import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest } from '@/lib/server/http';
import { collectFiles, zip } from '@/lib/server/studio/export';
import { slugify } from '@/lib/server/studio/react-site';
import { loadVersionForExport } from '@/lib/server/studio/version-files';
import { audit } from '@/lib/server/audit';

export const maxDuration = 60;
type P = { id: string };

/** Téléchargement du code source complet (ZIP) : toujours disponible, même sans GitHub. */
export const GET = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const v = new URL(request.url).searchParams.get('version');
  if (v && !UUID_RE.test(v)) throw badRequest('Version invalide.');
  const { version, project } = await loadVersionForExport(params.id, v);
  const files = await collectFiles(params.id, version.files, project.render, { checks: version.checks, build: version.build_report });
  const root = `${slugify(project.client_name || project.name)}-v${version.number}`;
  const data = zip(files, root);
  await db()`INSERT INTO deployments(project_id, version_id, provider, target, status, detail) VALUES (${params.id}, ${version.id}, 'zip', 'archive', 'succes', ${`${files.length} fichiers`})`;
  await audit('export_zip', { type: 'project', id: params.id }, { version: version.number });
  return new Response(Buffer.from(data), {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${root}.zip"`, 'Cache-Control': 'private, no-store' },
  });
});
