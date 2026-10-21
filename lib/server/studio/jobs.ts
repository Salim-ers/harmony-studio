/**
 * Pipeline de génération PERSISTANT et visible, exécuté étape par étape.
 *
 * Chaque appel à advanceJob() exécute UNE étape (≈ un appel Claude au maximum), ce qui tient
 * dans la durée maximale d'une fonction Vercel. L'état est en base : un rafraîchissement, une
 * fermeture d'onglet ou une erreur n'entraînent aucune perte ; le job se reprend ou se relance.
 * Un verrou (locked_until) empêche deux exécutions simultanées du même job.
 */
import { createHash } from 'node:crypto';
import { db } from '../db';
import { conflict, HttpError, logError, notFound, upstream } from '../http';
import { getConfig } from '../settings';
import { callClaude, type ContentBlock } from '../ai/anthropic';
import { composeGenerationPrompt, getActiveMatrices, variablesFor, type BriefData } from '../ai/matrices';
import { extractJson, filesToMap, mapToFiles, parseFiles, type ProjectKind } from '../ai/fileformat';
import {
  designSystemPrompt, fixPrompt, modifyPrompt, modulePrompt, pagePrompt, planPrompt, planSchema, reactDesignSystemPrompt, reactPagePrompt,
  reactSystemAddendum, scaffoldPrompt, systemPrompt, type Plan,
} from '../ai/prompts';
import { deliverableLabel } from '@/lib/shared/constants';
import { runAppChecks, runReactChecks, runStaticChecks, type CheckReport } from './checks';
import { readVariant } from './media';
import { getAssets, getProject, setProjectStatus, type AssetRow, type ProjectRow } from './projects';
import { assembleReactProject, bundleReact, KIT_LOCKED, routesFromPlan } from './react-site';
import { buildInSandbox, type BuildReport } from './runner';
import { getCurrentVersion, saveVersion } from './versions';

export type JobKind = 'creation' | 'modification' | 'correction' | 'construction';
type JobRow = {
  id: string; project_id: string; kind: JobKind; status: string; current_step: string; input: JobInput; state: JobState; error: string;
  attempts: number; cost_usd: string; input_tokens: number; output_tokens: number; base_version_id: string | null; result_version_id: string | null;
  created_at: string; updated_at: string; finished_at: string | null;
};
type StepRow = { id: string; job_id: string; position: number; key: string; label: string; status: string; detail: string; cost_usd: string | null; input_tokens: number; output_tokens: number; started_at: string | null; finished_at: string | null };
export type JobInput = { instruction?: string; autoContinue?: boolean; answers?: string; feedback?: string; problems?: string[] };
type JobState = {
  files?: Record<string, string>;
  summary?: string[];
  checks?: CheckReport;
  bundle?: { ok: boolean; errors: string[]; js?: string; css?: string };
  build?: BuildReport;
  fixRound?: number;
  prevStatus?: string;
  matrices?: Record<string, number | null>;
  systemSha?: string;
  attemptsByStep?: Record<string, number>;
};
type StepOutcome = { detail: string; status?: 'termine' | 'bloque' | 'echec'; pause?: boolean; cost?: number | null; inTok?: number; outTok?: number };

const ACTIVE = ['en_attente', 'en_cours', 'attente_reponse'];

export function renderOf(project: Pick<ProjectRow, 'deliverable'> & { render?: string }): ProjectKind {
  if (project.render === 'nextjs') return 'app';
  if (project.render === 'react') return 'react';
  return 'static';
}

function baseKey(key: string) {
  return key.split('#')[0];
}

function stepLabel(key: string, plan?: Plan | null) {
  const [base, suffix] = key.split('#');
  const round = suffix ? ` (passe ${suffix})` : '';
  if (base.startsWith('page:')) {
    const file = base.slice(5);
    const p = plan?.pages.find((x) => x.fichier === file || `src/pages/${file}` === x.fichier);
    return `Page « ${p?.titre ?? file} »`;
  }
  if (base.startsWith('module:')) return `Module « ${base.slice(7)} »`;
  const labels: Record<string, string> = {
    collecte: 'Collecte du brief et des médias', planification: 'Planification : brief enrichi, pages, direction artistique',
    'design-system': 'Système de design (palette, typographies, gabarit)', scaffold: 'Socle applicatif (configuration, base, authentification)',
    assemblage: 'Assemblage du projet', compilation: 'Compilation de l’aperçu React', controles: 'Contrôles qualité automatiques',
    correction: 'Correction automatique ciblée', construction: 'Installation, build et tests dans le runner isolé',
    modification: 'Application de la modification demandée', version: 'Enregistrement de la version',
  };
  return (labels[base] ?? base) + round;
}

async function projectRender(projectId: string) {
  const [row] = await db()<{ render: string }>`SELECT render FROM projects WHERE id = ${projectId}`;
  return row?.render ?? 'html';
}

