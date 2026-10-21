import { destroySession } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { assertSameOrigin, toResponse } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroySession();
    await audit('deconnexion');
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return toResponse(e, 'logout');
  }
}
