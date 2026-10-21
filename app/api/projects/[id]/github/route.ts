import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, readJson } from '@/lib/server/http';
import { collectFiles, pushToGithub } from '@/lib/server/studio/export';
import { loadVersionForExport } from '@/lib/server/studio/version-files';
import { audit } from '@/lib/server/audit';

export const maxDuration = 120;
type P = { id: string };
const schema = z.object({ repo: z.string().trim().min(1).max(90), versionId: z.string().uuid().nullable().default(null), confirm: z.literal(true) });

/** Envoi vers un dépôt GitHub PRIVÉ, uniquement après confirmation explicite. */
export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const b = await readJson(request, schema);
  const { version, project } = await loadVersionForExport(params.id, b.versionId);
  const files = await collectFiles(params.id, version.files, project.render, { checks: version.checks, build: version.build_report });
  const sql = db();
  const [dep] = await sql<{ id: string }>`INSERT INTO deployments(project_id, version_id, provider, target, status) VALUES (${params.id}, ${version.id}, 'github', 'repo', 'en_cours') RETURNING id`;
  try {
    const out = await pushToGithub({ repo: b.repo, files, message: `Harmony Studio — version ${version.number}` });
    await sql`UPDATE deployments SET status = 'succes', url = ${out.url}, external_id = ${out.commit} WHERE id = ${dep.id}`;
    await audit('github_push', { type: 'project', id: params.id }, { repo: b.repo, version: version.number });
    return json({ ok: true, url: out.url });
  } catch (e) {
    await sql`UPDATE deployments SET status = 'echec', detail = ${e instanceof Error ? e.message.slice(0, 300) : 'Erreur'} WHERE id = ${dep.id}`;
    throw e;
  }
}, { limit: 'external' });
