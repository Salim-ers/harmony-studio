import { beforeAll, describe, expect, it } from 'vitest';
import { body, ctx, jar, req } from './helpers';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as list, POST as create } from '@/app/api/prospects/route';
import { GET as getOne, PATCH, DELETE } from '@/app/api/prospects/[id]/route';
import { POST as search } from '@/app/api/prospects/search/route';
import { POST as addNote } from '@/app/api/prospects/[id]/notes/route';
import { POST as addTask } from '@/app/api/prospects/[id]/tasks/route';
import { POST as message } from '@/app/api/prospects/[id]/message/route';
import { POST as contactLog } from '@/app/api/prospects/[id]/contact-log/route';
import { POST as websiteCheck } from '@/app/api/prospects/[id]/website-check/route';
import { GET as exportCsv } from '@/app/api/prospects/export/route';
import { POST as importCsv } from '@/app/api/prospects/import/route';
import { POST as bulk } from '@/app/api/prospects/bulk/route';
import { POST as createQuote } from '@/app/api/quotes/route';
import { PATCH as patchQuote } from '@/app/api/quotes/[id]/route';
import { POST as createProfile } from '@/app/api/search-profiles/route';
import { db } from '@/lib/server/db';

type Item = { id: string; name: string; strategy: string; need_status: string; status: string; is_demo: boolean; score: number };

