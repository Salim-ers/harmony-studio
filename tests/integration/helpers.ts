export { jar } from './jar';

export const ORIGIN = 'http://localhost:3000';

export function req(path: string, init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string>; origin?: string | null } = {}) {
  const headers = new Headers(init.headers);
  const method = init.method ?? (init.json !== undefined || init.body ? 'POST' : 'GET');
  if (init.origin !== null && method !== 'GET') headers.set('origin', init.origin ?? ORIGIN);
  headers.set('host', 'localhost:3000');
  headers.set('x-forwarded-for', '203.0.113.7');
  let body = init.body;
  if (init.json !== undefined) { body = JSON.stringify(init.json); headers.set('content-type', 'application/json'); }
  return new Request(`${ORIGIN}${path}`, { method, headers, body });
}

export const ctx = <P extends Record<string, string>>(params: P = {} as P) => ({ params: Promise.resolve(params) });

export async function body<T = Record<string, unknown>>(res: Response) {
  return (await res.json()) as T;
}
