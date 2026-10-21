import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound } from '@/lib/server/http';
import { runSearch } from '@/lib/server/prospects/engine';

export const maxDuration = 60;
type P = { id: string };

export const POST = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const [p] = await db()`SELECT * FROM search_profiles WHERE id = ${params.id}`;
  if (!p) throw notFound('Recherche enregistrée introuvable.');
  const summary = await runSearch({ strategy: p.strategy, zones: p.zones, sectors: p.sectors, needs: p.needs, customQuery: p.custom_query, freshness: p.freshness, maxQueries: p.max_queries }, { trigger: 'manuel', profileId: p.id });
  return json(summary);
}, { limit: 'search' });
