-- À exécuter une seule fois dans Neon > SQL Editor.
CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'Recherche web',
  city TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Site vitrine',
  evidence TEXT NOT NULL DEFAULT '',
  signal TEXT NOT NULL DEFAULT 'À vérifier',
  score INT NOT NULL DEFAULT 30 CHECK (score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'Nouveau' CHECK (status IN ('Nouveau','À contacter','Contacté','Relance','Devis','Gagné','Perdu')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospects_status_idx ON prospects(status);
CREATE INDEX IF NOT EXISTS prospects_date_idx ON prospects(created_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  style TEXT NOT NULL,
  brief TEXT NOT NULL,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_html TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  html TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_versions_project_idx ON project_versions(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  matrix TEXT NOT NULL DEFAULT '',
  watch_city TEXT NOT NULL DEFAULT 'Oise',
  watch_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_settings(id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts(ip_hash, created_at DESC);
