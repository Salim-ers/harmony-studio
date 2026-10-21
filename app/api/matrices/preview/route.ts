import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { composeAuditPrompt, composeGenerationPrompt, getActiveMatrices, variablesFor } from '@/lib/server/ai/matrices';
import { getAssets, getProject } from '@/lib/server/studio/projects';

export const dynamic = 'force-dynamic';

/** Aperçu du prompt composé (matrices + variables d'un projet ou d'un exemple neutre). */
export const GET = adminRoute(async ({ request }) => {
  const projectId = new URL(request.url).searchParams.get('projectId');
  const matrices = await getActiveMatrices();
  if (projectId) {
    if (!UUID_RE.test(projectId)) throw badRequest('Identifiant invalide.');
    const project = await getProject(projectId);
    const assets = await getAssets(projectId);
    const vars = variablesFor(project.brief_data ?? {}, assets, project.plan?.pages.map((p) => p.titre));
    return json({ generation: composeGenerationPrompt(matrices, vars, project.matrix_overrides), audit: composeAuditPrompt(matrices, vars, project.matrix_overrides), variables: vars });
  }
  const vars = variablesFor({ clientName: 'Exemple Client', sector: '(métier du client)', city: '(ville)' }, []);
  return json({ generation: composeGenerationPrompt(matrices, vars), audit: composeAuditPrompt(matrices, vars), variables: vars });
});
