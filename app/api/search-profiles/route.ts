import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json, readJson } from '@/lib/server/http';
import { profileSchema } from '@/lib/server/prospects/schemas';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const profiles = await db()`SELECT * FROM search_profiles ORDER BY created_at DESC LIMIT 100`;
  return json({ profiles });
});

export const POST = adminRoute(async ({ request }) => {
  const b = await readJson(request, profileSchema);
  const [row] = await db()`INSERT INTO search_profiles(name, strategy, zones, sectors, needs, custom_query, freshness, max_queries, schedule_enabled, schedule_days, schedule_hour, alert_min_score)
    VALUES (${b.name}, ${b.strategy}, ${b.zones}, ${b.sectors}, ${b.needs}, ${b.customQuery}, ${b.freshness}, ${b.maxQueries}, ${b.schedule_enabled}, ${b.schedule_days}, ${b.schedule_hour}, ${b.alert_min_score})
    RETURNING *`;
  return json({ profile: row }, { status: 201 });
});
