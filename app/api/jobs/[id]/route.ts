import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { jobSnapshot } from '@/lib/server/studio/jobs';

export const dynamic = 'force-dynamic';
type P = { id: string };

export const GET = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  return json(await jobSnapshot(params.id));
});
