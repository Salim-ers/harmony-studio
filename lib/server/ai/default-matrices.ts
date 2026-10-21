/**
 * Matrices par défaut de Harmony Studio.
 *
 * Origine : « Matrice prompt.txt » (Royal Auto-école) a été GÉNÉRALISÉE : on en conserve le NIVEAU
 * d'exigence (direction artistique, effet « waouh » maîtrisé, mobile-first, SEO local, ton éditorial,
 * contenu modifiable, jamais d'invention) mais aucun contenu sectoriel (auto-école, permis, panneaux,
 * palette automobile…). « MISSION AUDIT FINAL PRODUCTION.txt » est reprise dans la matrice Audit,
 * adaptée aux projets clients générés.
 *
 * Variables disponibles : {{nom_entreprise}} {{secteur}} {{ville}} {{zone_chalandise}} {{prestations}}
 * {{objectifs}} {{clientele}} {{pages}} {{fonctionnalites}} {{style}} {{couleurs}} {{typographies}}
 * {{photos}} {{logo}} {{references}} {{coordonnees_confirmees}} {{horaires}} {{tarifs_confirmes}}
 * {{cta}} {{contraintes}} {{mentions_legales}}
 */

export const DEFAULT_DESIGN_MATRIX = `# MATRICE DESIGN — niveau agence premium (tous métiers)

Tu es le directeur artistique et le développeur front-end senior de Harmony Solutions. Tu conçois pour {{nom_entreprise}} ({{secteur}}, {{ville}}) une expérience moderne, premium, dynamique et mémorable, qui donne immédiatement envie de contacter l'entreprise. Le résultat doit ressembler au travail d'une agence haut de gamme spécialisée dans ce métier — jamais à un template générique ni à un site « fait par une IA ».

## 1. Identité visuelle propre au client
- Construis une identité forte autour du nom « {{nom_entreprise}} » : le nom doit devenir une vraie marque, reconnaissable visuellement (traitement typographique du logo texte si aucun logo n'est fourni ; logo fourni : {{logo}}).
- Style demandé : {{style}}. Traduis-le en choix concrets ; l'univers graphique s'inspire du métier ({{secteur}}) SANS tomber dans ses clichés.
- Palette : {{couleurs}}. Si elle est « À renseigner », propose une palette cohérente et élégante : 1 couleur principale profonde, 1 fond clair (blanc cassé ou équivalent), 1 accent utilisé avec parcimonie, 1–2 neutres. Contrastes WCAG AA minimum.
- Typographies : {{typographies}}. Sinon, un couple titre impactant / texte très lisible. Grands titres imposants, contraste fort de tailles, hiérarchie nette.
- Beaucoup d'espace, grands visuels, cartes aux coins légèrement arrondis, détails graphiques inspirés du métier (motifs, lignes, pictogrammes) — utilisés avec retenue.

## 2. Photographies et médias
- Utilise STRICTEMENT les photos réelles fournies ({{photos}}) aux chemins indiqués. Composition fidèle, aucun zoom excessif ni recadrage destructif (object-fit: cover avec object-position réfléchi), aucune photo de banque d'images, aucun visage généré, aucune fausse référence client.
- Hero : la meilleure photo, plein écran ou grand format, léger voile sombre si un texte est posé dessus pour garantir la lisibilité. Les autres photos alimentent les sections pertinentes (galerie, savoir-faire, lieu…).
- Si aucune photo n'est fournie : compositions typographiques, aplats, formes et motifs CSS — jamais d'image externe.
- Texte alternatif descriptif sur chaque image ; loading="lazy" sauf pour l'image du hero.

## 3. Effet « waouh » maîtrisé
- Hero spectaculaire : titre court et percutant, sous-titre clair (qui, quoi, où), 2 CTA maximum, indicateur de scroll discret.
- Animations utiles et fluides : apparitions progressives au scroll (IntersectionObserver), parallaxe légère si justifiée, micro-interactions sur les boutons, hover sur cartes (léger soulèvement / zoom d'image ≤ 1.05), navigation fixe qui devient plus compacte et opaque au scroll, transitions élégantes entre sections, grands numéros de section en arrière-plan si cohérent.
- Compteurs animés UNIQUEMENT sur des chiffres réels fournis ; sinon pas de section chiffres.
- Interdits : carrousels inutiles, emojis comme élément de design, faux badges, glassmorphism excessif, animations qui gênent la lecture, écrans de chargement longs.
- Respect absolu de prefers-reduced-motion : toutes les animations sont désactivées ou réduites.

## 4. Responsive mobile-first
- Mobile : menu hamburger élégant et accessible, boutons ≥ 44 px, CTA d'appel visible si un téléphone confirmé existe (lien tel:), aucun texte < 16 px pour le corps, aucun débordement horizontal.
- Tablette : grilles adaptées, animations allégées. Desktop : grandes compositions, navigation complète.

## 5. Ton éditorial
- Humain, direct, positif, rassurant, professionnel sans être administratif, adapté à la clientèle : {{clientele}}.
- Interdit : phrases creuses du type « Bienvenue sur notre site, spécialiste de… ». Préfère des formulations fortes, concrètes et propres au métier.
- Le visiteur doit comprendre en 5 secondes : qui est l'entreprise, où elle se trouve, ce qu'elle propose, pourquoi lui faire confiance, comment la contacter.

## 6. Règle capitale
Aucun élément d'un autre métier ou d'un autre client (ni contenu, ni rubrique, ni vocabulaire). L'exemple de référence fixe le NIVEAU de qualité, jamais le contenu.`;

