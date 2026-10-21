import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';

type P = { id: string; assetId: string };
const schema = z.object({ alt: z.string().trim().max(300).optional(), position: z.number().int().min(0).max(100).optional() });
const check = (p: P) => { if (!UUID_RE.test(p.id) || !UUID_RE.test(p.assetId)) throw badRequest('Identifiant invalide.'); };

export const PATCH = adminRoute<P>(async ({ request, params }) => {
  check(params);
  const b = await readJson(request, schema);
  const rows = await db()`UPDATE project_assets SET alt = coalesce(${b.alt ?? null}, alt), position = coalesce(${b.position ?? null}, position)
    WHERE id = ${params.assetId} AND project_id = ${params.id} RETURNING id`;
  if (!rows.length) throw notFound('Média introuvable.');
  return json({ ok: true });
});

/** Retire le média du projet ; le fichier privé est supprimé s'il n'est plus utilisé ailleurs. */
export const DELETE = adminRoute<P>(async ({ params }) => {
  check(params);
  const sql = db();
  const rows = await sql<{ media_id: string }>`DELETE FROM project_assets WHERE id = ${params.assetId} AND project_id = ${params.id} RETURNING media_id`;
  if (!rows.length) throw notFound('Média introuvable.');
  await sql`DELETE FROM media_files f WHERE f.id = ${rows[0].media_id} AND NOT EXISTS (SELECT 1 FROM project_assets a WHERE a.media_id = f.id)`;
  return json({ ok: true });
});
