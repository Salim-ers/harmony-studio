/** Accès aux projets de création et à leurs médias. */
import { db } from '../db';
import { notFound } from '../http';
import type { BriefData } from '../ai/matrices';
import type { Plan } from '../ai/prompts';

export type ProjectRow = {
  id: string; name: string; client_name: string; sector: string; city: string; deliverable: string; brief: string;
  brief_data: BriefData; plan: Plan | null; matrix_overrides: Record<string, string>; status: string; prospect_id: string | null;
  current_version_id: string | null; category: string; style: string; images: string[]; summary: string; is_demo: boolean;
  archived_at: string | null; created_at: string; updated_at: string;
};

export type AssetRow = { id: string; media_id: string; role: string; alt: string; slug: string; position: number; kind: string; mime: string; width: number | null; height: number | null; size: number };

export async function getProject(id: string): Promise<ProjectRow> {
  const rows = await db()<ProjectRow>`SELECT id, name, client_name, sector, city, deliverable, brief, brief_data, plan, matrix_overrides, status, prospect_id,
    current_version_id, category, style, images, summary, is_demo, archived_at, created_at, updated_at FROM projects WHERE id = ${id}`;
  if (!rows[0]) throw notFound('Projet introuvable.');
  return rows[0];
}

export async function getAssets(projectId: string): Promise<AssetRow[]> {
  return db()<AssetRow>`SELECT a.id, a.media_id, a.role, a.alt, a.slug, a.position, m.kind, m.mime, m.width, m.height, m.size
    FROM project_assets a JOIN media_files m ON m.id = a.media_id
    WHERE a.project_id = ${projectId} AND m.status = 'pret' ORDER BY a.position, a.created_at`;
}

export async function setProjectStatus(id: string, status: string) {
  await db()`UPDATE projects SET status = ${status}, updated_at = now() WHERE id = ${id}`;
}

export async function nextSlug(projectId: string, role: string, kind: string) {
  const prefix = role === 'logo' ? 'logo' : role === 'document' || kind === 'pdf' ? 'document' : role === 'charte' ? 'charte' : role === 'capture' ? 'reference' : 'photo';
  const ext = kind === 'pdf' ? 'pdf' : 'webp';
  const rows = await db()<{ slug: string }>`SELECT slug FROM project_assets WHERE project_id = ${projectId} AND slug LIKE ${prefix + '-%'}`;
  let n = rows.length + 1;
  const taken = new Set(rows.map((r) => r.slug));
  while (taken.has(`${prefix}-${String(n).padStart(2, '0')}.${ext}`)) n++;
  return `${prefix}-${String(n).padStart(2, '0')}.${ext}`;
}
