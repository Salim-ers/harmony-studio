import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { addEvent } from '@/lib/server/prospects/repo';

type P = { id: string };
const schema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['relance', 'appel', 'email', 'rendez-vous', 'devis', 'autre']).default('relance'),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const body = await readJson(request, schema);
  const rows = await db()`INSERT INTO prospect_tasks(prospect_id, title, kind, due_at)
    SELECT id, ${body.title}, ${body.kind}, ${body.due_at ?? null} FROM prospects WHERE id = ${params.id} RETURNING id, title, kind, due_at, done_at, created_at`;
  if (!rows[0]) throw notFound('Prospect introuvable.');
  await addEvent(params.id, 'tâche', `Tâche planifiée : ${body.title}${body.due_at ? ` (échéance ${new Date(body.due_at).toLocaleDateString('fr-FR')})` : ''}`);
  return json({ task: rows[0] }, { status: 201 });
});
