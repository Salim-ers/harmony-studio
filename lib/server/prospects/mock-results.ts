/**
 * Résultats SIMULÉS pour les tests locaux uniquement (HARMONY_MOCKS=1, hors Vercel).
 * Les URL pointent vers le domaine réservé « example.org » (RFC 2606) et chaque
 * titre est préfixé « [SIMULATION] » : ces fiches ne peuvent pas être confondues avec de vrais prospects.
 */
import type { RawResult } from './classify';

export function mockBraveResults(query: string): RawResult[] {
  const q = query.toLowerCase();
  const day = 24 * 3600 * 1000;
  const iso = (d: number) => new Date(Date.now() - d * day).toISOString();
  if (['pagesjaunes', 'boulang', 'pâtiss', 'horaires'].some((t) => q.includes(t))) {
    return [
      { title: '[SIMULATION] Boulangerie du Marché - Creil - PagesJaunes', url: 'https://example.org/simulation/pagesjaunes/boulangerie-du-marche', description: 'Boulangerie artisanale à Creil (60100). Horaires, téléphone : 03 44 00 00 00.', age: '', pageAge: '' },
      { title: '[SIMULATION] Les 10 meilleures boulangeries à Creil', url: 'https://example.org/simulation/top-10-boulangeries', description: 'Classement des meilleures boulangeries de Creil.', age: '' },
    ];
  }
  if (q.includes('appel') || q.includes('boamp') || q.includes('marché') || q.includes('consultation')) {
    return [
      { title: '[SIMULATION] Avis d’appel public : refonte du site internet de la commune', url: 'https://example.org/simulation/boamp/refonte-site-commune', description: 'Avis d’appel public à la concurrence — refonte du site internet communal, Oise. Date limite de remise des offres : 15/12/2026.', pageAge: iso(4) },
    ];
  }
  return [
    { title: '[SIMULATION] Cherche développeur pour création de site vitrine - Oise', url: 'https://example.org/simulation/annonce/site-vitrine-oise', description: 'Bonjour, je recherche un développeur freelance pour la création d’un site vitrine pour mon salon de coiffure à Creil. Budget 900 €.', pageAge: iso(3) },
    { title: '[SIMULATION] Agence web Oise — création de site internet à partir de 490 €', url: 'https://example.org/simulation/agence-web', description: 'Notre agence crée votre site internet. Devis gratuit.', age: '' },
    { title: '[SIMULATION] Offre d’emploi : développeur web CDI Creil', url: 'https://example.org/simulation/emploi-cdi', description: 'Nous recrutons un développeur web en CDI, temps plein.', pageAge: iso(2) },
  ];
}
