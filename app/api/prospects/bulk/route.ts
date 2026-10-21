import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json, readJson } from '@/lib/server/http';
import { PIPELINE } from '@/lib/shared/constants';
import { audit } from '@/lib/server/audit';

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['archiver', 'desarchiver', 'supprimer', 'statut', 'favori']),
  status: z.enum(PIPELINE).optional(),
});

export const POST = adminRoute(async ({ request }) => {
  const b = await readJson(request, schema);
  const sql = db();
  let rows: unknown[] = [];
  if (b.action === 'archiver') rows = await sql`UPDATE prospects SET archived_at = coalesce(archived_at, now()) WHERE id = ANY(${b.ids}::uuid[]) RETURNING id`;
  if (b.action === 'desarchiver') rows = await sql`UPDATE prospects SET archived_at = NULL WHERE id = ANY(${b.ids}::uuid[]) RETURNING id`;
  if (b.action === 'favori') rows = await sql`UPDATE prospects SET favorite = NOT favorite WHERE id = ANY(${b.ids}::uuid[]) RETURNING id`;
  if (b.action === 'supprimer') rows = await sql`DELETE FROM prospects WHERE id = ANY(${b.ids}::uuid[]) RETURNING id`;
  if (b.action === 'statut' && b.status) {
    rows = await sql`WITH old AS (SELECT id, status FROM prospects WHERE id = ANY(${b.ids}::uuid[]) AND status <> ${b.status}),
      upd AS (UPDATE prospects p SET status = ${b.status}, updated_at = now(), last_activity_at = now() FROM old WHERE p.id = old.id RETURNING p.id)
      INSERT INTO pipeline_events(prospect_id, kind, from_status, to_status, detail) SELECT old.id, 'statut', old.status, ${b.status}, 'Changement de statut groupé' FROM old RETURNING prospect_id`;
  }
  await audit(`prospects_${b.action}`, {}, { count: rows.length });
  return json({ ok: true, count: rows.length });
});
