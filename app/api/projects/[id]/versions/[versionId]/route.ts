import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { getVersion } from '@/lib/server/studio/versions';

export const dynamic = 'force-dynamic';
type P = { id: string; versionId: string };

export const GET = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.versionId)) throw badRequest('Identifiant invalide.');
  return json({ version: await getVersion(params.id, params.versionId) });
});
