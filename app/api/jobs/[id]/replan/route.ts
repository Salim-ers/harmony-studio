import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json, readJson } from '@/lib/server/http';
import { jobSnapshot, replan } from '@/lib/server/studio/jobs';

type P = { id: string };
const schema = z.object({ feedback: z.string().trim().min(3).max(4000) });

export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const b = await readJson(request, schema);
  await replan(params.id, b.feedback);
  return json(await jobSnapshot(params.id));
});
