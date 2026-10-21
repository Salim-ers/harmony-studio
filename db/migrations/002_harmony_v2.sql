-- Harmony Studio V2 — migration NON destructive.
-- Toutes les données V1 (prospects, projets, versions, paramètres) sont conservées.
-- Rejouable : chaque instruction est idempotente.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────── Sécurité / sessions ─────────────────────────
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  mfa BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key_hash, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_start);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_date_idx ON audit_logs(created_at DESC);

-- ───────────────────────── Paramètres ─────────────────────────
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('design','technique','seo','audit')),
  version INT NOT NULL,
  content TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_one_active ON prompt_templates(kind) WHERE is_active;

-- La matrice V1 personnalisée est préservée comme version inactive de la matrice Design.
INSERT INTO prompt_templates(kind, version, content, note, is_active)
SELECT 'design', 1, s.matrix, 'Matrice importée de la V1 (conservée, non active)', false
FROM app_settings s
WHERE s.id = 1 AND length(coalesce(s.matrix, '')) >= 30
  AND NOT EXISTS (SELECT 1 FROM prompt_templates WHERE kind = 'design' AND version = 1);

-- ───────────────────────── Prospection ─────────────────────────
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_check;
UPDATE prospects SET status = CASE status
  WHEN 'Nouveau' THEN 'À examiner'
  WHEN 'Relance' THEN 'À relancer'
  WHEN 'Devis' THEN 'Devis envoyé'
  ELSE status END
WHERE status IN ('Nouveau','Relance','Devis');
ALTER TABLE prospects ALTER COLUMN status SET DEFAULT 'À examiner';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospects_status_v2_check') THEN
    ALTER TABLE prospects ADD CONSTRAINT prospects_status_v2_check CHECK (status IN
      ('À examiner','Qualifié','À contacter','Contacté','Réponse reçue','Rendez-vous','Devis envoyé','Gagné','Perdu','À relancer'));
  END IF;
END $$;

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS strategy TEXT NOT NULL DEFAULT 'signal';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS activity TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS location_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS dedupe_key TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS published_label TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS need_type TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS need_status TEXT NOT NULL DEFAULT 'supposé';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'faible';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS confidence_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS score_details JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website_check JSONB;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS contacts JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS budget_text TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS next_action TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12,2);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS opposition_at TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS opposition_note TEXT NOT NULL DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS stale BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS search_run_id UUID;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Reprise des données V1 : la V1 n'a jamais vérifié les besoins → « supposé », confiance faible.
UPDATE prospects SET strategy = CASE WHEN signal LIKE 'Demande%' THEN 'explicite'
                                     WHEN source_type = 'logiciels' THEN 'marche' ELSE 'signal' END
