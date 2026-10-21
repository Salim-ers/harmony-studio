-- Retour arrière de 002 vers le schéma V1. À n'utiliser qu'après une SAUVEGARDE (voir BACKUP.md).
-- Conserve les données V1 (prospects, projets, versions HTML, paramètres) et rétablit les statuts V1.
-- ⚠️ Toutes les données propres à la V2 (sources, notes historisées, tâches, devis, jobs, médias privés, matrices versionnées…) sont SUPPRIMÉES.
BEGIN;
DROP TABLE IF EXISTS notifications, usage_events, deployments, quotes, project_assets, blob_chunks, media_variants, media_files,
  generation_steps, generation_jobs, project_messages, pipeline_events, prospect_tasks, prospect_notes, prospect_sources, search_runs,
  search_profiles, prompt_templates, audit_logs, rate_limits, admin_sessions CASCADE;
-- Projets : la V1 exige un HTML courant.
DELETE FROM project_versions WHERE html IS NULL;
UPDATE projects p SET current_html = coalesce(p.current_html, (SELECT v.html FROM project_versions v WHERE v.project_id = p.id ORDER BY v.created_at DESC LIMIT 1));
DELETE FROM projects WHERE current_html IS NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects DROP COLUMN IF EXISTS client_name, DROP COLUMN IF EXISTS sector, DROP COLUMN IF EXISTS city, DROP COLUMN IF EXISTS deliverable,
  DROP COLUMN IF EXISTS brief_data, DROP COLUMN IF EXISTS plan, DROP COLUMN IF EXISTS matrix_overrides, DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS prospect_id, DROP COLUMN IF EXISTS current_version_id, DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS is_demo;
ALTER TABLE projects ALTER COLUMN current_html SET NOT NULL;
DROP INDEX IF EXISTS project_versions_number_uidx;
ALTER TABLE project_versions DROP COLUMN IF EXISTS files, DROP COLUMN IF EXISTS number, DROP COLUMN IF EXISTS summary, DROP COLUMN IF EXISTS origin,
  DROP COLUMN IF EXISTS parent_version_id, DROP COLUMN IF EXISTS job_id, DROP COLUMN IF EXISTS checks, DROP COLUMN IF EXISTS prompts;
ALTER TABLE project_versions ALTER COLUMN html SET NOT NULL;
-- Prospects : statuts V1.
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_v2_check;
UPDATE prospects SET status = CASE
  WHEN status IN ('À examiner','Qualifié') THEN 'Nouveau'
  WHEN status IN ('À relancer','Réponse reçue','Rendez-vous') THEN 'Relance'
  WHEN status = 'Devis envoyé' THEN 'Devis' ELSE status END;
ALTER TABLE prospects ALTER COLUMN status SET DEFAULT 'Nouveau';
ALTER TABLE prospects ADD CONSTRAINT prospects_status_check CHECK (status IN ('Nouveau','À contacter','Contacté','Relance','Devis','Gagné','Perdu'));
DELETE FROM prospects WHERE source_url LIKE 'urn:%';
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_strategy_check, DROP CONSTRAINT IF EXISTS prospects_need_status_check, DROP CONSTRAINT IF EXISTS prospects_confidence_check;
DROP INDEX IF EXISTS prospects_canonical_uidx, prospects_dedupe_idx, prospects_domain_idx, prospects_score_idx, prospects_active_idx, prospects_strategy_idx;
ALTER TABLE prospects DROP COLUMN IF EXISTS strategy, DROP COLUMN IF EXISTS activity, DROP COLUMN IF EXISTS location_verified, DROP COLUMN IF EXISTS canonical_url,
  DROP COLUMN IF EXISTS domain, DROP COLUMN IF EXISTS dedupe_key, DROP COLUMN IF EXISTS platform, DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS published_label,
  DROP COLUMN IF EXISTS need_type, DROP COLUMN IF EXISTS need_status, DROP COLUMN IF EXISTS confidence, DROP COLUMN IF EXISTS confidence_reason, DROP COLUMN IF EXISTS score_details,
  DROP COLUMN IF EXISTS website, DROP COLUMN IF EXISTS website_check, DROP COLUMN IF EXISTS contacts, DROP COLUMN IF EXISTS budget_text, DROP COLUMN IF EXISTS deadline,
  DROP COLUMN IF EXISTS next_action, DROP COLUMN IF EXISTS estimated_value, DROP COLUMN IF EXISTS tags, DROP COLUMN IF EXISTS favorite, DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS do_not_contact, DROP COLUMN IF EXISTS opposition_at, DROP COLUMN IF EXISTS opposition_note, DROP COLUMN IF EXISTS stale, DROP COLUMN IF EXISTS is_demo,
  DROP COLUMN IF EXISTS search_run_id, DROP COLUMN IF EXISTS last_activity_at;
ALTER TABLE app_settings DROP COLUMN IF EXISTS config;
DELETE FROM schema_migrations WHERE name = '002_harmony_v2.sql';
COMMIT;
