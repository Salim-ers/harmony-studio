import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { restoreVersion } from '@/lib/server/studio/versions';
import { audit } from '@/lib/server/audit';

type P = { id: string; versionId: string };

export const POST = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.versionId)) throw badRequest('Identifiant invalide.');
  const active = await db()`SELECT 1 FROM generation_jobs WHERE project_id = ${params.id} AND status IN ('en_attente','en_cours','attente_reponse')`;
  if (active.length) throw badRequest('Une génération est en cours : terminez-la ou annulez-la avant de restaurer.');
  const saved = await restoreVersion(params.id, params.versionId);
  await db()`UPDATE projects SET status = 'Prêt pour revue' WHERE id = ${params.id}`;
  await db()`INSERT INTO project_messages(project_id, role, content, version_id) VALUES (${params.id}, 'system', ${`Version ${saved.number} créée par restauration.`}, ${saved.id})`;
  await audit('version_restauree', { type: 'project', id: params.id }, { from: params.versionId, to: saved.id });
  return json({ ok: true, versionId: saved.id, number: saved.number });
});