WHERE strategy = 'signal' AND (signal LIKE 'Demande%' OR source_type = 'logiciels');
UPDATE prospects SET canonical_url = source_url WHERE canonical_url IS NULL;
UPDATE prospects SET domain = lower(regexp_replace(regexp_replace(source_url, '^[a-z]+://(www\.)?', '', 'i'), '[/:?#].*$', ''))
WHERE domain = '';
UPDATE prospects SET confidence_reason = 'Fiche importée de la V1 : besoin non vérifié.' WHERE confidence_reason = '';
UPDATE prospects SET last_activity_at = updated_at WHERE last_activity_at > updated_at;
ALTER TABLE prospects ALTER COLUMN canonical_url SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prospects_canonical_uidx ON prospects(canonical_url);
CREATE INDEX IF NOT EXISTS prospects_dedupe_idx ON prospects(dedupe_key) WHERE dedupe_key <> '';
CREATE INDEX IF NOT EXISTS prospects_domain_idx ON prospects(domain);
CREATE INDEX IF NOT EXISTS prospects_score_idx ON prospects(score DESC);
CREATE INDEX IF NOT EXISTS prospects_active_idx ON prospects(archived_at, status, created_at DESC);
CREATE INDEX IF NOT EXISTS prospects_strategy_idx ON prospects(strategy);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospects_strategy_check') THEN
    ALTER TABLE prospects ADD CONSTRAINT prospects_strategy_check CHECK (strategy IN ('explicite','signal','marche','manuel'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospects_need_status_check') THEN
    ALTER TABLE prospects ADD CONSTRAINT prospects_need_status_check CHECK (need_status IN ('confirmé','supposé','inconnu'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospects_confidence_check') THEN
    ALTER TABLE prospects ADD CONSTRAINT prospects_confidence_check CHECK (confidence IN ('élevée','moyenne','faible'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS search_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('explicite','signal','marche')),
  zones TEXT[] NOT NULL DEFAULT '{}',
  sectors TEXT[] NOT NULL DEFAULT '{}',
  needs TEXT[] NOT NULL DEFAULT '{}',
  custom_query TEXT NOT NULL DEFAULT '',
  freshness TEXT NOT NULL DEFAULT 'pm' CHECK (freshness IN ('pd','pw','pm','py','all')),
  max_queries INT NOT NULL DEFAULT 6 CHECK (max_queries BETWEEN 1 AND 20),
  schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  schedule_days INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  schedule_hour INT NOT NULL DEFAULT 7 CHECK (schedule_hour BETWEEN 0 AND 23),
  alert_min_score INT NOT NULL DEFAULT 70 CHECK (alert_min_score BETWEEN 0 AND 100),
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES search_profiles(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL DEFAULT 'manuel' CHECK (trigger IN ('manuel','planifié')),
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours','terminé','partiel','échec')),
  results_found INT NOT NULL DEFAULT 0,
  results_new INT NOT NULL DEFAULT 0,
  results_merged INT NOT NULL DEFAULT 0,
  results_rejected INT NOT NULL DEFAULT 0,
  api_calls INT NOT NULL DEFAULT 0,
  rejections JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT NOT NULL DEFAULT '',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS search_runs_date_idx ON search_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS prospect_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  published_label TEXT NOT NULL DEFAULT '',
  query TEXT NOT NULL DEFAULT '',
  search_run_id UUID REFERENCES search_runs(id) ON DELETE SET NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (prospect_id, url)
);
CREATE INDEX IF NOT EXISTS prospect_sources_prospect_idx ON prospect_sources(prospect_id);

-- Chaque fiche V1 reçoit sa source d'origine (traçabilité).
INSERT INTO prospect_sources(prospect_id, url, platform, title, excerpt, discovered_at)
SELECT p.id, p.source_url, p.source_type, p.name, p.evidence, p.created_at FROM prospects p
WHERE NOT EXISTS (SELECT 1 FROM prospect_sources s WHERE s.prospect_id = p.id);

CREATE TABLE IF NOT EXISTS prospect_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospect_notes_prospect_idx ON prospect_notes(prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prospect_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'relance' CHECK (kind IN ('relance','appel','email','rendez-vous','devis','autre')),
  due_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospect_tasks_due_idx ON prospect_tasks(done_at, due_at);
CREATE INDEX IF NOT EXISTS prospect_tasks_prospect_idx ON prospect_tasks(prospect_id);

CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_events_prospect_idx ON pipeline_events(prospect_id, created_at DESC);

INSERT INTO pipeline_events(prospect_id, kind, to_status, detail, created_at)
SELECT p.id, 'création', p.status, 'Fiche reprise de la V1', p.created_at FROM prospects p
WHERE NOT EXISTS (SELECT 1 FROM pipeline_events e WHERE e.prospect_id = p.id);

-- Les notes V1 (champ texte unique) sont conservées dans prospects.notes ET copiées dans l'historique de notes.
INSERT INTO prospect_notes(prospect_id, body, created_at)
SELECT p.id, p.notes, p.updated_at FROM prospects p
WHERE length(trim(p.notes)) > 0 AND NOT EXISTS (SELECT 1 FROM prospect_notes n WHERE n.prospect_id = p.id);

-- ───────────────────────── Projets / création IA ─────────────────────────
ALTER TABLE projects ALTER COLUMN current_html DROP NOT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_name TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deliverable TEXT NOT NULL DEFAULT 'vitrine';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS brief_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS matrix_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Brouillon';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_version_id UUID;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN
      ('Brouillon','Planification','Génération','Construction','Tests','À corriger','Prêt pour revue','Approuvé','Déployé','Échec'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS projects_updated_idx ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_prospect_idx ON projects(prospect_id);

ALTER TABLE project_versions ALTER COLUMN html DROP NOT NULL;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS files JSONB;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS number INT;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS parent_version_id UUID;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS job_id UUID;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS checks JSONB;
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS prompts JSONB;

-- Reprise V1 : chaque HTML monolithique devient une version à un fichier « index.html ».
UPDATE project_versions SET files = jsonb_build_array(jsonb_build_object('path','index.html','content',html))
WHERE files IS NULL AND html IS NOT NULL;
UPDATE project_versions SET files = '[]'::jsonb WHERE files IS NULL;
ALTER TABLE project_versions ALTER COLUMN files SET NOT NULL;
ALTER TABLE project_versions ALTER COLUMN files SET DEFAULT '[]'::jsonb;
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at) AS n FROM project_versions
) UPDATE project_versions v SET number = numbered.n FROM numbered WHERE v.id = numbered.id AND v.number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_versions_number_uidx ON project_versions(project_id, number);

-- Projets V1 : version courante = dernière version ; statut « Prêt pour revue ».
UPDATE projects p SET current_version_id = (
  SELECT v.id FROM project_versions v WHERE v.project_id = p.id ORDER BY v.created_at DESC LIMIT 1
) WHERE p.current_version_id IS NULL;
UPDATE projects SET status = 'Prêt pour revue', deliverable = 'vitrine'
WHERE status = 'Brouillon' AND current_version_id IS NOT NULL AND current_html IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  version_id UUID,
  job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_messages_project_idx ON project_messages(project_id, created_at);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('creation','modification','correction','construction')),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','en_cours','attente_reponse','bloque','termine','echec','annule')),
  current_step TEXT NOT NULL DEFAULT '',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT NOT NULL DEFAULT '',
  attempts INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,5) NOT NULL DEFAULT 0,
  cost_known BOOLEAN NOT NULL DEFAULT true,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  base_version_id UUID,
  result_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS generation_jobs_project_idx ON generation_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generation_jobs_status_idx ON generation_jobs(status);

CREATE TABLE IF NOT EXISTS generation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  position INT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','en_cours','termine','echec','ignore','bloque')),
  detail TEXT NOT NULL DEFAULT '',
  cost_usd NUMERIC(12,5),
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (job_id, key)
);

-- ───────────────────────── Médias privés ─────────────────────────
CREATE TABLE IF NOT EXISTS media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image','pdf')),
  mime TEXT NOT NULL DEFAULT '',
  size INT NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  width INT,
  height INT,
  status TEXT NOT NULL DEFAULT 'upload' CHECK (status IN ('upload','pret','rejete')),
  expected_size INT NOT NULL DEFAULT 0,
  expected_parts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_files_sha_idx ON media_files(sha256);

CREATE TABLE IF NOT EXISTS media_variants (
  media_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('original','web','ai','thumb')),
  mime TEXT NOT NULL,
  size INT NOT NULL,
  width INT,
  height INT,
  chunks INT NOT NULL DEFAULT 1,
  PRIMARY KEY (media_id, variant)
);

CREATE TABLE IF NOT EXISTS blob_chunks (
  media_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  idx INT NOT NULL,
  data BYTEA NOT NULL,
  PRIMARY KEY (media_id, variant, idx)
);

CREATE TABLE IF NOT EXISTS project_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'photo' CHECK (role IN ('photo','logo','document','charte','capture')),
  alt TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, media_id),
  UNIQUE (project_id, slug)
);