// ───────────────────────── Création / contrôle des jobs ─────────────────────────

export async function createJob(projectId: string, kind: JobKind, input: JobInput = {}) {
  const sql = db();
  const project = await getProject(projectId);
  const config = await getConfig();
  const active = await sql<{ id: string; project_id: string }>`SELECT id, project_id FROM generation_jobs WHERE status = ANY(${ACTIVE})`;
  if (active.some((j) => j.project_id === projectId)) throw conflict('Une génération est déjà en cours pour ce projet : reprenez-la ou annulez-la.');
  if (active.filter((j) => j.project_id !== projectId).length >= config.ai.maxConcurrentJobs) throw new HttpError(429, `Limite de ${config.ai.maxConcurrentJobs} génération(s) simultanée(s) atteinte.`, 'CONCURRENCE');
  const render = await projectRender(projectId);
  const kindOf = renderOf({ deliverable: project.deliverable, render });
  const current = await getCurrentVersion(projectId);
  if (kind !== 'creation' && !current) throw conflict('Aucune version existante : lancez d’abord une création.');
  let steps: string[];
  if (kind === 'creation') steps = ['collecte', 'planification'];
  else if (kind === 'modification') steps = kindOf === 'react' ? ['modification', 'assemblage', 'compilation', 'controles', 'version'] : kindOf === 'app' ? ['modification', 'controles', 'version'] : ['modification', 'controles', 'version'];
  else if (kind === 'correction') steps = kindOf === 'react' ? ['correction', 'assemblage', 'compilation', 'controles', 'version'] : ['correction', 'controles', 'version'];
  else steps = ['construction'];
  const state: JobState = { files: current ? filesToMap(current.files) : {}, summary: [], prevStatus: project.status, fixRound: 0 };
  const [job] = await sql<{ id: string }>`INSERT INTO generation_jobs(project_id, kind, status, input, state, base_version_id, current_step)
    VALUES (${projectId}, ${kind}, 'en_attente', ${JSON.stringify(input)}::jsonb, ${JSON.stringify(state)}::jsonb, ${current?.id ?? null}, ${steps[0]}) RETURNING id`;
  await sql.batch(steps.map((key, i) => ({
    text: 'INSERT INTO generation_steps(job_id, position, key, label) VALUES ($1,$2,$3,$4)',
    params: [job.id, (i + 1) * 10, key, stepLabel(key, project.plan)],
  })));
  if (kind === 'modification' && input.instruction) await sql`INSERT INTO project_messages(project_id, role, content, job_id) VALUES (${projectId}, 'user', ${input.instruction}, ${job.id})`;
  await setProjectStatus(projectId, kind === 'creation' ? 'Planification' : kind === 'construction' ? 'Construction' : 'Génération');
  return job.id;
}

async function appendSteps(jobId: string, keys: string[], plan: Plan | null, beforeKey?: string) {
  const sql = db();
  const steps = await sql<{ key: string; position: number }>`SELECT key, position FROM generation_steps WHERE job_id = ${jobId} ORDER BY position`;
  let start: number;
  let gap: number;
  if (beforeKey) {
    const before = steps.find((s) => s.key === beforeKey);
    const prev = steps.filter((s) => before && s.position < before.position).pop();
    const lo = prev?.position ?? 0;
    const hi = before?.position ?? lo + 1000;
    gap = (hi - lo) / (keys.length + 1);
    start = lo + gap;
    if (gap < 1) {
      // Renumérotation si l'espace manque.
      await sql`UPDATE generation_steps SET position = position * 100 WHERE job_id = ${jobId}`;
      return appendSteps(jobId, keys, plan, beforeKey);
    }
  } else {
    start = (steps[steps.length - 1]?.position ?? 0) + 10;
    gap = 10;
  }
  await sql.batch(keys.map((key, i) => ({
    text: 'INSERT INTO generation_steps(job_id, position, key, label) VALUES ($1,$2,$3,$4) ON CONFLICT (job_id, key) DO NOTHING',
    params: [jobId, Math.round(start + i * gap), key, stepLabel(key, plan)],
  })));
}

function generationSteps(kind: ProjectKind, plan: Plan) {
  if (kind === 'app') return ['scaffold', ...plan.modules.slice(0, 10).map((m) => `module:${m.nom.slice(0, 60)}`), 'assemblage', 'controles', 'construction', 'version'];
  if (kind === 'react') return ['design-system', ...routesFromPlan(plan).map((r) => `page:${r.file.replace('src/pages/', '')}`), 'assemblage', 'compilation', 'controles', 'version'];
  return ['design-system', ...plan.pages.map((p) => `page:${p.fichier}`), 'assemblage', 'controles', 'version'];
}

