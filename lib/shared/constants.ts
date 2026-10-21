/** Constantes partagées serveur / interface (aucun secret ici). */

export const PIPELINE = [
  'À examiner', 'Qualifié', 'À contacter', 'Contacté', 'Réponse reçue', 'Rendez-vous', 'Devis envoyé', 'Gagné', 'Perdu', 'À relancer',
] as const;
export type PipelineStatus = (typeof PIPELINE)[number];

export const STRATEGIES = {
  explicite: { label: 'Demande explicite', short: 'Demande', description: 'Annonce ou publication qui exprime réellement un besoin (site, refonte, logiciel, appel d’offres…).', tone: 'gold' },
  signal: { label: 'Signal d’opportunité', short: 'Signal', description: 'Entreprise identifiée dont la présence numérique semble perfectible. Hypothèse à valider : elle n’a rien demandé.', tone: 'blue' },
  marche: { label: 'Projet / marché', short: 'Marché', description: 'Appel d’offres, consultation ou besoin B2B (application, ERP, automatisation, espace client…).', tone: 'violet' },
  manuel: { label: 'Ajout manuel', short: 'Manuel', description: 'Fiche créée à la main.', tone: 'neutral' },
} as const;
export type Strategy = keyof typeof STRATEGIES;

export const ZONES = [
  'Rantigny', 'Creil', 'Nogent-sur-Oise', 'Clermont', 'Saint-Maximin', 'Oise', 'Hauts-de-France', 'Île-de-France', 'France entière',
] as const;

/** Villes (et zones) proches de Rantigny utilisées pour le critère de proximité du score. */
export const LOCAL_AREA = [
  'rantigny', 'liancourt', 'cauffry', 'laigneville', 'mogneville', 'creil', 'nogent-sur-oise', 'nogent sur oise', 'montataire',
  'villers-saint-paul', 'clermont', 'breuil-le-vert', 'brueil-le-vert', 'saint-maximin', 'chantilly', 'senlis', 'pont-sainte-maxence',
  'beauvais', 'compiègne', 'compiegne', 'oise', '(60)', ' 60 ',
];

export const SECTORS: { key: string; label: string; terms: string[] }[] = [
  { key: 'boulangerie', label: 'Boulangerie / pâtisserie', terms: ['boulangerie', 'pâtisserie', 'boulanger', 'pâtissier'] },
  { key: 'restaurant', label: 'Restaurant', terms: ['restaurant', 'pizzeria', 'brasserie', 'traiteur'] },
  { key: 'cafe', label: 'Café / bar', terms: ['café', 'bar', 'salon de thé', 'coffee shop'] },
  { key: 'barbier', label: 'Barbier / coiffure', terms: ['barbier', 'barber shop', 'salon de coiffure', 'coiffeur'] },
  { key: 'beaute', label: 'Institut / esthétique', terms: ['institut de beauté', 'esthéticienne', 'onglerie', 'spa'] },
  { key: 'auto-ecole', label: 'Auto-école', terms: ['auto-école', 'école de conduite'] },
  { key: 'garage', label: 'Garage / carrosserie', terms: ['garage automobile', 'carrosserie', 'mécanique auto'] },
  { key: 'nettoyage', label: 'Société de nettoyage', terms: ['société de nettoyage', 'entreprise de nettoyage', 'nettoyage professionnel'] },
  { key: 'batiment', label: 'Artisan du bâtiment', terms: ['plombier', 'électricien', 'maçon', 'menuisier', 'couvreur', 'peintre en bâtiment', 'chauffagiste'] },
  { key: 'pharmacie', label: 'Pharmacie', terms: ['pharmacie', 'parapharmacie'] },
  { key: 'liberal', label: 'Profession libérale', terms: ['cabinet', 'avocat', 'kinésithérapeute', 'ostéopathe', 'expert-comptable', 'architecte'] },
  { key: 'sport', label: 'Salle de sport', terms: ['salle de sport', 'coach sportif', 'fitness', 'crossfit'] },
  { key: 'hotel', label: 'Hôtel / hébergement', terms: ['hôtel', 'chambre d’hôtes', 'gîte'] },
  { key: 'industrie', label: 'PME industrielle', terms: ['PME industrielle', 'usine', 'atelier de fabrication', 'sous-traitance industrielle'] },
  { key: 'ecommerce', label: 'E-commerçant', terms: ['boutique en ligne', 'e-commerce', 'créateur artisanal'] },
  { key: 'association', label: 'Association', terms: ['association', 'club'] },
  { key: 'commerce', label: 'Commerce de proximité', terms: ['fleuriste', 'boucherie', 'épicerie fine', 'caviste', 'opticien'] },
];

