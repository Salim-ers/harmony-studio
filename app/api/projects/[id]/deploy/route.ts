import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, readJson } from '@/lib/server/http';
import { collectFiles, deployToVercel } from '@/lib/server/studio/export';
import { loadVersionForExport } from '@/lib/server/studio/version-files';
import { audit } from '@/lib/server/audit';

export const maxDuration = 120;
type P = { id: string };
const schema = z.object({
  target: z.enum(['preview', 'production']),
  versionId: z.string().uuid().nullable().default(null),
  confirm: z.literal(true),
  confirmProduction: z.string().optional(),
});

/** Déploiement Vercel du site client : preview par défaut ; production seulement avec double confirmation. */
export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const b = await readJson(request, schema);
  const { version, project } = await loadVersionForExport(params.id, b.versionId);
  if (b.target === 'production') {
    if (b.confirmProduction !== 'PRODUCTION') throw badRequest('Tapez PRODUCTION pour confirmer une mise en ligne publique.');
    const [p] = await db()<{ status: string }>`SELECT status FROM projects WHERE id = ${params.id}`;
    if (p?.status !== 'Approuvé' && p?.status !== 'Déployé') throw badRequest('Approuvez d’abord le projet (statut « Approuvé ») avant une mise en production.');
  }
  const files = await collectFiles(params.id, version.files, project.render, { checks: version.checks, build: version.build_report });
  const sql = db();
  const [dep] = await sql<{ id: string }>`INSERT INTO deployments(project_id, version_id, provider, target, status) VALUES (${params.id}, ${version.id}, 'vercel', ${b.target}, 'en_cours') RETURNING id`;
  try {
    const out = await deployToVercel({ name: project.client_name || project.name, files, render: project.render, target: b.target });
    await sql`UPDATE deployments SET status = 'succes', url = ${out.url}, external_id = ${out.id}, detail = ${`État Vercel : ${out.state}`} WHERE id = ${dep.id}`;
    if (b.target === 'production') await sql`UPDATE projects SET status = 'Déployé' WHERE id = ${params.id}`;
    await audit('vercel_deploy', { type: 'project', id: params.id }, { target: b.target, version: version.number });
    return json({ ok: true, url: out.url, state: out.state });
  } catch (e) {
    await sql`UPDATE deployments SET status = 'echec', detail = ${e instanceof Error ? e.message.slice(0, 300) : 'Erreur'} WHERE id = ${dep.id}`;
    throw e;
  }
}, { limit: 'external' });
