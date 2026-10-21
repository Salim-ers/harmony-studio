/**
 * Export du code source (ZIP), dépôt GitHub privé et déploiement Vercel des projets clients.
 * Les actions externes (GitHub, Vercel) exigent une confirmation explicite côté serveur.
 */
import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { env } from '../env';
import { badRequest, forbidden, notConfigured, upstream } from '../http';
import type { GenFile } from '../ai/fileformat';
import type { CheckReport } from './checks';
import { readVariant } from './media';
import { getAssets } from './projects';
import { slugify } from './react-site';

export type BinFile = { path: string; data: Uint8Array };

export function qualityReport(checks: CheckReport | null, buildReport: unknown) {
  if (!checks) return '# Rapport qualité\n\nAucun contrôle automatique n’a été exécuté sur cette version.\n';
  const lines = [`# Rapport qualité automatique`, '', `Exécuté le ${new Date(checks.ran_at).toLocaleString('fr-FR')}.`, '',
    `- Erreurs : ${checks.counts.erreur}`, `- Avertissements : ${checks.counts.avertissement}`, `- Informations : ${checks.counts.info}`, '', '## Détail', ''];
  for (const i of checks.items) lines.push(`- **${i.level.toUpperCase()}** \`${i.file}\` — ${i.message}`);
  lines.push('', '## Non exécuté (à vérifier manuellement)', '', ...checks.not_executed.map((x) => `- ${x}`));
  const build = buildReport as { executed?: boolean; ok?: boolean; reason?: string } | null;
  if (build) lines.push('', '## Construction (runner isolé)', '', build.executed ? `Résultat : ${build.ok ? 'réussite' : 'ÉCHEC'}` : `Non exécutée : ${build.reason ?? ''}`);
  lines.push('', 'Ce rapport ne remplace pas la matrice d’audit final complète avant mise en production.');
  return lines.join('\n') + '\n';
}

/** Rassemble les fichiers d'une version + médias (dérivés web) au bon emplacement selon le rendu. */
export async function collectFiles(projectId: string, files: GenFile[], render: string, extras: { checks: CheckReport | null; build: unknown }): Promise<BinFile[]> {
  const out: BinFile[] = files.map((f) => ({ path: f.path, data: strToU8(f.content) }));
  const assets = await getAssets(projectId);
  const prefix = render === 'react' ? 'public/images/' : render === 'nextjs' ? 'public/images/' : 'images/';
  for (const a of assets.filter((x) => x.kind === 'image')) {
    const v = await readVariant(a.media_id, 'web');
    out.push({ path: prefix + a.slug, data: new Uint8Array(v.data) });
  }
  out.push({ path: 'RAPPORT-QUALITE.md', data: strToU8(qualityReport(extras.checks, extras.build)) });
  return out;
}

export function zip(files: BinFile[], root: string) {
  const tree: Record<string, Uint8Array> = {};
  for (const f of files) tree[`${root}/${f.path}`] = f.data;
  return zipSync(tree, { level: 6 });
}

// ───────────────────────── GitHub (dépôt privé) ─────────────────────────

