#!/usr/bin/env node
/** Vérification rapide de la structure et de la configuration (sans afficher aucune valeur secrète). */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let ok = true;
const check = (cond, label) => { console.log(`${cond ? '✔' : '✘'} ${label}`); if (!cond) ok = false; };
for (const f of ['middleware.ts', 'next.config.ts', 'vercel.json', '.env.example', 'lib/server/auth.ts', 'lib/server/db.ts', 'templates/react-site/src/App.jsx', 'db/migrations/001_v1_schema.sql', 'db/migrations/002_harmony_v2.sql', 'db/migrations/003_react_sites.sql'])
  check(existsSync(resolve(root, f)), `fichier ${f}`);
const example = readFileSync(resolve(root, '.env.example'), 'utf8');
for (const v of ['ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'DATABASE_URL', 'ANTHROPIC_API_KEY', 'BRAVE_SEARCH_API_KEY', 'CRON_SECRET'])
  check(new RegExp(`^${v}=`, 'm').test(example), `variable documentée ${v}`);
check(!/sk-ant-[A-Za-z0-9]|ghp_[A-Za-z0-9]{20}|postgres(ql)?:\/\/[^\s<]*:[^\s@<]+@/.test(example), '.env.example sans secret réel');
const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8');
check(/^\.env(\.local)?$/m.test(gitignore), '.env* ignorés par git');
const cron = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
check(Array.isArray(cron.crons) && cron.crons.length > 0, 'veille Vercel Cron déclarée');
const env = process.env;
if (env.DATABASE_URL || env.ADMIN_EMAIL) {
  console.log('\nVariables présentes dans cet environnement (valeurs masquées) :');
  for (const v of ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'ANTHROPIC_API_KEY', 'BRAVE_SEARCH_API_KEY', 'CRON_SECRET', 'ADMIN_TOTP_SECRET']) console.log(`  ${env[v] ? '●' : '○'} ${v}`);
  check(!env.SESSION_SECRET || env.SESSION_SECRET.length >= 32, 'SESSION_SECRET ≥ 32 caractères');
  check(!env.ADMIN_PASSWORD_HASH || /^scrypt2?:/.test(env.ADMIN_PASSWORD_HASH), 'ADMIN_PASSWORD_HASH au format scrypt');
  check(!env.HARMONY_MOCKS || !env.VERCEL, 'mode simulation désactivé sur Vercel');
}
console.log(`\nMigrations : ${readdirSync(resolve(root, 'db/migrations')).filter((f) => f.endsWith('.sql')).length} fichier(s).`);
console.log(ok ? '\nStructure du projet validée.' : '\nÀ corriger avant déploiement.');
process.exitCode = ok ? 0 : 1;
