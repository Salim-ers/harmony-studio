import { adminRoute } from '@/lib/server/api';
import { revokeOtherSessions } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { json } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async ({ session }) => {
  const rows = await db()`SELECT id, created_at, last_seen_at, expires_at, user_agent, mfa FROM admin_sessions
    WHERE revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC LIMIT 20`;
  return json({ sessions: rows.map((r) => ({ ...r, current: r.id === session.id })) });
});

export const DELETE = adminRoute(async ({ session }) => {
  const count = await revokeOtherSessions(session.id);
  await audit('sessions_revoquees', {}, { count });
  return json({ ok: true, count });
});
