/**
 * Serveur d'aperçu ISOLÉ (voir lib/server/studio/preview.ts).
 * Pas de session requise : l'accès repose sur un jeton signé, temporaire et propre à une version.
 * Le document est servi avec « CSP: sandbox » → origine opaque, aucun accès aux données de Harmony Studio.
 */
import { db, UUID_RE } from '@/lib/server/db';
import { contentTypeFor, previewHeaders, verifyPreview } from '@/lib/server/studio/preview';
import { previewIndexHtml } from '@/lib/server/studio/react-site';
import { readVariant } from '@/lib/server/studio/media';
import type { GenFile } from '@/lib/server/ai/fileformat';

export const dynamic = 'force-dynamic';

function notFoundPage() {
  return new Response('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Aperçu indisponible</title><p style="font-family:sans-serif;padding:2rem">Aperçu introuvable ou expiré (validité 30 min, liée à votre session). Cliquez sur « Recharger » dans Harmony Studio.</p></html>', { status: 404, headers: previewHeaders('text/html; charset=utf-8') });
}

export async function GET(_request: Request, context: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token, path = [] } = await context.params;
  const access = verifyPreview(token);
  if (!access || !UUID_RE.test(access.projectId) || !UUID_RE.test(access.versionId) || !UUID_RE.test(access.sessionId)) return notFoundPage();
  let rel: string;
  try { rel = path.map((p) => decodeURIComponent(p)).join('/'); } catch { return notFoundPage(); }
  if (rel.includes('..') || rel.includes('\\') || rel.length > 200) return notFoundPage();
  const sql = db();
  // Le jeton meurt avec la session qui l'a émis (déconnexion, révocation, expiration).
  const live = await sql`SELECT 1 FROM admin_sessions WHERE id = ${access.sessionId} AND revoked_at IS NULL AND expires_at > now()`;
  if (!live.length) return notFoundPage();
  const [version] = await sql<{ files: GenFile[]; preview_js: string | null; preview_css: string | null; render: string }>`
    SELECT v.files, v.preview_js, v.preview_css, p.render FROM project_versions v JOIN projects p ON p.id = v.project_id
    WHERE v.id = ${access.versionId} AND v.project_id = ${access.projectId}`;
  if (!version) return notFoundPage();
  const files = new Map(version.files.map((f) => [f.path, f.content]));

  if (rel.startsWith('images/')) {
    const slug = rel.slice(7);
    const [asset] = await sql<{ media_id: string; kind: string }>`SELECT a.media_id, m.kind FROM project_assets a JOIN media_files m ON m.id = a.media_id
      WHERE a.project_id = ${access.projectId} AND a.slug = ${slug}`;
    if (!asset || asset.kind !== 'image') {
      const svg = files.get(rel) ?? files.get(`public/${rel}`);
      if (svg && rel.endsWith('.svg')) return new Response(svg, { headers: previewHeaders('image/svg+xml') });
      return new Response('', { status: 404, headers: previewHeaders('text/plain') });
    }
    const media = await readVariant(asset.media_id, 'web');
    return new Response(new Uint8Array(media.data), { headers: previewHeaders(media.mime) });
  }

  if (version.render === 'react') {
    if (rel === '__apercu/app.js') return new Response(version.preview_js ?? 'document.body.innerHTML="<p style=\\"font-family:sans-serif;padding:2rem\\">Aperçu non compilé pour cette version.</p>"', { headers: previewHeaders('text/javascript; charset=utf-8') });
    if (rel === '__apercu/app.css') return new Response(version.preview_css ?? '', { headers: previewHeaders('text/css; charset=utf-8') });
    const publicFile = files.get(`public/${rel}`);
    if (rel && publicFile !== undefined) return new Response(publicFile, { headers: previewHeaders(contentTypeFor(rel)) });
    const index = files.get('index.html') ?? '<!doctype html><div id="root"></div>';
    return new Response(previewIndexHtml(index, `/apercu/${token}/`), { headers: previewHeaders('text/html; charset=utf-8') });
  }

  const target = rel === '' ? 'index.html' : rel.endsWith('/') ? `${rel}index.html` : rel;
  if (target.split('/').some((s) => s.startsWith('_'))) return notFoundPage();
  const content = files.get(target);
  if (content === undefined) return notFoundPage();
  return new Response(content, { headers: previewHeaders(contentTypeFor(target)) });
}
