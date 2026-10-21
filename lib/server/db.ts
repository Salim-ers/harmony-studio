/**
 * Accès base de données unique pour Harmony Studio.
 *
 * - Production (Vercel) : driver HTTP Neon (`@neondatabase/serverless`), sans connexion persistante.
 * - Local / tests : driver `pg` classique si DATABASE_DRIVER=pg (ou URL localhost).
 *
 * Toutes les requêtes sont paramétrées : le template tag transforme chaque valeur
 * interpolée en paramètre `$n`, jamais en concaténation SQL.
 */
import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Query = { text: string; params: unknown[] };

export interface Db {
  <T extends Row = Row>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Exécute plusieurs requêtes dans une transaction (non interactive). */
  batch(queries: Query[]): Promise<Row[][]>;
}

/** Construit une requête paramétrée à partir d'un template tag (utilisable dans batch). */
export function q(strings: TemplateStringsArray, ...values: unknown[]): Query {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
  return { text, params: values };
}

function shouldUseNodePg(url: string) {
  if (process.env.DATABASE_DRIVER === 'pg') return true;
  if (process.env.DATABASE_DRIVER === 'neon') return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '';
  } catch {
    return false;
  }
}

const globalForDb = globalThis as unknown as { __harmonyPool?: Pool; __harmonyDb?: Db; __harmonyDbUrl?: string };

function createPgDb(url: string): Db {
  const pool = globalForDb.__harmonyPool ?? new Pool({ connectionString: url, max: 5 });
  globalForDb.__harmonyPool = pool;
  const query = async <T extends Row>(text: string, params: unknown[] = []) => (await pool.query(text, params as unknown[])).rows as T[];
  const fn = (async <T extends Row>(strings: TemplateStringsArray, ...values: unknown[]) => {
    const built = q(strings, ...values);
    return query<T>(built.text, built.params);
  }) as Db;
  fn.query = query;
  fn.batch = async (queries) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out: Row[][] = [];
      for (const item of queries) out.push((await client.query(item.text, item.params as unknown[])).rows);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  };
  return fn;
}

function createNeonDb(url: string): Db {
  const sql = neon(url);
  const query = async <T extends Row>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[];
  const fn = (async <T extends Row>(strings: TemplateStringsArray, ...values: unknown[]) => {
    const built = q(strings, ...values);
    return query<T>(built.text, built.params);
  }) as Db;
  fn.query = query;
  fn.batch = async (queries) => (await sql.transaction(queries.map((item) => sql.query(item.text, item.params)))) as Row[][];
  return fn;
}

export function db(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new ConfigError('DATABASE_URL non configurée : la base Neon est indispensable.');
  if (globalForDb.__harmonyDb && globalForDb.__harmonyDbUrl === url) return globalForDb.__harmonyDb;
  const instance = shouldUseNodePg(url) ? createPgDb(url) : createNeonDb(url);
  globalForDb.__harmonyDb = instance;
  globalForDb.__harmonyDbUrl = url;
  return instance;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Encode un Buffer pour une colonne BYTEA, indépendamment du driver. */
export function toBytea(buf: Uint8Array) {
  return '\\x' + Buffer.from(buf).toString('hex');
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