export function normalizePlan(plan: Plan, kind: ProjectKind): Plan {
  if (kind === 'app') return plan;
  const used = new Set<string>();
  const pages = plan.pages.slice(0, 10).map((p, i) => {
    let base = p.fichier.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.html?$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || `page-${i + 1}`;
    if (i === 0) base = 'index';
    while (used.has(base)) base += '-2';
    used.add(base);
    return { ...p, fichier: `${base}.html` };
  });
  return { ...plan, pages };
}

/** Validation (et édition éventuelle) du plan par le propriétaire, puis poursuite de la génération. */
export async function approvePlan(jobId: string, edits: { plan?: Plan; answers?: string }) {
  const sql = db();
  const job = await loadJob(jobId);
  if (job.status !== 'attente_reponse') throw conflict('Ce job n’attend pas de validation.');
  const project = await getProject(job.project_id);
  const kind = renderOf({ deliverable: project.deliverable, render: await projectRender(job.project_id) });
  const plan = normalizePlan(planSchema.parse(edits.plan ?? project.plan), kind);
  await sql`UPDATE projects SET plan = ${JSON.stringify(plan)}::jsonb, updated_at = now() WHERE id = ${job.project_id}`;
  const input = { ...job.input, answers: edits.answers ?? job.input.answers };
  await sql`UPDATE generation_jobs SET status = 'en_cours', input = ${JSON.stringify(input)}::jsonb, updated_at = now() WHERE id = ${jobId}`;
  await appendSteps(jobId, generationSteps(kind, plan), plan);
  await setProjectStatus(job.project_id, 'Génération');
}

/** Demande un nouveau plan en tenant compte d'une remarque (repasse l'étape de planification). */
export async function replan(jobId: string, feedback: string) {
  const sql = db();
  const job = await loadJob(jobId);
  if (job.status !== 'attente_reponse') throw conflict('Ce job n’attend pas de validation.');
  await sql`UPDATE generation_jobs SET status = 'en_cours', input = ${JSON.stringify({ ...job.input, feedback })}::jsonb, updated_at = now() WHERE id = ${jobId}`;
  await sql`UPDATE generation_steps SET status = 'en_attente', detail = '', finished_at = NULL WHERE job_id = ${jobId} AND key = 'planification'`;
}

export async function cancelJob(jobId: string) {
  const sql = db();
  const job = await loadJob(jobId);
  if (!ACTIVE.includes(job.status)) throw conflict('Ce job est déjà terminé.');
  await sql`UPDATE generation_jobs SET status = 'annule', locked_until = NULL, finished_at = now(), updated_at = now() WHERE id = ${jobId}`;
  await sql`UPDATE generation_steps SET status = 'ignore' WHERE job_id = ${jobId} AND status IN ('en_attente','en_cours')`;
  const current = await getCurrentVersion(job.project_id);
  await setProjectStatus(job.project_id, current ? (job.state.prevStatus && job.state.prevStatus !== 'Génération' ? job.state.prevStatus : 'Prêt pour revue') : 'Brouillon');
}

export async function retryJob(jobId: string) {
  const sql = db();
  const job = await loadJob(jobId);
  if (job.status !== 'echec') throw conflict('Seul un job en échec peut être relancé.');
  await sql`UPDATE generation_steps SET status = 'en_attente', detail = '' WHERE job_id = ${jobId} AND status = 'echec'`;
  await sql`UPDATE generation_jobs SET status = 'en_cours', error = '', finished_at = NULL, updated_at = now() WHERE id = ${jobId}`;
}

async function loadJob(jobId: string): Promise<JobRow> {
  const rows = await db()<JobRow>`SELECT * FROM generation_jobs WHERE id = ${jobId}`;
  if (!rows[0]) throw notFound('Job introuvable.');
  return rows[0];
}

export async function jobSnapshot(jobId: string) {
  const sql = db();
  const job = await loadJob(jobId);
  const steps = await sql<StepRow>`SELECT id, position, key, label, status, detail, cost_usd, input_tokens, output_tokens, started_at, finished_at FROM generation_steps WHERE job_id = ${jobId} ORDER BY position`;
  const [project] = await sql<{ status: string; plan: Plan | null }>`SELECT status, plan FROM projects WHERE id = ${job.project_id}`;
  return {
    id: job.id, projectId: job.project_id, kind: job.kind, status: job.status, error: job.error, currentStep: job.current_step,
    costUsd: Number(job.cost_usd), inputTokens: job.input_tokens, outputTokens: job.output_tokens, createdAt: job.created_at, finishedAt: job.finished_at,
    resultVersionId: job.result_version_id, projectStatus: project?.status, plan: job.status === 'attente_reponse' ? project?.plan ?? null : undefined,
    files: Object.keys(job.state.files ?? {}).sort(), checks: job.state.checks?.counts ?? null, build: job.state.build ? { executed: job.state.build.executed, ok: job.state.build.ok, reason: job.state.build.reason } : null,
    steps: steps.map((s) => ({ key: s.key, label: s.label, status: s.status, detail: s.detail, costUsd: s.cost_usd === null ? null : Number(s.cost_usd), startedAt: s.started_at, finishedAt: s.finished_at })),
  };
}

