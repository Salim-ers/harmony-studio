/**
 * Médias clients PRIVÉS : stockés dans Neon (BYTEA découpé en blocs), jamais publics.
 * - Upload découpé (blocs ≤ 1 Mo) pour respecter la limite de corps des fonctions Vercel (4,5 Mo).
 * - Contrôle du type RÉEL (signature binaire), pas seulement de l'extension ou du MIME déclaré.
 * - Originaux conservés intacts ; dérivés optimisés (web, IA, vignette) sans métadonnées EXIF,
 *   orientation EXIF appliquée.
 * - Fournis à Claude en base64 par le serveur (aucune URL publique).
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { db, toBytea } from '../db';
import { badRequest, notFound } from '../http';

export const CHUNK_BYTES = 1_000_000;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const ALLOWED_DECLARED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'];

export type Variant = 'original' | 'web' | 'ai' | 'thumb';

export function sniffType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' | 'application/pdf' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(buf.toString('ascii', 8, 12))) return 'image/avif';
  if (buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export function sanitizeName(name: string) {
  return name.normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'fichier';
}

export async function initUpload(p: { name: string; size: number; mime: string }) {
  if (!ALLOWED_DECLARED.includes(p.mime)) throw badRequest('Format non accepté : JPEG, PNG, WebP, AVIF ou PDF uniquement (HEIC : exportez en JPEG).');
  const max = p.mime === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (p.size <= 0 || p.size > max) throw badRequest(`Fichier trop volumineux (maximum ${Math.round(max / 1024 / 1024)} Mo).`);
  const parts = Math.ceil(p.size / CHUNK_BYTES);
  const [row] = await db()<{ id: string }>`INSERT INTO media_files(original_name, kind, mime, expected_size, expected_parts, status)
    VALUES (${sanitizeName(p.name)}, ${p.mime === 'application/pdf' ? 'pdf' : 'image'}, ${p.mime}, ${p.size}, ${parts}, 'upload') RETURNING id`;
  return { id: row.id, parts, chunkBytes: CHUNK_BYTES };
}

export async function putPart(id: string, index: number, bytes: Buffer) {
  const sql = db();
  const [file] = await sql<{ status: string; expected_parts: number; expected_size: number }>`SELECT status, expected_parts, expected_size FROM media_files WHERE id = ${id}`;
  if (!file) throw notFound('Envoi introuvable.');
  if (file.status !== 'upload') throw badRequest('Cet envoi est déjà terminé.');
  if (!Number.isInteger(index) || index < 0 || index >= file.expected_parts) throw badRequest('Numéro de bloc invalide.');
  const expected = index === file.expected_parts - 1 ? file.expected_size - index * CHUNK_BYTES : CHUNK_BYTES;
  if (bytes.length !== expected) throw badRequest('Taille de bloc incorrecte.');
  await sql`INSERT INTO blob_chunks(media_id, variant, idx, data) VALUES (${id}, 'upload', ${index}, ${toBytea(bytes)}::bytea)
    ON CONFLICT (media_id, variant, idx) DO UPDATE SET data = EXCLUDED.data`;
}

async function readChunks(id: string, variant: string, count?: number) {
  const sql = db();
  const n = count ?? Number((await sql<{ n: number }>`SELECT count(*)::int AS n FROM blob_chunks WHERE media_id = ${id} AND variant = ${variant}`)[0]?.n ?? 0);
  const parts: Buffer[] = [];
  for (let i = 0; i < n; i++) {
    const rows = await sql<{ b64: string }>`SELECT encode(data, 'base64') AS b64 FROM blob_chunks WHERE media_id = ${id} AND variant = ${variant} AND idx = ${i}`;
    if (!rows[0]) throw new Error(`Bloc manquant ${i}`);
    parts.push(Buffer.from(rows[0].b64.replace(/\s+/g, ''), 'base64'));
  }
  return Buffer.concat(parts);
}

async function writeVariant(id: string, variant: Variant, buf: Buffer, mime: string, width: number | null, height: number | null) {
  const sql = db();
  const chunks = Math.max(1, Math.ceil(buf.length / CHUNK_BYTES));
  await sql`DELETE FROM blob_chunks WHERE media_id = ${id} AND variant = ${variant}`;
  for (let i = 0; i < chunks; i++) {
    await sql`INSERT INTO blob_chunks(media_id, variant, idx, data) VALUES (${id}, ${variant}, ${i}, ${toBytea(buf.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES))}::bytea)`;
  }
  await sql`INSERT INTO media_variants(media_id, variant, mime, size, width, height, chunks) VALUES (${id}, ${variant}, ${mime}, ${buf.length}, ${width}, ${height}, ${chunks})
    ON CONFLICT (media_id, variant) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size, width = EXCLUDED.width, height = EXCLUDED.height, chunks = EXCLUDED.chunks`;
}

/** 64 Mpx : couvre les capteurs de 50 Mpx ; au-delà (modes 108/200 Mpx), le décodage serait trop gourmand en mémoire. */
export const MAX_INPUT_PIXELS = 64_000_000;
class TooManyPixelsError extends Error {}