-- ───────────────────────── Devis ─────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL UNIQUE,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  client_details TEXT NOT NULL DEFAULT '',
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  vat_regime TEXT NOT NULL DEFAULT 'a_definir' CHECK (vat_regime IN ('a_definir','franchise','tva')),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_ht NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tva NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','envoyé','accepté','refusé','expiré')),
  valid_until DATE,
  notes TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_prospect_idx ON quotes(prospect_id);
CREATE INDEX IF NOT EXISTS quotes_project_idx ON quotes(project_id);

-- ───────────────────────── Déploiements / usage / notifications ─────────────────────────
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id UUID,
  provider TEXT NOT NULL CHECK (provider IN ('github','vercel','zip')),
  target TEXT NOT NULL CHECK (target IN ('repo','preview','production','archive')),
  status TEXT NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours','succes','echec')),
  url TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deployments_project_idx ON deployments(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cache_read_tokens INT NOT NULL DEFAULT 0,
  cache_write_tokens INT NOT NULL DEFAULT 0,
  units INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,5),
  ok BOOLEAN NOT NULL DEFAULT true,
  detail TEXT NOT NULL DEFAULT '',
  project_id UUID,
  job_id UUID,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_date_idx ON usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_provider_idx ON usage_events(provider, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(read_at, created_at DESC);
