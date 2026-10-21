#!/usr/bin/env node
/**
 * Applique les migrations SQL de db/migrations dans l'ordre, une seule fois chacune.
 * Usage : DATABASE_URL=... npm run db:migrate        (applique)
 *         DATABASE_URL=... npm run db:migrate -- --status (affiche l'état)
 * Fonctionne avec Neon (connexion Postgres standard, SSL) et Postgres local.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['.env.local', '.env']) {
  const p = resolve(root, file);
  if (!process.env.DATABASE_URL && existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) process.env.DATABASE_URL = m[1].replace(/^['"]|['"]$/g, '');
    }
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquante (variable d\'environnement ou .env.local).');
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes('host=/');
const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: true } });
const dir = resolve(root, 'db/migrations');
const files = readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Map((await client.query('SELECT name, checksum FROM schema_migrations')).rows.map((r) => [r.name, r.checksum]));
  if (process.argv.includes('--status')) {
    for (const f of files) console.log(`${done.has(f) ? '✔ appliquée ' : '… en attente'}  ${f}`);
    process.exit(0);
  }
  let applied = 0;
  for (const f of files) {
    const sql = readFileSync(resolve(dir, f), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (done.has(f)) {
      if (done.get(f) !== checksum) console.warn(`⚠ ${f} a été modifiée après application (checksum différent) — non rejouée.`);
      continue;
    }
    process.stdout.write(`→ ${f} … `);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name, checksum) VALUES($1,$2)', [f, checksum]);
      await client.query('COMMIT');
      applied++;
      console.log('ok');
    } catch (e) {
      await client.query('ROLLBACK');
      console.log('ÉCHEC');
      throw e;
    }
  }
  console.log(applied ? `${applied} migration(s) appliquée(s).` : 'Base déjà à jour.');
} catch (e) {
  console.error('Migration interrompue :', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.end();
}
