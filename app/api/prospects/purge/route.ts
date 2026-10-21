import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json, readJson } from '@/lib/server/http';
import { getConfig } from '@/lib/server/settings';
import { audit } from '@/lib/server/audit';

/**
 * Durée de conservation (RGPD) : prospects sans activité depuis N mois, hors clients gagnés.
 * GET = liste des fiches concernées (aucune suppression) ; POST = suppression confirmée.
 */
export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const config = await getConfig();
  const rows = await db()`SELECT id, name, status, last_activity_at FROM prospects
    WHERE status <> 'Gagné' AND last_activity_at < now() - make_interval(months => ${config.prospecting.retentionMonths}) ORDER BY last_activity_at LIMIT 500`;
  return json({ months: config.prospecting.retentionMonths, items: rows });
});

const schema = z.object({ confirm: z.literal('PURGER') });

export const POST = adminRoute(async ({ request }) => {
  await readJson(request, schema);
  const config = await getConfig();
  const rows = await db()`DELETE FROM prospects WHERE status <> 'Gagné' AND last_activity_at < now() - make_interval(months => ${config.prospecting.retentionMonths}) RETURNING id`;
  await audit('purge_rgpd', {}, { count: rows.length, months: config.prospecting.retentionMonths });
  return json({ deleted: rows.length });
});
