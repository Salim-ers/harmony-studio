# Audit final de production — Harmony Studio V2

- **Date** : 21 octobre 2026.
- **Référentiel** : votre document « MISSION : AUDIT FINAL PRODUCTION, SÉCURITÉ, PERFORMANCE ET FIABILITÉ » (copie dans `db/reference/`), appliqué famille par famille, de 1 à 25.
- **Méthode** :
  1. Auto-audit des 25 familles.
  2. Audit de sécurité **indépendant**, réalisé par un agent distinct qui n’avait pas écrit le code, en lecture seule, avec deux preuves de concept exécutées.
  3. Correction des problèmes trouvés, puis nouvelle exécution de **toute** la chaîne de validation sur le code livré.

Rien n’est déclaré fonctionnel sans avoir été exécuté. Ce qui n’a pas pu l’être est marqué **NON EXÉCUTÉ**, avec la raison.

---

## 1. Audit initial de la V1 (point de départ)

La V1 (34 fichiers, commit `206cb18`) posait de bonnes bases : hash scrypt, cookie signé `HttpOnly`/`SameSite=Strict`, contrôle d’origine, limite de 5 tentatives de connexion, SQL paramétré, cron protégé, aperçu en iframe `sandbox`. Points relevés et traitement en V2 :

| Domaine | Constat V1 | Traitement V2 |
|---|---|---|
| Sessions | Cookie signé sans état valable 7 jours : la déconnexion ne révoque rien (un cookie copié reste valide) ; pas de 2FA | Sessions en base révocables (empreinte SHA-256), expiration absolue + inactivité, 2FA TOTP anti-rejeu |
| Photos | Envoi vers Vercel Blob en **accès public** : toute photo client est lisible par quiconque obtient l’URL ; images transmises à Claude par URL publique | Stockage **privé** en base, type réel vérifié, dérivés optimisés, originaux conservés ; bouton de rapatriement des anciennes photos |
| En-têtes | Pas de CSP ni de HSTS | CSP à nonce + `strict-dynamic`, HSTS, COOP, Permissions-Policy |
| Cron | Secret comparé avec `!==` (pas en temps constant) | Comparaison à temps constant, 16 caractères minimum |
| Validation | Contrôles manuels hétérogènes | Zod partout, corps à taille plafonnée |
| Prospection | Un seul niveau d’heuristique ; score fixe (78/35/48) ; aucune exclusion d’agences, d’offres d’emploi ou de classements ; dédoublonnage par URL seulement | 3 stratégies distinctes, rejet motivé des faux positifs, score expliqué, dédoublonnage URL canonique + entité, provenance et preuves |
| Matrice | Matrice unique spécifique (référence Royal Auto-école) | 4 matrices **génériques** tous métiers (Design, Technique, SEO, Audit), versionnées, avec variables |
| Génération | Un seul appel Claude → un fichier HTML dans du JSON (fragile, 10 000 tokens, 120 s), sans budget ni coût, sans plan validé | Pipeline persistant étape par étape, plan à valider, budget vérifié avant chaque appel, coûts par étape, sites React + Motion ou HTML, applications Next.js |
| Versions | Copies HTML successives, sans différentiel ni restauration | Versions multi-fichiers, différentiel, restauration non destructive |
| Exploitation | Pas de lockfile, versions en `^`, pas de tests, `schema.sql` sans migrations versionnées, pas de procédure de sauvegarde | Lockfile, versions exactes, 77 tests + 6 E2E, migrations versionnées avec retour arrière, BACKUP.md testé |
| Modèle par défaut | `claude-sonnet-4-6` codé en dur | Modèle choisi dans Paramètres, grille tarifaire éditable (modèle hors grille refusé) |

---

## 2. Inventaire des problèmes trouvés sur la V2 (avant corrections finales)

Format : **fichier**, problème, risque, correction et statut.

### 1. CRITICAL

Aucun problème critique dans le code applicatif (confirmé par l’audit indépendant).

Une dépendance d’**outillage de test** était signalée « critical » par npm : voir D2 dans la section HIGH.

### 2. HIGH

