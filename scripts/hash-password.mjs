import { scryptSync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
const rl = createInterface({input: process.stdin,output: process.stdout});
const pwd = await rl.question('Choisis un mot de passe admin fort : ');
rl.close();
if (pwd.length < 12) { console.error('Minimum 12 caractères.'); process.exit(1); }
const salt = randomBytes(16).toString('hex');
console.log('\nADMIN_PASSWORD_HASH=scrypt:' + salt + ':' + scryptSync(pwd, salt, 64).toString('hex'));
