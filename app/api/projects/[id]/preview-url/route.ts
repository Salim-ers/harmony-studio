import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound } from '@/lib/server/http';
import { previewBase, signPreview } from '@/lib/server/studio/preview';

export const dynamic = 'force-dynamic';
type P = { id: string };

export const GET = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const requested = new URL(request.url).searchParams.get('version');
  if (requested && !UUID_RE.test(requested)) throw badRequest('Version invalide.');
  const rows = requested
    ? await db()<{ id: string }>`SELECT id FROM project_versions WHERE id = ${requested} AND project_id = ${params.id}`
    : await db()<{ id: string }>`SELECT current_version_id AS id FROM projects WHERE id = ${params.id} AND current_version_id IS NOT NULL`;
  if (!rows[0]?.id) throw notFound('Aucune version à prévisualiser.');
  const token = signPreview(params.id, rows[0].id);
  return json({ url: previewBase(token), versionId: rows[0].id, expiresInMinutes: 120 });
});