// ───────────────────────── Exécution ─────────────────────────

/** Exécute la prochaine étape du job. Retourne l'instantané à jour (sans exception métier). */
export async function advanceJob(jobId: string) {
  const sql = db();
  const locked = await sql<JobRow>`UPDATE generation_jobs SET locked_until = now() + interval '14 minutes',
      status = CASE WHEN status = 'en_attente' THEN 'en_cours' ELSE status END, updated_at = now()
    WHERE id = ${jobId} AND status IN ('en_attente','en_cours') AND (locked_until IS NULL OR locked_until < now())
    RETURNING *`;
  const job = locked[0];
  if (!job) return jobSnapshot(jobId);
  let stepRow: StepRow | undefined;
  try {
    const next = await sql<StepRow>`SELECT * FROM generation_steps WHERE job_id = ${jobId} AND status IN ('en_attente','en_cours') ORDER BY position LIMIT 1`;
    stepRow = next[0];
    if (!stepRow) {
      await finishJob(job);
      return jobSnapshot(jobId);
    }
    const attempts = { ...(job.state.attemptsByStep ?? {}) };
    attempts[stepRow.key] = (attempts[stepRow.key] ?? 0) + 1;
    if (attempts[stepRow.key] > 3) throw upstream('Cette étape a échoué ou a été interrompue 3 fois : relancez-la manuellement après vérification.');
    job.state.attemptsByStep = attempts;
    await sql`UPDATE generation_steps SET status = 'en_cours', started_at = now() WHERE id = ${stepRow.id}`;
    await sql`UPDATE generation_jobs SET current_step = ${stepRow.key}, state = ${JSON.stringify(job.state)}::jsonb WHERE id = ${jobId}`;
    const outcome = await runStep(job, stepRow);
    const status = outcome.status ?? 'termine';
    await sql`UPDATE generation_steps SET status = ${status}, detail = ${outcome.detail.slice(0, 4000)}, finished_at = now(),
      cost_usd = ${outcome.cost ?? null}, input_tokens = ${outcome.inTok ?? 0}, output_tokens = ${outcome.outTok ?? 0} WHERE id = ${stepRow.id}`;
    const newStatus = outcome.pause ? 'attente_reponse' : 'en_cours';
    await sql`UPDATE generation_jobs SET state = ${JSON.stringify(job.state)}::jsonb, status = ${newStatus}, updated_at = now(),
      cost_usd = cost_usd + ${outcome.cost ?? 0}, input_tokens = input_tokens + ${outcome.inTok ?? 0}, output_tokens = output_tokens + ${outcome.outTok ?? 0}
      WHERE id = ${jobId}`;
    const remaining = await sql`SELECT 1 FROM generation_steps WHERE job_id = ${jobId} AND status IN ('en_attente','en_cours') LIMIT 1`;
    if (!remaining.length && !outcome.pause) await finishJob({ ...job, status: newStatus });
  } catch (e) {
    const message = e instanceof HttpError ? e.publicMessage : 'Erreur interne pendant l’étape (détails dans les journaux serveur).';
    if (!(e instanceof HttpError)) logError('generation-step', e, { jobId, step: stepRow?.key });
    if (stepRow) await sql`UPDATE generation_steps SET status = 'echec', detail = ${message}, finished_at = now() WHERE id = ${stepRow.id}`;
    await sql`UPDATE generation_jobs SET status = 'echec', error = ${message}, state = ${JSON.stringify(job.state)}::jsonb, updated_at = now() WHERE id = ${jobId}`;
    const current = await getCurrentVersion(job.project_id);
    await setProjectStatus(job.project_id, current ? (job.state.prevStatus ?? 'Prêt pour revue') : 'Échec');
  } finally {
    await sql`UPDATE generation_jobs SET locked_until = NULL WHERE id = ${jobId}`;
  }
  return jobSnapshot(jobId);
}

async function finishJob(job: JobRow) {
  const sql = db();
  const blocked = await sql`SELECT 1 FROM generation_steps WHERE job_id = ${job.id} AND status = 'bloque' LIMIT 1`;
  await sql`UPDATE generation_jobs SET status = ${blocked.length ? 'bloque' : 'termine'}, finished_at = now(), updated_at = now() WHERE id = ${job.id}`;
}

type Ctx = { job: JobRow; project: ProjectRow; render: ProjectKind; assets: AssetRow[]; brief: BriefData; config: Awaited<ReturnType<typeof getConfig>> };

