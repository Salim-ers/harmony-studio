import { defineConfig } from '@playwright/test';

/**
 * Tests E2E dans un vrai navigateur contre `next start` (base locale, HARMONY_MOCKS=1).
 * Prérequis : npm run build && npm start (port 3100) avec .env.local de test — voir README, section Tests.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: 'retain-on-failure',
  },
});
