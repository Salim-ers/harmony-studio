import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { diffVersions, getVersion } from '@/lib/server/studio/versions';

export const dynamic = 'force-dynamic';
type P = { id: string; versionId: string };

/** Différentiel entre une version et sa parente (ou la version ?against=). */
export const GET = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.versionId)) throw badRequest('Identifiant invalide.');
  const v = await getVersion(params.id, params.versionId);
  const against = new URL(request.url).searchParams.get('against') ?? v.parent_version_id;
  if (!against) return json({ base: null, diff: v.files.map((f) => ({ path: f.path, status: 'ajouté', added: f.content.split('\n').length, removed: 0, patch: '' })) });
  if (!UUID_RE.test(against)) throw badRequest('Version de comparaison invalide.');
  const base = await getVersion(params.id, against);
  return json({ base: { id: base.id, number: base.number }, diff: diffVersions(base.files, v.files) });
});
