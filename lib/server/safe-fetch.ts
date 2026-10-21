/**
 * Récupération HTTP protégée contre le SSRF :
 * - http/https uniquement, ports 80/443, pas d'identifiants dans l'URL ;
 * - l'adresse IP est validée AU MOMENT DE LA CONNEXION (option lookup) → pas de contournement par DNS rebinding ;
 * - redirections suivies manuellement (max 3) et revalidées ;
 * - taille et durée limitées.
 */
import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

export class UnsafeUrlError extends Error {}

export function isPrivateIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6) || v6.startsWith('64:ff9b:') || v6.startsWith('2001:db8');
}

export function assertPublicUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UnsafeUrlError('URL invalide.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new UnsafeUrlError('Seules les URL http(s) sont autorisées.');
  if (url.username || url.password) throw new UnsafeUrlError('Les identifiants dans l’URL sont interdits.');
  if (url.port && !['80', '443'].includes(url.port)) throw new UnsafeUrlError('Port non autorisé.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new UnsafeUrlError('Hôte interne interdit.');
  if (isIP(host) && isPrivateIp(host)) throw new UnsafeUrlError('Adresse IP privée interdite.');
  return url;
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = (Array.isArray(addresses) ? addresses : [addresses]) as { address: string; family: number }[];
    const bad = list.find((a) => isPrivateIp(a.address));
    if (bad || !list.length) return callback(new UnsafeUrlError('Résolution vers une adresse privée refusée.') as NodeJS.ErrnoException, '', 0);
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export type SafeResponse = { url: string; status: number; headers: Record<string, string>; body: string; bytes: Buffer; truncated: boolean };

function requestOnce(url: URL, maxBytes: number, timeoutMs: number): Promise<SafeResponse & { location?: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'GET',
      lookup: safeLookup,
      timeout: timeoutMs,
      headers: { 'User-Agent': 'HarmonyStudio/2.0 (analyse ponctuelle de site public; contact via site Harmony Solutions)', Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { truncated = true; res.destroy(); return; }
        chunks.push(chunk);
      });
      const done = () => resolve({
        url: url.toString(), status: res.statusCode ?? 0, truncated,
        headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')])),
        body: Buffer.concat(chunks).toString('utf8'),
        bytes: Buffer.concat(chunks),
        location: res.headers.location,
      });
      res.on('end', done);
      res.on('close', done);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetch(raw: string, { maxBytes = 1_500_000, timeoutMs = 8000, maxRedirects = 3 } = {}): Promise<SafeResponse> {
  let url = assertPublicUrl(raw);
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await requestOnce(url, maxBytes, timeoutMs);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.location) {
      url = assertPublicUrl(new URL(res.location, url).toString());
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError('Trop de redirections.');
}