async function systemFor(ctx: Ctx, plan: Plan | null) {
  const matrices = await getActiveMatrices();
  const vars = variablesFor(ctx.brief, ctx.assets, plan?.pages.map((p) => p.titre));
  const composed = composeGenerationPrompt(matrices, vars, ctx.project.matrix_overrides as Record<string, string>);
  let system = systemPrompt(composed, ctx.render === 'app' ? 'app' : 'static');
  if (ctx.render === 'react') system += reactSystemAddendum((ctx.brief as BriefData & { motion?: string }).motion || 'dynamique');
  ctx.job.state.matrices = Object.fromEntries(Object.entries(matrices).map(([k, v]) => [k, v.version]));
  ctx.job.state.systemSha = createHash('sha256').update(system).digest('hex').slice(0, 16);
  return system;
}

async function ai(ctx: Ctx, purpose: string, system: string, content: string | ContentBlock[], opts: { model?: string; maxTokens?: number } = {}) {
  const res = await callClaude({
    purpose, model: opts.model ?? ctx.config.ai.generationModel, system, maxTokens: opts.maxTokens ?? ctx.config.ai.maxOutputTokens,
    messages: [{ role: 'user', content }], projectId: ctx.project.id, jobId: ctx.job.id, cacheSystem: true,
  }, { jobSpent: Number(ctx.job.cost_usd) });
  ctx.job.cost_usd = String(Number(ctx.job.cost_usd) + (res.costUsd ?? 0));
  return res;
}

function mergeFiles(ctx: Ctx, text: string, opts: { require?: string; kind: ProjectKind }) {
  const parsed = parseFiles(text, opts.kind);
  if (parsed.truncated) throw upstream('Réponse de Claude tronquée (limite de sortie atteinte) : augmentez « tokens max » dans Paramètres ou simplifiez la page, puis relancez.');
  const files = { ...(ctx.job.state.files ?? {}) };
  let written = 0;
  for (const f of parsed.files) {
    if (opts.kind === 'react' && KIT_LOCKED.includes(f.path)) continue;
    files[f.path] = f.content;
    written++;
  }
  for (const d of parsed.deleted) if (!(opts.kind === 'react' && KIT_LOCKED.includes(d))) delete files[d];
  if (opts.require && !parsed.files.some((f) => f.path === opts.require)) throw upstream(`Claude n’a pas renvoyé le fichier attendu « ${opts.require} ». Relancez l’étape.`);
  ctx.job.state.files = files;
  if (parsed.summary) ctx.job.state.summary = [...(ctx.job.state.summary ?? []), parsed.summary];
  const rejected = parsed.rejected.length ? ` — ${parsed.rejected.length} fichier(s) refusé(s) (chemin non autorisé) : ${parsed.rejected.slice(0, 5).join(', ')}` : '';
  return { written, detail: `${written} fichier(s) : ${parsed.files.map((f) => f.path).slice(0, 12).join(', ')}${rejected}`, deleted: parsed.deleted.length };
}

const usageOf = (r: { usage: { input_tokens: number; output_tokens: number }; costUsd: number | null }) => ({ cost: r.costUsd, inTok: r.usage.input_tokens, outTok: r.usage.output_tokens });

