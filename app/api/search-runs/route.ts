import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const runs = await db()`SELECT r.id, r.trigger, r.params, r.queries, r.status, r.results_found, r.results_new, r.results_merged, r.results_rejected,
      r.api_calls, r.rejections, r.error, r.is_demo, r.started_at, r.finished_at, s.name AS profile_name
    FROM search_runs r LEFT JOIN search_profiles s ON s.id = r.profile_id ORDER BY r.started_at DESC LIMIT 50`;
  return json({ runs });
});
