import { execFileSync } from 'node:child_process';
import pg from 'pg';

/** Base d'intégration neuve à chaque exécution, migrée avec les vraies migrations. */
export default async function setup() {
  const admin = new pg.Client({ connectionString: 'postgresql://postgres@localhost:5432/postgres' });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS harmony_it WITH (FORCE)');
  await admin.query('CREATE DATABASE harmony_it');
  await admin.end();
  execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: 'postgresql://postgres@localhost:5432/harmony_it' }, stdio: 'pipe' });
}