describe('Prospection, CRM et devis (base réelle, Brave simulé)', () => {
  beforeAll(async () => {
    jar.clear();
    await db()`DELETE FROM rate_limits`;
    expect((await login(req('/api/auth/login', { json: { email: 'salim@harmony.test', password: 'MotDePasse-Tres-Solide-2026' } }))).status).toBe(200);
  });

  it('recherche « demandes explicites » : garde la vraie demande, écarte agence et emploi', async () => {
    const res = await search(req('/api/prospects/search', { json: { strategy: 'explicite', zones: ['Oise'], needs: ['site'], maxQueries: 2 } }), ctx());
    const s = await body<{ created: number; rejected: number; demo: boolean; status: string }>(res);
    expect(res.status).toBe(200);
    expect(s.status).toBe('terminé');
    expect(s.demo).toBe(true);
    expect(s.created).toBe(1);
    expect(s.rejected).toBeGreaterThanOrEqual(2);
    const l = await body<{ items: Item[] }>(await list(req('/api/prospects?strategy=explicite'), ctx()));
    expect(l.items).toHaveLength(1);
    expect(l.items[0]).toMatchObject({ strategy: 'explicite', need_status: 'confirmé', is_demo: true, status: 'À examiner' });
  });

  it('déduplique une seconde exécution', async () => {
    const s = await body<{ created: number; duplicates: number; merged: number }>(await search(req('/api/prospects/search', { json: { strategy: 'explicite', zones: ['Oise'], needs: ['site'], maxQueries: 1 } }), ctx()));
    expect(s.created).toBe(0);
    expect(s.duplicates + s.merged).toBeGreaterThanOrEqual(1);
  });

  it('« boulangeries à Creil » : signaux = hypothèses, liste écartée', async () => {
    const s = await body<{ created: number }>(await search(req('/api/prospects/search', { json: { strategy: 'signal', zones: ['Creil'], sectors: ['boulangerie'], maxQueries: 1 } }), ctx()));
    expect(s.created).toBe(1);
    const l = await body<{ items: Item[] }>(await list(req('/api/prospects?strategy=signal'), ctx()));
    expect(l.items[0].need_status).toBe('supposé');
    expect(l.items[0].name).toContain('Boulangerie du Marché');
  });

  it('fiche → À contacter, note, relance : tout est persistant (y compris après reconnexion)', async () => {
    const l = await body<{ items: Item[] }>(await list(req('/api/prospects?strategy=signal'), ctx()));
    const id = l.items[0].id;
    expect((await PATCH(req(`/api/prospects/${id}`, { method: 'PATCH', json: { status: 'À contacter' } }), ctx({ id }))).status).toBe(200);
    expect((await addNote(req(`/api/prospects/${id}/notes`, { json: { body: 'Appeler la gérante le matin.' } }), ctx({ id }))).status).toBe(201);
    expect((await addTask(req(`/api/prospects/${id}/tasks`, { json: { title: 'Relancer', kind: 'appel', due_at: new Date(Date.now() + 86400000).toISOString() } }), ctx({ id }))).status).toBe(201);
    jar.clear();
    await login(req('/api/auth/login', { json: { email: 'salim@harmony.test', password: 'MotDePasse-Tres-Solide-2026' } }));
    const d = await body<{ prospect: Item; notes: unknown[]; tasks: unknown[]; events: { kind: string }[]; sources: unknown[] }>(await getOne(req(`/api/prospects/${id}`), ctx({ id })));
    expect(d.prospect.status).toBe('À contacter');
    expect(d.notes).toHaveLength(1);
    expect(d.tasks).toHaveLength(1);
    expect(d.sources.length).toBeGreaterThanOrEqual(1);
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['statut', 'note', 'tâche', 'création']));
  });

  it('message : brouillon jamais envoyé ; opposition RGPD bloque ; contact seulement déclaré', async () => {
    const l = await body<{ items: Item[] }>(await list(req('/api/prospects?strategy=signal'), ctx()));
    const id = l.items[0].id;
    const m = await body<{ sent: boolean; draft: { message: string }; source: string }>(await message(req(`/api/prospects/${id}/message`, { json: { channel: 'E-mail', mode: 'modele' } }), ctx({ id })));
    expect(m.sent).toBe(false);
    expect(m.draft.message).toContain('STOP');
    const c = await body<{ status: string }>(await contactLog(req(`/api/prospects/${id}/contact-log`, { json: { channel: 'Téléphone', summary: 'Messagerie', followUpDays: 3 } }), ctx({ id })));
    expect(c.status).toBe('Contacté');
    await PATCH(req(`/api/prospects/${id}`, { method: 'PATCH', json: { do_not_contact: true, opposition_note: 'Refus par téléphone' } }), ctx({ id }));
    expect((await message(req(`/api/prospects/${id}/message`, { json: { channel: 'E-mail', mode: 'modele' } }), ctx({ id }))).status).toBe(400);
  });

  it('IDOR / validation : identifiants devinés ou invalides refusés', async () => {
    expect((await getOne(req('/api/prospects/1'), ctx({ id: '1' }))).status).toBe(400);
    expect((await getOne(req('/api/prospects/abc'), ctx({ id: "' OR 1=1 --" }))).status).toBe(400);
    const random = '00000000-0000-4000-8000-000000000000';
    expect((await getOne(req(`/api/prospects/${random}`), ctx({ id: random }))).status).toBe(404);
    expect((await PATCH(req(`/api/prospects/${random}`, { method: 'PATCH', json: { status: 'Inventé' } }), ctx({ id: random }))).status).toBe(400);
  });

  it('analyse de site : refuse une URL interne (SSRF)', async () => {
    const r = await create(req('/api/prospects', { json: { name: 'Interne', website: 'http://169.254.169.254/' } }), ctx());
    const { id } = await body<{ id: string }>(r);
    const res = await websiteCheck(req(`/api/prospects/${id}/website-check`, { method: 'POST' }), ctx({ id }));
    expect(res.status).toBe(400);
  });

  it('export CSV protégé contre les formules, import CSV avec dédoublonnage', async () => {
    await create(req('/api/prospects', { json: { name: '=CMD()', city: 'Creil' } }), ctx());
    const bytes = Buffer.from(await (await exportCsv(req('/api/prospects/export'), ctx())).arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 pour Excel
    const csv = bytes.toString('utf8');
    expect(csv).toContain("\"'=CMD()\"");
    const text = 'Nom;URL source;Ville;Statut\nGarage Test;https://garage-test.example/;Clermont;Qualifié\nGarage Test bis;https://garage-test.example/;Clermont;Qualifié\n';
    const r = await body<{ created: number; duplicates: number }>(await importCsv(req('/api/prospects/import', { json: { csv: text } }), ctx()));
    expect(r).toMatchObject({ created: 1, duplicates: 1 });
  });

  it('actions groupées et devis rattaché (totaux calculés côté serveur)', async () => {
    const l = await body<{ items: Item[] }>(await list(req('/api/prospects?q=Garage'), ctx()));
    const id = l.items[0].id;
    await bulk(req('/api/prospects/bulk', { json: { ids: [id], action: 'statut', status: 'Rendez-vous' } }), ctx());
    const q = await body<{ id: string; number: string }>(await createQuote(req('/api/quotes', { json: { title: 'Site vitrine', prospect_id: id, lines: [{ label: 'Site', quantity: 1, unitPrice: 900 }], vat_regime: 'tva', vat_rate: 20 } }), ctx()));
    expect(q.number).toMatch(/^DEV-\d{4}-\d{3}$/);
    const [row] = await db()`SELECT total_ht, total_ttc FROM quotes WHERE id = ${q.id}`;
    expect(Number(row.total_ttc)).toBe(1080);
    await patchQuote(req(`/api/quotes/${q.id}`, { method: 'PATCH', json: { status: 'envoyé' } }), ctx({ id: q.id }));
    const d = await body<{ prospect: Item }>(await getOne(req(`/api/prospects/${id}`), ctx({ id })));
    expect(d.prospect.status).toBe('Devis envoyé');
  });

  it('enregistre une recherche planifiable', async () => {
    const r = await createProfile(req('/api/search-profiles', { json: { name: 'Veille Oise', strategy: 'explicite', zones: ['Oise'], schedule_enabled: true, schedule_days: [1, 3, 5] } }), ctx());
    expect(r.status).toBe(201);
  });

  it('suppression définitive (droit à l’effacement) en cascade', async () => {
    const r = await body<{ id: string }>(await create(req('/api/prospects', { json: { name: 'À effacer', notes: 'note' } }), ctx()));
    expect((await DELETE(req(`/api/prospects/${r.id}`, { method: 'DELETE' }), ctx({ id: r.id }))).status).toBe(200);
    const left = await db()`SELECT 1 FROM prospect_notes WHERE prospect_id = ${r.id}`;
    expect(left).toHaveLength(0);
  });
});