| # | Fichier | Problème | Risque | Correction | Statut |
|---|---|---|---|---|---|
| H1 | `package.json` → `sharp` 0.34.5 | Failles libvips, libheif et librsvg (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w). Les fichiers AVIF sont acceptés, donc décodés par libheif | Une image piégée envoyée par un client provoque une corruption mémoire dans la fonction serveur | `sharp` **0.35.5** | ✅ Corrigé. Test d’envoi et d’EXIF repassé |
| D1 | `next` 15.5.28 → `postcss` 8.4.31 | Avis GHSA-qx2v, GHSA-6g55, GHSA-fxqj, GHSA-r28c (lecture de fichiers `.map`, XSS dans la sortie CSS) | Faible en pratique : uniquement au build, sur notre propre CSS. Comptait pourtant comme vulnérabilité de production | `overrides.postcss = 8.5.31` (même version majeure) | ✅ Corrigé. `npm audit --omit=dev` : **0**. Build et E2E repassés |
| D2 | `vitest` 3.2.7 → `tinypool` 1.1.1 | Pollution de prototype menant à l’exécution de code (GHSA-5gmw, GHSA-85c8) | Outil de test uniquement, jamais déployé | `vitest` **5.0.5** + `esbuild` **0.28.2**, requis par Vite 8 et utilisé aussi pour compiler les aperçus | ✅ Corrigé. 77 tests repassés |

### 3. MEDIUM

| # | Fichier | Problème | Risque | Correction | Statut |
|---|---|---|---|---|---|
| M1 | `lib/server/safe-fetch.ts` | Contournement SSRF : `http://[::ffff:127.0.0.1]/` devient `::ffff:7f00:1` en hexadécimal, ce qui échappait au filtre par chaîne. Les IP littérales ne passent pas par le contrôle DNS. **Preuve de concept exécutée** par l’auditeur | « Analyser le site » d’un prospect dont le site redirige vers une adresse interne ou de métadonnées cloud | Filtre `net.BlockList` en binaire, deux listes IPv4/IPv6. Plages ajoutées : IPv4 mappées, NAT64, 6to4, Teredo, documentation | ✅ Corrigé. 12 nouveaux cas testés |
| M2 | `app/api/auth/login/route.ts` | Le seau global (40/h) était consommé **avant** la vérification, y compris pour les connexions réussies | N’importe qui pouvait bloquer la connexion du propriétaire avec 41 requêtes par heure | Limite par IP d’abord ; seuls les **échecs** comptent dans le seau global. Au-delà du seuil : avec 2FA, le propriétaire passe et les erreurs deviennent indistinguables ; sans 2FA, suspension jusqu’à la fin de l’heure. Une notification est créée | ✅ Corrigé. 3 tests d’intégration |
| M3 | `lib/server/ai/fileformat.ts`, `studio/react-site.ts`, `studio/export.ts` | Claude pouvait écrire `.github/workflows/*.yml`, `vercel.json` (React), `postcss.config.js`, ou `package.json` / `vercel.json` (statique) | Injection de prompt (document client, page web d’un prospect) → code exécuté par GitHub Actions, par le build Vercel ou sur votre poste | Liste **fermée** de chemins pour React ; fichiers de build interdits en statique ; dossiers de CI, hooks et IDE interdits partout ; kit réimposé à chaque assemblage ; filtre réappliqué à l’export ; consigne ajoutée au prompt | ✅ Corrigé. 25 cas testés |

### 4. LOW

