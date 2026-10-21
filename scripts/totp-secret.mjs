#!/usr/bin/env node
/** Génère un secret TOTP (2FA) à ajouter dans votre application d'authentification puis dans ADMIN_TOTP_SECRET. */
import { randomBytes } from 'node:crypto';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const buf = randomBytes(20);
let bits = 0, value = 0, secret = '';
for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { secret += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
if (bits > 0) secret += ALPHABET[(value << (5 - bits)) & 31];
const label = encodeURIComponent('Harmony Studio:propriétaire');
console.log('\nADMIN_TOTP_SECRET=' + secret);
console.log('\nURI à transformer en QR code (ou saisir le secret à la main dans Google Authenticator, 1Password, Bitwarden…) :');
console.log(`otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Harmony Studio')}&algorithm=SHA1&digits=6&period=30\n`);
console.log('Conservez ce secret hors du code (gestionnaire de mots de passe) et ne le partagez jamais.');
