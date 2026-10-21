import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { computeTotals, quoteSchema } from '@/lib/server/quotes';
import { addEvent } from '@/lib/server/prospects/repo';

type P = { id: string };
const check = (id: string) => { if (!UUID_RE.test(id)) throw badRequest('Identifiant invalide.'); };

export const GET = adminRoute<P>(async ({ params }) => {
  check(params.id);
  const [q] = await db()`SELECT * FROM quotes WHERE id = ${params.id}`;
  if (!q) throw notFound('Devis introuvable.');
  return json({ quote: q });
});

const patchSchema = quoteSchema.partial().extend({ status: z.enum(['brouillon', 'envoyé', 'accepté', 'refusé', 'expiré']).optional() });

export const PATCH = adminRoute<P>(async ({ request, params }) => {
  check(params.id);
  const b = await readJson(request, patchSchema);
  const sql = db();
  const [q] = await sql`SELECT * FROM quotes WHERE id = ${params.id}`;
  if (!q) throw notFound('Devis introuvable.');
  const lines = b.lines ?? q.lines;
  const regime = b.vat_regime ?? q.vat_regime;
  const rate = b.vat_rate ?? Number(q.vat_rate);
  const totals = computeTotals(lines, regime, rate);
  await sql`UPDATE quotes SET title = ${b.title ?? q.title}, client_name = ${b.client_name ?? q.client_name}, client_details = ${b.client_details ?? q.client_details},
    prospect_id = ${b.prospect_id !== undefined ? b.prospect_id : q.prospect_id}, project_id = ${b.project_id !== undefined ? b.project_id : q.project_id},
    lines = ${JSON.stringify(lines)}::jsonb, vat_regime = ${regime}, vat_rate = ${rate}, total_ht = ${totals.ht}, total_tva = ${totals.tva}, total_ttc = ${totals.ttc},
    valid_until = ${b.valid_until !== undefined ? b.valid_until : q.valid_until}, notes = ${b.notes ?? q.notes}, status = ${b.status ?? q.status},
    sent_at = CASE WHEN ${b.status === 'envoyé'} AND sent_at IS NULL THEN now() ELSE sent_at END, updated_at = now() WHERE id = ${params.id}`;
  const prospectId = b.prospect_id !== undefined ? b.prospect_id : q.prospect_id;
  if (b.status && b.status !== q.status && prospectId) {
    await addEvent(prospectId, 'devis', `Devis ${q.number} : ${q.status} → ${b.status}${b.status === 'envoyé' ? ' (envoi déclaré manuellement)' : ''}`);
    if (b.status === 'envoyé') await sql`UPDATE prospects SET status = 'Devis envoyé' WHERE id = ${prospectId} AND status IN ('À examiner','Qualifié','À contacter','Contacté','Réponse reçue','Rendez-vous','À relancer')`;
    if (b.status === 'accepté') await sql`UPDATE prospects SET status = 'Gagné' WHERE id = ${prospectId}`;
  }
  return json({ ok: true, totals });
});

export const DELETE = adminRoute<P>(async ({ params }) => {
  check(params.id);
  const rows = await db()`DELETE FROM quotes WHERE id = ${params.id} RETURNING id`;
  if (!rows.length) throw notFound('Devis introuvable.');
  return json({ ok: true });
});
