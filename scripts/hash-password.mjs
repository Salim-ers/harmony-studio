/**
 * Génère ADMIN_PASSWORD_HASH (scrypt, N=2^14, r=8, p=5 — voir lib/server/auth.ts).
 * La saisie n'est pas masquée par le terminal : lancez la commande dans une fenêtre que personne ne voit.
 */
import { scryptSync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const N = 16384, r = 8, p = 5;
const rl = createInterface({ input: process.stdin, output: process.stdout });
const pwd = await rl.question('Choisissez un mot de passe administrateur (12 caractères minimum, idéalement une phrase) : ');
rl.close();
if (pwd.length < 12) { console.error('Minimum 12 caractères.'); process.exit(1); }
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(pwd.slice(0, 512), salt, 64, { N, r, p, maxmem: 256 * N * r }).toString('hex');
console.log(`\nADMIN_PASSWORD_HASH=scrypt2:${N}:${r}:${p}:${salt}:${hash}`);
