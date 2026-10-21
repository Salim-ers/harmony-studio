import { beforeEach, describe, expect, it } from 'vitest';
import { body, ctx, jar, req } from './helpers';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as dashboard } from '@/app/api/dashboard/route';
import { GET as health } from '@/app/api/health/route';
import { GET as cron } from '@/app/api/cron/route';
import { DELETE as revokeOthers } from '@/app/api/security/sessions/route';
import { POST as createProspect } from '@/app/api/prospects/route';
import { db } from '@/lib/server/db';
import { base32Encode, totpAt } from '@/lib/server/totp';

const good = { email: 'salim@harmony.test', password: 'MotDePasse-Tres-Solide-2026' };

describe('Authentification et sessions', () => {
  beforeEach(async () => { jar.clear(); await db()`DELETE FROM rate_limits`; delete process.env.ADMIN_TOTP_SECRET; });

  it('refuse l’accès sans session (API et données)', async () => {
    const res = await dashboard(req('/api/dashboard'), ctx());
    expect(res.status).toBe(401);
  });

  it('refuse de mauvais identifiants sans révéler lequel est faux', async () => {
    const a = await login(req('/api/auth/login', { json: { ...good, password: 'mauvais' } }));
    const b = await login(req('/api/auth/login', { json: { ...good, email: 'autre@x.fr' } }));
    expect(a.status).toBe(401);
    expect((await body(a)).error).toBe((await body(b)).error);
  });

  it('limite les tentatives de connexion (brute force)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await login(req('/api/auth/login', { json: { ...good, password: `x${i}` } }))).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect((await login(req('/api/auth/login', { json: good }))).status).toBe(429);
  });

  it('refuse une connexion sans en-tête Origin (CSRF)', async () => {
    expect((await login(req('/api/auth/login', { json: good, origin: null }))).status).toBe(403);
    expect((await login(req('/api/auth/login', { json: good, origin: 'https://attaquant.example' }))).status).toBe(403);
  });

  it('ouvre une session en base, puis la déconnexion l’invalide réellement', async () => {
    const res = await login(req('/api/auth/login', { json: good }));
    expect(res.status).toBe(200);
    const token = jar.get('harmony_session')!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    const rows = await db()`SELECT token_hash FROM admin_sessions WHERE revoked_at IS NULL`;
    expect(rows.some((r) => r.token_hash === token)).toBe(false); // seule l'empreinte est stockée
    expect((await dashboard(req('/api/dashboard'), ctx())).status).toBe(200);
    await logout(req('/api/auth/logout', { method: 'POST' }));
    jar.set('harmony_session', token); // rejeu du cookie volé après déconnexion
    expect((await dashboard(req('/api/dashboard'), ctx())).status).toBe(401);
  });

  it('rejette une requête mutante authentifiée venant d’une autre origine', async () => {
    await login(req('/api/auth/login', { json: good }));
    const res = await createProspect(req('/api/prospects', { json: { name: 'X' }, origin: 'https://evil.example' }), ctx());
    expect(res.status).toBe(403);
  });

  it('exige le code TOTP quand la 2FA est active et refuse son rejeu', async () => {
    process.env.ADMIN_TOTP_SECRET = base32Encode(Buffer.from('12345678901234567890'));
    expect((await login(req('/api/auth/login', { json: good }))).status).toBe(401);
    const code = totpAt(process.env.ADMIN_TOTP_SECRET, Math.floor(Date.now() / 30000));
    expect((await login(req('/api/auth/login', { json: { ...good, code } }))).status).toBe(200);
    jar.clear();
    const replay = await login(req('/api/auth/login', { json: { ...good, code } }));
    expect(replay.status).toBe(401);
    expect((await body(replay)).error).toMatch(/déjà été utilisé/);
  });

  it('révoque les autres sessions', async () => {
    await login(req('/api/auth/login', { json: good }));
    const first = jar.get('harmony_session')!;
    jar.clear();
    await login(req('/api/auth/login', { json: good }));
    const res = await revokeOthers(req('/api/security/sessions', { method: 'DELETE' }), ctx());
    expect((await body<{ count: number }>(res)).count).toBeGreaterThanOrEqual(1);
    jar.set('harmony_session', first);
    expect((await dashboard(req('/api/dashboard'), ctx())).status).toBe(401);
  });

  it('expose un health check sans donnée sensible et protège le cron', async () => {
    const h = await body<Record<string, unknown>>(await health());
    expect(h).toMatchObject({ status: 'ok', database: 'ok', migrations: 'à jour' });
    expect(JSON.stringify(h)).not.toMatch(/postgres|secret|localhost/i);
    expect((await cron(new Request('http://localhost:3000/api/cron'))).status).toBe(401);
    expect((await cron(new Request('http://localhost:3000/api/cron', { headers: { authorization: 'Bearer cron-secret-cron-secret-0123' } }))).status).toBe(200);
  });
});
