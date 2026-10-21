import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async ({ request }) => {
  const scope = new URL(request.url).searchParams.get('scope') ?? 'ouvertes';
  const rows = scope === 'toutes'
    ? await db()`SELECT t.id, t.title, t.kind, t.due_at, t.done_at, t.created_at, p.id AS prospect_id, p.name AS prospect_name FROM prospect_tasks t
        LEFT JOIN prospects p ON p.id = t.prospect_id ORDER BY t.done_at NULLS FIRST, t.due_at NULLS LAST LIMIT 300`
    : await db()`SELECT t.id, t.title, t.kind, t.due_at, t.done_at, t.created_at, p.id AS prospect_id, p.name AS prospect_name FROM prospect_tasks t
        LEFT JOIN prospects p ON p.id = t.prospect_id WHERE t.done_at IS NULL ORDER BY t.due_at NULLS LAST LIMIT 300`;
  return json({ tasks: rows });
});
