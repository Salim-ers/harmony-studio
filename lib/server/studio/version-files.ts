import { db } from '../db';
import { notFound } from '../http';
import type { GenFile } from '../ai/fileformat';
import type { CheckReport } from './checks';

export async function loadVersionForExport(projectId: string, versionId: string | null) {
  const sql = db();
  const rows = versionId
    ? await sql<{ id: string; number: number; files: GenFile[]; checks: CheckReport | null; build_report: unknown }>`SELECT id, number, files, checks, build_report FROM project_versions WHERE id = ${versionId} AND project_id = ${projectId}`
    : await sql<{ id: string; number: number; files: GenFile[]; checks: CheckReport | null; build_report: unknown }>`SELECT v.id, v.number, v.files, v.checks, v.build_report FROM projects p JOIN project_versions v ON v.id = p.current_version_id WHERE p.id = ${projectId}`;
  if (!rows[0]) throw notFound('Version introuvable.');
  const [project] = await sql<{ name: string; render: string; client_name: string }>`SELECT name, render, client_name FROM projects WHERE id = ${projectId}`;
  return { version: rows[0], project };
}
