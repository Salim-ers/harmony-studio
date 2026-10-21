import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { addEvent } from '@/lib/server/prospects/repo';
import { canonicalUrl } from '@/lib/server/prospects/url';
import { audit } from '@/lib/server/audit';
import { PIPELINE } from '@/lib/shared/constants';

export const dynamic = 'force-dynamic';
type P = { id: string };

function checkId(id: string) {
  if (!UUID_RE.test(id)) throw badRequest('Identifiant invalide.');
}

export const GET = adminRoute<P>(async ({ params }) => {
  checkId(params.id);
  const sql = db();
  const rows = await sql`SELECT * FROM prospects WHERE id = ${params.id}`;
  if (!rows[0]) throw notFound('Prospect introuvable.');
  const [sources, notes, tasks, events, quotes, projects] = await Promise.all([
    sql`SELECT id, url, platform, title, excerpt, published_at, published_label, query, discovered_at FROM prospect_sources WHERE prospect_id = ${params.id} ORDER BY discovered_at DESC LIMIT 50`,
    sql`SELECT id, body, created_at FROM prospect_notes WHERE prospect_id = ${params.id} ORDER BY created_at DESC LIMIT 200`,
    sql`SELECT id, title, kind, due_at, done_at, created_at FROM prospect_tasks WHERE prospect_id = ${params.id} ORDER BY done_at NULLS FIRST, due_at NULLS LAST`,
    sql`SELECT id, kind, from_status, to_status, detail, created_at FROM pipeline_events WHERE prospect_id = ${params.id} ORDER BY created_at DESC LIMIT 200`,
    sql`SELECT id, number, title, status, total_ttc, total_ht, created_at FROM quotes WHERE prospect_id = ${params.id} ORDER BY created_at DESC`,
    sql`SELECT id, name, status, updated_at FROM projects WHERE prospect_id = ${params.id} ORDER BY updated_at DESC`,
  ]);
  return json({ prospect: rows[0], sources, notes, tasks, events, quotes, projects });
});

const patchSchema = z.object({
  status: z.enum(PIPELINE).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  activity: z.string().trim().max(100).optional(),
  city: z.string().trim().max(90).optional(),
  location_verified: z.boolean().optional(),
  need_type: z.string().trim().max(100).optional(),
  need_status: z.enum(['confirmé', 'supposé', 'inconnu']).optional(),
  next_action: z.string().trim().max(300).optional(),
  estimated_value: z.number().min(0).max(10_000_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  website: z.string().trim().max(500).nullable().optional(),
  do_not_contact: z.boolean().optional(),
  opposition_note: z.string().max(500).optional(),
  notes: z.string().max(3500).optional(),
}).strict();

export const PATCH = adminRoute<P>(async ({ request, params }) => {
  checkId(params.id);
  const body = await readJson(request, patchSchema);
  const sql = db();
  const [current] = await sql<{ status: string; do_not_contact: boolean; archived_at: string | null }>`SELECT status, do_not_contact, archived_at FROM prospects WHERE id = ${params.id}`;
  if (!current) throw notFound('Prospect introuvable.');
  let website: string | null | undefined = body.website;
  if (website) {
    website = canonicalUrl(website);
    if (!website) throw badRequest('URL du site invalide.');
  }
  await sql`UPDATE prospects SET
      status = coalesce(${body.status ?? null}, status),
      name = coalesce(${body.name ?? null}, name),
      activity = coalesce(${body.activity ?? null}, activity),
      city = coalesce(${body.city ?? null}, city),
      location_verified = coalesce(${body.location_verified ?? null}, location_verified),
      need_type = coalesce(${body.need_type ?? null}, need_type),
      need_status = coalesce(${body.need_status ?? null}, need_status),
      next_action = coalesce(${body.next_action ?? null}, next_action),
      estimated_value = CASE WHEN ${body.estimated_value !== undefined} THEN ${body.estimated_value ?? null}::numeric ELSE estimated_value END,
      tags = coalesce(${body.tags ?? null}::text[], tags),
      favorite = coalesce(${body.favorite ?? null}, favorite),
      archived_at = CASE WHEN ${body.archived === true} THEN coalesce(archived_at, now()) WHEN ${body.archived === false} THEN NULL ELSE archived_at END,
      website = CASE WHEN ${body.website !== undefined} THEN ${website ?? null} ELSE website END,
      do_not_contact = coalesce(${body.do_not_contact ?? null}, do_not_contact),
      opposition_at = CASE WHEN ${body.do_not_contact === true} THEN coalesce(opposition_at, now()) WHEN ${body.do_not_contact === false} THEN NULL ELSE opposition_at END,
      opposition_note = coalesce(${body.opposition_note ?? null}, opposition_note),
      notes = coalesce(${body.notes ?? null}, notes),
      updated_at = now(), last_activity_at = now()
    WHERE id = ${params.id}`;
  if (body.status && body.status !== current.status) await addEvent(params.id, 'statut', `Statut : ${current.status} → ${body.status}`, current.status, body.status);
  if (body.do_not_contact === true && !current.do_not_contact) await addEvent(params.id, 'rgpd', `Opposition enregistrée${body.opposition_note ? ` : ${body.opposition_note}` : ''}`);
  if (body.archived === true && !current.archived_at) await addEvent(params.id, 'archive', 'Fiche archivée');
  if (body.archived === false && current.archived_at) await addEvent(params.id, 'archive', 'Fiche désarchivée');
  return json({ ok: true });
});

export const DELETE = adminRoute<P>(async ({ params }) => {
  checkId(params.id);
  const rows = await db()`DELETE FROM prospects WHERE id = ${params.id} RETURNING id`;
  if (!rows.length) throw notFound('Prospect introuvable.');
  await audit('prospect_supprime', { type: 'prospect', id: params.id });
  return json({ ok: true });
});
