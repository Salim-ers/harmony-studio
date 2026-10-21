import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json, readJson } from '@/lib/server/http';
import { approvePlan, jobSnapshot } from '@/lib/server/studio/jobs';
import { planSchema } from '@/lib/server/ai/prompts';

type P = { id: string };
const schema = z.object({ plan: planSchema.optional(), answers: z.string().max(4000).optional() });

export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const b = await readJson(request, schema, 300_000);
  await approvePlan(params.id, b);
  return json(await jobSnapshot(params.id));
});
