import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async ({ request }) => {
  const before = Number(new URL(request.url).searchParams.get('before') ?? 0);
  const logs = before > 0
    ? await db()`SELECT id, action, target_type, target_id, detail, created_at FROM audit_logs WHERE id < ${before} ORDER BY id DESC LIMIT 100`
    : await db()`SELECT id, action, target_type, target_id, detail, created_at FROM audit_logs ORDER BY id DESC LIMIT 100`;
  return json({ logs });
});
