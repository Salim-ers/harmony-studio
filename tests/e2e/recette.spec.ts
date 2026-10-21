import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const EMAIL = process.env.E2E_EMAIL ?? 'salim@harmony.test';
const PASSWORD = process.env.E2E_PASSWORD ?? 'E2E-MotDePasse-Solide-2026';
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/captures';
mkdirSync(SHOTS, { recursive: true });

const cspErrors: string[] = [];
function watchConsole(page: Page) {
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text()); });
  page.on('pageerror', (e) => cspErrors.push(`pageerror: ${e.message}`));
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: /Accéder à mon espace/ }).click();
  await page.waitForURL('**/dashboard');
}
async function shot(page: Page, name: string) {
  for (const [label, width] of [['bureau', 1440], ['tablette', 820], ['mobile', 390]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: join(SHOTS, `${name}-${label}.png`), fullPage: false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `débordement horizontal sur ${name} (${width}px)`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe.configure({ mode: 'serial' });

test('sécurité : pages et API privées refusées sans session', async ({ page, request }) => {
  watchConsole(page);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/\?suite=%2Fdashboard/);
  await expect(page.getByRole('heading', { name: 'Bienvenue.' })).toBeVisible();
  expect((await request.get('/api/prospects')).status()).toBe(401);
  expect((await request.get('/api/projects')).status()).toBe(401);
  await shot(page, '01-connexion');
});

test('connexion : erreur claire puis accès au tableau de bord', async ({ page }) => {
  watchConsole(page);
  await page.goto('/');
  await page.getByLabel('Adresse e-mail').fill(EMAIL);
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: /Accéder à mon espace/ }).click();
  await expect(page.locator('.alert-error')).toContainText('Identifiants incorrects');
  await login(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Salim');
  await expect(page.getByText('MODE SIMULATION LOCAL')).toBeVisible();
  await shot(page, '02-tableau-de-bord');
});

test('prospection : recherche réelle (simulée), qualification, note, persistance', async ({ page }) => {
  watchConsole(page);
  await login(page);
  await page.goto('/prospection?recherche=1');
  await page.getByRole('button', { name: /Demande explicite/ }).click();
  await page.getByRole('button', { name: /Lancer l’analyse/ }).click();
  await expect(page.getByText('Nouvelles pistes')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Résultats de SIMULATION/)).toBeVisible();
  await page.getByRole('button', { name: /Signal d’opportunité/ }).click();
  await page.getByRole('button', { name: 'Creil', exact: true }).click();
  await page.getByRole('button', { name: 'Boulangerie / pâtisserie' }).click();
  await page.getByRole('button', { name: /Lancer l’analyse/ }).click();
  await expect(page.getByText(/nouvelle\(s\) piste\(s\)/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Masquer la recherche/ }).click();
  await shot(page, '03-prospection');
  const link = page.getByRole('link', { name: /Boulangerie du Marché/ }).first();
  await expect(link).toBeVisible();
  await expect(page.getByText('Hypothèse à valider').first()).toBeVisible();
  await link.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Boulangerie du Marché');
  await page.getByLabel('Statut commercial').selectOption('À contacter');
  await expect(page.getByText(/Statut : À contacter/).first()).toBeVisible();
  const note = `Appeler la gérante mardi matin (${Date.now()}).`;
  await page.getByLabel('Nouvelle note').fill(note);
  await page.getByRole('button', { name: 'Ajouter la note' }).click();
  await expect(page.getByText(note)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Statut commercial')).toHaveValue('À contacter');
  await expect(page.getByText(note)).toBeVisible();
  await shot(page, '04-fiche-prospect');
});

test('création : photos + brief → plan validé → site React généré → aperçu isolé → modification', async ({ page }) => {
  test.setTimeout(240_000);
  watchConsole(page);
  const photo = join(SHOTS, 'vitrine-test.jpg');
  writeFileSync(photo, await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 196, g: 140, b: 82 } } }).jpeg().toBuffer());
  await login(page);
  await page.goto('/creation/nouveau');
  await page.getByLabel('Nom du projet *').fill('Boulangerie Dupont — site');
  await page.getByLabel('Nom de l’entreprise cliente *').fill('Boulangerie Dupont');
  await page.getByLabel('Métier / domaine').fill('boulangerie-pâtisserie artisanale');
  await page.getByLabel('Ville').fill('Creil');
  await page.getByRole('button', { name: /Suivant/ }).click();
  await expect(page.getByRole('button', { name: /React \+ Motion/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Spectaculaire/ }).click();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.getByLabel(/Brief libre/).fill('Site premium avec carte de produits et prise de contact, ambiance chaleureuse.');
  await page.getByRole('button', { name: /Suivant/ }).click();
  await page.locator('input[type=file]').setInputFiles(photo);
  await expect(page.getByText('vitrine-test.jpg')).toBeVisible();
  await page.getByRole('button', { name: /Suivant/ }).click();
  await shot(page, '05-nouveau-projet');
  await page.getByRole('button', { name: /Créer et lancer la planification/ }).click();
  await page.waitForURL(/\/creation\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByText('Plan proposé par Claude — modifiable')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Valider le plan et générer/ }).click();
  const frame = page.frameLocator('iframe[title="Aperçu isolé du site généré"]');
  await expect(frame.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 120_000 });
  await expect(frame.getByText('SIMULATION — contenu factice')).toBeVisible();
  await expect(frame.locator('img[alt="Photo fournie par le client"]')).toBeVisible();
  // Isolation : le document de l'aperçu a une origine opaque, sans accès aux cookies ni au parent.
  const isolation = await page.frames().find((f) => f.url().includes('/apercu/'))!.evaluate(() => {
    let cookie = 'accessible'; let parent = 'accessible';
    try { void document.cookie; cookie = document.cookie === '' ? 'vide' : 'accessible'; } catch { cookie = 'bloqué'; }
    try { void window.parent.document.body; } catch { parent = 'bloqué'; }
    return { cookie, parent, origin: window.origin };
  });
  expect(isolation.parent).toBe('bloqué');
  expect(['bloqué', 'vide']).toContain(isolation.cookie);
  expect(isolation.origin).toBe('null');
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await shot(page, '06-studio');
  await page.getByLabel('Demande de modification').fill('Rends la page d’accueil plus spectaculaire sans toucher au contact');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(frame.getByText('encore plus spectaculaire')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('tab', { name: /Versions/ }).click();
  await expect(page.locator('.tl-item').getByText('Version 2')).toBeVisible();
  await page.getByRole('tab', { name: /Qualité/ }).click();
  await expect(page.getByText('Non exécuté automatiquement')).toBeVisible();
});

test('paramètres : matrices génériques, intégrations, aucun secret affiché', async ({ page }) => {
  watchConsole(page);
  await login(page);
  await page.goto('/parametres?onglet=matrices');
  await expect(page.getByLabel('Contenu de la matrice')).toHaveValue(/MATRICE DESIGN/);
  await expect(page.getByLabel('Contenu de la matrice')).not.toHaveValue(/Royal/);
  await shot(page, '07-parametres-matrices');
  await page.goto('/parametres?onglet=ia');
  await expect(page.getByText('Abonnement Claude.ai ≠ API.')).toBeVisible();
  const html = await page.content();
  expect(html).not.toMatch(/scrypt2?:|postgresql:\/\/|sk-ant-/);
});

test('aucune violation CSP ni erreur JavaScript pendant la recette', async () => {
  expect(cspErrors).toEqual([]);
});
