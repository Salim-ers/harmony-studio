import { vi } from 'vitest';
import { hashPassword } from '@/lib/server/auth';

vi.mock('next/headers', async () => {
  const { jar } = await import('./jar');
  return {
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      has: (name: string) => jar.has(name),
      set: (name: string, value: string, opts?: { maxAge?: number }) => { if (opts?.maxAge === 0 || !value) jar.delete(name); else jar.set(name, value); },
      delete: (name: string) => jar.delete(name),
    }),
    headers: async () => new Headers(),
  };
});

process.env.DATABASE_URL = 'postgresql://postgres@localhost:5432/harmony_it';
process.env.DATABASE_DRIVER = 'pg';
process.env.SESSION_SECRET = 'integration-secret-integration-secret-0123456789';
process.env.ADMIN_EMAIL = 'salim@harmony.test';
process.env.ADMIN_PASSWORD_HASH = hashPassword('MotDePasse-Tres-Solide-2026');
process.env.HARMONY_MOCKS = '1';
process.env.CRON_SECRET = 'cron-secret-cron-secret-0123';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.BRAVE_SEARCH_API_KEY;
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
