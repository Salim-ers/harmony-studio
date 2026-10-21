/** Versions de projet : enregistrement, lecture, différentiel et restauration non destructive. */
import { createTwoFilesPatch, diffLines } from 'diff';
import { db } from '../db';
import { notFound } from '../http';
import type { GenFile } from '../ai/fileformat';
import type { CheckReport } from './checks';

export type VersionRow = {
  id: string; project_id: string; number: number; files: GenFile[]; summary: string; origin: string; instructions: string;
  parent_version_id: string | null; checks: CheckReport | null; created_at: string;
};

export function exportable(files: GenFile[]) {
  return files.filter((f) => !f.path.split('/').some((seg) => seg.startsWith('_')));
}

export async function saveVersion(p: {
  projectId: string; files: GenFile[]; summary: string; origin: 'generation' | 'modification' | 'correction' | 'restauration' | 'import';
  instructions?: string; parentId?: string | null; jobId?: string | null; checks?: CheckReport | null; prompts?: unknown;
  preview?: { js: string; css: string } | null; buildReport?: unknown;
}) {
  const sql = db();
  const files = exportable(p.files);
  const [row] = await sql<{ id: string; number: number }>`
    INSERT INTO project_versions(project_id, number, files, summary, origin, instructions, parent_version_id, job_id, checks, prompts, html, preview_js, preview_css, build_report)
    VALUES (${p.projectId}, (SELECT coalesce(max(number), 0) + 1 FROM project_versions WHERE project_id = ${p.projectId}),
      ${JSON.stringify(files)}::jsonb, ${p.summary.slice(0, 4000)}, ${p.origin}, ${p.instructions ?? ''}, ${p.parentId ?? null}, ${p.jobId ?? null},
      ${p.checks ? JSON.stringify(p.checks) : null}::jsonb, ${p.prompts ? JSON.stringify(p.prompts) : null}::jsonb,
      ${files.find((f) => f.path === 'index.html')?.content ?? null}, ${p.preview?.js ?? null}, ${p.preview?.css ?? null},
      ${p.buildReport ? JSON.stringify(p.buildReport) : null}::jsonb)
    RETURNING id, number`;
  const indexHtml = files.find((f) => f.path === 'index.html')?.content ?? null;
  await sql`UPDATE projects SET current_version_id = ${row.id}, current_html = ${indexHtml}, summary = ${p.summary.slice(0, 1000)}, updated_at = now() WHERE id = ${p.projectId}`;
  return row;
}

export async function listVersions(projectId: string) {
  return db()<{ id: string; number: number; summary: string; origin: string; instructions: string; created_at: string; file_count: number; errors: number | null }>`
    SELECT id, number, summary, origin, instructions, created_at, jsonb_array_length(files) AS file_count,
      (checks->'counts'->>'erreur')::int AS errors
    FROM project_versions WHERE project_id = ${projectId} ORDER BY number DESC LIMIT 100`;
}

export async function getVersion(projectId: string, versionId: string): Promise<VersionRow> {
  const rows = await db()<VersionRow>`SELECT id, project_id, number, files, summary, origin, instructions, parent_version_id, checks, created_at
    FROM project_versions WHERE id = ${versionId} AND project_id = ${projectId}`;
  if (!rows[0]) throw notFound('Version introuvable.');
  return rows[0];
}

export async function getCurrentVersion(projectId: string): Promise<VersionRow | null> {
  const rows = await db()<VersionRow>`SELECT v.id, v.project_id, v.number, v.files, v.summary, v.origin, v.instructions, v.parent_version_id, v.checks, v.created_at
    FROM projects p JOIN project_versions v ON v.id = p.current_version_id WHERE p.id = ${projectId}`;
  return rows[0] ?? null;
}

export type FileDiff = { path: string; status: 'ajouté' | 'supprimé' | 'modifié'; added: number; removed: number; patch: string };

export function diffVersions(before: GenFile[], after: GenFile[]): FileDiff[] {
  const a = new Map(before.map((f) => [f.path, f.content]));
  const b = new Map(after.map((f) => [f.path, f.content]));
  const out: FileDiff[] = [];
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    const oldC = a.get(path);
    const newC = b.get(path);
    if (oldC === newC) continue;
    const parts = diffLines(oldC ?? '', newC ?? '');
    const added = parts.filter((x) => x.added).reduce((s, x) => s + (x.count ?? 0), 0);
    const removed = parts.filter((x) => x.removed).reduce((s, x) => s + (x.count ?? 0), 0);
    const patch = createTwoFilesPatch(`avant/${path}`, `après/${path}`, oldC ?? '', newC ?? '', '', '', { context: 3 });
    out.push({ path, status: oldC === undefined ? 'ajouté' : newC === undefined ? 'supprimé' : 'modifié', added, removed, patch: patch.length > 120_000 ? patch.slice(0, 120_000) + '\n… (différentiel tronqué)' : patch });
  }
  return out.sort((x, y) => x.path.localeCompare(y.path));
}

/** Restaurer = créer une NOUVELLE version identique à l'ancienne (l'historique n'est jamais réécrit). */
export async function restoreVersion(projectId: string, versionId: string) {
  const v = await getVersion(projectId, versionId);
  const current = await getCurrentVersion(projectId);
  const [extra] = await db()<{ preview_js: string | null; preview_css: string | null; build_report: unknown }>`SELECT preview_js, preview_css, build_report FROM project_versions WHERE id = ${versionId}`;
  return saveVersion({
    projectId, files: v.files, summary: `Restauration de la version ${v.number}`, origin: 'restauration', parentId: current?.id ?? null, checks: v.checks,
    preview: extra?.preview_js ? { js: extra.preview_js, css: extra.preview_css ?? '' } : null, buildReport: extra?.build_report ?? null,
  });
}
