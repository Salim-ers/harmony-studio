/** Matrices versionnées (table prompt_templates) et composition du prompt final d'un projet. */
import { db } from '../db';
import type { MatrixKind } from '@/lib/shared/constants';
import { DEFAULT_MATRICES, MATRIX_VARIABLES, type MatrixVariable } from './default-matrices';

export type MatrixSet = Record<MatrixKind, { content: string; version: number | null; isDefault: boolean }>;

export async function getActiveMatrices(): Promise<MatrixSet> {
  const rows = await db()<{ kind: MatrixKind; content: string; version: number }>`
    SELECT kind, content, version FROM prompt_templates WHERE is_active`;
  const out = {} as MatrixSet;
  for (const kind of Object.keys(DEFAULT_MATRICES) as MatrixKind[]) {
    const row = rows.find((r) => r.kind === kind);
    out[kind] = row ? { content: row.content, version: row.version, isDefault: false } : { content: DEFAULT_MATRICES[kind], version: null, isDefault: true };
  }
  return out;
}

export async function listVersions(kind: MatrixKind) {
  return db()<{ id: string; version: number; note: string; is_active: boolean; created_at: string; length: number }>`
    SELECT id, version, note, is_active, created_at, length(content) AS length FROM prompt_templates WHERE kind = ${kind} ORDER BY version DESC LIMIT 50`;
}

export async function saveMatrixVersion(kind: MatrixKind, content: string, note: string) {
  const sql = db();
  const [{ next }] = await sql<{ next: number }>`SELECT coalesce(max(version), 0) + 1 AS next FROM prompt_templates WHERE kind = ${kind}`;
  await sql.batch([
    { text: 'UPDATE prompt_templates SET is_active = false WHERE kind = $1 AND is_active', params: [kind] },
    { text: 'INSERT INTO prompt_templates(kind, version, content, note, is_active) VALUES ($1,$2,$3,$4,true)', params: [kind, next, content, note] },
  ]);
  return next;
}

export async function activateVersion(kind: MatrixKind, version: number) {
  const sql = db();
  const exists = await sql`SELECT 1 FROM prompt_templates WHERE kind = ${kind} AND version = ${version}`;
  if (!exists.length) return false;
  await sql.batch([
    { text: 'UPDATE prompt_templates SET is_active = false WHERE kind = $1 AND is_active', params: [kind] },
    { text: 'UPDATE prompt_templates SET is_active = true WHERE kind = $1 AND version = $2', params: [kind, version] },
  ]);
  return true;
}

/** Restaure la matrice par défaut (désactive les versions personnalisées, sans les supprimer). */
export async function restoreDefault(kind: MatrixKind) {
  await db()`UPDATE prompt_templates SET is_active = false WHERE kind = ${kind} AND is_active`;
}

export async function getVersionContent(kind: MatrixKind, version: number) {
  const rows = await db()<{ content: string }>`SELECT content FROM prompt_templates WHERE kind = ${kind} AND version = ${version}`;
  return rows[0]?.content ?? null;
}

export type BriefData = {
  clientName?: string; sector?: string; city?: string; zone?: string; brief?: string; style?: string; palette?: string; typography?: string;
  features?: string[]; cta?: string; services?: string; objectives?: string; audience?: string; address?: string; phone?: string; email?: string;
  hours?: string; socials?: string; prices?: string; legal?: string; references?: string; constraints?: string; pages?: string;
  motion?: 'sobre' | 'dynamique' | 'spectaculaire' | string; domain?: string;
};

const MISSING = 'À renseigner';
const val = (v?: string | null) => (v && v.trim() ? v.trim() : MISSING);

export function variablesFor(brief: BriefData, assets: { slug: string; role: string; alt: string }[], pages?: string[]): Record<MatrixVariable, string> {
  const photos = assets.filter((a) => a.role !== 'logo' && a.role !== 'document');
  const logo = assets.find((a) => a.role === 'logo');
  const contact = [brief.address && `Adresse : ${brief.address}`, brief.phone && `Téléphone : ${brief.phone}`, brief.email && `E-mail : ${brief.email}`, brief.socials && `Réseaux : ${brief.socials}`].filter(Boolean).join(' · ');
  return {
    nom_entreprise: val(brief.clientName),
    secteur: val(brief.sector),
    ville: val(brief.city),
    zone_chalandise: val(brief.zone),
    prestations: val(brief.services),
    objectifs: val(brief.objectives),
    clientele: val(brief.audience),
    pages: pages?.length ? pages.join(', ') : val(brief.pages),
    fonctionnalites: brief.features?.length ? brief.features.join(', ') : MISSING,
    style: val(brief.style),
    couleurs: val(brief.palette),
    typographies: val(brief.typography),
    photos: photos.length ? photos.map((p) => `images/${p.slug} (${p.alt || 'sans description'})`).join(' ; ') : 'Aucune photo fournie',
    logo: logo ? `images/${logo.slug}` : 'Aucun logo fourni',
    references: val(brief.references),
    coordonnees_confirmees: contact || MISSING,
    horaires: val(brief.hours),
    tarifs_confirmes: val(brief.prices),
    cta: val(brief.cta),
    contraintes: val(brief.constraints),
    mentions_legales: val(brief.legal),
  };
}

export function fillTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, name: string) => (name in vars ? vars[name] : m));
}

export type Overrides = Partial<Record<MatrixKind, string>>;

/** Compose les matrices Design + Technique + SEO (l'Audit est réservé à la phase de validation). */
export function composeGenerationPrompt(matrices: MatrixSet, vars: Record<string, string>, overrides: Overrides = {}) {
  const parts = (['design', 'technique', 'seo'] as const).map((kind) => {
    const extra = overrides[kind]?.trim() ? `\n\n### Règles spécifiques à ce projet (prioritaires)\n${overrides[kind]!.trim()}` : '';
    return fillTemplate(matrices[kind].content, vars) + extra;
  });
  return parts.join('\n\n---\n\n');
}

export function composeAuditPrompt(matrices: MatrixSet, vars: Record<string, string>, overrides: Overrides = {}) {
  const extra = overrides.audit?.trim() ? `\n\n### Contrôles spécifiques à ce projet\n${overrides.audit.trim()}` : '';
  return fillTemplate(matrices.audit.content, vars) + extra;
}

export { MATRIX_VARIABLES };
