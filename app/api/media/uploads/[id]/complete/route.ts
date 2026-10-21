import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { completeUpload } from '@/lib/server/studio/media';

export const maxDuration = 60;
type P = { id: string };

export const POST = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  return json(await completeUpload(params.id));
}, { limit: 'upload' });
