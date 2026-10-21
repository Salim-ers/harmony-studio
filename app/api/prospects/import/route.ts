import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json, readJson } from '@/lib/server/http';
import { mapImport, parseCsv } from '@/lib/server/prospects/csv';
import { canonicalUrl, domainOf, normalizeName, platformOf } from '@/lib/server/prospects/url';
import { PIPELINE } from '@/lib/shared/constants';
import { audit } from '@/lib/server/audit';

const schema = z.object({ csv: z.string().min(1).max(3_000_000), dryRun: z.boolean().default(false) });

export const POST = adminRoute(async ({ request }) => {
  const { csv, dryRun } = await readJson(request, schema, 3_200_000);
  const { items, unknownColumns } = mapImport(parseCsv(csv));
  if (dryRun) return json({ rows: items.length, unknownColumns, sample: items.slice(0, 5) });
  const sql = db();
  let created = 0, duplicates = 0, invalid = 0;
  for (const item of items.slice(0, 5000)) {
    const name = (item.name ?? '').slice(0, 180);
    if (!name) { invalid++; continue; }
    const canonical = item.source_url ? canonicalUrl(item.source_url) : `urn:harmony:import:${randomUUID()}`;
    if (!canonical) { invalid++; continue; }
    const status = (PIPELINE as readonly string[]).includes(item.status ?? '') ? item.status! : 'À examiner';
    const tags = (item.tags ?? '').split(/[,;]/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
    const value = item.estimated_value ? Number(item.estimated_value.replace(/\s/g, '').replace(',', '.')) : null;
    const website = item.website ? canonicalUrl(item.website) : null;
    const rows = await sql<{ id: string }>`INSERT INTO prospects(name, source_url, canonical_url, source_type, city, category, signal, score, status, notes, strategy, activity,
        domain, dedupe_key, platform, need_type, need_status, confidence, confidence_reason, website, tags, estimated_value)
      VALUES (${name}, ${canonical}, ${canonical}, 'Import CSV', ${(item.city ?? '').slice(0, 90)}, ${(item.need_type || 'À préciser').slice(0, 100)}, 'Import CSV', 10, ${status},
        ${(item.notes ?? '').slice(0, 3500)}, 'manuel', ${(item.activity ?? '').slice(0, 100)}, ${item.source_url ? domainOf(canonical) : ''},
        ${`n:${normalizeName(name)}|${normalizeName(item.city ?? '')}`}, ${item.source_url ? platformOf(canonical).name : 'Import CSV'}, ${(item.need_type ?? '').slice(0, 100)},
        'inconnu', 'faible', 'Fiche importée : provenance à vérifier.', ${website}, ${tags}, ${Number.isFinite(value) ? value : null})
      ON CONFLICT DO NOTHING RETURNING id`;
    if (rows[0]) {
      created++;
      await sql`INSERT INTO pipeline_events(prospect_id, kind, to_status, detail) VALUES (${rows[0].id}, 'création', ${status}, 'Import CSV')`;
    } else duplicates++;
  }
  await audit('import_csv', {}, { created, duplicates, invalid });
  return json({ created, duplicates, invalid, unknownColumns });
});
