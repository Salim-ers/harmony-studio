import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { addEvent } from '@/lib/server/prospects/repo';

type P = { id: string };
const schema = z.object({ body: z.string().trim().min(1).max(5000) });

export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const { body } = await readJson(request, schema);
  const rows = await db()`INSERT INTO prospect_notes(prospect_id, body) SELECT id, ${body} FROM prospects WHERE id = ${params.id} RETURNING id, body, created_at`;
  if (!rows[0]) throw notFound('Prospect introuvable.');
  await addEvent(params.id, 'note', 'Note ajoutée');
  return json({ note: rows[0] }, { status: 201 });
});

export const DELETE = adminRoute<P>(async ({ request, params }) => {
  const noteId = new URL(request.url).searchParams.get('noteId') ?? '';
  if (!UUID_RE.test(params.id) || !UUID_RE.test(noteId)) throw badRequest('Identifiant invalide.');
  const rows = await db()`DELETE FROM prospect_notes WHERE id = ${noteId} AND prospect_id = ${params.id} RETURNING id`;
  if (!rows.length) throw notFound('Note introuvable.');
  return json({ ok: true });
});