async function runStep(job: JobRow, step: StepRow): Promise<StepOutcome> {
  const project = await getProject(job.project_id);
  const render = renderOf({ deliverable: project.deliverable, render: await projectRender(project.id) });
  const assets = await getAssets(project.id);
  const config = await getConfig();
  const brief: BriefData = { ...(project.brief_data ?? {}), brief: project.brief_data?.brief || project.brief };
  const ctx: Ctx = { job, project, render, assets, brief, config };
  const plan = project.plan ? planSchema.safeParse(project.plan).data ?? null : null;
  const key = baseKey(step.key);

  if (key === 'collecte') {
    if (!(brief.brief ?? '').trim() && !(brief.services ?? '').trim()) throw new HttpError(400, 'Brief vide : décrivez le projet en quelques phrases.', 'INVALIDE');
    return { detail: `Brief : ${(brief.brief ?? '').length} caractères · ${assets.length} média(s) · rendu ${render === 'react' ? 'React + Motion' : render === 'app' ? 'application Next.js' : 'HTML statique'}` };
  }

  if (key === 'planification') {
    await setProjectStatus(project.id, 'Planification');
    const system = await systemFor(ctx, null);
    const blocks: ContentBlock[] = [];
    for (const a of assets.filter((x) => x.kind === 'image').slice(0, 8)) {
      const v = await readVariant(a.media_id, 'ai');
      blocks.push({ type: 'text', text: `Média images/${a.slug} (${a.role}) :` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: v.mime, data: v.data.toString('base64') } });
    }
    for (const a of assets.filter((x) => x.kind === 'pdf').slice(0, 2)) {
      if (a.size > 8 * 1024 * 1024) continue;
      const v = await readVariant(a.media_id, 'ai');
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: v.data.toString('base64') }, title: a.slug });
    }
    blocks.push({ type: 'text', text: planPrompt({ brief, deliverableLabel: deliverableLabel(project.deliverable), kind: render === 'app' ? 'app' : 'static', assets, answers: job.input.answers, feedback: job.input.feedback }) });
    const res = await ai(ctx, 'planification', system, blocks, { model: config.ai.planModel, maxTokens: 8000 });
    let parsedPlan: Plan;
    try {
      parsedPlan = normalizePlan(planSchema.parse(extractJson(res.text)), render);
    } catch {
      throw upstream('Le plan renvoyé par Claude est illisible (JSON invalide). Relancez l’étape.');
    }
    await db()`UPDATE projects SET plan = ${JSON.stringify(parsedPlan)}::jsonb, updated_at = now() WHERE id = ${project.id}`;
    const questions = parsedPlan.questions_bloquantes.length;
    if (job.input.autoContinue && !questions) {
      await appendSteps(job.id, generationSteps(render, parsedPlan), parsedPlan);
      return { detail: `${parsedPlan.pages.length} page(s) planifiée(s) · enchaînement automatique`, ...usageOf(res) };
    }
    return { detail: questions ? `${questions} question(s) bloquante(s) : réponse requise` : `Plan prêt (${parsedPlan.pages.length} page(s)) : validez-le pour lancer la génération`, pause: true, ...usageOf(res) };
  }

  if (!plan && !['modification', 'correction', 'controles', 'version', 'construction', 'assemblage', 'compilation'].includes(key)) throw upstream('Plan absent : relancez la planification.');
  await setProjectStatus(project.id, key === 'construction' ? 'Construction' : key === 'controles' ? 'Tests' : 'Génération');

  if (key === 'design-system') {
    const system = await systemFor(ctx, plan);
    const motion = brief.motion || 'dynamique';
    const prompt = render === 'react' ? reactDesignSystemPrompt(plan!, brief, routesFromPlan(plan!), motion) : designSystemPrompt(plan!, brief);
    const res = await ai(ctx, 'design-system', system, prompt);
    const out = mergeFiles(ctx, res.text, { kind: render, require: render === 'react' ? 'src/components/Layout.jsx' : '_layout.html' });
    return { detail: out.detail, ...usageOf(res) };
  }

  if (key.startsWith('page:')) {
    const system = await systemFor(ctx, plan);
    const files = ctx.job.state.files ?? {};
    if (render === 'react') {
      const routes = routesFromPlan(plan!);
      const index = routes.findIndex((r) => r.file === `src/pages/${key.slice(5)}`);
      if (index < 0) throw upstream('Page inconnue dans le plan.');
      const route = routes[index];
      const page = plan!.pages[index];
      const res = await ai(ctx, 'page', system, reactPagePrompt(plan!, route, page, { siteConfig: files['src/site.config.js'] ?? '', theme: files['src/styles/theme.css'] ?? '', layout: files['src/components/Layout.jsx'] ?? '' }));
      const out = mergeFiles(ctx, res.text, { kind: 'react', require: route.file });
      return { detail: out.detail, ...usageOf(res) };
    }
    const page = plan!.pages.find((p) => p.fichier === key.slice(5));
    if (!page) throw upstream('Page inconnue dans le plan.');
    const res = await ai(ctx, 'page', system, pagePrompt(plan!, page, files['_layout.html'] ?? '', files['assets/css/styles.css'] ?? ''));
    const out = mergeFiles(ctx, res.text, { kind: 'static', require: page.fichier });
    return { detail: out.detail, ...usageOf(res) };
  }

  if (key === 'scaffold') {
    const system = await systemFor(ctx, plan);
    const res = await ai(ctx, 'scaffold', system, scaffoldPrompt(plan!, brief));
    const out = mergeFiles(ctx, res.text, { kind: 'app', require: 'package.json' });
    return { detail: out.detail, ...usageOf(res) };
  }

  if (key.startsWith('module:')) {
    const system = await systemFor(ctx, plan);
    const mod = plan!.modules.find((m) => m.nom.slice(0, 60) === key.slice(7));
    if (!mod) throw upstream('Module inconnu dans le plan.');
    const files = ctx.job.state.files ?? {};
    const keyFiles = ['package.json', 'lib/db.ts', 'lib/auth.ts', 'db/migrations/001_init.sql', 'middleware.ts'].filter((p) => files[p]).map((p) => ({ path: p, content: files[p] }));
    const res = await ai(ctx, 'module', system, modulePrompt(plan!, mod, { paths: Object.keys(files).sort(), keyFiles }));
    const out = mergeFiles(ctx, res.text, { kind: 'app' });
    return { detail: out.detail, ...usageOf(res) };
  }

  if (key === 'assemblage') {
    const files = { ...(ctx.job.state.files ?? {}) };
    if (render === 'react') {
      const effectivePlan = plan ?? planSchema.parse(project.plan);
      ctx.job.state.files = assembleReactProject({ plan: effectivePlan, files, brief, projectName: project.name, motion: brief.motion || 'dynamique' });
      return { detail: 'Kit Harmony (routeur, kit motion, composants honnêtes), routes, package.json, vercel.json et README assemblés.' };
    }
    if (render === 'static') {
      const pages = Object.keys(files).filter((p) => p.endsWith('.html') && !p.startsWith('_'));
      const domain = (brief.domain ?? '').trim().replace(/\/$/, '');
      files['robots.txt'] = domain ? `User-agent: *\nAllow: /\nSitemap: ${domain}/sitemap.xml\n` : 'User-agent: *\nAllow: /\n';
      if (domain && /^https:\/\/[a-z0-9.-]+$/i.test(domain)) files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${domain}/${p === 'index.html' ? '' : p}</loc></url>`).join('\n')}\n</urlset>\n`;
      ctx.job.state.files = files;
      return { detail: `${pages.length} page(s) · robots.txt${files['sitemap.xml'] ? ' · sitemap.xml' : ' · sitemap.xml non généré (domaine du site inconnu)'}` };
    }
    if (!files['.gitignore']) files['.gitignore'] = 'node_modules\n.next\n.env\n.env.*\n!.env.example\n';
    ctx.job.state.files = files;
    return { detail: `${Object.keys(files).length} fichier(s) assemblés.` };
  }

  if (key === 'compilation') {
    const result = await bundleReact(ctx.job.state.files ?? {});
    ctx.job.state.bundle = { ok: result.ok, errors: result.errors, js: result.js, css: result.css };
    return { detail: result.ok ? `Compilation réussie (${Math.round(result.js.length / 1024)} Ko JS, ${Math.round(result.css.length / 1024)} Ko CSS)` : `Échec de compilation : ${result.errors.slice(0, 3).join(' | ')}` };
  }

  if (key === 'controles') {
    const files = mapToFiles(ctx.job.state.files ?? {});
    const slugs = assets.map((a) => a.slug);
    const name = brief.clientName || project.name;
    const report = render === 'react'
      ? runReactChecks(files, { brief, assetSlugs: slugs, clientName: name, routes: plan ? routesFromPlan(plan) : [], bundle: ctx.job.state.bundle ? { ok: ctx.job.state.bundle.ok, errors: ctx.job.state.bundle.errors } : null })
      : render === 'app' ? runAppChecks(files) : runStaticChecks(files, { brief, assetSlugs: slugs, clientName: name });
    ctx.job.state.checks = report;
    const round = ctx.job.state.fixRound ?? 0;
    if (report.counts.erreur > 0 && render !== 'app' && round < config.ai.autoFixAttempts) {
      ctx.job.state.fixRound = round + 1;
      const r = round + 2;
      const keys = render === 'react' ? [`correction#${r}`, `assemblage#${r}`, `compilation#${r}`, `controles#${r}`] : [`correction#${r}`, `controles#${r}`];
      const versionStep = (await db()<{ key: string }>`SELECT key FROM generation_steps WHERE job_id = ${job.id} AND key = 'version'`)[0];
      if (versionStep) await appendSteps(job.id, keys, plan, 'version');
      return { detail: `${report.counts.erreur} erreur(s), ${report.counts.avertissement} avertissement(s) → correction automatique programmée` };
    }
    return { detail: `${report.counts.erreur} erreur(s), ${report.counts.avertissement} avertissement(s), ${report.counts.info} info(s)` };
  }

  if (key === 'correction' || key === 'modification') {
    const system = await systemFor(ctx, plan);
    const files = ctx.job.state.files ?? {};
    const editable = Object.entries(files).filter(([p]) => !(render === 'react' && (KIT_LOCKED.includes(p) || p.startsWith('src/motion/') || ['src/routes.js', 'src/routes.paths.js', 'package.json', 'index.html', 'vercel.json', 'README.md'].includes(p))));
    if (key === 'correction') {
      const problems = job.input.problems?.length ? job.input.problems : (ctx.job.state.checks?.items ?? []).filter((i) => i.level === 'erreur').map((i) => `${i.file} : ${i.message}`);
      if (!problems.length) return { detail: 'Aucun problème bloquant à corriger.' };
      const named = new Set((ctx.job.state.checks?.items ?? []).filter((i) => i.level === 'erreur').map((i) => i.file));
      let selected = editable.filter(([p]) => named.has(p) || problems.some((x) => x.includes(p)));
      if (!selected.length) selected = editable.filter(([p]) => /\.(html|jsx|css)$/.test(p));
      const res = await ai(ctx, 'correction', system, fixPrompt({ problems: problems.slice(0, 40), files: selected.map(([path, content]) => ({ path, content })) }));
      const out = mergeFiles(ctx, res.text, { kind: render });
      return { detail: `Correction : ${out.detail}`, ...usageOf(res) };
    }
    const instruction = job.input.instruction ?? '';
    const total = editable.reduce((s, [, c]) => s + c.length, 0);
    let selected = editable;
    if (total > 160_000) {
      const words = instruction.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      selected = editable.filter(([p]) => /theme\.css|styles\.css|layout|site\.config|index\.html|accueil/i.test(p) || words.some((w) => p.toLowerCase().includes(w)));
    }
    const res = await ai(ctx, 'modification', system, modifyPrompt({ instruction, plan, files: selected.map(([path, content]) => ({ path, content })), allPaths: Object.keys(files).sort(), assets, kind: render === 'app' ? 'app' : 'static' }));
    const out = mergeFiles(ctx, res.text, { kind: render });
    if (!out.written && !out.deleted) throw upstream('Claude n’a renvoyé aucun fichier modifié. Reformulez la demande puis relancez.');
    return { detail: `Modification : ${out.detail}`, ...usageOf(res) };
  }

  if (key === 'construction') {
    const report = await buildInSandbox(mapToFiles(ctx.job.state.files ?? {}));
    ctx.job.state.build = report;
    if (job.kind === 'construction') {
      const current = await getCurrentVersion(project.id);
      if (current) await db()`UPDATE project_versions SET build_report = ${JSON.stringify(report)}::jsonb WHERE id = ${current.id}`;
      await setProjectStatus(project.id, !report.executed ? 'Construction' : report.ok ? 'Prêt pour revue' : 'À corriger');
    }
    if (!report.executed) return { detail: report.reason ?? 'Runner non configuré.', status: 'bloque' };
    return { detail: report.ok ? 'Installation, build et tests réussis dans le runner isolé.' : `Échec : ${report.steps.filter((s) => s.exitCode !== 0).map((s) => s.name).join(', ')}`, status: report.ok ? 'termine' : 'echec' };
  }

  if (key === 'version') {
    const files = mapToFiles(ctx.job.state.files ?? {});
    const checks = ctx.job.state.checks ?? null;
    const summary = (ctx.job.state.summary ?? []).join('\n').slice(0, 3000) || (job.kind === 'modification' ? `Modification : ${job.input.instruction ?? ''}` : 'Version générée');
    const matrices = await getActiveMatrices();
    const saved = await saveVersion({
      projectId: project.id, files, summary, origin: job.kind === 'creation' ? 'generation' : job.kind === 'correction' ? 'correction' : 'modification',
      instructions: job.input.instruction ?? '', parentId: job.base_version_id, jobId: job.id, checks,
      prompts: { matrices: Object.fromEntries(Object.entries(matrices).map(([k, v]) => [k, v.version ?? 'défaut'])), systemSha: ctx.job.state.systemSha, model: config.ai.generationModel, overrides: project.matrix_overrides },
      preview: render === 'react' && ctx.job.state.bundle?.ok ? { js: ctx.job.state.bundle.js ?? '', css: ctx.job.state.bundle.css ?? '' } : null,
      buildReport: ctx.job.state.build ?? null,
    });
    await db()`UPDATE generation_jobs SET result_version_id = ${saved.id} WHERE id = ${job.id}`;
    const errors = checks?.counts.erreur ?? 0;
    let status = errors > 0 ? 'À corriger' : 'Prêt pour revue';
    if (render === 'app') status = !ctx.job.state.build?.executed ? 'Construction' : ctx.job.state.build.ok && !errors ? 'Prêt pour revue' : 'À corriger';
    await setProjectStatus(project.id, status);
    const note = render === 'app' && !ctx.job.state.build?.executed ? '\n\n⚠️ Code non construit ni testé (runner isolé non configuré) : ne pas le considérer comme fonctionnel.' : '';
    await db()`INSERT INTO project_messages(project_id, role, content, version_id, job_id) VALUES (${project.id}, 'assistant', ${`Version ${saved.number} enregistrée.\n${summary}${note}`}, ${saved.id}, ${job.id})`;
    // Allège l'état du job : les fichiers sont désormais dans la version.
    ctx.job.state.bundle = ctx.job.state.bundle ? { ok: ctx.job.state.bundle.ok, errors: ctx.job.state.bundle.errors } : undefined;
    return { detail: `Version ${saved.number} enregistrée (${files.length} fichiers) · statut « ${status} »` };
  }

  throw upstream(`Étape inconnue : ${step.key}`);
}
