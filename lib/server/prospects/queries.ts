/**
 * Génération de requêtes de recherche variées (pas une liste figée) :
 * gabarits par stratégie × métiers × besoins × zones, échantillonnés à chaque exécution.
 */
import { NEEDS, SECTORS, type Strategy } from '@/lib/shared/constants';

export type QueryPlanInput = {
  strategy: Exclude<Strategy, 'manuel'>;
  zones: string[];
  sectors: string[];
  needs: string[];
  customQuery?: string;
  maxQueries: number;
};

const zoneTerm = (z: string) => (z === 'France entière' ? '' : z.includes(' ') || z.includes('-') ? `"${z}"` : z);

const EXPLICIT_TEMPLATES = [
  (need: string, zone: string) => `"recherche" "développeur" "${need}" ${zone}`,
  (need: string, zone: string) => `"cherche" "prestataire" "${need}" ${zone}`,
  (need: string, zone: string) => `"besoin d'un" "${need}" ${zone}`,
  (need: string, zone: string) => `"cherche quelqu'un" "${need}" ${zone}`,
  (need: string, zone: string) => `"recherche freelance" "${need}" ${zone}`,
  (need: string) => `site:codeur.com/projects "${need}"`,
  (need: string, zone: string) => `"demande de devis" "${need}" ${zone}`,
];
const EXPLICIT_SECTOR_TEMPLATES = [
  (sector: string, zone: string) => `"${sector}" "cherche" "site internet" ${zone}`,
  (sector: string, zone: string) => `"${sector}" "besoin d'un site" ${zone}`,
];
const SIGNAL_TEMPLATES = [
  (sector: string, zone: string) => `${sector} ${zone} site:pagesjaunes.fr/pros`,
  (sector: string, zone: string) => `${sector} ${zone} horaires téléphone`,
  (sector: string, zone: string) => `${sector} ${zone} site:facebook.com`,
  (sector: string, zone: string) => `${sector} indépendant ${zone} avis`,
];
const MARKET_TEMPLATES = [
  (need: string, zone: string) => `"appel d'offres" "${need}" ${zone}`,
  (need: string, zone: string) => `site:boamp.fr "${need}" ${zone}`,
  (need: string, zone: string) => `"consultation" "${need}" ${zone}`,
  (need: string, zone: string) => `"marché public" "${need}" ${zone}`,
  (need: string) => `site:marches-publics.gouv.fr "${need}"`,
];

function shuffle<T>(items: T[], random: () => number) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildQueries(input: QueryPlanInput, random: () => number = Math.random): string[] {
  if (input.customQuery?.trim()) {
    const base = input.customQuery.trim().slice(0, 250);
    const zones = input.zones.filter((z) => z !== 'France entière');
    if (!zones.length || zones.some((z) => base.toLowerCase().includes(z.toLowerCase()))) return [base];
    return zones.slice(0, input.maxQueries).map((z) => `${base} ${zoneTerm(z)}`.trim());
  }
  const zones = input.zones.length ? input.zones : ['Oise'];
  const sectorTerms = (input.sectors.length ? SECTORS.filter((s) => input.sectors.includes(s.key)) : SECTORS).flatMap((s) => s.terms.slice(0, 2));
  const needTerms = (input.needs.length ? NEEDS.filter((n) => input.needs.includes(n.key)) : NEEDS).flatMap((n) => n.terms.slice(0, 2));
  const candidates: string[] = [];
  for (const zone of zones) {
    const z = zoneTerm(zone);
    if (input.strategy === 'explicite') {
      for (const t of EXPLICIT_TEMPLATES) for (const need of needTerms) candidates.push(t(need, z));
      if (input.sectors.length) for (const t of EXPLICIT_SECTOR_TEMPLATES) for (const s of sectorTerms) candidates.push(t(s, z));
    } else if (input.strategy === 'signal') {
      for (const t of SIGNAL_TEMPLATES) for (const s of sectorTerms) candidates.push(t(s, z));
    } else {
      const marketNeeds = input.needs.length ? needTerms : ['site internet', 'application web', 'logiciel', 'plateforme numérique', 'ERP'];
      for (const t of MARKET_TEMPLATES) for (const need of marketNeeds) candidates.push(t(need, z));
    }
  }
  const unique = [...new Set(candidates.map((c) => c.replace(/\s+/g, ' ').trim()))];
  // Diversité : on alterne les gabarits/zones plutôt que de prendre les N premiers.
  return shuffle(unique, random).slice(0, Math.max(1, Math.min(20, input.maxQueries)));
}
