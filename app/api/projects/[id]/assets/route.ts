import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { nextSlug } from '@/lib/server/studio/projects';

type P = { id: string };
const schema = z.object({ mediaId: z.string().uuid(), role: z.enum(['photo', 'logo', 'document', 'charte', 'capture']).default('photo'), alt: z.string().trim().max(300).default('') });

export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const b = await readJson(request, schema);
  const sql = db();
  const [media] = await sql<{ kind: string; status: string }>`SELECT kind, status FROM media_files WHERE id = ${b.mediaId}`;
  if (!media || media.status !== 'pret') throw notFound('Média introuvable ou non finalisé.');
  if (media.kind === 'pdf' && b.role !== 'document' && b.role !== 'charte') throw badRequest('Un PDF ne peut être utilisé que comme document ou charte.');
  const [project] = await sql`SELECT id FROM projects WHERE id = ${params.id}`;
  if (!project) throw notFound('Projet introuvable.');
  if (b.role === 'logo') {
    const existing = await sql`SELECT 1 FROM project_assets WHERE project_id = ${params.id} AND role = 'logo'`;
    if (existing.length) throw badRequest('Un logo est déjà associé : retirez-le d’abord.');
  }
  const slug = await nextSlug(params.id, b.role, media.kind);
  const [{ n }] = await sql<{ n: number }>`SELECT count(*)::int AS n FROM project_assets WHERE project_id = ${params.id}`;
  if (Number(n) >= 40) throw badRequest('40 médias maximum par projet.');
  const [asset] = await sql`INSERT INTO project_assets(project_id, media_id, role, alt, slug, position) VALUES (${params.id}, ${b.mediaId}, ${b.role}, ${b.alt}, ${slug}, ${Number(n)})
    ON CONFLICT (project_id, media_id) DO NOTHING RETURNING id, slug`;
  if (!asset) throw badRequest('Ce média est déjà associé au projet.');
  await sql`UPDATE projects SET updated_at = now() WHERE id = ${params.id}`;
  return json({ asset }, { status: 201 });
});
