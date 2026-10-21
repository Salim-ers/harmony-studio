import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { addEvent } from '@/lib/server/prospects/repo';

type P = { id: string };
const schema = z.object({ done: z.boolean().optional(), due_at: z.string().datetime({ offset: true }).nullable().optional(), title: z.string().trim().min(1).max(200).optional() });

export const PATCH = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const body = await readJson(request, schema);
  const rows = await db()<{ prospect_id: string | null; title: string }>`UPDATE prospect_tasks SET
      done_at = CASE WHEN ${body.done === true} THEN coalesce(done_at, now()) WHEN ${body.done === false} THEN NULL ELSE done_at END,
      due_at = CASE WHEN ${body.due_at !== undefined} THEN ${body.due_at ?? null}::timestamptz ELSE due_at END,
      title = coalesce(${body.title ?? null}, title)
    WHERE id = ${params.id} RETURNING prospect_id, title`;
  if (!rows[0]) throw notFound('Tâche introuvable.');
  if (body.done === true && rows[0].prospect_id) await addEvent(rows[0].prospect_id, 'tâche', `Tâche terminée : ${rows[0].title}`);
  return json({ ok: true });
});

export const DELETE = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const rows = await db()`DELETE FROM prospect_tasks WHERE id = ${params.id} RETURNING id`;
  if (!rows.length) throw notFound('Tâche introuvable.');
  return json({ ok: true });
});
