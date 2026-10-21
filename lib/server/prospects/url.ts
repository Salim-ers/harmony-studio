/** Normalisation d'URL, domaines et reconnaissance des plateformes sources. */

const TRACKING = /^(utm_|fbclid$|gclid$|msclkid$|mc_|igshid$|ref$|ref_src$|_hs|yclid$|spm$)/i;

export function canonicalUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (u.username || u.password) return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = '';
    for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    let path = u.pathname.replace(/\/{2,}/g, '/');
    if (path.length > 1) path = path.replace(/\/$/, '');
    u.pathname = path;
    u.protocol = 'https:';
    return u.toString().slice(0, 1500);
  } catch {
    return null;
  }
}

export function domainOf(raw: string) {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

type PlatformInfo = { name: string; type: 'annonces' | 'marches' | 'annuaire' | 'reseau' | 'emploi' | 'avis' | 'reservation' | 'registre' | 'freelance-profils' | 'web' };

const PLATFORMS: [RegExp, PlatformInfo][] = [
  [/(^|\.)codeur\.com$/, { name: 'Codeur.com', type: 'annonces' }],
  [/(^|\.)404works\.com$/, { name: '404works', type: 'annonces' }],
  [/(^|\.)freelance-info\.fr$/, { name: 'Freelance-info', type: 'annonces' }],
  [/(^|\.)leboncoin\.fr$/, { name: 'Leboncoin', type: 'annonces' }],
  [/(^|\.)boamp\.fr$/, { name: 'BOAMP', type: 'marches' }],
  [/(^|\.)marches-publics\.gouv\.fr$/, { name: 'PLACE (marches-publics.gouv.fr)', type: 'marches' }],
  [/(^|\.)francemarches\.com$/, { name: 'France Marchés', type: 'marches' }],
  [/(^|\.)marchesonline\.com$/, { name: 'Marchés Online', type: 'marches' }],
  [/(^|\.)achatpublic\.com$/, { name: 'Achatpublic', type: 'marches' }],
  [/(^|\.)e-marchespublics\.com$/, { name: 'e-marchespublics', type: 'marches' }],
  [/(^|\.)klekoon\.com$/, { name: 'Klekoon', type: 'marches' }],
  [/(^|\.)ted\.europa\.eu$/, { name: 'TED (UE)', type: 'marches' }],
  [/(^|\.)pagesjaunes\.fr$/, { name: 'PagesJaunes', type: 'annuaire' }],
  [/(^|\.)118712\.fr$/, { name: '118 712', type: 'annuaire' }],
  [/(^|\.)justacote\.com$/, { name: 'Justacoté', type: 'annuaire' }],
  [/(^|\.)cylex-france\.fr$/, { name: 'Cylex', type: 'annuaire' }],
  [/(^|\.)hoodspot\.fr$/, { name: 'Hoodspot', type: 'annuaire' }],
  [/(^|\.)mappy\.com$/, { name: 'Mappy', type: 'annuaire' }],
  [/(^|\.)societe\.com$/, { name: 'Societe.com', type: 'registre' }],
  [/(^|\.)pappers\.fr$/, { name: 'Pappers', type: 'registre' }],
  [/(^|\.)annuaire-entreprises\.data\.gouv\.fr$/, { name: 'Annuaire des entreprises', type: 'registre' }],
  [/(^|\.)infogreffe\.fr$/, { name: 'Infogreffe', type: 'registre' }],
  [/(^|\.)facebook\.com$/, { name: 'Facebook', type: 'reseau' }],
  [/(^|\.)instagram\.com$/, { name: 'Instagram', type: 'reseau' }],
  [/(^|\.)linkedin\.com$/, { name: 'LinkedIn', type: 'reseau' }],
  [/(^|\.)tripadvisor\.(fr|com)$/, { name: 'Tripadvisor', type: 'avis' }],
  [/(^|\.)thefork\.fr$|(^|\.)lafourchette\.com$/, { name: 'TheFork', type: 'reservation' }],
  [/(^|\.)planity\.com$/, { name: 'Planity', type: 'reservation' }],
  [/(^|\.)doctolib\.fr$/, { name: 'Doctolib', type: 'reservation' }],
  [/(^|\.)malt\.fr$/, { name: 'Malt', type: 'freelance-profils' }],
  [/(^|\.)comeup\.com$/, { name: 'ComeUp', type: 'freelance-profils' }],
  [/(^|\.)fiverr\.com$/, { name: 'Fiverr', type: 'freelance-profils' }],
  [/(^|\.)(indeed|hellowork|welcometothejungle|francetravail|pole-emploi|monster|apec|jobteaser|meteojob|regionsjob)\.(fr|com)$/, { name: 'Site d’emploi', type: 'emploi' }],
];

export function platformOf(raw: string): PlatformInfo {
  const host = domainOf(raw);
  for (const [re, info] of PLATFORMS) if (re.test(host)) return info;
  return { name: host || 'Web', type: 'web' };
}

/** Plateforme tierce (annuaire, réseau, place de marché…) : son domaine n'est PAS le site de l'entreprise. */
export function isThirdParty(raw: string) {
  return platformOf(raw).type !== 'web';
}

export function normalizeName(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(sarl|sas|sasu|eurl|sa|ei|eirl|scop|sci)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 80);
}
