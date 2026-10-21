import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, '.') } },
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], setupFiles: ['tests/setup.ts'] } },
      { extends: true, test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], setupFiles: ['tests/integration/setup-env.ts'], globalSetup: ['tests/integration/global-setup.ts'] } },
    ],
  },
});
