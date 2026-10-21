import { describe, expect, it } from 'vitest';
import { base32Encode, generateSecret, totpAt, verifyTotp } from '@/lib/server/totp';
import { assertPublicUrl, isPrivateIp } from '@/lib/server/safe-fetch';
import { signPreview, verifyPreview } from '@/lib/server/studio/preview';
import { redact } from '@/lib/server/http';
import { parseFiles, safePath } from '@/lib/server/ai/fileformat';
import { sniffType } from '@/lib/server/studio/media';

describe('TOTP RFC 6238', () => {
  it('correspond au vecteur de test officiel (SHA-1)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    // RFC 6238 annexe B : T = 59 s → 94287082 (8 chiffres) → 287082 (6 chiffres)
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
  });
  it('accepte ±1 pas et refuse le reste', () => {
    const s = generateSecret();
    const now = Date.now();
    const step = Math.floor(now / 30000);
    expect(verifyTotp(s, totpAt(s, step), now)).toBe(step);
    expect(verifyTotp(s, totpAt(s, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(s, totpAt(s, step - 3), now)).toBeNull();
    expect(verifyTotp(s, 'abcdef', now)).toBeNull();
  });
});

describe('Protection SSRF', () => {
  it('identifie les adresses privées et réservées', () => {
    for (const ip of ['127.0.0.1', '10.0.0.4', '172.16.5.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1']) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '151.101.1.1', '2a00:1450:4007::1']) expect(isPrivateIp(ip)).toBe(false);
  });
  it('refuse les schémas, ports et hôtes internes', () => {
    expect(() => assertPublicUrl('file:///etc/passwd')).toThrow();
    expect(() => assertPublicUrl('http://localhost/')).toThrow();
    expect(() => assertPublicUrl('http://169.254.169.254/latest/meta-data')).toThrow();
    expect(() => assertPublicUrl('http://exemple.fr:8080/')).toThrow();
    expect(() => assertPublicUrl('http://admin:x@exemple.fr/')).toThrow();
    expect(assertPublicUrl('https://exemple.fr/').hostname).toBe('exemple.fr');
  });
});

describe('Jetons d’aperçu', () => {
  it('signe, vérifie, expire et résiste à la falsification', () => {
    const t = signPreview('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    expect(verifyPreview(t)).toEqual({ projectId: '11111111-1111-1111-1111-111111111111', versionId: '22222222-2222-2222-2222-222222222222' });
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ p: '33333333-3333-3333-3333-333333333333', v: 'x', e: 9e12 })).toString('base64url');
    expect(verifyPreview(`${forged}.${sig}`)).toBeNull();
    expect(verifyPreview(`${payload}.AAAA`)).toBeNull();
    expect(verifyPreview(t, Date.now() + 3 * 3600 * 1000)).toBeNull();
  });
});

describe('Fichiers générés par l’IA (non fiables)', () => {
  it('refuse les chemins dangereux', () => {
    for (const p of ['../etc/passwd', '/abs.html', 'a/../../b.html', '.env', 'node_modules/x.js', 'a\\b.html', 'script.php', 'images/photo.jpg']) expect(safePath(p, 'static')).toBeNull();
    expect(safePath('assets/css/styles.css', 'static')).toBe('assets/css/styles.css');
    expect(safePath('src/pages/AccueilPage.jsx', 'react')).toBe('src/pages/AccueilPage.jsx');
    expect(safePath('public/images/x.webp', 'react')).toBeNull();
    expect(safePath('src/pages/A.jsx', 'static')).toBeNull();
  });
  it('détecte une sortie tronquée et ignore les blocs markdown', () => {
    const ok = parseFiles('<<<FICHIER chemin="index.html">>>\n```html\n<h1>x</h1>\n```\n<<<FIN>>>\n<<<RESUME>>>\nok\n<<<FIN>>>', 'static');
    expect(ok.files[0]).toEqual({ path: 'index.html', content: '<h1>x</h1>' });
    expect(ok.summary).toBe('ok');
    expect(parseFiles('<<<FICHIER chemin="a.html">>>\n<p>coupé', 'static').truncated).toBe(true);
    expect(parseFiles('<<<FICHIER chemin="../x.html">>>\nx\n<<<FIN>>>', 'static').rejected).toEqual(['../x.html']);
  });
});

describe('Uploads : type réel', () => {
  it('reconnaît les signatures et refuse le reste', () => {
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg');
    expect(sniffType(Buffer.from('%PDF-1.7 aaaaaaaa'))).toBe('application/pdf');
    expect(sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00'))).toBeNull();
    expect(sniffType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
  });
});

describe('Journalisation sans secret', () => {
  it('masque clés et chaînes de connexion', () => {
    const out = redact('err sk-ant-api03-abcdef123456 postgresql://u:p@h/db ghp_aaaaaaaaaaaaaaaaaaaaaaaa Bearer abc.def');
    expect(out).not.toMatch(/sk-ant-api03-abc|postgresql:\/\/u|ghp_a|Bearer abc/);
  });
});
