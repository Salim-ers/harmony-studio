import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json, readJson } from '@/lib/server/http';
import { computeTotals, nextQuoteNumber, quoteSchema } from '@/lib/server/quotes';
import { getConfig } from '@/lib/server/settings';
import { addEvent } from '@/lib/server/prospects/repo';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const quotes = await db()`SELECT q.id, q.number, q.title, q.client_name, q.status, q.total_ht, q.total_ttc, q.vat_regime, q.valid_until, q.created_at, q.updated_at,
      q.prospect_id, p.name AS prospect_name, q.project_id, pr.name AS project_name
    FROM quotes q LEFT JOIN prospects p ON p.id = q.prospect_id LEFT JOIN projects pr ON pr.id = q.project_id ORDER BY q.created_at DESC LIMIT 300`;
  return json({ quotes });
});


export const POST = adminRoute(async ({ request }) => {
  const b = await readJson(request, quoteSchema);
  const config = await getConfig();
  const regime = b.vat_regime ?? config.vat.regime;
  const rate = b.vat_rate ?? config.vat.rate;
  const totals = computeTotals(b.lines, regime, rate);
  const number = await nextQuoteNumber();
  const [row] = await db()`INSERT INTO quotes(number, prospect_id, project_id, title, client_name, client_details, lines, vat_regime, vat_rate, total_ht, total_tva, total_ttc, valid_until, notes)
    VALUES (${number}, ${b.prospect_id}, ${b.project_id}, ${b.title}, ${b.client_name}, ${b.client_details}, ${JSON.stringify(b.lines)}::jsonb, ${regime}, ${rate},
      ${totals.ht}, ${totals.tva}, ${totals.ttc}, ${b.valid_until}, ${b.notes}) RETURNING id, number`;
  if (b.prospect_id) await addEvent(b.prospect_id, 'devis', `Devis ${number} créé (brouillon)`);
  return json({ id: row.id, number: row.number }, { status: 201 });
});