export const NEEDS: { key: string; label: string; terms: string[] }[] = [
  { key: 'site', label: 'Création de site', terms: ['création de site internet', 'site web', 'site vitrine'] },
  { key: 'refonte', label: 'Refonte', terms: ['refonte de site', 'refaire mon site', 'moderniser site'] },
  { key: 'seo', label: 'SEO / visibilité', terms: ['référencement naturel', 'SEO', 'visibilité Google'] },
  { key: 'ecommerce', label: 'Boutique / commande', terms: ['boutique en ligne', 'commande en ligne', 'click and collect', 'paiement en ligne'] },
  { key: 'reservation', label: 'Réservation', terms: ['réservation en ligne', 'prise de rendez-vous en ligne'] },
  { key: 'application', label: 'Application web', terms: ['application web', 'application sur mesure', 'développement application'] },
  { key: 'erp', label: 'ERP / gestion', terms: ['ERP', 'logiciel de gestion', 'outil de gestion sur mesure', 'CRM'] },
  { key: 'automatisation', label: 'Automatisation', terms: ['automatisation', 'digitalisation des processus'] },
  { key: 'dashboard', label: 'Tableau de bord', terms: ['tableau de bord', 'dashboard', 'reporting'] },
];

export const DELIVERABLES = [
  { key: 'landing', label: 'Landing page', kind: 'static' },
  { key: 'vitrine', label: 'Site vitrine multi-pages', kind: 'static' },
  { key: 'vitrine-seo', label: 'Vitrine + SEO local', kind: 'static' },
  { key: 'catalogue', label: 'Catalogue / menu', kind: 'static' },
  { key: 'carte-visite', label: 'Carte de visite digitale', kind: 'static' },
  { key: 'reservation', label: 'Réservation', kind: 'app' },
  { key: 'commande', label: 'Vente / commande / paiement', kind: 'app' },
  { key: 'fidelite', label: 'Carte de fidélité digitale', kind: 'app' },
  { key: 'dashboard', label: 'Tableau de bord', kind: 'app' },
  { key: 'application', label: 'Application métier', kind: 'app' },
  { key: 'erp', label: 'ERP sur mesure', kind: 'app' },
  { key: 'libre', label: 'Projet libre', kind: 'static' },
] as const;
export type DeliverableKey = (typeof DELIVERABLES)[number]['key'];
export function deliverableKind(key: string): 'static' | 'app' {
  return DELIVERABLES.find((d) => d.key === key)?.kind ?? 'static';
}
export function deliverableLabel(key: string) {
  return DELIVERABLES.find((d) => d.key === key)?.label ?? key;
}

export const STYLES = [
  'Très premium', 'Minimaliste', 'Contemporain', 'Luxe', 'Chaleureux & artisanal', 'Industriel', 'Éditorial', 'Audacieux & immersif', 'Naturel & organique', 'Tech / SaaS',
];

export const PROJECT_STATUSES = [
  'Brouillon', 'Planification', 'Génération', 'Construction', 'Tests', 'À corriger', 'Prêt pour revue', 'Approuvé', 'Déployé', 'Échec',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ASSET_ROLES = { photo: 'Photo', logo: 'Logo', document: 'Document', charte: 'Charte graphique', capture: 'Capture / référence' } as const;

export const TASK_KINDS = { relance: 'Relance', appel: 'Appel', email: 'E-mail', 'rendez-vous': 'Rendez-vous', devis: 'Devis', autre: 'Autre' } as const;

export const QUOTE_STATUSES = { brouillon: 'Brouillon', 'envoyé': 'Envoyé', 'accepté': 'Accepté', 'refusé': 'Refusé', 'expiré': 'Expiré' } as const;

export const MATRIX_KINDS = {
  design: 'Matrice Design',
  technique: 'Matrice Technique / Fonctionnalités',
  seo: 'Matrice SEO & Contenu',
  audit: 'Matrice Audit Final',
} as const;
export type MatrixKind = keyof typeof MATRIX_KINDS;
