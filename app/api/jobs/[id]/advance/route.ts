import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { advanceJob } from '@/lib/server/studio/jobs';

// Une étape = au plus un appel Claude. Vercel Pro autorise jusqu'à 800 s (Hobby : 300 s).
export const maxDuration = 300;
type P = { id: string };

export const POST = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  return json(await advanceJob(params.id));
}, { limit: 'ai' });
