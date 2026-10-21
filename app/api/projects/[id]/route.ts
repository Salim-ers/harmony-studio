import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { briefSchema } from '@/lib/server/studio/schemas';
import { getAssets, getProject } from '@/lib/server/studio/projects';
import { listVersions } from '@/lib/server/studio/versions';
import { integrationStatuses } from '@/lib/server/env';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';
type P = { id: string };
const check = (id: string) => { if (!UUID_RE.test(id)) throw badRequest('Identifiant invalide.'); };

export const GET = adminRoute<P>(async ({ params }) => {
  check(params.id);
  const sql = db();
  const project = await getProject(params.id);
  const [extra] = await sql<{ render: string }>`SELECT render FROM projects WHERE id = ${params.id}`;
  const [assets, versions, messages, jobs, deployments, quotes] = await Promise.all([
    getAssets(params.id),
    listVersions(params.id),
    sql`SELECT id, role, content, version_id, job_id, created_at FROM project_messages WHERE project_id = ${params.id} ORDER BY created_at ASC LIMIT 300`,
    sql`SELECT id, kind, status, error, cost_usd, created_at, finished_at FROM generation_jobs WHERE project_id = ${params.id} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT id, provider, target, status, url, detail, version_id, created_at FROM deployments WHERE project_id = ${params.id} ORDER BY created_at DESC LIMIT 30`,
    sql`SELECT id, number, title, status, total_ttc FROM quotes WHERE project_id = ${params.id} ORDER BY created_at DESC`,
  ]);
  const [current] = project.current_version_id ? await sql`SELECT checks, build_report, (preview_js IS NOT NULL) AS has_bundle FROM project_versions WHERE id = ${project.current_version_id}` : [null];
  const integrations = Object.fromEntries(integrationStatuses().map((i) => [i.key, i.configured]));
  return json({ project: { ...project, render: extra?.render ?? 'html' }, assets, versions, messages, jobs, deployments, quotes, current, integrations });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  brief: briefSchema.partial().optional(),
  matrix_overrides: z.object({ design: z.string().max(4000), technique: z.string().max(4000), seo: z.string().max(4000), audit: z.string().max(4000) }).partial().optional(),
  prospect_id: z.string().uuid().nullable().optional(),
  status: z.enum(['Approuvé', 'Prêt pour revue']).optional(),
  archived: z.boolean().optional(),
});

export const PATCH = adminRoute<P>(async ({ request, params }) => {
  check(params.id);
  const b = await readJson(request, patchSchema, 100_000);
  const project = await getProject(params.id);
  if (b.status === 'Approuvé' && !project.current_version_id) throw badRequest('Aucune version à approuver.');
  const brief = b.brief ? { ...project.brief_data, ...Object.fromEntries(Object.entries(b.brief).filter(([, v]) => v !== undefined)) } : project.brief_data;
  const overrides = b.matrix_overrides ? { ...project.matrix_overrides, ...b.matrix_overrides } : project.matrix_overrides;
  await db()`UPDATE projects SET name = ${b.name ?? project.name}, brief_data = ${JSON.stringify(brief)}::jsonb, brief = ${(brief as { brief?: string }).brief ?? project.brief},
    client_name = ${(brief as { clientName?: string }).clientName ?? project.client_name}, sector = ${(brief as { sector?: string }).sector ?? project.sector},
    city = ${(brief as { city?: string }).city ?? project.city}, matrix_overrides = ${JSON.stringify(overrides)}::jsonb,
    prospect_id = ${b.prospect_id !== undefined ? b.prospect_id : project.prospect_id}, status = ${b.status ?? project.status},
    archived_at = CASE WHEN ${b.archived === true} THEN coalesce(archived_at, now()) WHEN ${b.archived === false} THEN NULL ELSE archived_at END,
    updated_at = now() WHERE id = ${params.id}`;
  if (b.status === 'Approuvé') await audit('projet_approuve', { type: 'project', id: params.id });
  return json({ ok: true });
});

export const DELETE = adminRoute<P>(async ({ params }) => {
  check(params.id);
  const sql = db();
  const media = await sql<{ media_id: string }>`SELECT media_id FROM project_assets WHERE project_id = ${params.id}`;
  const rows = await sql`DELETE FROM projects WHERE id = ${params.id} RETURNING id`;
  if (!rows.length) throw notFound('Projet introuvable.');
  // Médias devenus orphelins : supprimés (stockage privé, aucune autre référence).
  for (const m of media) await sql`DELETE FROM media_files f WHERE f.id = ${m.media_id} AND NOT EXISTS (SELECT 1 FROM project_assets a WHERE a.media_id = f.id)`;
  await audit('projet_supprime', { type: 'project', id: params.id });
  return json({ ok: true });
});
