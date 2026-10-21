import { adminRoute } from '@/lib/server/api';
import { json, readJson } from '@/lib/server/http';
import { runSearch } from '@/lib/server/prospects/engine';
import { searchParamsSchema } from '@/lib/server/prospects/schemas';
import { getConfig } from '@/lib/server/settings';
import { db } from '@/lib/server/db';
import { HttpError } from '@/lib/server/http';

export const maxDuration = 60;

export const POST = adminRoute(async ({ request }) => {
  const params = await readJson(request, searchParamsSchema);
  const config = await getConfig();
  const [used] = await db()<{ n: number }>`SELECT count(*)::int AS n FROM usage_events WHERE provider = 'brave' AND NOT is_demo AND created_at >= date_trunc('month', now())`;
  if (config.brave.monthlyQueryCap > 0 && Number(used.n) + params.maxQueries * params.pages > config.brave.monthlyQueryCap)
    throw new HttpError(429, `Plafond mensuel de requêtes Brave atteint (${used.n}/${config.brave.monthlyQueryCap}). Modifiez-le dans Paramètres si votre abonnement le permet.`, 'QUOTA');
  const summary = await runSearch(params, { trigger: 'manuel' });
  return json(summary);
}, { limit: 'search' });
