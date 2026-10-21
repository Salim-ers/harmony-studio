/**
 * Paramètres applicatifs non secrets (table app_settings, colonne config JSONB).
 * Les valeurs par défaut sont définies ici ; la base ne stocke que les surcharges.
 */
import { z } from 'zod';
import { db } from './db';

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

/**
 * Grille tarifaire API (USD par million de tokens), relevée sur la page officielle
 * https://platform.claude.com/docs/en/about-claude/pricing le 21/10/2026.
 * Entièrement modifiable dans Paramètres → Intégrations & coûts.
 */
export const DEFAULT_PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  'claude-fable-5-1': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
};

const priceSchema = z.object({ input: z.number().min(0), output: z.number().min(0), cacheWrite: z.number().min(0), cacheRead: z.number().min(0) });

export const catalogItemSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  price: z.number().min(0).max(1_000_000).nullable(),
  priceMax: z.number().min(0).max(1_000_000).nullable().optional(),
  unit: z.enum(['forfait', 'mois', 'heure', 'jour', 'unité']),
  note: z.string().max(300).default(''),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const configSchema = z.object({
  company: z.object({
    name: z.string().max(120),
    legalForm: z.string().max(120),
    address: z.string().max(300),
    siren: z.string().max(30),
    phone: z.string().max(40),
    email: z.string().max(120),
    website: z.string().max(200),
    signatory: z.string().max(120),
    valueProposition: z.string().max(1500),
    quoteFooter: z.string().max(1500),
  }),
  ai: z.object({
    planModel: z.string().min(3).max(80),
    generationModel: z.string().min(3).max(80),
    maxOutputTokens: z.number().int().min(4000).max(128000),
    monthlyBudgetUsd: z.number().min(0).max(100000),
    jobBudgetUsd: z.number().min(0).max(10000),
    maxConcurrentJobs: z.number().int().min(1).max(5),
    autoFixAttempts: z.number().int().min(0).max(3),
  }),
  pricing: z.record(z.string(), priceSchema),
  pricingNote: z.string().max(300),
  brave: z.object({ costPer1000Usd: z.number().min(0).max(1000).nullable(), monthlyQueryCap: z.number().int().min(0).max(1_000_000) }),
  prospecting: z.object({
    preferredZones: z.array(z.string().max(80)).max(30),
    retentionMonths: z.number().int().min(1).max(120),
    defaultFreshness: z.enum(['pd', 'pw', 'pm', 'py', 'all']),
  }),
  catalog: z.array(catalogItemSchema).max(60),
  vat: z.object({ regime: z.enum(['a_definir', 'franchise', 'tva']), rate: z.number().min(0).max(30), franchiseMention: z.string().max(300) }),
});
export type AppConfig = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: AppConfig = {
  company: { name: 'Harmony Solutions', legalForm: '', address: '', siren: '', phone: '', email: '', website: '', signatory: 'Salim', valueProposition: 'Harmony Solutions conçoit des sites internet modernes, des outils de gestion (CRM, ERP, tableaux de bord) et des solutions digitales sur mesure pour les commerçants, artisans, indépendants et PME.', quoteFooter: '' },
  ai: { planModel: DEFAULT_MODEL, generationModel: DEFAULT_MODEL, maxOutputTokens: 32000, monthlyBudgetUsd: 50, jobBudgetUsd: 5, maxConcurrentJobs: 2, autoFixAttempts: 1 },
  pricing: DEFAULT_PRICING,
  pricingNote: 'Tarifs API Anthropic relevés le 21/10/2026 (USD / million de tokens). Vérifiez-les régulièrement.',
  brave: { costPer1000Usd: null, monthlyQueryCap: 1500 },
  prospecting: { preferredZones: ['Rantigny', 'Creil', 'Nogent-sur-Oise', 'Clermont', 'Saint-Maximin', 'Oise'], retentionMonths: 36, defaultFreshness: 'pm' },
  // Tarifs de RÉFÉRENCE indicatifs (prompt maître + plaquette Harmony Solutions). Ce ne sont pas des offres fermes.
  catalog: [
    { id: 'carte-visite', label: 'Carte de visite digitale', price: 149, unit: 'forfait', note: 'Tarif de départ indiqué sur la plaquette.' },
    { id: 'fidelite', label: 'Carte de fidélité digitale', price: 299, unit: 'forfait', note: 'Tarif de départ indiqué sur la plaquette.' },
    { id: 'vitrine', label: 'Site vitrine premium', price: 700, unit: 'forfait', note: 'Environ — selon périmètre.' },
    { id: 'vitrine-seo', label: 'Site vitrine + SEO', price: 900, unit: 'forfait', note: 'Environ — selon périmètre.' },
    { id: 'vitrine-admin', label: 'Vitrine + administration / menu', price: 1000, unit: 'forfait', note: 'Environ — selon périmètre.' },
    { id: 'commande', label: 'Commande / paiement en ligne', price: 1500, priceMax: 2000, unit: 'forfait', note: 'Fourchette indicative 1 500–2 000 €.' },
    { id: 'erp', label: 'CRM / ERP / Dashboard simple', price: 1200, unit: 'forfait', note: 'À partir de — un ERP complet nécessite une estimation personnalisée.' },
    { id: 'pwa', label: 'Interface tablette / PWA installable', price: null, unit: 'forfait', note: 'Sur devis.' },
    { id: 'sur-mesure', label: 'Solution complète sur mesure', price: 1500, unit: 'forfait', note: 'À partir de — estimation personnalisée obligatoire.' },
    { id: 'maintenance-essentiel', label: 'Maintenance (formule essentielle)', price: 39.99, unit: 'mois', note: 'Indicatif.' },
    { id: 'maintenance-pro', label: 'Maintenance (formule étendue)', price: 79.99, unit: 'mois', note: 'Indicatif.' },
  ],
  vat: { regime: 'a_definir', rate: 20, franchiseMention: 'TVA non applicable, art. 293 B du CGI' },
};

function deepMerge<T>(base: T, override: unknown): T {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return (override ?? base) as T;
  if (typeof override !== 'object' || override === null || Array.isArray(override)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const current = (base as Record<string, unknown>)[k];
    out[k] = current !== undefined && typeof current === 'object' && current !== null && !Array.isArray(current) && k !== 'pricing'
      ? deepMerge(current, v)
      : v;
  }
  return out as T;
}

export type LegacySettings = { watch_city: string; watch_enabled: boolean };

export async function getConfig(): Promise<AppConfig & { legacy: LegacySettings }> {
  const rows = await db()<{ config: unknown; watch_city: string; watch_enabled: boolean }>`
    SELECT config, watch_city, watch_enabled FROM app_settings WHERE id = 1`;
  const merged = deepMerge(DEFAULT_CONFIG, rows[0]?.config ?? {});
  const parsed = configSchema.safeParse(merged);
  const config = parsed.success ? parsed.data : DEFAULT_CONFIG;
  return { ...config, legacy: { watch_city: rows[0]?.watch_city ?? 'Oise', watch_enabled: rows[0]?.watch_enabled ?? false } };
}

export async function saveConfig(partial: Partial<AppConfig>) {
  const current = await getConfig();
  const { legacy: _legacy, ...base } = current;
  void _legacy;
  const next = configSchema.parse(deepMerge(base, partial));
  await db()`INSERT INTO app_settings(id, config) VALUES (1, ${JSON.stringify(next)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`;
  return next;
}
