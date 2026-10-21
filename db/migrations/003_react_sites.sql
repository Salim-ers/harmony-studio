-- Sites clients React (Vite + Motion) : rendu par projet et bundle d'aperçu par version. Non destructif.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS render TEXT NOT NULL DEFAULT 'html';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_render_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_render_check CHECK (render IN ('html','react','nextjs'));
  END IF;
END $$;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS preview_js TEXT;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS preview_css TEXT;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS build_report JSONB;
