# Harmony Studio — Harmony Solutions

Application Next.js privée, déployable sur Vercel, comprenant **prospection commerciale** et **création de sites par Claude**. Interface intégralement en français.

## Fonctions de cette V1

- Accès propriétaire unique : aucun formulaire d'inscription, vérification d'un mot de passe haché scrypt, cookie signé HttpOnly et limitation des essais de connexion en base.
- Prospection via **Brave Search API** : demandes de site, commerces, logiciels/ERP, recherche libre, zone géographique, déduplication, scoring indicatif et lien vers la source.
- Fiches prospect : statut, notes, historique de création, filtres, ajout manuel, export CSV et brouillon de message à personnaliser (aucun envoi automatique).
- Veille quotidienne configurable (Vercel Cron, désactivée par défaut).
- Studio IA : nom, prestation, direction artistique, brief, jusqu'à 6 photos, matrice éditable, génération Claude, amélioration d'une version existante et sauvegarde Neon.
- Prévisualisation HTML en iframe isolée et export d'un fichier HTML autonome.
- Bibliothèque des projets sauvegardés.

## Installation

**Prérequis** : Node.js 20+, un projet Vercel **Pro** pour un usage professionnel, une base Neon Postgres, un store Vercel Blob **public**, clés API Brave et Anthropic. La formule gratuite Vercel Hobby est réservée à un usage personnel et non commercial. La génération Claude peut nécessiter jusqu’à 120 secondes, également plus adaptée aux limites Pro.

1. Importer ce dossier dans un dépôt GitHub privé, puis créer un projet sur Vercel depuis ce dépôt. (Ou en local : `npm install && npm run dev`.)
2. Dans [Neon](https://console.neon.tech), créer une base, puis exécuter la totalité de `scripts/schema.sql` dans **SQL Editor**.
3. Copier `.env.example` en `.env.local` pour le local. Sur Vercel, configurer les mêmes variables dans **Settings → Environment Variables**.
4. Exécuter `npm run hash-password` pour obtenir `ADMIN_PASSWORD_HASH`. Générer séparément des secrets forts pour `SESSION_SECRET` (32 caractères minimum) et `CRON_SECRET` : `openssl rand -hex 32`. **Ne jamais stocker le mot de passe en clair, ni publier `.env.local`.**
5. Dans Vercel, créer/attacher **Storage → Blob** au projet et vérifier la variable `BLOB_READ_WRITE_TOKEN`.
6. Créer les clés `BRAVE_SEARCH_API_KEY` (Brave Search) et `ANTHROPIC_API_KEY` (Anthropic Console), puis les renseigner côté serveur. La variable `ANTHROPIC_MODEL` permet de changer de modèle s'il existe une version plus récente accessible.
7. Lancer `npm install`, `npm run typecheck`, `npm run build` et déployer sur Vercel. Le premier accès est la page de connexion avec `ADMIN_EMAIL` et le mot de passe choisi.
8. Dans **Paramètres**, désactiver ou activer la veille quotidienne, définir la zone et enregistrer.
9. Coller ultérieurement le prompt habituel dans **Paramètres → Matrice de création** ; il sera pris en compte au prochain appel Claude.

### Attention à l'abonnement Claude

L'abonnement Claude Max et l'API Anthropic sont deux voies d'accès distinctes. Selon l'offre, des crédits API mensuels peuvent être inclus ; les appels API supplémentaires suivent la tarification Anthropic. Le site hébergé sur Vercel utilise **la clé API** (et non les cookies de session de claude.ai ni un abonnement Claude web « détourné »). Le Claude Agent SDK lié à certains abonnements est une option distincte pour une installation locale et ne s'exécute pas directement comme session personnelle persistante sur Vercel.

### Photos et confidentialité

La connexion à Harmony Studio et la base de données sont privées, mais les photos de cette V1 sont enregistrées dans **Vercel Blob avec accès `public`** pour que Claude puisse les consulter. Toute personne ayant l'URL peut voir une photo : ne pas y mettre de pièces d'identité, documents confidentiels, coordonnées privées, etc. Pour une confidentialité complète des médias, il faudrait une architecture avec stockage privé et transfert authentifié/base64 vers Claude.

### Cadre légal et qualité des prospects

Le moteur de recherche renvoie des **résultats indexés** (pas une liste vérifiée d'entreprises qui souhaitent réellement acheter un site). Il n'explore pas clandestinement les réseaux sociaux, ne récolte pas automatiquement des e-mails personnels et n'envoie aucun message commercial automatique. Vérifier la source, la date, les conditions du site source et le contexte avant contact, respecter le RGPD et les règles applicables à la prospection B2B, prévoir une opposition simple.

### Limites de la V1

- Les recherches indexées ne donnent pas un accès garanti à toutes les annonces, réseaux sociaux et marchés. Certaines sources ne sont pas indexées.
- La « création » produit un **site vitrine statique autonome** avec HTML, CSS et JS, pas encore un projet Next.js multi-fichiers ni un véritable ERP avec backend, authentification client ou Stripe intégré. De telles fonctionnalités demandent une étape de développement et de tests supplémentaire.
- Un résultat généré par IA doit être relu et testé (contenu, accessibilité, responsive, SEO, sécurité et conformité légale) avant livraison au client.
- Le HTML est prévisualisé dans une iframe isolée avec restrictions CSP, mais son export ne doit pas être déployé sans audit des scripts. Les photos de génération peuvent contenir des droits d'auteur : vérifier les droits d'utilisation.
- Les recherches automatiques s'exécutent une fois par jour à 7 h **UTC** ; Vercel Hobby ne garantit pas la précision de la minute.
- Éviter de partager l'URL du projet avec d'autres personnes ; sur Vercel prévoir la protection des déploiements Preview, et un domaine dédié pour la production.
- Selon le modèle et la taille du site, une génération longue peut dépasser la durée autorisée par le forfait Vercel, nécessitant un backend de tâches asynchrones.

## Pistes pour la V2

- Connecteurs d'annonces soumis aux CGU de chaque plateforme, vérification automatique des sites, enrichissement entreprises via données professionnelles autorisées et détection de prospects mieux qualifiés.
- Assistant de rédaction de messages commerciaux avec relecture humaine, historique des relances et devis.
- Génération de projets **Next.js multi-fichiers** avec agent de code, dépôt GitHub privé, preview à la demande, déploiement Vercel et migrations Neon automatisées.
- Génération de fonctionnalités dynamiques : commandes, tableaux de bord métier, comptes clients, notifications et paiements.
- Conserver les images dans un stockage privé, connecter une bibliothèque média clients, historique de versions et snapshots.
- Journal d'audit et authentification à deux facteurs.

## Structure

- `app/api/auth` : connexion/déconnexion.
- `app/api/prospects` : recherche, carnet de prospects et mises à jour.
- `app/api/projects` : projets et génération.
- `app/api/settings` : matrice et veille.
- `app/api/upload` : token d'upload Vercel Blob.
- `app/api/cron` : veille protégée par `CRON_SECRET`.
- `lib` : Neon, sessions, Claude, logique de prospection.
- `components` : interface administrateur.

**À noter :** le code a été préparé sans accès à tes comptes ni à tes clés ; il n'est **pas déployé**. Teste les intégrations avec tes propres identifiants avant usage commercial.
