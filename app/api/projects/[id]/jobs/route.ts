import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json, readJson } from '@/lib/server/http';
import { createJob, jobSnapshot } from '@/lib/server/studio/jobs';
import { getCurrentVersion } from '@/lib/server/studio/versions';

type P = { id: string };
const schema = z.object({
  kind: z.enum(['creation', 'modification', 'correction', 'construction']),
  instruction: z.string().trim().max(4000).optional(),
  autoContinue: z.boolean().default(false),
});

export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const b = await readJson(request, schema);
  if (b.kind === 'modification' && !b.instruction) throw badRequest('Décrivez la modification souhaitée.');
  let problems: string[] | undefined;
  if (b.kind === 'correction') {
    const current = await getCurrentVersion(params.id);
    problems = (current?.checks?.items ?? []).filter((i) => i.level === 'erreur').map((i) => `${i.file} : ${i.message}`);
    if (!problems.length) throw badRequest('Aucune erreur bloquante à corriger dans la version actuelle.');
  }
  const jobId = await createJob(params.id, b.kind, { instruction: b.instruction, autoContinue: b.autoContinue, problems });
  return json(await jobSnapshot(jobId), { status: 201 });
}, { limit: 'ai' });
