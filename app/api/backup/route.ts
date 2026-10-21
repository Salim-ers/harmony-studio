import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Export JSON des données métier (complément aux sauvegardes Neon, voir BACKUP.md).
 * Les binaires des médias ne sont pas inclus (volumineux) : ils restent dans Neon.
 */
export const GET = adminRoute(async () => {
  const sql = db();
  const tables = ['prospects', 'prospect_sources', 'prospect_notes', 'prospect_tasks', 'pipeline_events', 'search_profiles', 'quotes', 'projects',
    'project_versions', 'project_assets', 'project_messages', 'prompt_templates', 'deployments', 'app_settings'] as const;
  const data: Record<string, unknown[]> = {};
  for (const t of tables) {
    data[t] = t === 'project_versions'
      ? await sql.query(`SELECT id, project_id, number, files, summary, origin, instructions, parent_version_id, checks, created_at FROM project_versions ORDER BY created_at`)
      : await sql.query(`SELECT * FROM ${t}`);
  }
  await audit('export_sauvegarde');
  const body = JSON.stringify({ format: 'harmony-studio-backup', version: 2, exported_at: new Date().toISOString(), data });
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="harmony-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'private, no-store' } });
});
