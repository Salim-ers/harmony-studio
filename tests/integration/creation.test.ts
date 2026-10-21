import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { body, ctx, jar, req } from './helpers';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as createProject } from '@/app/api/projects/route';
import { GET as getProject, DELETE as deleteProject } from '@/app/api/projects/[id]/route';
import { POST as initUpload } from '@/app/api/media/uploads/route';
import { PUT as putPart } from '@/app/api/media/uploads/[id]/[part]/route';
import { POST as complete } from '@/app/api/media/uploads/[id]/complete/route';
import { GET as getMedia } from '@/app/api/media/[id]/[variant]/route';
import { POST as attach } from '@/app/api/projects/[id]/assets/route';
import { POST as createJob } from '@/app/api/projects/[id]/jobs/route';
import { POST as advance } from '@/app/api/jobs/[id]/advance/route';
import { POST as approve } from '@/app/api/jobs/[id]/approve/route';
import { GET as previewUrl } from '@/app/api/projects/[id]/preview-url/route';
import { GET as preview } from '@/app/apercu/[token]/[[...path]]/route';
import { GET as exportZip } from '@/app/api/projects/[id]/export/route';
import { GET as diff } from '@/app/api/projects/[id]/versions/[versionId]/diff/route';
import { GET as getVersion } from '@/app/api/projects/[id]/versions/[versionId]/route';
import { POST as restore } from '@/app/api/projects/[id]/versions/[versionId]/restore/route';
import { db } from '@/lib/server/db';

type Snap = { id: string; status: string; steps: { key: string; status: string; detail: string }[]; plan?: unknown; error: string };
type ProjectDetail = { project: { status: string; current_version_id: string }; versions: { id: string; number: number }[]; current: { checks: { counts: Record<string, number> }; has_bundle: boolean } | null; assets: { slug: string; media_id: string }[] };

type UploadResult = { status: number; id: string; width: number; error?: string };
async function upload(buf: Buffer, name: string, mime: string): Promise<UploadResult> {
  const init = await body<{ id: string; parts: number; chunkBytes: number; error?: string }>(await initUpload(req('/api/media/uploads', { json: { name, size: buf.length, mime } }), ctx()));
  if (!init.id) return { status: 400, id: '', width: 0, error: init.error };
  for (let i = 0; i < init.parts; i++) {
    const part = buf.subarray(i * init.chunkBytes, (i + 1) * init.chunkBytes);
    const r = await putPart(req(`/api/media/uploads/${init.id}/${i}`, { method: 'PUT', body: new Uint8Array(part), headers: { 'content-type': 'application/octet-stream', 'content-length': String(part.length) } }), ctx({ id: init.id, part: String(i) }));
    expect(r.status).toBe(200);
  }
  const done = await complete(req(`/api/media/uploads/${init.id}/complete`, { method: 'POST' }), ctx({ id: init.id }));
  return { status: done.status, ...(await body<{ id: string; error?: string; width: number }>(done)) };
}

async function runJob(projectId: string, kind: string, extra: Record<string, unknown> = {}) {
  let snap = await body<Snap>(await createJob(req(`/api/projects/${projectId}/jobs`, { json: { kind, ...extra } }), ctx({ id: projectId })));
  for (let i = 0; i < 40 && ['en_attente', 'en_cours'].includes(snap.status); i++) snap = await body<Snap>(await advance(req(`/api/jobs/${snap.id}/advance`, { method: 'POST' }), ctx({ id: snap.id })));
  return snap;
}
async function continueJob(jobId: string) {
  let snap = await body<Snap>(await approve(req(`/api/jobs/${jobId}/approve`, { json: {} }), ctx({ id: jobId })));
  for (let i = 0; i < 40 && ['en_attente', 'en_cours'].includes(snap.status); i++) snap = await body<Snap>(await advance(req(`/api/jobs/${jobId}/advance`, { method: 'POST' }), ctx({ id: jobId })));
  return snap;
}

