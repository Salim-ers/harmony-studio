/**
 * Erreurs HTTP, validation et enveloppe commune des routes API.
 * Les messages publics sont génériques ; les détails restent dans les logs serveur.
 */
import { randomUUID } from 'node:crypto';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { ConfigError } from './db';

export class HttpError extends Error {
  constructor(public status: number, public publicMessage: string, public code = 'ERREUR') {
    super(publicMessage);
    this.name = 'HttpError';
  }
}
export const badRequest = (m: string) => new HttpError(400, m, 'INVALIDE');
export const notFound = (m = 'Ressource introuvable.') => new HttpError(404, m, 'INTROUVABLE');
export const conflict = (m: string) => new HttpError(409, m, 'CONFLIT');
export const unauthorized = () => new HttpError(401, 'Accès administrateur requis.', 'NON_AUTHENTIFIE');
export const forbidden = (m = 'Requête non autorisée.') => new HttpError(403, m, 'INTERDIT');
export const tooMany = (m = 'Trop de requêtes. Réessayez dans quelques minutes.') => new HttpError(429, m, 'LIMITE');
export const upstream = (m: string) => new HttpError(502, m, 'SERVICE_EXTERNE');
export const notConfigured = (m: string) => new HttpError(503, m, 'NON_CONFIGURE');

/** Journal structuré, sans secret : on ne journalise jamais corps de requête, cookies ou clés. */
export function logError(context: string, error: unknown, extra: Record<string, unknown> = {}) {
  const id = randomUUID().slice(0, 8);
  const err = error instanceof Error ? { name: error.name, message: redact(error.message), stack: error.stack?.split('\n').slice(0, 6).join('\n') } : { message: redact(String(error)) };
  console.error(JSON.stringify({ level: 'error', id, context, ...extra, error: err, at: new Date().toISOString() }));
  return id;
}

const SECRET_PATTERNS = [/sk-ant-[A-Za-z0-9_-]+/g, /gh[pousr]_[A-Za-z0-9]{20,}/g, /github_pat_[A-Za-z0-9_]+/g, /postgres(ql)?:\/\/[^\s]+/g, /Bearer\s+[A-Za-z0-9._-]+/gi, /scrypt2?:[a-f0-9:]+/g];
export function redact(text: string) {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, '[masqué]'), text);
}

export function toResponse(error: unknown, context = 'api') {
  if (error instanceof HttpError) return Response.json({ error: error.publicMessage, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const where = first?.path?.length ? ` (${first.path.join('.')})` : '';
    return Response.json({ error: `Données invalides${where} : ${first?.message ?? 'format incorrect'}`, code: 'INVALIDE' }, { status: 400 });
  }
  if (error instanceof ConfigError) return Response.json({ error: error.message, code: 'NON_CONFIGURE' }, { status: 503 });
  if (error instanceof SyntaxError) return Response.json({ error: 'Corps de requête JSON invalide.', code: 'INVALIDE' }, { status: 400 });
  const pgCode = (error as { code?: string })?.code;
  if (pgCode === '42P01' || pgCode === '42703') {
    const id = logError(context, error);
    return Response.json({ error: `La base de données n'est pas à jour : exécutez « npm run db:migrate » (réf. ${id}).`, code: 'MIGRATION' }, { status: 503 });
  }
  if (pgCode === '23505') return Response.json({ error: 'Cet élément existe déjà.', code: 'CONFLIT' }, { status: 409 });
  const id = logError(context, error);
  return Response.json({ error: `Une erreur interne est survenue (réf. ${id}). Consultez les journaux du serveur.`, code: 'INTERNE' }, { status: 500 });
}

export async function readJson<S extends ZodTypeAny>(request: Request, schema: S, maxBytes = 200_000): Promise<ZodInfer<S>> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError(413, 'Requête trop volumineuse.', 'TROP_GROS');
  const text = await readBodyLimited(request, maxBytes);
  let data: unknown = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'Corps de requête JSON invalide.', 'JSON_INVALIDE'); }
  return schema.parse(data);
}

/** Lit le corps par morceaux et s'arrête dès que la limite est dépassée (même sans Content-Length, en « chunked »). */
export async function readBodyLimited(request: Request, maxBytes: number) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, 'Requête trop volumineuse.', 'TROP_GROS');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'private, no-store');
  return Response.json(data, { ...init, headers });
}

/** Vérifie que la requête mutante provient de l'application (protection CSRF en complément de SameSite). */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) throw forbidden();
  if (!origin) throw forbidden();
  const allowed = new Set<string>();
  try { allowed.add(new URL(request.url).origin); } catch { /* ignore */ }
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  if (host) allowed.add(`${proto}://${host}`);
  if (process.env.APP_ORIGIN) allowed.add(process.env.APP_ORIGIN.replace(/\/$/, ''));
  if (!allowed.has(origin)) throw forbidden();
}
