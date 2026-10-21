/**
 * Classification d'un résultat de recherche : demande explicite, signal d'opportunité,
 * projet/marché ou rejet (faux positif). Toutes les décisions sont expliquées.
 * Aucune donnée n'est inventée : ce qui n'est pas trouvé reste « inconnu ».
 */
import type { Strategy } from '@/lib/shared/constants';
import { LOCAL_AREA, NEEDS, SECTORS } from '@/lib/shared/constants';
import { platformOf } from './url';

export type RawResult = {
  title: string;
  url: string;
  description: string;
  extraSnippets?: string[];
  age?: string;
  pageAge?: string;
};

export type Classified =
  | { rejected: true; reason: string }
  | {
      rejected: false;
      strategy: Exclude<Strategy, 'manuel'>;
      name: string;
      activity: string;
      needType: string;
      needStatus: 'confirmé' | 'supposé' | 'inconnu';
      confidence: 'élevée' | 'moyenne' | 'faible';
      confidenceReason: string;
      evidence: string;
      quote: string;
      platform: string;
      platformType: string;
      publishedAt: Date | null;
      publishedLabel: string;
      budgetText: string;
      deadline: string | null;
      urgent: boolean;
      locationMatch: string;
      contacts: { type: 'téléphone' | 'email'; value: string }[];
      signalLabel: string;
    };