async function gh(path: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch) {
  const token = env.githubToken();
  if (!token) throw notConfigured('GitHub non connecté (GITHUB_TOKEN absent). Le ZIP reste disponible.');
  const res = await fetchImpl(`https://api.github.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  return res;
}

export function validRepoName(name: string) {
  return /^[A-Za-z0-9._-]{1,90}$/.test(name) && !name.startsWith('.');
}

export async function pushToGithub(p: { repo: string; files: BinFile[]; message: string }, fetchImpl: typeof fetch = fetch) {
  const owner = env.githubOwner();
  if (!owner) throw notConfigured('GITHUB_OWNER non configuré.');
  if (!validRepoName(p.repo)) throw badRequest('Nom de dépôt invalide.');
  let repoRes = await gh(`/repos/${owner}/${p.repo}`, {}, fetchImpl);
  if (repoRes.status === 404) {
    const userRes = await gh(`/users/${owner}`, {}, fetchImpl);
    const isOrg = userRes.ok && ((await userRes.json()) as { type?: string }).type === 'Organization';
    repoRes = await gh(isOrg ? `/orgs/${owner}/repos` : '/user/repos', { method: 'POST', body: JSON.stringify({ name: p.repo, private: true, auto_init: true, description: 'Projet généré avec Harmony Studio — Harmony Solutions' }) }, fetchImpl);
    if (!repoRes.ok) throw upstream(`Création du dépôt GitHub refusée (${repoRes.status}). Vérifiez les permissions du jeton.`);
  } else if (!repoRes.ok) throw upstream(`GitHub indisponible (${repoRes.status}).`);
  const repo = (await repoRes.json()) as { private: boolean; html_url: string; default_branch: string };
  if (!repo.private) throw forbidden('Ce dépôt GitHub est PUBLIC : envoi refusé. Utilisez un dépôt privé.');
  const branch = repo.default_branch || 'main';
  const refRes = await gh(`/repos/${owner}/${p.repo}/git/ref/heads/${branch}`, {}, fetchImpl);
  const parent = refRes.ok ? ((await refRes.json()) as { object: { sha: string } }).object.sha : null;
  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const f of p.files) {
    const blob = await gh(`/repos/${owner}/${p.repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: Buffer.from(f.data).toString('base64'), encoding: 'base64' }) }, fetchImpl);
    if (!blob.ok) throw upstream(`Envoi du fichier ${f.path} refusé (${blob.status}).`);
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: ((await blob.json()) as { sha: string }).sha });
  }
  const treeRes = await gh(`/repos/${owner}/${p.repo}/git/trees`, { method: 'POST', body: JSON.stringify({ tree }) }, fetchImpl);
  if (!treeRes.ok) throw upstream(`Création de l’arborescence refusée (${treeRes.status}).`);
  const treeSha = ((await treeRes.json()) as { sha: string }).sha;
  const commitRes = await gh(`/repos/${owner}/${p.repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: p.message, tree: treeSha, parents: parent ? [parent] : [] }) }, fetchImpl);
  if (!commitRes.ok) throw upstream(`Création du commit refusée (${commitRes.status}).`);
  const commitSha = ((await commitRes.json()) as { sha: string }).sha;
  const update = parent
    ? await gh(`/repos/${owner}/${p.repo}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commitSha, force: false }) }, fetchImpl)
    : await gh(`/repos/${owner}/${p.repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha }) }, fetchImpl);
  if (!update.ok) throw upstream(`Mise à jour de la branche refusée (${update.status}).`);
  return { url: repo.html_url, commit: commitSha };
}

// ───────────────────────── Vercel (déploiement du site client) ─────────────────────────

export async function deployToVercel(p: { name: string; files: BinFile[]; render: string; target: 'preview' | 'production' }, fetchImpl: typeof fetch = fetch) {
  const token = env.vercelDeployToken();
  if (!token) throw notConfigured('Déploiement Vercel non configuré (VERCEL_DEPLOY_TOKEN absent). Le ZIP reste disponible.');
  if (p.render === 'nextjs') throw badRequest('Les applications full-stack se déploient via GitHub + Vercel (variables d’environnement et base de données à configurer) : utilisez d’abord « Dépôt GitHub privé ».');
  const team = env.vercelDeployTeamId() ? `?teamId=${encodeURIComponent(env.vercelDeployTeamId())}` : '';
  const headers = { Authorization: `Bearer ${token}` };
  const manifest: { file: string; sha: string; size: number }[] = [];
  for (const f of p.files) {
    if (f.path === 'RAPPORT-QUALITE.md') continue;
    const sha = createHash('sha1').update(f.data).digest('hex');
    const up = await fetchImpl(`https://api.vercel.com/v2/files${team}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'x-vercel-digest': sha, 'Content-Length': String(f.data.length) }, body: Buffer.from(f.data), signal: AbortSignal.timeout(60_000) });
    if (!up.ok && up.status !== 409) throw upstream(`Envoi de ${f.path} vers Vercel refusé (${up.status}).`);
    manifest.push({ file: f.path, sha, size: f.data.length });
  }
  const projectSettings = p.render === 'react'
    ? { framework: 'vite', buildCommand: 'npm run build', outputDirectory: 'dist', installCommand: 'npm install' }
    : { framework: null, buildCommand: null, outputDirectory: null };
  const body = { name: slugify(p.name).slice(0, 90) || 'site-client', files: manifest, projectSettings, ...(p.target === 'production' ? { target: 'production' } : {}) };
  const res = await fetchImpl(`https://api.vercel.com/v13/deployments${team}${team ? '&' : '?'}skipAutoDetectionConfirmation=1`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    let msg = String(res.status);
    try { msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg; } catch { /* ignore */ }
    throw upstream(`Déploiement Vercel refusé : ${msg.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string; url: string; readyState?: string };
  return { id: data.id, url: `https://${data.url}`, state: data.readyState ?? 'QUEUED' };
}
