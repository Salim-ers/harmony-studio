/**
 * Score commercial EXPLICABLE (0–100). Ce n'est pas une probabilité d'achat :
 * c'est un indicateur de priorisation, chaque point est justifié.
 */
export type ScoreInput = {
  strategy: 'explicite' | 'signal' | 'marche' | 'manuel';
  confidence: 'élevée' | 'moyenne' | 'faible';
  publishedAt: Date | null;
  needType: string;
  locationMatch: string;
  urgent: boolean;
  budgetText: string;
  hasQuote: boolean;
  platformType: string;
  deadline: string | null;
  websiteKnown?: boolean | null;
};
export type ScoreDetail = { label: string; points: number };

const SERVICE_FIT: [RegExp, number, string][] = [
  [/site|refonte|seo|visibilit|vitrine/i, 12, 'Correspond à l’offre sites vitrines / SEO'],
  [/boutique|commande|réservation|reservation/i, 12, 'Correspond à l’offre commande / réservation'],
  [/erp|logiciel|application|plateforme|tableau de bord|automatisation/i, 14, 'Correspond à l’offre outils métiers / ERP'],
];

export function computeScore(input: ScoreInput, now = new Date()): { score: number; details: ScoreDetail[]; stale: boolean } {
  const details: ScoreDetail[] = [];
  const add = (label: string, points: number) => { if (points) details.push({ label, points }); };

  if (input.strategy === 'explicite') add('Besoin exprimé explicitement dans la source', 30);
  else if (input.strategy === 'marche') add('Projet / consultation identifié', 26);
  else if (input.strategy === 'signal') add('Signal d’opportunité (hypothèse non confirmée)', 8);
  else add('Fiche ajoutée manuellement', 10);

  if (input.strategy !== 'signal') add(`Confiance ${input.confidence} sur le besoin`, input.confidence === 'élevée' ? 10 : input.confidence === 'moyenne' ? 5 : 0);

  let stale = false;
  if (input.publishedAt) {
    const days = (now.getTime() - input.publishedAt.getTime()) / 8.64e7;
    if (days <= 7) add('Publication très récente (≤ 7 jours)', 18);
    else if (days <= 30) add('Publication récente (≤ 30 jours)', 12);
    else if (days <= 90) add('Publication de moins de 3 mois', 6);
    else if (days > 365) { add('Publication de plus d’un an (probablement obsolète)', -18); stale = true; }
    else if (days > 180) { add('Publication de plus de 6 mois', -8); stale = true; }
  } else if (input.strategy !== 'signal') add('Date de publication inconnue', -4);

  const fit = SERVICE_FIT.find(([re]) => re.test(input.needType));
  if (fit) add(fit[2], fit[1]);
  if (input.locationMatch) add(`Proximité géographique (${input.locationMatch})`, 10);
  if (input.urgent) add('Urgence mentionnée', 5);
  if (input.budgetText) add('Budget public mentionné', 5);
  if (input.deadline) {
    const left = (new Date(input.deadline).getTime() - now.getTime()) / 8.64e7;
    if (left < 0) { add('Échéance dépassée', -25); stale = true; }
    else if (left <= 21) add('Échéance proche (≤ 3 semaines)', 4);
  }
  let proof = 0;
  if (input.hasQuote) proof += 4;
  if (input.publishedAt) proof += 2;
  if (input.platformType === 'annonces' || input.platformType === 'marches') proof += 4;
  add('Qualité de la preuve (citation, date, plateforme)', proof);
  if (input.strategy === 'signal' && input.websiteKnown === false) add('Aucun site propre trouvé (recherche limitée)', 8);

  const raw = details.reduce((s, d) => s + d.points, 0);
  return { score: Math.max(0, Math.min(100, Math.round(raw))), details, stale };
}
