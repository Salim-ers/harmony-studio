/**
 * Lecture centralisée des variables d'environnement serveur.
 * Aucune de ces valeurs n'est jamais envoyée au navigateur : seul l'état
 * « configuré / non configuré » est exposé à l'interface.
 */
import 'server-only'; // empêche toute importation accidentelle côté navigateur (erreur de build)

export const env = {
  adminEmail: () => (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase(),
  adminPasswordHash: () => process.env.ADMIN_PASSWORD_HASH ?? '',
  totpSecret: () => (process.env.ADMIN_TOTP_SECRET ?? '').replace(/\s+/g, '').toUpperCase(),
  sessionSecret: () => process.env.SESSION_SECRET ?? '',
  anthropicKey: () => process.env.ANTHROPIC_API_KEY ?? '',
  braveKey: () => process.env.BRAVE_SEARCH_API_KEY ?? '',
  cronSecret: () => process.env.CRON_SECRET ?? '',
  githubToken: () => process.env.GITHUB_TOKEN ?? '',
  githubOwner: () => process.env.GITHUB_OWNER ?? '',
  vercelDeployToken: () => process.env.VERCEL_DEPLOY_TOKEN ?? '',
  vercelDeployTeamId: () => process.env.VERCEL_DEPLOY_TEAM_ID ?? '',
  previewOrigin: () => (process.env.PREVIEW_ORIGIN ?? '').replace(/\/$/, ''),
  appOrigin: () => (process.env.APP_ORIGIN ?? '').replace(/\/$/, ''),
  isProduction: () => process.env.NODE_ENV === 'production',
  isVercel: () => !!process.env.VERCEL,
};

/**
 * Mode simulation : réponses Brave/Claude factices, CLAIREMENT marquées « Donnée de test ».
 * Interdit dès que l'application tourne sur Vercel (preview ou production).
 */
export function mocksEnabled() {
  return process.env.HARMONY_MOCKS === '1' && !process.env.VERCEL && !process.env.VERCEL_ENV;
}

/** Le runner Vercel Sandbox est utilisable si OIDC (sur Vercel) ou jeton explicite. */
export function sandboxConfigured() {
  if (process.env.SANDBOX_ENABLED !== '1') return false;
  if (process.env.VERCEL_OIDC_TOKEN) return true;
  return !!(process.env.SANDBOX_VERCEL_TOKEN && process.env.SANDBOX_VERCEL_TEAM_ID && process.env.SANDBOX_VERCEL_PROJECT_ID);
}

export type IntegrationStatus = {
  key: string;
  label: string;
  configured: boolean;
  required: boolean;
  detail: string;
};

export function integrationStatuses(): IntegrationStatus[] {
  const sessionOk = env.sessionSecret().length >= 32;
  return [
    { key: 'database', label: 'Base Neon PostgreSQL', configured: !!process.env.DATABASE_URL, required: true, detail: 'DATABASE_URL' },
    { key: 'auth', label: 'Compte propriétaire', configured: !!env.adminEmail() && env.adminPasswordHash().startsWith('scrypt:') && sessionOk, required: true, detail: 'ADMIN_EMAIL, ADMIN_PASSWORD_HASH, SESSION_SECRET (≥ 32 caractères)' },
    { key: 'totp', label: 'Double authentification (TOTP)', configured: env.totpSecret().length >= 16, required: false, detail: 'ADMIN_TOTP_SECRET — fortement recommandé' },
    { key: 'anthropic', label: 'API Claude (Anthropic)', configured: !!env.anthropicKey() || mocksEnabled(), required: true, detail: mocksEnabled() && !env.anthropicKey() ? 'MODE SIMULATION LOCAL — aucune vraie génération' : 'ANTHROPIC_API_KEY (facturation API distincte de l’abonnement Claude)' },
    { key: 'brave', label: 'Brave Search API', configured: !!env.braveKey() || mocksEnabled(), required: true, detail: mocksEnabled() && !env.braveKey() ? 'MODE SIMULATION LOCAL — aucun vrai résultat' : 'BRAVE_SEARCH_API_KEY' },
    { key: 'cron', label: 'Veille planifiée (Vercel Cron)', configured: env.cronSecret().length >= 16, required: false, detail: 'CRON_SECRET' },
    { key: 'sandbox', label: 'Runner isolé (Vercel Sandbox)', configured: sandboxConfigured(), required: false, detail: 'SANDBOX_ENABLED=1 + OIDC Vercel ou SANDBOX_VERCEL_TOKEN/TEAM_ID/PROJECT_ID' },
    { key: 'github', label: 'GitHub (dépôts privés)', configured: !!env.githubToken() && !!env.githubOwner(), required: false, detail: 'GITHUB_TOKEN (fine-grained), GITHUB_OWNER' },
    { key: 'vercel', label: 'Déploiement Vercel des projets clients', configured: !!env.vercelDeployToken(), required: false, detail: 'VERCEL_DEPLOY_TOKEN (+ VERCEL_DEPLOY_TEAM_ID)' },
    { key: 'preview', label: 'Origine isolée des aperçus', configured: !!env.previewOrigin(), required: false, detail: 'PREVIEW_ORIGIN — recommandé (sinon iframe sandbox + CSP sandbox sur la même origine)' },
  ];
}
