import { z } from 'zod';
import { createSession, verifyEmail, verifyPassword } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { env } from '@/lib/server/env';
import { assertSameOrigin, readJson, toResponse, HttpError } from '@/lib/server/http';
import { clientIp, consume, hashKey, reset } from '@/lib/server/ratelimit';
import { verifyTotp } from '@/lib/server/totp';
import { db } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().max(200),
  password: z.string().max(512),
  code: z.string().trim().max(10).optional().default(''),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    await consume('loginGlobal', 'global');
    await consume('login', ip);
    const body = await readJson(request, schema, 4000);
    const emailOk = verifyEmail(body.email);
    const passwordOk = verifyPassword(body.password);
    if (!emailOk || !passwordOk) {
      await audit('connexion_refusee', {}, { raison: 'identifiants' }, hashKey(ip));
      throw new HttpError(401, 'Identifiants incorrects.', 'IDENTIFIANTS');
    }
    const secret = env.totpSecret();
    let mfa = false;
    if (secret) {
      const step = verifyTotp(secret, body.code);
      if (step === null) {
        await audit('connexion_refusee', {}, { raison: '2fa' }, hashKey(ip));
        throw new HttpError(401, 'Code de double authentification invalide ou expiré.', 'CODE_2FA');
      }
      // Anti-rejeu : un code TOTP ne peut servir qu'une fois.
      const used = await db()`INSERT INTO rate_limits(bucket, key_hash, window_start, count) VALUES ('totp-used', 'owner', to_timestamp(${step * 30}), 1)
        ON CONFLICT DO NOTHING RETURNING 1`;
      if (!used.length) throw new HttpError(401, 'Ce code a déjà été utilisé. Attendez le suivant.', 'CODE_2FA');
      mfa = true;
    }
    await createSession({ ip, userAgent: request.headers.get('user-agent') ?? '', mfa });
    await reset('login', ip);
    await audit('connexion', {}, { mfa }, hashKey(ip));
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return toResponse(e, 'login');
  }
}
