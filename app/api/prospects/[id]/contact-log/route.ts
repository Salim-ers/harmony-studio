import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { addEvent } from '@/lib/server/prospects/repo';

type P = { id: string };
const schema = z.object({ channel: z.string().trim().min(1).max(60), summary: z.string().max(2000).default(''), followUpDays: z.number().int().min(0).max(120).optional() });

/**
 * Le propriétaire DÉCLARE avoir contacté le prospect lui-même (Harmony Studio n'envoie rien).
 * L'historique le mentionne explicitement.
 */
export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const body = await readJson(request, schema);
  const sql = db();
  const [p] = await sql<{ status: string; do_not_contact: boolean }>`SELECT status, do_not_contact FROM prospects WHERE id = ${params.id}`;
  if (!p) throw notFound('Prospect introuvable.');
  if (p.do_not_contact) throw badRequest('Opposition enregistrée : ce prospect ne doit plus être contacté.');
  const to = ['À examiner', 'Qualifié', 'À contacter', 'À relancer'].includes(p.status) ? 'Contacté' : p.status;
  await sql`UPDATE prospects SET status = ${to}, updated_at = now() WHERE id = ${params.id}`;
  await addEvent(params.id, 'contact', `Contact déclaré manuellement (${body.channel})${body.summary ? ` : ${body.summary}` : ''}`, p.status, to);
  if (body.followUpDays) {
    await sql`INSERT INTO prospect_tasks(prospect_id, title, kind, due_at) VALUES (${params.id}, ${`Relancer (${body.channel})`}, 'relance', now() + make_interval(days => ${body.followUpDays}))`;
  }
  return json({ ok: true, status: to });
});