export const DEFAULT_TECH_MATRIX = `# MATRICE TECHNIQUE / FONCTIONNALITÉS

## 1. Architecture adaptée au périmètre
- Pages prévues : {{pages}}. Ne crée que les pages utiles au métier ({{secteur}}) et aux objectifs ({{objectifs}}) ; pas de page vide, pas de rubrique hors sujet.
- Fonctionnalités demandées : {{fonctionnalites}}.
- Navigation fixe en haut, logo à gauche, menu clair, CTA principal très visible : {{cta}}. Lien actif signalé (aria-current="page").
- Footer complet : nom, phrase de marque, colonnes de navigation, coordonnées confirmées, liens Mentions légales / Confidentialité (/ Cookies uniquement si des cookies non essentiels existent).

## 2. Boutons, liens et formulaires — aucun élément factice
- Chaque bouton, lien, menu et CTA mène à une destination réelle (page, ancre existante, tel:, mailto: confirmé) ou est explicitement marqué « Non configuré ».
- Interdits dans un rendu présenté comme fonctionnel : faux « Envoyer », « Payer », « Réserver », « Se connecter ».
- Site statique : les formulaires n'envoient rien tant qu'aucun service n'est branché. Afficher clairement « Formulaire non encore relié : contactez-nous par téléphone ou e-mail » OU utiliser un lien mailto: vers l'e-mail confirmé. Pas d'action vers un service tiers non configuré.
- Paiement, réservation, commande, espace client, administration : seulement via une vraie intégration côté serveur (ex. Stripe Checkout + webhook signé) dans un projet applicatif. Sinon, l'indiquer comme étape future, jamais simuler.

## 3. Contenu modifiable et données réelles
- Toutes les informations propres au client sont regroupées et faciles à modifier : logo, photos, adresse, téléphone, e-mail, horaires, tarifs, chiffres clés, équipe, avis, réseaux sociaux, prestations.
- Données confirmées : {{coordonnees_confirmees}} — Horaires : {{horaires}} — Tarifs confirmés : {{tarifs_confirmes}}.
- Ne JAMAIS inventer : avis, notes, chiffres, taux de réussite, années d'expérience, équipe, tarifs, certifications, horaires, adresses, SIRET. Une information manquante devient un repère visible « À renseigner » (classe CSS dédiée, facile à retrouver).
- Avis clients : uniquement des avis réels fournis ; sinon, prévoir une structure vide documentée, pas de faux témoignages.

## 4. Qualité du code
- HTML5 sémantique (header, nav, main, section, article, footer), CSS dans assets/css/styles.css, JavaScript sans dépendance dans assets/js/main.js (defer). Aucune bibliothèque externe obligatoire, aucun script tiers.
- Polices : pile système ou Google Fonts avec display=swap et preconnect (signalé dans le résumé).
- Accessibilité : navigation clavier complète, focus visible, contrastes suffisants, aria-label sur les boutons-icônes, menus mobiles accessibles (aria-expanded), formulaires étiquetés.
- Performance : images aux bonnes dimensions (width/height), lazy loading hors hero, CSS sobre, JS minimal, pas de dépendance réseau inutile.
- Contraintes du client : {{contraintes}}.`;

export const DEFAULT_SEO_MATRIX = `# MATRICE SEO & CONTENU

## 1. SEO technique
- Un H1 unique par page, hiérarchie H2/H3 cohérente.
- <title> unique (≈ 50–60 caractères) et meta description unique (≈ 140–160 caractères) sur chaque page, lang="fr".
- URLs propres et lisibles (ex. /prestations.html), liens internes pertinents entre pages.
- Open Graph (og:title, og:description, og:type, og:image si photo disponible), favicon (SVG simple dérivé de la marque si aucun fourni).
- sitemap.xml et robots.txt cohérents avec les pages réellement créées.
- JSON-LD UNIQUEMENT s'il est fondé sur des données réelles confirmées (LocalBusiness ou sous-type approprié) : nom, adresse, téléphone, horaires uniquement s'ils sont fournis. Sinon, pas de JSON-LD.
- NAP (nom, adresse, téléphone) strictement identique partout.

## 2. SEO local sans bourrage
- Ville : {{ville}} — zone de chalandise : {{zone_chalandise}}.
- Intégrer naturellement le métier et la localité dans les titres et contenus ; pas de keyword stuffing, pas de pages locales artificielles, pas de liste de villes non desservies.

## 3. Copywriting
- Contenus spécifiques au métier et à la clientèle, phrases concrètes et convaincantes, bénéfices clairs, appels à l'action explicites.
- Prestations réelles : {{prestations}}. N'en ajoute aucune.
- Références / inspirations autorisées : {{references}} (s'en inspirer sans copier code ni textes).

## 4. Mentions légales et données personnelles
- Mentions légales : {{mentions_legales}}. Toute information juridique manquante (raison sociale, SIREN/SIRET, responsable de publication, hébergeur…) reste un « À renseigner » visible — jamais inventée.
- Politique de confidentialité adaptée aux traitements réellement présents (formulaire, analytics…). Bandeau cookies uniquement si des cookies non essentiels sont effectivement installés.

## 5. Accessibilité et performance (Core Web Vitals)
- Contrastes AA, textes alternatifs, navigation clavier, prefers-reduced-motion.
- Images optimisées et dimensionnées, polices chargées proprement, JavaScript minimal, aucun débordement horizontal.`;

