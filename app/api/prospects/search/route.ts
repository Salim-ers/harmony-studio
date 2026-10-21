import { adminRoute } from '@/lib/server/api';
import { json, readJson } from '@/lib/server/http';
import { runSearch } from '@/lib/server/prospects/engine';
import { searchParamsSchema } from '@/lib/server/prospects/schemas';

export const maxDuration = 60;

export const POST = adminRoute(async ({ request }) => {
  const params = await readJson(request, searchParamsSchema);
  // Le plafond mensuel Brave est vérifié dans runSearch (commun à tous les déclencheurs).
  const summary = await runSearch(params, { trigger: 'manuel' });
  return json(summary);
}, { limit: 'search' });
