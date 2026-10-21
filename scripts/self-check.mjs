import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const checks=['app/page.tsx','app/dashboard/page.tsx','components/Dashboard.tsx','lib/auth.ts','lib/claude.ts','lib/prospect-search.ts','scripts/schema.sql','vercel.json','.env.example'];
for(const c of checks){if(!existsSync(resolve(root,c))){console.error('MANQUANT:',c);process.exitCode=1}else console.log('OK',c)}
const env=readFileSync(resolve(root,'.env.example'),'utf8');
for(const v of ['ADMIN_EMAIL','ADMIN_PASSWORD_HASH','SESSION_SECRET','DATABASE_URL','BRAVE_SEARCH_API_KEY','ANTHROPIC_API_KEY','BLOB_READ_WRITE_TOKEN','CRON_SECRET'])if(!new RegExp(`^${v}=`, 'm').test(env)){console.error('Variable manquante:',v);process.exitCode=1}
const cron=JSON.parse(readFileSync(resolve(root,'vercel.json'),'utf8'));if(!cron.crons?.length){console.error('Veille non configurée');process.exitCode=1}
console.log(process.exitCode?'À corriger.':'Structure du projet validée.');
