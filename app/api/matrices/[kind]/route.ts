import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { activateVersion, getActiveMatrices, getVersionContent, listVersions, restoreDefault, saveMatrixVersion } from '@/lib/server/ai/matrices';
import { DEFAULT_MATRICES } from '@/lib/server/ai/default-matrices';
import { MATRIX_KINDS, type MatrixKind } from '@/lib/shared/constants';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';
type P = { kind: string };
const kindOf = (k: string) => { if (!(k in MATRIX_KINDS)) throw badRequest('Matrice inconnue.'); return k as MatrixKind; };

export const GET = adminRoute<P>(async ({ request, params }) => {
  const kind = kindOf(params.kind);
  const version = new URL(request.url).searchParams.get('version');
  if (version) {
    const content = await getVersionContent(kind, Number(version));
    if (content === null) throw notFound('Version introuvable.');
    return json({ content });
  }
  const active = (await getActiveMatrices())[kind];
  return json({ kind, label: MATRIX_KINDS[kind], active, defaultContent: DEFAULT_MATRICES[kind], versions: await listVersions(kind) });
});

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enregistrer'), content: z.string().min(30).max(60000), note: z.string().max(200).default('') }),
  z.object({ action: z.literal('activer'), version: z.number().int().min(1) }),
  z.object({ action: z.literal('defaut') }),
]);

export const POST = adminRoute<P>(async ({ request, params }) => {
  const kind = kindOf(params.kind);
  const b = await readJson(request, schema, 300_000);
  if (b.action === 'enregistrer') {
    const version = await saveMatrixVersion(kind, b.content, b.note);
    await audit('matrice_enregistree', { type: 'matrice', id: kind }, { version });
    return json({ ok: true, version });
  }
  if (b.action === 'activer') {
    if (!(await activateVersion(kind, b.version))) throw notFound('Version introuvable.');
    await audit('matrice_activee', { type: 'matrice', id: kind }, { version: b.version });
    return json({ ok: true });
  }
  await restoreDefault(kind);
  await audit('matrice_defaut', { type: 'matrice', id: kind });
  return json({ ok: true });
});
