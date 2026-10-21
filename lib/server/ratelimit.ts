/**
 * Limitation de débit persistante (table rate_limits), fiable sur Vercel où
 * chaque invocation peut tourner dans une instance différente.
 */
import { createHash } from 'node:crypto';
import { db } from './db';
import { tooMany } from './http';

export const LIMITS = {
  login: { limit: 5, windowSec: 15 * 60 },
  loginGlobal: { limit: 40, windowSec: 60 * 60 },
  search: { limit: 30, windowSec: 60 * 60 },
  ai: { limit: 300, windowSec: 60 * 60 },
  upload: { limit: 400, windowSec: 60 * 60 },
  external: { limit: 20, windowSec: 60 * 60 },
  websiteCheck: { limit: 60, windowSec: 60 * 60 },
  write: { limit: 1500, windowSec: 60 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

export function hashKey(key: string) {
  return createHash('sha256').update(key + (process.env.SESSION_SECRET ?? '')).digest('hex').slice(0, 40);
}

/** Incrémente le compteur et lève 429 si la limite est dépassée. */
export async function consume(name: LimitName, key: string, cost = 1) {
  const { limit, windowSec } = LIMITS[name];
  const sql = db();
  const rows = await sql<{ count: number }>`
    INSERT INTO rate_limits(bucket, key_hash, window_start, count)
    VALUES (${name}, ${hashKey(key)}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}) * ${windowSec}), ${cost})
    ON CONFLICT (bucket, key_hash, window_start) DO UPDATE SET count = rate_limits.count + EXCLUDED.count
    RETURNING count`;
  if (Math.random() < 0.02) await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) throw tooMany();
  return { count, limit, remaining: Math.max(0, limit - count) };
}

/** Lecture sans incrément (pour vérifier avant un traitement coûteux). */
export async function peek(name: LimitName, key: string) {
  const { limit, windowSec } = LIMITS[name];
  const rows = await db()<{ count: number }>`
    SELECT count FROM rate_limits WHERE bucket = ${name} AND key_hash = ${hashKey(key)}
      AND window_start = to_timestamp(floor(extract(epoch from now()) / ${windowSec}) * ${windowSec})`;
  const count = Number(rows[0]?.count ?? 0);
  return { count, limit, blocked: count >= limit };
}

export async function reset(name: LimitName, key: string) {
  await db()`DELETE FROM rate_limits WHERE bucket = ${name} AND key_hash = ${hashKey(key)}`;
}

export function clientIp(request: Request) {
  return (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || 'inconnue').split(',')[0].trim();
}
