/**
 * Format d'échange des fichiers générés par Claude :
 *   <<<FICHIER chemin="index.html">>>
 *   …contenu…
 *   <<<FIN>>>
 * Plus robuste que du JSON pour de gros contenus (pas d'échappement).
 * Chaque chemin est validé : aucun chemin absolu, aucun « .. », extensions autorisées uniquement.
 */

export type GenFile = { path: string; content: string };

const STATIC_EXT = ['html', 'css', 'js', 'xml', 'txt', 'svg', 'json', 'webmanifest', 'md'];
const REACT_EXT = ['html', 'css', 'js', 'jsx', 'json', 'svg', 'md', 'txt', 'xml'];
const APP_EXT = [...STATIC_EXT, 'ts', 'tsx', 'mjs', 'cjs', 'sql', 'yml', 'yaml', 'example', 'gitignore', 'local-example', 'prisma'];
const FORBIDDEN_NAMES = new Set(['.env', '.env.local', '.env.production', '.npmrc', 'id_rsa']);
export const MAX_FILE_BYTES = 400_000;
export const MAX_FILES = 220;

export type ProjectKind = 'static' | 'react' | 'app';

export function safePath(raw: string, kind: ProjectKind): string | null {
  const p = raw.trim().replace(/^\.\//, '');
  if (!p || p.length > 160 || p.startsWith('/') || p.includes('\\') || p.includes('\0')) return null;
  if (!/^[A-Za-z0-9._\-/()[\]@]+$/.test(p)) return null;
  const segments = p.split('/');
  if (segments.length > 8 || segments.some((s) => !s || s === '.' || s === '..')) return null;
  if (segments.includes('node_modules') || segments.includes('.git')) return null;
  const name = segments[segments.length - 1];
  if (FORBIDDEN_NAMES.has(name)) return null;
  if (kind === 'static' && segments[0] === 'images' && !name.endsWith('.svg')) return null;
  if (kind === 'react' && (segments[0] === 'images' || (segments[0] === 'public' && segments[1] === 'images'))) return null;
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const allowed = kind === 'app' ? APP_EXT : kind === 'react' ? REACT_EXT : STATIC_EXT;
  if (!allowed.includes(ext) && !(kind === 'app' && ['.gitignore', '.env.example', '.eslintrc', '.nvmrc', 'Dockerfile'].includes(name))) return null;
  return p;
}

export type ParseResult = { files: GenFile[]; deleted: string[]; summary: string; rejected: string[]; truncated: boolean };

export function parseFiles(text: string, kind: ProjectKind): ParseResult {
  const files: GenFile[] = [];
  const rejected: string[] = [];
  const re = /<<<FICHIER chemin="([^"]+)">>>\r?\n?([\s\S]*?)\r?\n?<<<FIN>>>/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = re.exec(text))) {
    lastEnd = re.lastIndex;
    const path = safePath(m[1], kind);
    let content = m[2];
    // Certains modèles entourent le contenu d'un bloc ``` : on le retire.
    const fence = content.match(/^```[a-z]*\r?\n([\s\S]*?)\r?\n```\s*$/i);
    if (fence) content = fence[1];
    if (!path) { rejected.push(m[1].slice(0, 160)); continue; }
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) { rejected.push(`${path} (trop volumineux)`); continue; }
    const existing = files.findIndex((f) => f.path === path);
    if (existing >= 0) files[existing] = { path, content };
    else files.push({ path, content });
  }
  const deleted = [...text.matchAll(/<<<SUPPRIMER chemin="([^"]+)">>>/g)].map((x) => safePath(x[1], kind)).filter((x): x is string => !!x);
  const summary = (text.match(/<<<RESUME>>>\r?\n?([\s\S]*?)\r?\n?<<<FIN>>>/)?.[1] ?? '').trim().slice(0, 4000);
  const tail = text.slice(lastEnd);
  const truncated = /<<<FICHIER chemin="[^"]+">>>/.test(tail) && !/<<<FIN>>>/.test(tail.slice(tail.lastIndexOf('<<<FICHIER')));
  return { files: files.slice(0, MAX_FILES), deleted, summary, rejected, truncated };
}

/** Extrait le premier objet JSON d'une réponse (tolère un bloc ```json). */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Réponse JSON introuvable');
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

export function filesToMap(files: GenFile[]) {
  return Object.fromEntries(files.map((f) => [f.path, f.content])) as Record<string, string>;
}
export function mapToFiles(map: Record<string, string>): GenFile[] {
  return Object.keys(map).sort().map((path) => ({ path, content: map[path] }));
}