| # | Fichier | Problème | Correction | Statut |
|---|---|---|---|---|
| L1 | `studio/preview.ts`, `apercu/…/route.ts` | Jeton d’aperçu de 2 h, non lié à la session : il restait valable après déconnexion | 30 min, lié à l’identifiant de session et vérifié en base à chaque requête | ✅ Testé (session révoquée → 404) |
| L2 | `prospects/engine.ts` | Plafond mensuel Brave vérifié sur une seule route (la veille planifiée et les recherches enregistrées le contournaient) | Vérification déplacée dans `runSearch` ; le cron continue les autres tâches et notifie | ✅ Testé (manuel + planifié) |
| L3 | `studio/runner.ts` | Si la coupure réseau échouait, le build s’exécutait quand même avec le réseau ouvert | Arrêt et rapport « non exécuté » | ✅ Corrigé — **NON EXÉCUTÉ** en réel (Vercel Sandbox non disponible ici) |
| L4 | `lib/server/http.ts` | `readJson` lisait tout le corps avant de vérifier la taille (envoi en « chunked » sans `Content-Length`) | Lecture par morceaux avec plafond ; JSON invalide → 400 | ✅ Corrigé (toutes les routes passent par là) |
| L5 | `lib/server/auth.ts` | scrypt aux paramètres par défaut ; sessions de 7 j / 48 h | scrypt N=2^14, r=8, p=5 (format `scrypt2`, ancien format accepté, paramètres bornés) ; sessions de 72 h / 12 h. 2FA non imposée, pour éviter de vous bloquer au premier déploiement, mais avertissement renforcé | ✅ Testé (nouveau hash, hash V1, hash hors bornes) |
| L6 | `studio/media.ts` | 120 Mpx autorisés ; filtre PDF contournable | 64 Mpx avec message clair ; filtre PDF documenté comme indicatif (PDF jamais affichés ni publiés) | ✅ Testé (image 72 Mpx refusée) |
| L7 | `next` → `postcss` | (voir D1) | — | ✅ |
| I1 | `lib/server/db.ts`, `env.ts` | Pas de garde `server-only` | `import 'server-only'` (une importation côté navigateur fait échouer le build) | ✅ |
| I2 | `apercu/…/route.ts` | `decodeURIComponent` pouvait lever une exception (erreur 500) | try/catch → 404 | ✅ Testé |
| I3 | `matrices/[kind]`, `react-site.ts` | Opérateur `in` sur des objets simples (`constructor` accepté) | `Object.hasOwn` | ✅ |
| I4 | `components/Login.tsx` | La page publique affichait le prénom du propriétaire | « Bienvenue. » | ✅ |
| I5 | `lib/server/http.ts` | Le masquage des logs ne reconnaissait pas le nouveau format de hash | `scrypt2?:` | ✅ Testé |
| I6 | `tests/integration/prospects.test.ts` | Test instable : synonyme tiré au hasard (« pâtisserie ») non reconnu par la simulation Brave | Simulation corrigée | ✅ 3 exécutions complètes consécutives à 77/77 |

### 5. PERFORMANCE

| # | Constat | Évaluation / action |
|---|---|---|
| P1 | Studio : JS partagé 103 kB, page la plus lourde `/creation/[id]` 126 kB, middleware 34,6 kB | Correct pour un outil interne. Composants client limités aux écrans interactifs |
| P2 | Sites React clients : bundle 369 kB (120 kB gzip) pour un site de 5 pages | Acceptable. Amélioration possible : chargement différé par page (`React.lazy`) |
| P3 | Images : dérivés WebP 2400 px, vignettes 480 px, version IA 1568 px. Dans les sites, `ParallaxImage` du kit est en `lazy` (sauf `priority`), et le chargement différé hors hero est imposé par les matrices et les consignes de génération | ✅ (pour les images écrites par Claude : à vérifier à la relecture) |
| P4 | Polices auto-hébergées (`@fontsource`), aucun appel à Google Fonts depuis le Studio | ✅ |
| P5 | Liste des prospects paginée (25 par défaut, 200 maximum), 30 index, compteurs agrégés en SQL | ✅ |
| P6 | Médias stockés en base (BYTEA, blocs de 1 Mo) : la base grossit vite | Choix délibéré (privé, sauvegardé avec le reste). Au-delà de quelques Go, migrer vers un stockage objet privé |
| P7 | Génération : un appel Claude par requête HTTP (300 s maximum), reprise automatique | ✅ Compatible Hobby et Pro |
| P8 | 12 `SELECT *` sur de petites tables de configuration ou de détail | Sans impact mesurable ; laissé tel quel (consigne « pas de refactoring esthétique ») |

### 6. MAINTENANCE

| # | Constat | Action |
|---|---|---|
| X1 | Next 15.5 : le correctif postcss passe par un `override` | À retirer lors de la migration vers Next 16 (version majeure, à planifier) |
| X2 | `eslint` 9.39.5 marqué « plus maintenu » ; `eslint-config-next` dépend d’une version de `braces` signalée, sans correctif publié | Outils de développement uniquement. À traiter avec Next 16 et ESLint 10 |
| X3 | Deux pilotes PostgreSQL (`@neondatabase/serverless` en production, `pg` en local et pour les migrations) | Volontaire, encapsulé dans `lib/server/db.ts` |
| X4 | Node.js 22 requis par Vitest 5 | `engines.node = 22.x` (également utilisé par Vercel) |
| X5 | Code V1 remplacé | Supprimé seulement après vérification de tous les usages ; conservé dans l’historique Git (`206cb18`) |

