import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { cancelJob, jobSnapshot } from '@/lib/server/studio/jobs';

type P = { id: string };

export const POST = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  await cancelJob(params.id);
  return json(await jobSnapshot(params.id));
});
