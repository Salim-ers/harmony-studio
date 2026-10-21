import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { buildWhere, listQuerySchema } from '@/lib/server/prospects/repo';
import { toCsv } from '@/lib/server/prospects/csv';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async ({ request }) => {
  const query = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  const { where, params } = buildWhere(query);
  const rows = await db().query(`SELECT * FROM prospects WHERE ${where} ORDER BY created_at DESC LIMIT 10000`, params);
  await audit('export_csv', {}, { lignes: rows.length });
  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="harmony-prospects-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
