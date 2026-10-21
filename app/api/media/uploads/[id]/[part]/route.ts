import { adminRoute } from '@/lib/server/api';
import { UUID_RE } from '@/lib/server/db';
import { badRequest, json, HttpError } from '@/lib/server/http';
import { CHUNK_BYTES, putPart } from '@/lib/server/studio/media';

type P = { id: string; part: string };

/** Réception d'un bloc binaire (≤ 1 Mo) ; corps application/octet-stream. */
export const PUT = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id) || !/^\d{1,3}$/.test(params.part)) throw badRequest('Paramètres invalides.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > CHUNK_BYTES) throw new HttpError(413, 'Bloc trop volumineux.', 'TROP_GROS');
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > CHUNK_BYTES) throw new HttpError(413, 'Bloc trop volumineux.', 'TROP_GROS');
  await putPart(params.id, Number(params.part), buf);
  return json({ ok: true });
}, { limit: 'upload' });
