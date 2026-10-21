/**
 * Aperçu ISOLÉ des projets générés.
 * - Jeton signé HMAC, limité dans le temps, propre à une version (pas de cookie nécessaire).
 * - Réponses servies avec « Content-Security-Policy: sandbox allow-scripts » : le document a une
 *   origine opaque, même ouvert directement → aucun accès aux cookies, au stockage ni aux API de
 *   Harmony Studio. Option recommandée : PREVIEW_ORIGIN (domaine distinct).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env';

const TTL_SECONDS = 2 * 3600;

function key() {
  const secret = env.sessionSecret();
  if (secret.length < 32) throw new Error('SESSION_SECRET manquant');
  return createHmac('sha256', secret).update('harmony-preview-v1').digest();
}

export function signPreview(projectId: string, versionId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ p: projectId, v: versionId, e: Math.floor(now / 1000) + TTL_SECONDS })).toString('base64url');
  const sig = createHmac('sha256', key()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyPreview(token: string, now = Date.now()): { projectId: string; versionId: string } | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig || payload.length > 300) return null;
  const expected = createHmac('sha256', key()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { p: string; v: string; e: number };
    if (typeof data.e !== 'number' || data.e < now / 1000) return null;
    return { projectId: data.p, versionId: data.v };
  } catch {
    return null;
  }
}

export function previewBase(token: string) {
  return `${env.previewOrigin()}/apercu/${token}/`;
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8',
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webmanifest: 'application/manifest+json',
};
export function contentTypeFor(path: string) {
  return TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

export function previewHeaders(contentType: string) {
  const ancestors = env.appOrigin() ? `'self' ${env.appOrigin()}` : "'self'";
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': [
      'sandbox allow-scripts allow-popups allow-forms',
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self'",
      "connect-src 'none'",
      "form-action 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      `frame-ancestors ${ancestors}`,
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'private, max-age=300',
  };
}