---

## 3. Contrôle des 25 familles

| # | Famille | Statut | Éléments vérifiés |
|---|---|---|---|
| 1 | Ne rien casser | ✅ | Fonctions V1 conservées (prospects, projets, versions, matrice, veille) ; migration non destructive avec retour arrière testé |
| 2 | Secrets | ✅ | Aucun secret dans le dépôt ni l’historique ; aucun `NEXT_PUBLIC_*` ; `server-only` ; `.gitignore` couvre `.env*` ; `self-check` ; le test E2E vérifie qu’aucun secret n’apparaît dans les pages |
| 3 | Authentification | ✅ | Connexion, déconnexion avec révocation, sessions, cookies `__Host-` ; inscription et mot de passe oublié **sans objet** (compte unique défini par variables) |
| 4 | Autorisations / IDOR | ✅ | `adminRoute` sur 55 des 59 routes API (exceptions : login, logout, health, cron protégé) ; parents vérifiés ; tests IDOR |
| 5 | Base de données | ✅ | 18 clés étrangères, 31 contraintes `CHECK`, 30 index, transactions (`batch`), migrations versionnées avec contrôle d’intégrité. Supabase/RLS **sans objet** (Neon, accès uniquement côté serveur) |
| 6 | Validation | ✅ | Zod sur corps, requêtes et identifiants ; envois en blocs vérifiés ; webhooks **sans objet** |
| 7 | Injections | ✅ | SQL paramétré, XSS (React + CSP), chemins (`safePath`), redirections internes uniquement, SSRF (M1), aucune commande shell construite avec des entrées |
| 8 | Limitation de débit | ✅ | Connexion (IP + global), recherche, IA, envoi de fichiers, publication externe, analyse de site, écritures ; persistante en base |
| 9 | En-têtes | ✅ | CSP, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, XFO/`frame-ancestors`, COOP — vérifiés sur le serveur de production local |
| 10 | Uploads | ✅ | Taille, type réel, renommage, aucune exécution, stockage privé, accès par session |
| 11 | Webhooks | Sans objet | Aucun webhook entrant |
| 12 | Paiements | Sans objet | Aucun paiement ; les totaux des devis sont calculés côté serveur |
| 13 | Logs | ✅ | Aucun `console.log` ; `logError` en JSON avec référence et masquage des secrets ; journal des actions en base |
| 14 | Erreurs | ✅ | Messages génériques avec référence ; ni pile d’appels, ni SQL, ni chemin, ni secret côté client |
| 15 | Dépendances | ✅ prod / ⚠️ dev | Production : **0** vulnérabilité. Développement : 5 alertes `high` sur une seule chaîne (`braces`, sans correctif), sans impact. Versions exactes, lockfile conservé |
| 16 | Code mort | ✅ | TypeScript strict + ESLint sans avertissement ; code V1 retiré après vérification |
| 17 | Performance | ✅ | Voir section PERFORMANCE |
| 18 | Performance base de données | ✅ | Index sur les filtres et tris, pagination, compteurs en SQL ; pas de N+1 sur les listes |
| 19 | Cache | ✅ | API en `private, no-store` ; médias en `private` ; aucune donnée personnelle en cache public ; ressources Next immuables |
| 20 | Tests | ✅ | Voir TEST STATUS |
| 21 | Monitoring | ⚠️ partiel | Logs structurés (Vercel Logs), `/api/health`, notifications internes (sécurité, quota, RGPD), journal des actions et des coûts. Pas d’outil externe branché (Sentry possible via `logError`, point unique) |
| 22 | Sauvegardes | ✅ | Stratégie à 3 niveaux, restauration `pg_dump` testée, PITR Neon documenté (**NON EXÉCUTÉ** : nécessite votre compte) |
| 23 | Health check | ✅ | `/api/health` : état de la base et des migrations, sans information sensible |
| 24 | Documentation | ✅ | README, SECURITY, DEPLOYMENT, ENVIRONMENT, BACKUP, MODE-EMPLOI, ce rapport ; aucune valeur réelle de secret |
| 25 | Audit final | ✅ | Ce document |

---

## SECURITY STATUS

