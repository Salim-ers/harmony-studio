/**
 * Authentification du propriétaire unique de Harmony Studio.
 * - Mot de passe : hash scrypt dans ADMIN_PASSWORD_HASH (jamais en clair).
 * - Sessions : jeton aléatoire 256 bits dans un cookie HttpOnly ; seule son empreinte SHA-256
 *   est stockée en base (table admin_sessions) → déconnexion et révocation réelles.
 * - 2FA TOTP optionnelle via ADMIN_TOTP_SECRET.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from './db';
import { env } from './env';
import { unauthorized } from './http';
import { hashKey } from './ratelimit';

// Durées par défaut resserrées après audit (L5) : 3 jours maximum, 12 h d'inactivité. Réglables par variables d'environnement.
export const SESSION_ABSOLUTE_HOURS = Number(process.env.SESSION_TTL_HOURS || 72);
export const SESSION_IDLE_HOURS = Number(process.env.SESSION_IDLE_HOURS || 12);

export function cookieName() {
  return env.isProduction() ? '__Host-harmony_session' : 'harmony_session';
}

/** Hash de démonstration constant : permet un temps de calcul identique quand l'e-mail est faux. */
const DUMMY_SALT = '00000000000000000000000000000000';

/**
 * Paramètres scrypt actuels (équivalence OWASP « N=2^14, r=8, p=5 ») : même mémoire que les paramètres par défaut
 * de Node (16 Mo par calcul, sans risque de saturation si plusieurs connexions arrivent en même temps sur une
 * fonction Vercel), mais cinq fois plus coûteux en calcul pour un attaquant.
 * Formats acceptés :
 *  - « scrypt2:N:r:p:sel:hash » (actuel, produit par npm run hash-password) ;
 *  - « scrypt:sel:hash » (V1 : N=16384, r=8, p=1) — toujours valide, à régénérer quand vous changez de mot de passe.
 */
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 5 } as const;

type ParsedHash = { salt: string; hash: Buffer; N: number; r: number; p: number };

function parseHash(raw: string): ParsedHash | null {
  const parts = raw.split(':');
  const hexOk = (salt: string, hash: string) => /^[a-f0-9]{32}$/.test(salt) && /^[a-f0-9]{128}$/.test(hash);
  if (parts.length === 3 && parts[0] === 'scrypt' && hexOk(parts[1], parts[2])) return { salt: parts[1], hash: Buffer.from(parts[2], 'hex'), N: 16384, r: 8, p: 1 };
  if (parts.length === 6 && parts[0] === 'scrypt2' && hexOk(parts[4], parts[5])) {
    const [N, r, p] = parts.slice(1, 4).map(Number);
    // Bornes : empêchent une configuration erronée de rendre chaque connexion excessivement coûteuse.
    const powerOfTwo = Number.isInteger(N) && N >= 16384 && N <= 131072 && (N & (N - 1)) === 0;
    if (powerOfTwo && Number.isInteger(r) && r >= 8 && r <= 16 && Number.isInteger(p) && p >= 1 && p <= 16) return { salt: parts[4], hash: Buffer.from(parts[5], 'hex'), N, r, p };
  }
  return null;
}

function derive(password: string, salt: string, params: { N: number; r: number; p: number }) {
  return scryptSync(password.slice(0, 512), salt, 64, { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r });
}

export function verifyPassword(password: string) {
  const parsed = parseHash(env.adminPasswordHash());
  const candidate = derive(password, parsed?.salt ?? DUMMY_SALT, parsed ?? SCRYPT_PARAMS);
  if (!parsed) return false;
  return parsed.hash.length === candidate.length && timingSafeEqual(candidate, parsed.hash);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt2:${N}:${r}:${p}:${salt}:${derive(password, salt, SCRYPT_PARAMS).toString('hex')}`;
}

export function verifyEmail(email: string) {
  const expected = env.adminEmail();
  const given = email.trim().toLowerCase();
  if (!expected) return false;
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function assertSessionSecret() {
  if (env.sessionSecret().length < 32) throw new Error('SESSION_SECRET doit contenir au moins 32 caractères.');
}

export async function createSession(meta: { ip: string; userAgent: string; mfa: boolean }) {
  assertSessionSecret();
  const token = randomBytes(32).toString('base64url');
  const sql = db();
  await sql`INSERT INTO admin_sessions(token_hash, expires_at, ip_hash, user_agent, mfa)
    VALUES (${tokenHash(token)}, now() + make_interval(hours => ${SESSION_ABSOLUTE_HOURS}), ${hashKey(meta.ip)}, ${meta.userAgent.slice(0, 200)}, ${meta.mfa})`;
  // Nettoyage opportuniste des sessions expirées.
  await sql`DELETE FROM admin_sessions WHERE expires_at < now() - interval '30 days'`;
  const jar = await cookies();
  jar.set(cookieName(), token, {
    httpOnly: true,
    secure: env.isProduction(),
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_ABSOLUTE_HOURS * 3600,
  });
}

export type Session = { id: string; createdAt: string; mfa: boolean };

/** Vérifie le cookie contre la base. Retourne null si absent, expiré, inactif trop longtemps ou révoqué. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(cookieName())?.value ?? '';
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const sql = db();
  const rows = await sql<{ id: string; created_at: Date; mfa: boolean; last_seen_at: Date }>`
    SELECT id, created_at, mfa, last_seen_at FROM admin_sessions
    WHERE token_hash = ${tokenHash(token)} AND revoked_at IS NULL AND expires_at > now()
      AND last_seen_at > now() - make_interval(hours => ${SESSION_IDLE_HOURS})`;
  const row = rows[0];
  if (!row) return null;
  // Exiger la 2FA si elle a été activée après l'ouverture de la session.
  if (env.totpSecret() && !row.mfa) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60 * 1000) {
    await sql`UPDATE admin_sessions SET last_seen_at = now() WHERE id = ${row.id}`;
  }
  return { id: row.id, createdAt: new Date(row.created_at).toISOString(), mfa: row.mfa };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw unauthorized();
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(cookieName())?.value;
  if (token) await db()`UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = ${tokenHash(token)} AND revoked_at IS NULL`;
  jar.set(cookieName(), '', { httpOnly: true, secure: env.isProduction(), sameSite: 'strict', path: '/', maxAge: 0 });
}

export async function revokeOtherSessions(currentId: string) {
  const rows = await db()`UPDATE admin_sessions SET revoked_at = now() WHERE id <> ${currentId} AND revoked_at IS NULL RETURNING id`;
  return rows.length;
}