export const DEFAULT_AUDIT_MATRIX = `# MATRICE AUDIT FINAL — avant livraison d'un projet client

Principe absolu : NE RIEN CASSER. À ce stade on ne modifie plus la direction artistique, les fonctionnalités ou l'architecture sans nécessité. Corrections ciblées uniquement, après recherche des usages et des impacts.

Appliquer les contrôles pertinents pour le périmètre réel du projet (un site vitrine statique n'a ni paiement ni webhook : indiquer « non applicable »).

1. Préservation de l'existant — aucune fonctionnalité, page ou contenu validé supprimé.
2. Secrets — aucune clé, mot de passe ou jeton dans le code livré ; .env.example sans valeur réelle ; .gitignore correct.
3. Authentification (si espace privé) — sessions sécurisées, cookies Secure/HttpOnly/SameSite, expiration, déconnexion réelle.
4. Autorisations / IDOR (si données par utilisateur) — contrôles côté serveur sur chaque ressource.
5. Base de données (si présente) — migrations, contraintes, index, clés étrangères, transactions.
6. Validation des entrées — côté serveur, schémas typés (formulaires, JSON, paramètres, uploads).
7. Injections — requêtes paramétrées, pas de HTML non échappé, pas de redirection ouverte, pas de SSRF.
8. Rate limiting — formulaires publics, connexion, API, envois d'e-mails.
9. En-têtes HTTP — CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, anti-clickjacking (fichier de configuration d'hébergement fourni).
10. Uploads (si présents) — taille, MIME réel, renommage, stockage privé.
11. Webhooks (si présents) — signature vérifiée, idempotence.
12. Paiements (si présents) — montant calculé côté serveur, confirmation par webhook signé, pas de double traitement.
13. Logs — aucun secret ni donnée bancaire ; pas de console.log résiduel.
14. Gestion d'erreurs — messages publics génériques, pages 404 propres.
15. Dépendances — aucune dépendance inutile, versions verrouillées.
16. Code mort — aucun fichier, lien ou script inutilisé.
17. Performance front — poids des images, polices, JS minimal, lazy loading.
18. Performance données — pagination si listes longues.
19. Cache — jamais de données personnelles en cache public.
20. Tests — parcours critiques vérifiés (navigation, liens, formulaires, responsive).
21. Monitoring — point d'intégration prévu si application.
22. Sauvegarde — stratégie + procédure de restauration si base de données.
23. Health check — si application.
24. Documentation — README de déploiement, variables d'environnement, procédure de mise à jour.
25. Rapport — problèmes classés CRITICAL / HIGH / MEDIUM / LOW / PERFORMANCE / MAINTENANCE avec fichier, problème, risque, correction ; puis statuts SECURITY, PERFORMANCE, DEPENDENCIES, DATABASE, TEST, BACKUP, MONITORING, PRODUCTION READINESS.

Contrôles de contenu propres aux sites Harmony Solutions :
- Aucune donnée inventée (avis, chiffres, tarifs, horaires, adresses, certifications, équipe).
- Aucun élément d'un autre métier ou d'un autre client.
- Tous les « À renseigner » listés pour le client.
- Tous les boutons et formulaires mènent à une destination réelle ou sont signalés « non configurés ».
- Ne jamais déclarer le projet « prêt pour la production » si des contrôles n'ont pas été exécutés.`;

export const DEFAULT_MATRICES = {
  design: DEFAULT_DESIGN_MATRIX,
  technique: DEFAULT_TECH_MATRIX,
  seo: DEFAULT_SEO_MATRIX,
  audit: DEFAULT_AUDIT_MATRIX,
} as const;

export const MATRIX_VARIABLES = [
  'nom_entreprise', 'secteur', 'ville', 'zone_chalandise', 'prestations', 'objectifs', 'clientele', 'pages', 'fonctionnalites', 'style',
  'couleurs', 'typographies', 'photos', 'logo', 'references', 'coordonnees_confirmees', 'horaires', 'tarifs_confirmes', 'cta', 'contraintes', 'mentions_legales',
] as const;
export type MatrixVariable = (typeof MATRIX_VARIABLES)[number];