**Bon pour un outil privé à propriétaire unique.**
- Aucun problème critique.
- Le seul problème HIGH (sharp) et les 3 problèmes MEDIUM sont corrigés et couverts par des tests.
- Les points LOW sont corrigés, sauf un choix volontaire : la 2FA n’est pas imposée, mais elle est fortement recommandée et sa nécessité est signalée.
- À faire au déploiement : activer la 2FA, utiliser un domaine d’aperçu distinct et un jeton Vercel dédié aux sites clients (voir SECURITY.md).

## PERFORMANCE STATUS

**Satisfaisant.**
- Studio : 103 à 126 kB de JS par page.
- Listes paginées et indexées, images optimisées, polices locales.
- Points à surveiller : la taille de la base (médias stockés en BYTEA) et le découpage du bundle des sites React.

## DEPENDENCIES STATUS

**Production : 0 vulnérabilité** (`npm audit --omit=dev`).
- Développement : 5 alertes `high` sur une seule chaîne d’outillage de lint, sans correctif publié et sans impact.
- Mises à jour effectuées : `sharp` 0.35.5, `esbuild` 0.28.2, `vitest` 5.0.5, `postcss` 8.5.31 (override).
- Ajout : `server-only` 0.0.1.
- Lockfile conservé, versions exactes.

## DATABASE STATUS

**Prêt.**
- 3 migrations versionnées avec contrôle d’intégrité, non destructives, avec scripts de retour arrière testés (aller-retour V1 → V2 → V1 → V2).
- Clés étrangères, contraintes, index, transactions en place.
- Reprise des données V1 testée.

## TEST STATUS

Exécutions du 21/10/2026 sur le code livré (Node 22.22, PostgreSQL 16 local) :

| Contrôle | Commande | Résultat |
|---|---|---|
| Types | `npm run typecheck` | ✅ 0 erreur |
| Lint | `npm run lint` | ✅ 0 erreur, 0 avertissement |
| Tests unitaires + intégration | `npm test` | ✅ **77/77** (8 fichiers), 3 exécutions complètes consécutives sans échec |
| Build de production | `npm run build` | ✅ 75 routes compilées |
| E2E navigateur (Chromium) | `npm run test:e2e` contre `next start` | ✅ **6/6** : sécurité sans session, connexion, prospection persistante, création (photos → plan → site React → aperçu isolé à origine opaque → modification → version 2), paramètres sans secret, aucune violation CSP ni erreur JS |
| Débordements mobile | script Playwright sur 14 pages, 820 et 390 px | ✅ 0 débordement horizontal |
| Site React exporté | `vite build` réel | ✅ `index.html`, bundle, `sitemap.xml`, `robots.txt` |
| Sauvegarde / restauration | `pg_dump` → `pg_restore` | ✅ comptages et empreintes identiques |
| Vulnérabilités | `npm audit --omit=dev` | ✅ 0 |
| Appels réels Claude, Brave, GitHub, Vercel, Vercel Sandbox | — | **NON EXÉCUTÉ** : clés absentes de l’environnement de développement. Code testé contre des réponses simulées conformes aux API ; recette réelle décrite dans DEPLOYMENT.md §7 |
| Restauration PITR Neon | — | **NON EXÉCUTÉ** : nécessite votre compte Neon |

Couverture fonctionnelle : authentification, 2FA et anti-rejeu, verrouillage, CSRF, IDOR, SSRF, envoi de fichiers (vrai JPEG, faux JPEG, exécutable, SVG, 72 Mpx), CSV (formules, BOM, import), RGPD (opposition, effacement), devis (totaux serveur), pipeline de génération complet, budget, aperçu (jeton, session, URI invalide), versions (différentiel, restauration), export ZIP, GitHub privé et Vercel (simulés), cron et quota.

## BACKUP STATUS

**Prêt, procédure testée.**
- `pg_dump` hebdomadaire chiffré et PITR Neon.
- Export JSON depuis l’interface.
- Restauration `pg_dump` testée (comptages et MD5 identiques).
- Restauration PITR à tester une fois lors de la mise en service.

## MONITORING STATUS

**Partiel (suffisant pour démarrer).**
- Logs JSON structurés avec référence d’erreur (Vercel Logs), `/api/health`, notifications internes, journal des actions et des coûts.
- À ajouter si besoin : un service d’alerte externe, soit un moniteur de disponibilité sur `/api/health`, soit Sentry branché dans `logError`.

## PRODUCTION READINESS