export function cleanText(html: string) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const REQUEST_RE = /\b(je|nous|on)?\s*(recherch|cherch)(e|ons|ent|ez)?\s+(un|une|des|d['’]un|d['’]une|quelqu['’]un|une personne)?\s*(d[ée]veloppeu(r|se)s?|prestataires?|freelances?|webmasters?|webdesigners?|int[ée]grat(eur|rice)s?|agences?|personnes?|quelqu['’]un|indépendants?|graphistes?)/i;
const NEED_RE = /\b(besoin|souhaite|souhaitons|voudrais|aimerais|aimerions|projet de|demande de devis|recherche de prestataire)\b[^.]{0,80}\b(site|application|appli|logiciel|plateforme|boutique|e-?commerce|refonte|erp|crm|r[ée]f[ée]rencement|seo|intranet|extranet|tableau de bord)/i;
const TENDER_RE = /\b(appel d['’]offres?|avis d['’]appel public|march[ée] public|march[ée] [àa] proc[ée]dure adapt[ée]e|\bmapa\b|consultation (pour|relative|portant)|dossier de consultation|\bdce\b|avis de march[ée])/i;
const AGENCY_RE = /\b(notre agence|nous (cr[ée]ons|r[ée]alisons|concevons|accompagnons|d[ée]veloppons)|agence (web|digitale|de communication|seo)|devis gratuit|à partir de \d+\s?€|offre sp[ée]ciale|tarifs? (de )?cr[ée]ation|nos r[ée]alisations|formation (d[ée]veloppeur|web)|tutoriel|comment cr[ée]er (un|son) site|guide (complet|pratique)|prix d['’]un site)/i;
const SELF_FREELANCE_RE = /\b(je suis (un |une )?(d[ée]veloppeu|freelance|webdesign)|disponible pour (vos|de nouveaux) projets|mon portfolio)\b/i;
const JOB_RE = /\b(cdi|cdd|alternance|stage|stagiaire|offre d['’]emploi|nous recrutons|on recrute|recrute (un|une)|salaire|temps plein|candidature)\b/i;
const LIST_RE = /\b(les \d+ meilleur|top \d+|meilleur(e)?s .{0,40} (à|a|de|dans)\s|liste des|annuaire des|classement des)/i;
const URGENT_RE = /\b(urgent|rapidement|au plus vite|d[èe]s que possible|asap|sous \d+ (jours|semaines))\b/i;
const BUDGET_RE = /(budget[^.\d]{0,30})?(\d{1,3}(?:[\s.  ]?\d{3})*(?:,\d{2})?)\s?(?:€|euros?|k€)/i;
const DEADLINE_RE = /(date limite[^.\d]{0,40}|avant le|jusqu['’]au|remise des offres[^.\d]{0,30})\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i;
const PHONE_RE = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const MONTHS: Record<string, number> = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11, janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11 };

/** Interprète `page_age` (ISO) ou `age` (« 3 days ago », « March 12, 2025 », « il y a 2 jours »). */
export function parsePublished(pageAge?: string, age?: string, now = new Date()): { date: Date | null; label: string } {
  if (pageAge) {
    const d = new Date(pageAge);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= now.getTime() + 86400000) return { date: d, label: age || d.toLocaleDateString('fr-FR') };
  }
  if (!age) return { date: null, label: '' };
  const a = age.toLowerCase();
  const rel = a.match(/(\d+)\s*(minute|hour|day|week|month|year|heure|jour|semaine|mois|an)s?/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const ms = { minute: 6e4, hour: 3.6e6, heure: 3.6e6, day: 8.64e7, jour: 8.64e7, week: 6.048e8, semaine: 6.048e8, month: 2.628e9, mois: 2.628e9, year: 3.154e10, an: 3.154e10 }[unit] ?? 0;
    return { date: new Date(now.getTime() - n * ms), label: age };
  }
  const abs = a.match(/([a-zéû]+)\s+(\d{1,2}),?\s+(\d{4})/) || a.match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/);
  if (abs) {
    const [monthName, day] = /^\d/.test(abs[1]) ? [abs[2], abs[1]] : [abs[1], abs[2]];
    const m = MONTHS[monthName];
    if (m !== undefined) return { date: new Date(Date.UTC(Number(abs[3]), m, Number(day))), label: age };
  }
  return { date: null, label: age };
}

export function extractName(title: string, url: string) {
  const parts = cleanText(title).split(/\s+[|–—-]\s+/);
  let name = (parts[0] || '').trim();
  const platform = platformOf(url);
  if (platform.type === 'web' && parts.length > 1 && name.length < 4) name = parts[1];
  name = name.replace(/\s*[-–|]\s*(PagesJaunes|Facebook|Instagram|LinkedIn|Tripadvisor|Codeur\.com|Societe\.com|Pappers)$/i, '').trim();
  return (name || 'Nom à confirmer').slice(0, 180);
}

function matchFrom<T extends { key: string; label: string; terms: string[] }>(list: T[], text: string) {
  const lower = text.toLowerCase();
  return list.find((item) => item.terms.some((t) => lower.includes(t.toLowerCase())) || lower.includes(item.label.toLowerCase()));
}

export function detectNeed(text: string) {
  const lower = text.toLowerCase();
  if (/\berp\b|logiciel de gestion|gestion commerciale|\bcrm\b|gestion des stocks/.test(lower)) return 'ERP / logiciel de gestion';
  if (/application (web|mobile|métier|sur mesure)|\bappli\b|plateforme/.test(lower)) return 'Application / plateforme';
  if (/tableau de bord|dashboard|reporting/.test(lower)) return 'Tableau de bord';
  if (/automatis/.test(lower)) return 'Automatisation';
  if (/e-?commerce|boutique en ligne|vente en ligne|click (and|&) collect|commande en ligne|paiement en ligne/.test(lower)) return 'Boutique / commande en ligne';
  if (/r[ée]servation|prise de rendez-vous/.test(lower)) return 'Réservation en ligne';
  if (/refonte|refaire|moderniser/.test(lower)) return 'Refonte de site';
  if (/r[ée]f[ée]rencement|\bseo\b|visibilit[ée]/.test(lower)) return 'SEO / visibilité';
  if (/site/.test(lower)) return 'Site internet';
  const need = matchFrom(NEEDS, text);
  return need?.label ?? '';
}

export function detectLocation(text: string, zones: string[]) {
  const lower = ` ${text.toLowerCase()} `;
  for (const z of zones) {
    const zl = z.toLowerCase();
    if (zl && zl !== 'france entière' && lower.includes(zl)) return z;
  }
  for (const z of LOCAL_AREA) if (lower.includes(z)) return z.replace(/[()]/g, '').trim();
  return '';
}

export function classify(result: RawResult, requested: Exclude<Strategy, 'manuel'>, zones: string[], now = new Date()): Classified {
  const title = cleanText(result.title || '');
  const description = cleanText(result.description || '');
  const extras = (result.extraSnippets ?? []).map(cleanText).join(' ');
  const text = `${title}. ${description} ${extras}`;
  const platform = platformOf(result.url);

  if (platform.type === 'emploi' || (JOB_RE.test(text) && !/freelance|mission|prestataire/i.test(text)))
    return { rejected: true, reason: 'Offre d’emploi salarié (hors cible prestataire).' };
  if (platform.type === 'freelance-profils' || SELF_FREELANCE_RE.test(text))
    return { rejected: true, reason: 'Profil ou offre d’un autre prestataire, pas un client.' };
  const isTender = TENDER_RE.test(text) || platform.type === 'marches';
  const isRequest = REQUEST_RE.test(text) || NEED_RE.test(text);
  if (AGENCY_RE.test(text) && !isRequest && !isTender)
    return { rejected: true, reason: 'Page promotionnelle d’agence ou contenu éditorial (faux positif).' };
  if (LIST_RE.test(title) && !isRequest && !isTender)
    return { rejected: true, reason: 'Page de classement ou de liste : aucune entreprise identifiée.' };

  let strategy: Exclude<Strategy, 'manuel'>;
  if (isTender) strategy = 'marche';
  else if (isRequest) strategy = requested === 'marche' ? 'marche' : 'explicite';
  else if (requested === 'signal') strategy = 'signal';
  else return { rejected: true, reason: 'Aucune formulation de besoin détectée dans l’extrait.' };

  const { date, label } = parsePublished(result.pageAge, result.age, now);
  const needType = detectNeed(text) || (strategy === 'signal' ? 'Présence en ligne à évaluer' : 'À préciser');
  const sector = matchFrom(SECTORS, text);
  const quoteMatch = (text.match(REQUEST_RE) || text.match(NEED_RE) || text.match(TENDER_RE))?.index;
  const quote = quoteMatch !== undefined ? text.slice(Math.max(0, quoteMatch - 60), quoteMatch + 200).trim() : '';
  const budget = text.match(BUDGET_RE);
  const deadlineM = text.match(DEADLINE_RE);
  let deadline: string | null = null;
  if (deadlineM) {
    const y = deadlineM[4].length === 2 ? 2000 + Number(deadlineM[4]) : Number(deadlineM[4]);
    const d = new Date(Date.UTC(y, Number(deadlineM[3]) - 1, Number(deadlineM[2])));
    if (!Number.isNaN(d.getTime())) deadline = d.toISOString().slice(0, 10);
  }
  const contacts: { type: 'téléphone' | 'email'; value: string }[] = [];
  for (const p of new Set(text.match(PHONE_RE) ?? [])) contacts.push({ type: 'téléphone', value: p.replace(/[\s.-]/g, ' ').trim() });
  for (const e of new Set(text.match(EMAIL_RE) ?? [])) if (!/example|exemple|sentry|wixpress/i.test(e)) contacts.push({ type: 'email', value: e.toLowerCase() });

  const ageDays = date ? (now.getTime() - date.getTime()) / 8.64e7 : null;
  let confidence: 'élevée' | 'moyenne' | 'faible' = 'faible';
  let confidenceReason = '';
  let needStatus: 'confirmé' | 'supposé' | 'inconnu' = 'supposé';
  if (strategy === 'signal') {
    confidenceReason = 'Entreprise identifiée, aucun besoin exprimé : hypothèse commerciale à valider.';
  } else {
    needStatus = 'confirmé';
    const known = platform.type === 'annonces' || platform.type === 'marches';
    if (known && ageDays !== null && ageDays <= 90) {
      confidence = 'élevée';
      confidenceReason = `Besoin formulé dans la source (${platform.name}), publication datée de moins de 90 jours.`;
    } else if (known || (ageDays !== null && ageDays <= 180)) {
      confidence = 'moyenne';
      confidenceReason = known ? `Besoin formulé sur ${platform.name}, date de publication inconnue ou ancienne.` : 'Besoin formulé dans l’extrait, source non spécialisée : à relire.';
    } else {
      confidence = 'faible';
      confidenceReason = 'Formulation de besoin détectée automatiquement dans un extrait non daté : à confirmer en lisant la source.';
    }
  }

  return {
    rejected: false,
    strategy,
    name: extractName(title, result.url),
    activity: sector?.label ?? '',
    needType,
    needStatus,
    confidence,
    confidenceReason,
    evidence: (description || extras).slice(0, 900),
    quote: quote.slice(0, 300),
    platform: platform.name,
    platformType: platform.type,
    publishedAt: date,
    publishedLabel: label,
    budgetText: budget ? budget[0].trim().slice(0, 80) : '',
    deadline,
    urgent: URGENT_RE.test(text),
    locationMatch: detectLocation(text, zones),
    contacts: contacts.slice(0, 6),
    signalLabel: strategy === 'explicite' ? 'Demande explicite' : strategy === 'marche' ? 'Projet / marché' : 'Signal d’opportunité (hypothèse)',
  };
}