const brief = { clientName: 'Boulangerie Dupont', sector: 'boulangerie artisanale', city: 'Creil', brief: 'Site premium avec carte de produits et prise de contact.', motion: 'spectaculaire' };

describe('Création IA de bout en bout (Claude simulé, base réelle)', () => {
  let projectId = '';
  let photoId = '';
  beforeAll(async () => {
    jar.clear();
    await db()`DELETE FROM rate_limits`;
    expect((await login(req('/api/auth/login', { json: { email: 'salim@harmony.test', password: 'MotDePasse-Tres-Solide-2026' } }))).status).toBe(200);
  });

  it('upload privé : vraie photo acceptée (dérivés créés, EXIF retiré), exécutable/SVG/faux JPEG refusés', async () => {
    const jpeg = await sharp({ create: { width: 3200, height: 2000, channels: 3, background: { r: 200, g: 150, b: 90 } } }).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }).toBuffer();
    const ok = await upload(jpeg, 'vitrine.jpg', 'image/jpeg');
    expect(ok.status).toBe(200);
    photoId = ok.id;
    expect(ok.width).toBe(2000); // orientation EXIF appliquée
    const web = await getMedia(req(`/api/media/${photoId}/web`), ctx({ id: photoId, variant: 'web' }));
    expect(web.headers.get('content-type')).toBe('image/webp');
    expect(web.headers.get('cache-control')).toContain('private');
    const meta = await sharp(Buffer.from(await web.arrayBuffer())).metadata();
    expect(meta.width).toBeLessThanOrEqual(2400);
    expect(meta.orientation ?? 1).toBe(1);
    const original = await getMedia(req(`/api/media/${photoId}/original`), ctx({ id: photoId, variant: 'original' }));
    expect(Buffer.from(await original.arrayBuffer()).equals(jpeg)).toBe(true); // original intact
    const fake = await upload(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2000)]), 'virus.jpg', 'image/jpeg');
    expect(fake.status).toBe(400);
    const huge = await sharp({ create: { width: 9000, height: 8000, channels: 3, background: { r: 10, g: 10, b: 10 } } }).jpeg({ quality: 50 }).toBuffer();
    const tooBig = await upload(huge, 'capteur-200mpx.jpg', 'image/jpeg');
    expect(tooBig.status).toBe(400);
    expect(tooBig.error).toContain('mégapixels');
    const svgInit = await initUpload(req('/api/media/uploads', { json: { name: 'x.svg', size: 100, mime: 'image/svg+xml' } }), ctx());
    expect(svgInit.status).toBe(400);
    const anonymous = await (async () => { const saved = new Map(jar); jar.clear(); const r = await getMedia(req(`/api/media/${photoId}/web`), ctx({ id: photoId, variant: 'web' })); for (const [k, v] of saved) jar.set(k, v); return r.status; })();
    expect(anonymous).toBe(401);
  });

  it('site React : plan à valider → génération → compilation → contrôles → version', async () => {
    const p = await body<{ id: string; render: string }>(await createProject(req('/api/projects', { json: { name: 'Site Dupont', deliverable: 'vitrine', render: 'react', brief } }), ctx()));
    projectId = p.id;
    expect(p.render).toBe('react');
    expect((await attach(req(`/api/projects/${projectId}/assets`, { json: { mediaId: photoId, role: 'photo', alt: 'Vitrine de la boulangerie' } }), ctx({ id: projectId }))).status).toBe(201);
    const planned = await runJob(projectId, 'creation');
    expect(planned.status).toBe('attente_reponse');
    expect(planned.plan).toBeTruthy();
    const done = await continueJob(planned.id);
    expect(done.error).toBe('');
    expect(done.status).toBe('termine');
    expect(done.steps.find((s) => s.key === 'compilation')?.detail).toMatch(/Compilation réussie/);
    const d = await body<ProjectDetail>(await getProject(req(`/api/projects/${projectId}`), ctx({ id: projectId })));
    expect(d.versions).toHaveLength(1);
    expect(d.current?.has_bundle).toBe(true);
    expect(['Prêt pour revue', 'À corriger']).toContain(d.project.status);
  });

  it('aperçu isolé : CSP sandbox, base réécrite, bundle et photo privée servis par jeton', async () => {
    const { url } = await body<{ url: string }>(await previewUrl(req(`/api/projects/${projectId}/preview-url`), ctx({ id: projectId })));
    const token = url.split('/apercu/')[1].replace(/\/$/, '');
    jar.clear(); // l'aperçu ne dépend d'aucun cookie
    const html = await preview(new Request(`http://localhost:3000/apercu/${token}/`), { params: Promise.resolve({ token, path: [] }) });
    expect(html.headers.get('content-security-policy')).toMatch(/^sandbox allow-scripts/);
    expect(html.headers.get('content-security-policy')).toContain("connect-src 'none'");
    const text = await html.text();
    expect(text).toContain(`<base href="/apercu/${token}/" />`);
    const js = await preview(new Request(`http://localhost:3000/apercu/${token}/__apercu/app.js`), { params: Promise.resolve({ token, path: ['__apercu', 'app.js'] }) });
    expect((await js.text()).length).toBeGreaterThan(50_000);
    const img = await preview(new Request(`http://localhost:3000/apercu/${token}/images/photo-01.webp`), { params: Promise.resolve({ token, path: ['images', 'photo-01.webp'] }) });
    expect(img.headers.get('content-type')).toBe('image/webp');
    const bad = await preview(new Request(`http://localhost:3000/apercu/x.y/`), { params: Promise.resolve({ token: 'x.y', path: [] }) });
    expect(bad.status).toBe(404);
    const malformed = await preview(new Request(`http://localhost:3000/apercu/${token}/%E0%A4%A`), { params: Promise.resolve({ token, path: ['%E0%A4%A'] }) });
    expect(malformed.status).toBe(404); // URI invalide : 404 propre, pas d'erreur 500
    // Audit L1 : le jeton d'aperçu meurt avec la session qui l'a émis
    await db()`UPDATE admin_sessions SET revoked_at = now() WHERE revoked_at IS NULL`;
    const revoked = await preview(new Request(`http://localhost:3000/apercu/${token}/`), { params: Promise.resolve({ token, path: [] }) });
    expect(revoked.status).toBe(404);
    jar.clear();
    await login(req('/api/auth/login', { json: { email: 'salim@harmony.test', password: 'MotDePasse-Tres-Solide-2026' } }));
  });

  it('modification ciblée « plus spectaculaire sans toucher au contact », différentiel et restauration', async () => {
    const before = await body<ProjectDetail>(await getProject(req(`/api/projects/${projectId}`), ctx({ id: projectId })));
    const v1 = before.versions[0];
    const snap = await runJob(projectId, 'modification', { instruction: 'Rends la page d’accueil plus spectaculaire sans toucher au contact' });
    expect(snap.status).toBe('termine');
    const after = await body<ProjectDetail>(await getProject(req(`/api/projects/${projectId}`), ctx({ id: projectId })));
    const v2 = after.versions[0];
    expect(v2.number).toBe(2);
    const dd = await body<{ diff: { path: string }[] }>(await diff(req(`/api/projects/${projectId}/versions/${v2.id}/diff`), ctx({ id: projectId, versionId: v2.id })));
    expect(dd.diff.map((f) => f.path)).toEqual(['src/pages/AccueilPage.jsx']);
    const f1 = (await body<{ version: { files: { path: string; content: string }[] } }>(await getVersion(req(''), ctx({ id: projectId, versionId: v1.id })))).version.files;
    const f2 = (await body<{ version: { files: { path: string; content: string }[] } }>(await getVersion(req(''), ctx({ id: projectId, versionId: v2.id })))).version.files;
    expect(f2.find((f) => f.path === 'src/pages/ContactPage.jsx')?.content).toBe(f1.find((f) => f.path === 'src/pages/ContactPage.jsx')?.content);
    expect(f2.find((f) => f.path === 'src/pages/AccueilPage.jsx')?.content).toContain('encore plus spectaculaire');
    const r = await body<{ number: number }>(await restore(req(`/api/projects/${projectId}/versions/${v1.id}/restore`, { method: 'POST' }), ctx({ id: projectId, versionId: v1.id })));
    expect(r.number).toBe(3);
    const v3 = (await body<ProjectDetail>(await getProject(req(`/api/projects/${projectId}`), ctx({ id: projectId })))).versions[0];
    const f3 = (await body<{ version: { files: { path: string; content: string }[] } }>(await getVersion(req(''), ctx({ id: projectId, versionId: v3.id })))).version.files;
    expect(f3).toEqual(f1);
  });

  it('export ZIP : projet Vite complet avec photos dans public/images et rapport qualité', async () => {
    const res = await exportZip(req(`/api/projects/${projectId}/export`), ctx({ id: projectId }));
    expect(res.headers.get('content-type')).toBe('application/zip');
    const files = Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())));
    const root = files[0].split('/')[0];
    for (const f of ['package.json', 'vite.config.js', 'vercel.json', 'index.html', 'src/App.jsx', 'src/motion/index.js', 'src/pages/AccueilPage.jsx', 'public/images/photo-01.webp', 'RAPPORT-QUALITE.md', 'README.md'])
      expect(files).toContain(`${root}/${f}`);
    expect(files.some((f) => f.includes('_layout') || f.endsWith('.env'))).toBe(false);
  });

  it('site HTML statique : génération et contrôles', async () => {
    const p = await body<{ id: string }>(await createProject(req('/api/projects', { json: { name: 'Vitrine HTML', deliverable: 'vitrine', render: 'html', brief } }), ctx()));
    const planned = await runJob(p.id, 'creation');
    const done = await continueJob(planned.id);
    expect(done.status).toBe('termine');
    const d = await body<ProjectDetail>(await getProject(req(`/api/projects/${p.id}`), ctx({ id: p.id })));
    expect(d.versions).toHaveLength(1);
    expect(d.current?.checks.counts).toBeTruthy();
  });

  it('application métier sans runner : blocage explicite, jamais déclarée fonctionnelle', async () => {
    const p = await body<{ id: string; render: string }>(await createProject(req('/api/projects', { json: { name: 'Suivi des devis', deliverable: 'application', brief: { ...brief, brief: 'Outil interne de suivi des devis avec utilisateurs et statut.' } } }), ctx()));
    expect(p.render).toBe('nextjs');
    const planned = await runJob(p.id, 'creation');
    const done = await continueJob(planned.id);
    expect(done.status).toBe('bloque');
    expect(done.steps.find((s) => s.key === 'construction')).toMatchObject({ status: 'bloque' });
    expect(done.steps.find((s) => s.key === 'construction')?.detail).toMatch(/ne peut pas être considéré comme fonctionnel/);
    const d = await body<ProjectDetail>(await getProject(req(`/api/projects/${p.id}`), ctx({ id: p.id })));
    expect(d.project.status).toBe('Construction');
    expect(d.project.status).not.toBe('Prêt pour revue');
  });

  it('isolation : projet inexistant ou identifiant forgé refusé ; suppression nettoie les médias', async () => {
    const random = '00000000-0000-4000-8000-000000000001';
    expect((await getProject(req(`/api/projects/${random}`), ctx({ id: random }))).status).toBe(404);
    expect((await previewUrl(req(`/api/projects/${projectId}/preview-url?version=${random}`), ctx({ id: projectId }))).status).toBe(404);
    expect((await deleteProject(req(`/api/projects/${projectId}`, { method: 'DELETE' }), ctx({ id: projectId }))).status).toBe(200);
    const media = await db()`SELECT 1 FROM media_files WHERE id = ${photoId}`;
    expect(media).toHaveLength(0);
  });
});