**Prêt pour une mise en service contrôlée, pas encore « validé en production ».**

Le code, la base, la sécurité et la documentation sont prêts. Trois étapes restent indispensables avant un usage commercial :
1. Renseigner les variables réelles et appliquer les migrations sur Neon (DEPLOYMENT.md).
2. Exécuter la **recette avec vos vraies clés** (DEPLOYMENT.md §7) : premiers appels réels à Claude, Brave et, si utilisés, GitHub, Vercel et Sandbox.
3. Activer la 2FA, puis tester une restauration PITR.

Tant que l’étape 2 n’est pas faite, les intégrations externes restent **non vérifiées en conditions réelles**.

---

## 4. Risques restants

1. **Intégrations réelles non exécutées** (Claude, Brave, GitHub, Vercel, Sandbox). Elles sont conformes aux documentations officielles et testées contre des simulations, mais un écart de format reste possible. Atténuation : recette du §7 de DEPLOYMENT.md, avec un budget par génération limité à 2 $.
2. **Next 15 + override postcss** : à retirer lors de la migration vers Next 16 (majeure, non faite ici pour ne rien casser).
3. **Outillage de développement** : chaîne `braces` signalée, sans correctif publié (sans impact en production).
4. **Sites React = applications monopage** : référencement correct sur Google, moins bon pour d’autres robots. Un pré-rendu statique est une évolution possible.
5. **Médias stockés en base** : la croissance de la base et la formule Neon sont à surveiller.
6. **Sans 2FA**, une attaque distribuée peut suspendre la connexion pendant une heure. Avec la 2FA, ce n’est pas possible.
7. **Détection automatique des demandes** : elle reste une aide. Relire la source avant tout contact.
8. **Injection de prompt** : les protections limitent ce que le code généré peut faire (aperçu isolé, chemins fermés, runner sans secret). Il faut toujours relire un site avant de le publier en production, d’où l’étape « Approuver ».

---

## 5. Liste exacte des fichiers modifiés depuis la V1

Comparaison `git diff --name-status 206cb18` (V1 d’origine) → commit final. `A` = ajouté, `M` = modifié, `D` = supprimé, `R` = renommé.

Total : **210 fichiers** — ajoutés : 176, modifiés : 22, supprimés : 11, renommés : 1.

Détail des fichiers modifiés lors de **cet audit final** (corrections de sécurité, dépendances, tests, documentation) : `.env.example`, `README.md`, `ENVIRONMENT.md`, `MODE-EMPLOI.md`, `SECURITY.md` (nouveau), `AUDIT-FINAL.md` (nouveau), `package.json`, `package-lock.json`, `vitest.config.ts → vitest.config.mts`, `app/apercu/[token]/[[...path]]/route.ts`, `app/api/auth/login/route.ts`, `app/api/cron/route.ts`, `app/api/matrices/[kind]/route.ts`, `app/api/projects/[id]/preview-url/route.ts`, `app/api/prospects/search/route.ts`, `components/Login.tsx`, `components/pages/Parametres.tsx`, `lib/server/ai/fileformat.ts`, `lib/server/ai/prompts.ts`, `lib/server/auth.ts`, `lib/server/db.ts`, `lib/server/env.ts`, `lib/server/http.ts`, `lib/server/prospects/engine.ts`, `lib/server/prospects/mock-results.ts`, `lib/server/safe-fetch.ts`, `lib/server/studio/export.ts`, `lib/server/studio/media.ts`, `lib/server/studio/preview.ts`, `lib/server/studio/react-site.ts`, `lib/server/studio/runner.ts`, `scripts/hash-password.mjs`, `scripts/self-check.mjs`, `tests/e2e/recette.spec.ts`, `tests/integration/auth.test.ts`, `tests/integration/creation.test.ts`, `tests/integration/prospects.test.ts`, `tests/unit/security.test.ts` — plus, juste avant l’audit : `components/pages/Journal.tsx`, `lib/server/settings.ts` (tarif Brave 2026), `vercel.json` (horaire du cron), `BACKUP.md`, `DEPLOYMENT.md`.

