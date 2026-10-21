import { db } from './db';

export type SearchMode = 'demandes' | 'commerces' | 'logiciels';
const queries: Record<SearchMode, (city:string)=>string[]> = {
  demandes: (c) => [
    `"cherche quelqu'un" "site internet" ${c}`,
    `"recherche développeur" "site web" ${c}`,
    `"besoin d'un site" artisan OR commerce ${c}`,
    `site:codeur.com/projects "site vitrine" ${c}`
  ],
  commerces: (c) => [
    `boulangerie pâtisserie artisanale ${c} contact`,
    `restaurant café indépendant ${c} contact`,
    `salon coiffure barbier ${c} contact`,
    `artisan plombier électricien ${c} contact`,
    `garage carrosserie indépendant ${c} contact`,
    `institut beauté bien-être ${c} contact`
  ],
  logiciels: (c) => [
    `"cherche un logiciel" gestion entreprise ${c}`,
    `"application sur mesure" besoin entreprise ${c}`,
    `"appel d'offres" développement application web ${c}`
  ]
};
function classify(title: string, description: string, mode: SearchMode) {
  const s = (title+' '+description).toLowerCase();
  const explicit = /cherche|recherche|besoin|appel d.offres|prestataire|développeur|creation de site|création de site/.test(s);
  const category = /application|erp|logiciel|automatisation|gestion/.test(s) ? 'Logiciel / ERP'
    : /seo|référencement/.test(s) ? 'Site + SEO' : 'Site vitrine';
  const signal = explicit && mode !== 'commerces' ? 'Demande potentiellement explicite' : 'Opportunité à vérifier';
  const score = signal.startsWith('Demande') ? 78 : mode === 'commerces' ? 35 : 48;
  return { signal, score, category };
}
function normalize(raw: string) {
  try {
    const u = new URL(raw);
    if (!['https:', 'http:'].includes(u.protocol)) return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/i.test(k)) u.searchParams.delete(k);
    return u.toString().slice(0, 1500);
  } catch { return null; }
}
export async function runSearch(city: string, mode: SearchMode, customQuery?: string) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error('BRAVE_SEARCH_API_KEY non configurée.');
  const cleanCity = city.slice(0, 90).trim() || 'Oise';
  const qs = customQuery?.trim() ? [customQuery.slice(0, 250)] : queries[mode](cleanCity);
  let found = 0, accepted = 0, updated = 0;
  const sql = db();
  for (const q of qs) {
    const p = new URLSearchParams({ q, count:'15', country:'FR', search_lang:'fr' });
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${p}`, {
      headers: {'X-Subscription-Token': key, Accept:'application/json'}, cache:'no-store', signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Recherche Brave indisponible (${response.status}).`);
    const data = await response.json() as {web?:{results?:Array<{title?:string;url?:string;description?:string}>}};
    for (const result of data.web?.results || []) {
      found++;
      const url = normalize(result.url || '');
      if (!url) continue;
      const name = (result.title || 'Prospect à vérifier').replace(/<[^>]*>/g,'').slice(0, 180);
      const evidence = (result.description || '').replace(/<[^>]*>/g,'').slice(0, 900);
      const { category, score, signal } = classify(name, evidence, mode);
      const row = await sql`INSERT INTO prospects(name, source_url, source_type, city, category, evidence, signal, score)
          VALUES(${name}, ${url}, ${mode}, ${cleanCity}, ${category}, ${evidence}, ${signal}, ${score})
          ON CONFLICT(source_url) DO NOTHING RETURNING id`;
      if (row.length) accepted++; else updated++;
    }
  }
  return { found, accepted, duplicates: updated, queries: qs };
}
