import { createHmac, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'harmony_admin';
const TTL = 7 * 24 * 3600;
function secret() {
  const s = process.env.SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('SESSION_SECRET doit contenir au moins 32 caractères.');
  return s;
}
function sign(s: string) { return createHmac('sha256', secret()).update(s).digest('base64url'); }
export function verifyPassword(password: string) {
  const parts = (process.env.ADMIN_PASSWORD_HASH ?? '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1])) return false;
  try {
    const candidate = scryptSync(password, parts[1], 64);
    const expected = Buffer.from(parts[2], 'hex');
    return expected.length === candidate.length && timingSafeEqual(candidate, expected);
  } catch { return false; }
}
export async function issueSession() {
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', exp: Math.floor(Date.now()/1000) + TTL })).toString('base64url');
  const cookieJar = await cookies();
  cookieJar.set(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: TTL });
}
export async function clearSession() {
  (await cookies()).set(COOKIE, '', { path:'/', maxAge: 0 });
}
export async function isAuthenticated() {
  const token = (await cookies()).get(COOKIE)?.value ?? '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  try {
    const actual = Buffer.from(sign(payload));
    const given = Buffer.from(signature);
    if (actual.length !== given.length || !timingSafeEqual(actual, given)) return false;
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return obj.sub === 'admin' && typeof obj.exp === 'number' && obj.exp > Date.now()/1000;
  } catch { return false; }
}
export async function requireAdmin() {
  if (!(await isAuthenticated())) throw new Error('UNAUTHORIZED');
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new Error('ORIGIN');
}
export function ipHash(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  return createHash('sha256').update(ip + secret()).digest('hex');
}
export function apiError(error: unknown) {
  const msg = error instanceof Error ? error.message : 'Erreur inconnue';
  if (msg === 'UNAUTHORIZED') return Response.json({ error:'Accès administrateur requis.' }, {status:401});
  if (msg === 'ORIGIN') return Response.json({ error:'Requête non autorisée.' }, {status:403});
  if (msg.startsWith('INVALID:')) return Response.json({error:msg.slice(8)}, {status:400});
  if (/^(Claude :|Recherche Brave indisponible|La réponse Claude|Claude a atteint)/.test(msg))
    return Response.json({error:msg}, {status:502});
  console.error('API error', error);
  return Response.json({error:msg.includes('non configur') ? msg : 'Une erreur est survenue. Vérifie les variables, la base de données et les logs Vercel.'}, {status:500});
}
