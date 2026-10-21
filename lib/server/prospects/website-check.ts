/**
 * Analyse ponctuelle (déclenchée manuellement) de la page d'accueil publique d'un prospect.
 * Respecte robots.txt. Produit des INDICES, jamais une affirmation de besoin.
 */
import { safeFetch } from '../safe-fetch';
import { braveSearch } from './brave';
import { cleanText } from './classify';
import { canonicalUrl, domainOf, isThirdParty, normalizeName } from './url';

export type WebsiteCheck = {
  checked_at: string;
  url: string;
  reachable: boolean;
  robots_blocked: boolean;
  https: boolean;
  status: number;
  title: string;
  hints: string[];
  positives: string[];
  latest_year: number | null;
  error?: string;
};

export function robotsDisallowsRoot(robots: string) {
  let applies = false;
  let blocked = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*' || /harmonystudio/i.test(value);
    else if (applies && key === 'disallow' && value === '/') blocked = true;
    else if (applies && key === 'allow' && value === '/') blocked = false;
  }
  return blocked;
}

export function analyzeHtml(html: string, finalUrl: string, now = new Date()) {
  const lower = html.toLowerCase();
  const hints: string[] = [];
  const positives: string[] = [];
  const title = cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')).slice(0, 200);
  if (!finalUrl.startsWith('https://')) hints.push('Le site ne s’affiche pas en HTTPS.');
  else positives.push('HTTPS actif.');
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) hints.push('Aucune balise viewport : affichage mobile probablement non adapté.');
  else positives.push('Balise viewport présente (responsive probable).');
  if (!/<meta[^>]+name=["']description["']/i.test(html)) hints.push('Pas de meta description (SEO perfectible).');
  if (!title) hints.push('Pas de balise <title>.');
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1])).filter((y) => y > 1995 && y <= now.getFullYear() + 1);
  const latest = years.length ? Math.max(...years) : null;
  if (latest && latest <= now.getFullYear() - 3) hints.push(`Mention de copyright la plus récente : ${latest} (contenu possiblement non mis à jour).`);
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1];
  if (generator) positives.push(`Générateur déclaré : ${generator.slice(0, 60)}.`);
  if (/jquery[-.]1\.\d/.test(lower)) hints.push('Utilise jQuery 1.x (technologie ancienne).');
  if (/<frameset|<font\b|<marquee|\.swf/.test(lower)) hints.push('Balises HTML obsolètes détectées (frameset/font/marquee/Flash).');
  if (!/href=["']tel:/i.test(html)) hints.push('Aucun lien d’appel direct (tel:) détecté.');
  if (/<form\b/i.test(html)) positives.push('Formulaire présent.');
  if (/réserv|reserv|booking|planity|doctolib|thefork/i.test(lower)) positives.push('Mention d’une réservation / prise de rendez-vous.');
  if (/panier|cart|checkout|commande en ligne/i.test(lower)) positives.push('Fonction de commande ou panier détectée.');
  if (html.length > 1_200_000) hints.push('Page très lourde (> 1,2 Mo de HTML).');
  return { title, hints, positives, latest_year: latest };
}

export async function checkWebsite(url: string): Promise<WebsiteCheck> {
  const base: WebsiteCheck = { checked_at: new Date().toISOString(), url, reachable: false, robots_blocked: false, https: url.startsWith('https://'), status: 0, title: '', hints: [], positives: [], latest_year: null };
  try {
    const origin = new URL(url).origin;
    try {
      const robots = await safeFetch(`${origin}/robots.txt`, { maxBytes: 200_000, timeoutMs: 5000 });
      if (robots.status === 200 && robotsDisallowsRoot(robots.body)) return { ...base, robots_blocked: true, hints: ['robots.txt interdit l’analyse automatique : vérification manuelle recommandée.'] };
    } catch { /* robots.txt absent ou inaccessible : on continue */ }
    const res = await safeFetch(url);
    const analysis = analyzeHtml(res.body, res.url);
    return { ...base, url: res.url, reachable: res.status >= 200 && res.status < 400, https: res.url.startsWith('https://'), status: res.status, ...analysis };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message.slice(0, 200) : 'Erreur', hints: ['Site injoignable lors de l’analyse.'] };
  }
}

/** Recherche limitée (une requête) d'un site propre à l'entreprise. */
export async function lookupOwnWebsite(name: string, city: string) {
  const q = `"${name.replace(/"/g, '')}" ${city}`.trim();
  const res = await braveSearch({ q, count: 10 });
  const tokens = normalizeName(name).split(' ').filter((t) => t.length >= 4);
  for (const r of res.results) {
    const canonical = canonicalUrl(r.url);
    if (!canonical || isThirdParty(canonical)) continue;
    const host = domainOf(canonical).replace(/[^a-z0-9]/g, '');
    if (tokens.some((t) => host.includes(t))) return { query: q, found: true, url: canonical, demo: res.demo };
  }
  return { query: q, found: false, url: null as string | null, demo: res.demo };
}