```text
M	.env.example
M	.gitignore
A	AUDIT-FINAL.md
A	BACKUP.md
D	DEMARRAGE_RAPIDE.txt
A	DEPLOYMENT.md
A	ENVIRONMENT.md
A	MODE-EMPLOI.md
M	README.md
A	SECURITY.md
A	app/(app)/creation/[id]/page.tsx
A	app/(app)/creation/nouveau/page.tsx
A	app/(app)/creation/page.tsx
A	app/(app)/dashboard/page.tsx
A	app/(app)/devis/[id]/page.tsx
A	app/(app)/devis/page.tsx
A	app/(app)/error.tsx
A	app/(app)/journal/page.tsx
A	app/(app)/layout.tsx
A	app/(app)/loading.tsx
A	app/(app)/parametres/page.tsx
A	app/(app)/prospection/[id]/page.tsx
A	app/(app)/prospection/page.tsx
A	app/(app)/prospection/recherches/page.tsx
A	app/(app)/taches/page.tsx
A	app/apercu/[token]/[[...path]]/route.ts
A	app/api/audit-logs/route.ts
M	app/api/auth/login/route.ts
M	app/api/auth/logout/route.ts
A	app/api/backup/route.ts
M	app/api/cron/route.ts
A	app/api/dashboard/route.ts
A	app/api/health/route.ts
A	app/api/jobs/[id]/advance/route.ts
A	app/api/jobs/[id]/approve/route.ts
A	app/api/jobs/[id]/cancel/route.ts
A	app/api/jobs/[id]/replan/route.ts
A	app/api/jobs/[id]/retry/route.ts
A	app/api/jobs/[id]/route.ts
A	app/api/matrices/[kind]/route.ts
A	app/api/matrices/preview/route.ts
A	app/api/media/[id]/[variant]/route.ts
A	app/api/media/uploads/[id]/[part]/route.ts
A	app/api/media/uploads/[id]/complete/route.ts
A	app/api/media/uploads/route.ts
A	app/api/notifications/route.ts
A	app/api/projects/[id]/assets/[assetId]/route.ts
A	app/api/projects/[id]/assets/route.ts
A	app/api/projects/[id]/deploy/route.ts
A	app/api/projects/[id]/export/route.ts
A	app/api/projects/[id]/github/route.ts
A	app/api/projects/[id]/import-legacy/route.ts
A	app/api/projects/[id]/jobs/route.ts
A	app/api/projects/[id]/preview-url/route.ts
M	app/api/projects/[id]/route.ts
A	app/api/projects/[id]/versions/[versionId]/diff/route.ts
A	app/api/projects/[id]/versions/[versionId]/restore/route.ts
A	app/api/projects/[id]/versions/[versionId]/route.ts
A	app/api/projects/[id]/versions/route.ts
D	app/api/projects/generate/route.ts
M	app/api/projects/route.ts
A	app/api/prospects/[id]/contact-log/route.ts
A	app/api/prospects/[id]/lookup-site/route.ts
A	app/api/prospects/[id]/message/route.ts
A	app/api/prospects/[id]/notes/route.ts
A	app/api/prospects/[id]/route.ts
A	app/api/prospects/[id]/tasks/route.ts
A	app/api/prospects/[id]/website-check/route.ts
A	app/api/prospects/bulk/route.ts
A	app/api/prospects/export/route.ts
A	app/api/prospects/import/route.ts
A	app/api/prospects/purge/route.ts
M	app/api/prospects/route.ts
M	app/api/prospects/search/route.ts
A	app/api/quotes/[id]/route.ts
A	app/api/quotes/route.ts
A	app/api/search-profiles/[id]/route.ts
A	app/api/search-profiles/[id]/run/route.ts
A	app/api/search-profiles/route.ts
A	app/api/search-runs/route.ts
A	app/api/search/route.ts
A	app/api/security/sessions/route.ts
M	app/api/settings/route.ts
A	app/api/tasks/[id]/route.ts
A	app/api/tasks/route.ts
D	app/api/upload/route.ts
A	app/api/usage/route.ts
D	app/dashboard/page.tsx
M	app/globals.css
A	app/impression/devis/[id]/page.tsx
M	app/layout.tsx
A	app/not-found.tsx
M	app/page.tsx
A	components/AppShell.tsx
D	components/Dashboard.tsx
M	components/Login.tsx
A	components/PrintButton.tsx
A	components/pages/Dashboard.tsx
A	components/pages/DevisEditor.tsx
A	components/pages/DevisList.tsx
A	components/pages/Journal.tsx
A	components/pages/NouveauProjet.tsx
A	components/pages/Parametres.tsx
A	components/pages/Projets.tsx
A	components/pages/ProspectDetail.tsx
A	components/pages/Prospection.tsx
A	components/pages/Recherches.tsx
A	components/pages/Taches.tsx
A	components/studio/JobPanel.tsx
A	components/studio/Studio.tsx
A	components/ui.tsx
R100	scripts/schema.sql	db/migrations/001_v1_schema.sql
A	db/migrations/002_harmony_v2.sql
A	db/migrations/003_react_sites.sql
A	db/reference/MISSION AUDIT FINAL PRODUCTION.txt
A	db/reference/Matrice prompt - Royal Auto-ecole (reference qualite).txt
A	db/rollback/002_harmony_v2.down.sql
A	db/rollback/003_react_sites.down.sql
A	eslint.config.mjs
D	lib/auth.ts
D	lib/claude.ts
A	lib/client/api.ts
A	lib/client/format.ts
A	lib/client/upload.ts
D	lib/db.ts
D	lib/matrix.ts
D	lib/prospect-search.ts
A	lib/server/ai/anthropic.ts
A	lib/server/ai/default-matrices.ts
A	lib/server/ai/fileformat.ts
A	lib/server/ai/matrices.ts
A	lib/server/ai/mock.ts
A	lib/server/ai/prompts.ts
A	lib/server/api.ts
A	lib/server/audit.ts
A	lib/server/auth.ts
A	lib/server/db.ts
A	lib/server/env.ts
A	lib/server/http.ts
A	lib/server/prospects/brave.ts
A	lib/server/prospects/classify.ts
A	lib/server/prospects/csv.ts
A	lib/server/prospects/engine.ts
A	lib/server/prospects/mock-results.ts
A	lib/server/prospects/queries.ts
A	lib/server/prospects/repo.ts
A	lib/server/prospects/schemas.ts
A	lib/server/prospects/score.ts
A	lib/server/prospects/url.ts
A	lib/server/prospects/website-check.ts
A	lib/server/quotes.ts
A	lib/server/ratelimit.ts
A	lib/server/safe-fetch.ts
A	lib/server/settings.ts
A	lib/server/studio/checks.ts
A	lib/server/studio/export.ts
A	lib/server/studio/jobs.ts
A	lib/server/studio/media.ts
A	lib/server/studio/preview.ts
A	lib/server/studio/projects.ts
A	lib/server/studio/react-site.ts
A	lib/server/studio/runner.ts
A	lib/server/studio/schemas.ts
A	lib/server/studio/version-files.ts
A	lib/server/studio/versions.ts
A	lib/server/totp.ts
A	lib/shared/constants.ts
D	lib/types.ts
A	middleware.ts
M	next-env.d.ts
M	next.config.ts
A	package-lock.json
M	package.json
A	playwright.config.ts
M	scripts/hash-password.mjs
A	scripts/migrate.mjs
M	scripts/self-check.mjs
A	scripts/totp-secret.mjs
A	templates/react-site/index.html
A	templates/react-site/src/App.jsx
A	templates/react-site/src/components/Kit.jsx
A	templates/react-site/src/main.jsx
A	templates/react-site/src/motion/Interactive.jsx
A	templates/react-site/src/motion/PageTransition.jsx
A	templates/react-site/src/motion/Parallax.jsx
A	templates/react-site/src/motion/Reveal.jsx
A	templates/react-site/src/motion/Stagger.jsx
A	templates/react-site/src/motion/TextReveal.jsx
A	templates/react-site/src/motion/index.js
A	templates/react-site/src/motion/intensity.js
A	templates/react-site/src/styles/kit.css
A	templates/react-site/vercel.json
A	templates/react-site/vite.config.js
A	tests/e2e/recette.spec.ts
A	tests/integration/auth.test.ts
A	tests/integration/creation.test.ts
A	tests/integration/external.test.ts
A	tests/integration/global-setup.ts
A	tests/integration/helpers.ts
A	tests/integration/jar.ts
A	tests/integration/prospects.test.ts
A	tests/integration/setup-env.ts
A	tests/setup.ts
A	tests/unit/creation.test.ts
A	tests/unit/prospects.test.ts
A	tests/unit/react-site.test.ts
A	tests/unit/security.test.ts
M	tsconfig.json
M	vercel.json
A	vitest.config.mts
```