export async function processImage(buf: Buffer) {
  // metadata() lit seulement l'en-tête (aucun décodage) : on peut contrôler la taille avant toute allocation.
  const meta = await sharp(buf, { limitInputPixels: false, failOn: 'error' }).metadata();
  if (!meta.width || !meta.height) throw badRequest('Image illisible.');
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new TooManyPixelsError();
  const rotated = () => sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const web = await rotated().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 100, effort: 4 }).toBuffer({ resolveWithObject: true });
  const ai = meta.hasAlpha
    ? await rotated().resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
    : await rotated().resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const thumb = await rotated().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer({ resolveWithObject: true });
  return { meta, web, ai, aiMime: meta.hasAlpha ? 'image/png' : 'image/jpeg', thumb };
}

export async function completeUpload(id: string) {
  const sql = db();
  const [file] = await sql<{ status: string; expected_parts: number; expected_size: number; mime: string }>`SELECT status, expected_parts, expected_size, mime FROM media_files WHERE id = ${id}`;
  if (!file) throw notFound('Envoi introuvable.');
  if (file.status !== 'upload') throw badRequest('Cet envoi est déjà terminé.');
  const buf = await readChunks(id, 'upload', file.expected_parts).catch(() => { throw badRequest('Envoi incomplet : certains blocs manquent.'); });
  const reject = async (message: string) => {
    await sql`UPDATE media_files SET status = 'rejete' WHERE id = ${id}`;
    await sql`DELETE FROM blob_chunks WHERE media_id = ${id}`;
    throw badRequest(message);
  };
  if (buf.length !== file.expected_size) return reject('Taille finale incorrecte.');
  const real = sniffType(buf);
  if (!real) return reject('Contenu refusé : le fichier n’est pas une image JPEG/PNG/WebP/AVIF ou un PDF valide (les exécutables, SVG et HTML sont interdits).');
  if ((real === 'application/pdf') !== (file.mime === 'application/pdf')) return reject('Le type réel du fichier ne correspond pas au type déclaré.');
  const sha = createHash('sha256').update(buf).digest('hex');
  let width: number | null = null, height: number | null = null;
  if (real === 'application/pdf') {
    // Filtre INDICATIF (un PDF peut masquer ces mots-clés par encodage ou compression) : la vraie protection est
    // que les PDF ne sont jamais rendus dans le Studio (téléchargement forcé, CSP sandbox) ni transmis tels quels aux sites.
    if (/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(buf.toString('latin1'))) return reject('PDF refusé : il contient du JavaScript, une action de lancement ou un fichier embarqué.');
    await writeVariant(id, 'original', buf, real, null, null);
    await writeVariant(id, 'ai', buf, real, null, null);
  } else {
    let processed;
    try { processed = await processImage(buf); } catch (e) {
      if (e instanceof TooManyPixelsError) return reject(`Résolution trop élevée (plus de ${MAX_INPUT_PIXELS / 1_000_000} mégapixels) : exportez la photo en résolution standard (12 à 50 Mpx), puis renvoyez-la.`);
      return reject('Image corrompue ou non décodable.');
    }
    const { meta, web, ai, aiMime, thumb } = processed;
    const swap = (meta.orientation ?? 1) >= 5;
    width = (swap ? meta.height : meta.width) ?? null;
    height = (swap ? meta.width : meta.height) ?? null;
    await writeVariant(id, 'original', buf, real, width, height);
    await writeVariant(id, 'web', web.data, 'image/webp', web.info.width, web.info.height);
    await writeVariant(id, 'ai', ai.data, aiMime, ai.info.width, ai.info.height);
    await writeVariant(id, 'thumb', thumb.data, 'image/webp', thumb.info.width, thumb.info.height);
  }
  await sql`DELETE FROM blob_chunks WHERE media_id = ${id} AND variant = 'upload'`;
  await sql`UPDATE media_files SET status = 'pret', mime = ${real}, size = ${buf.length}, sha256 = ${sha}, width = ${width}, height = ${height} WHERE id = ${id}`;
  return { id, mime: real, size: buf.length, width, height, sha256: sha };
}

export async function readVariant(id: string, variant: Variant) {
  const [v] = await db()<{ mime: string; chunks: number; size: number }>`SELECT mime, chunks, size FROM media_variants WHERE media_id = ${id} AND variant = ${variant}`;
  if (!v) throw notFound('Média introuvable.');
  return { mime: v.mime, data: await readChunks(id, variant, v.chunks) };
}

/** Rapatrie une photo V1 (Vercel Blob public) dans le stockage privé. Domaine strictement limité. */
export async function importLegacyBlob(url: string) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.public.blob.vercel-storage.com')) throw badRequest('Seules les photos V1 Vercel Blob peuvent être importées.');
  const { safeFetch } = await import('../safe-fetch');
  const res = await safeFetch(url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15000, maxRedirects: 0 });
  if (res.status !== 200 || res.truncated) throw badRequest('Photo V1 inaccessible ou trop volumineuse.');
  const mime = sniffType(res.bytes);
  if (!mime || mime === 'application/pdf') throw badRequest('Photo V1 au format non reconnu.');
  const init = await initUpload({ name: decodeURIComponent(u.pathname.split('/').pop() || 'photo-v1'), size: res.bytes.length, mime });
  for (let i = 0; i < init.parts; i++) await putPart(init.id, i, res.bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
  return completeUpload(init.id);
}
