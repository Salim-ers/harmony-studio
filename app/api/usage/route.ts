import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json } from '@/lib/server/http';
import { monthSpendUsd } from '@/lib/server/ai/anthropic';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const sql = db();
  const byOperation = await sql`SELECT provider, operation, count(*)::int AS calls, sum(input_tokens)::int AS input_tokens, sum(output_tokens)::int AS output_tokens,
      sum(cost_usd) AS cost_usd, count(*) FILTER (WHERE cost_usd IS NULL AND provider = 'anthropic')::int AS unknown_cost, count(*) FILTER (WHERE NOT ok)::int AS failures
    FROM usage_events WHERE created_at >= date_trunc('month', now()) AND NOT is_demo GROUP BY provider, operation ORDER BY provider, operation`;
  const byDay = await sql`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, provider, coalesce(sum(cost_usd), 0) AS cost_usd, count(*)::int AS calls
    FROM usage_events WHERE created_at > now() - interval '30 days' AND NOT is_demo GROUP BY 1, 2 ORDER BY 1`;
  const recent = await sql`SELECT provider, operation, model, input_tokens, output_tokens, cost_usd, ok, detail, is_demo, created_at, project_id
    FROM usage_events ORDER BY created_at DESC LIMIT 100`;
  return json({ month: await monthSpendUsd(), byOperation, byDay, recent });
});
