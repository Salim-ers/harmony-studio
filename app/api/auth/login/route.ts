import { z } from 'zod';
import { createSession, verifyEmail, verifyPassword } from '@/lib/server/auth';
import { audit, notify } from '@/lib/server/audit';
import { env } from '@/lib/server/env';
import { assertSameOrigin, readJson, toResponse, tooMany, HttpError } from '@/lib/server/http';
import { clientIp, consume, hashKey, peek, reset } from '@/lib/server/ratelimit';
import { verifyTotp } from '@/lib/server/totp';
import { db } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().trim().max(200),
  password: z.string().max(512),
  code: z.string().trim().max(10).optional().default(''),
});

/**
 * Ordre des contrôles (audit indépendant, M2) :
 * 1. limite par IP (5 essais / 15 min), comptée à chaque tentative ;
 * 2. le seau global ne compte que les ÉCHECS : une connexion réussie ne le consomme jamais ;
 * 3. au-delà du seuil global (attaque distribuée) :
 *    - avec la 2FA active, seules les connexions mot de passe + code valides passent
 *      et toute erreur reçoit la même réponse (pas d'indice sur le mot de passe) ;
 *    - sans 2FA, la connexion est suspendue jusqu'à la fin de la fenêtre (activez la 2FA pour éviter ce blocage).
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    await consume('login', ip);
    const body = await readJson(request, schema, 4000);
    const secret = env.totpSecret();
    const lockdown = (await peek('loginGlobal', 'global')).blocked;
    if (lockdown && !secret) throw tooMany();

    const fail = async (raison: string, message: string, code: string) => {
      await audit('connexion_refusee', {}, { raison, verrouillage_global: lockdown }, hashKey(ip));
      const { count, limit } = await peek('loginGlobal', 'global');
      await consume('loginGlobal', 'global').catch(() => undefined);
      if (count + 1 === limit) await notify('securite', 'Nombreux échecs de connexion', `${limit} échecs en moins d’une heure : la connexion exige désormais ${secret ? 'le code 2FA' : 'd’attendre la fin de la fenêtre'}. Activez la 2FA si ce n’est pas fait.`, '/parametres');
      if (lockdown) throw new HttpError(401, 'Connexion refusée.', 'IDENTIFIANTS');
      throw new HttpError(401, message, code);
    };

    const emailOk = verifyEmail(body.email);
    const passwordOk = verifyPassword(body.password);
    if (!emailOk || !passwordOk) await fail('identifiants', 'Identifiants incorrects.', 'IDENTIFIANTS');
    let mfa = false;
    if (secret) {
      const step = verifyTotp(secret, body.code);
      if (step === null) await fail('2fa', 'Code de double authentification invalide ou expiré.', 'CODE_2FA');
      // Anti-rejeu : un code TOTP ne peut servir qu'une fois.
      const used = await db()`INSERT INTO rate_limits(bucket, key_hash, window_start, count) VALUES ('totp-used', 'owner', to_timestamp(${step! * 30}), 1)
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
