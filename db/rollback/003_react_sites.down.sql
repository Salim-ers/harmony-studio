-- Retour arrière de 003 (supprime uniquement les ajouts de 003 ; les données V1/V2 restent).
-- ⚠️ Les bundles d'aperçu React et le choix de rendu des projets sont perdus.
ALTER TABLE project_versions DROP COLUMN IF EXISTS build_report;
ALTER TABLE project_versions DROP COLUMN IF EXISTS preview_css;
ALTER TABLE project_versions DROP COLUMN IF EXISTS preview_js;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_render_check;
ALTER TABLE projects DROP COLUMN IF EXISTS render;
DELETE FROM schema_migrations WHERE name = '003_react_sites.sql';
