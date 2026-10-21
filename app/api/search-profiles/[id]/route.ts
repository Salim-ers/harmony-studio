import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { profileSchema } from '@/lib/server/prospects/schemas';

type P = { id: string };

export const PATCH = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const b = await readJson(request, profileSchema);
  const rows = await db()`UPDATE search_profiles SET name = ${b.name}, strategy = ${b.strategy}, zones = ${b.zones}, sectors = ${b.sectors}, needs = ${b.needs},
    custom_query = ${b.customQuery}, freshness = ${b.freshness}, max_queries = ${b.maxQueries}, schedule_enabled = ${b.schedule_enabled},
    schedule_days = ${b.schedule_days}, schedule_hour = ${b.schedule_hour}, alert_min_score = ${b.alert_min_score}, updated_at = now()
    WHERE id = ${params.id} RETURNING *`;
  if (!rows[0]) throw notFound('Recherche enregistrée introuvable.');
  return json({ profile: rows[0] });
});

export const DELETE = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const rows = await db()`DELETE FROM search_profiles WHERE id = ${params.id} RETURNING id`;
  if (!rows.length) throw notFound('Recherche enregistrée introuvable.');
  return json({ ok: true });
});
