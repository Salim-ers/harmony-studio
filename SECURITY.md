# Sécurité — Harmony Studio

Harmony Studio est un outil **privé à propriétaire unique**. Il manipule des données de prospection, des clés d’API payantes (Claude, Brave, GitHub, Vercel) et du **code généré par une IA, considéré comme non fiable**. Ce document décrit les protections en place, ce qu’elles couvrent et ce qu’elles ne couvrent pas.

Résultat de l’audit et liste des corrections : [AUDIT-FINAL.md](AUDIT-FINAL.md). Variables et rotation des secrets : [ENVIRONMENT.md](ENVIRONMENT.md).

## 1. Modèle de menace

| Menace | Exemple | Protection principale |
|---|---|---|
| Accès non autorisé au Studio | vol de mot de passe, force brute | scrypt renforcé, 2FA TOTP, limitation des tentatives, sessions révocables |
| Requête forgée depuis un autre site (CSRF) | page piégée qui appelle l’API | cookie `SameSite=Strict` + contrôle `Origin`/`Sec-Fetch-Site` sur toute requête mutante |
| Code généré malveillant (injection de prompt) | un document client pousse Claude à écrire un script qui vole la session | aperçu en origine opaque (CSP `sandbox`), liste fermée de fichiers autorisés, compilation sans exécution, runner isolé sans secret ni réseau |
| Requête serveur vers le réseau interne (SSRF) | « Analyser le site » d’un prospect qui redirige vers `169.254.169.254` | validation de l’IP au moment de la connexion, toutes écritures d’IP comprises, redirections revalidées |
| Fichier piégé | image AVIF exploitant libvips, PDF avec JavaScript | type réel vérifié (octets magiques), sharp 0.35.5 corrigé, limite de 64 Mpx, PDF jamais affichés dans le Studio |
| Fuite de secrets | clé dans le navigateur, dans un log ou dans Git | aucune variable `NEXT_PUBLIC_*`, garde `server-only`, masquage dans les logs, `.env*` ignoré, `npm run self-check` |
| Dépense incontrôlée | boucle de génération, veille trop fréquente | budget mensuel et par génération vérifiés **avant** chaque appel Claude, plafond mensuel Brave pour tous les déclencheurs |

## 2. Authentification et sessions

- **Mot de passe** : hash scrypt `scrypt2:N:r:p:sel:hash` (N=2^14, r=8, p=5 : niveau recommandé par OWASP pour 16 Mo de mémoire par calcul, ce qui évite de saturer une fonction Vercel en cas de connexions simultanées). Les hash V1 `scrypt:sel:hash` restent acceptés. Paramètres bornés pour qu’une erreur de configuration ne rende pas chaque connexion démesurément coûteuse.
- **Temps constant** : l’e-mail et le mot de passe sont toujours vérifiés tous les deux (sel factice si le hash est absent) : la durée de réponse ne révèle rien.
- **Sessions** : jeton aléatoire de 256 bits ; seule son empreinte SHA-256 est en base (`admin_sessions`). Cookie `__Host-harmony_session`, `HttpOnly`, `Secure`, `SameSite=Strict`. Expiration absolue 72 h, inactivité 12 h (réglables). Déconnexion = révocation réelle en base. « Déconnecter les autres sessions » dans Paramètres → Sécurité.
- **2FA TOTP** (RFC 6238) : ±30 s, comparaison à temps constant, **anti-rejeu** (un code ne sert qu’une fois). Activer la 2FA après coup invalide les sessions ouvertes sans elle.
- **Limitation des tentatives** :
  - 5 essais par IP sur 15 minutes, comptés à chaque tentative ;
  - un seau global de 40 **échecs** par heure ; une connexion réussie ne le consomme jamais ;
  - au-delà du seuil global, avec 2FA, seules les connexions mot de passe + code valides passent, et toutes les erreurs reçoivent la même réponse (aucun indice sur le mot de passe). Sans 2FA, la connexion est suspendue jusqu’à la fin de l’heure. Une notification « sécurité » est créée dans les deux cas.
- **Redirection après connexion** : seuls les chemins internes sont acceptés.

## 3. Autorisations

- Toutes les routes `app/api/**` passent par `adminRoute` (session vérifiée en base, contrôle d’origine, limitation de débit), sauf `auth/login`, `auth/logout`, `health` et `cron`. `cron` exige `CRON_SECRET`, comparé en temps constant.
- Les pages privées vérifient la session **côté serveur** (`app/(app)/layout.tsx`, `impression/devis`). Le middleware ne sert qu’à rediriger rapidement : il n’est pas une barrière de sécurité.
- Les ressources imbriquées vérifient leur parent (version ↔ projet, note ↔ prospect, média ↔ projet…). Identifiants validés en UUID ; tests IDOR dans `tests/integration`.

## 4. Entrées, injections, sorties

- **Validation** : Zod sur tous les corps JSON, paramètres de requête et formulaires. Corps lus **par morceaux avec plafond** (même sans `Content-Length`), JSON invalide → 400.
- **SQL** : uniquement des requêtes paramétrées via `lib/server/db.ts`. `ORDER BY`, `LIMIT` et `OFFSET` viennent de listes blanches ou d’entiers validés.
- **XSS** : React échappe tout ; aucun `dangerouslySetInnerHTML` hors du script de thème constant (avec nonce). CSP à nonce + `strict-dynamic`, `frame-ancestors 'none'`.
- **CSV** : neutralisation des formules (`=`, `+`, `-`, `@`, tabulation, retour chariot) à l’export.
- **Chemins** : `safePath` refuse les chemins absolus, `..`, `\`, les octets nuls et les noms interdits.
- **SSRF** (`lib/server/safe-fetch.ts`) : http/https sur les ports 80/443 uniquement, pas d’identifiants dans l’URL. Les plages privées, réservées et spéciales sont bloquées par `net.BlockList`, qui compare les adresses en binaire ; les écritures alternatives comme `::ffff:7f00:1` ne passent donc pas. L’IP est vérifiée au moment de la connexion (pas de contournement par DNS rebinding). Les redirections sont suivies à la main (3 au maximum) et revalidées. Taille et durée sont limitées, et `robots.txt` est respecté.

## 5. Code généré par l’IA (non fiable par principe)

1. **Fichiers acceptés** :
   - Site React : liste **fermée** de chemins (`src/pages`, `src/components`, `src/sections`, `src/data`, `src/hooks`, `src/lib`, `src/site.config.js`, `src/styles`, `public/*.svg`). La configuration de build (`package.json`, `vite.config.js`, `vercel.json`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/motion/`) est fournie par Harmony Studio et **réimposée à chaque assemblage**. Les fichiers `postcss`, `tailwind` et `babel` sont retirés.
   - Site statique : aucun fichier interprété par un outil de build ou un hébergeur (`package.json`, `vercel.json`, `netlify.toml`, `*.config.*`…).
   - Tous les types : aucun fichier dans `.github/`, `.husky/`, `.vscode/`, `.devcontainer/`… (CI et hooks qui s’exécuteraient ailleurs), aucun `.env`, `.npmrc` ou `.yarnrc`. Ce filtre est **réappliqué à l’export** (ZIP, GitHub, Vercel), y compris pour les anciennes versions.
2. **Aperçu** : servi avec `Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms` sans `allow-same-origin`, donc dans une **origine opaque**. Le code ne peut lire ni les cookies, ni le stockage, ni l’API du Studio (`connect-src 'none'`, `form-action 'none'`), et il est affiché dans une iframe `sandbox`. Lien signé HMAC, valable **30 minutes**, lié à **la session** qui l’a demandé : il meurt à la déconnexion. Domaine distinct recommandé (`PREVIEW_ORIGIN`).
3. **Compilation des aperçus React** : esbuild sur un système de fichiers virtuel ; seuls les paquets de la liste blanche sont importables. Aucun code généré n’est exécuté sur le serveur du Studio.
4. **Applications Next.js générées** : construites et testées uniquement dans **Vercel Sandbox** (micro-VM éphémère, `env: {}`, scripts d’installation désactivés). Le réseau est limité au registre npm pendant l’installation, puis **coupé** avant tout build ou test ; si la coupure échoue, la construction est annulée. Sans runner, l’application reste « Construction » et n’est jamais déclarée fonctionnelle.
5. **Publication** : dépôt GitHub **privé** uniquement (refus si le dépôt existe et est public). Déploiement Vercel en preview par défaut ; la production exige un projet « Approuvé » et la saisie de « PRODUCTION ».

## 6. Fichiers envoyés (médias privés)

- Envoi découpé (blocs de 1 Mo), taille déclarée vérifiée, type **réel** contrôlé par octets magiques (JPEG, PNG, WebP, AVIF, PDF). SVG, HTML et exécutables sont refusés.
- Images : décodées par sharp 0.35.5 (failles libvips corrigées). Au-delà de 64 Mpx, la photo est refusée avec un message clair. L’orientation EXIF est appliquée et les métadonnées retirées des dérivés ; l’original est conservé à part.
- Stockage **privé** en base (aucune URL publique). Fichiers servis uniquement avec une session, en `Cache-Control: private`, `nosniff`, CSP `sandbox` ; les PDF sont forcés en téléchargement.
- Le filtre des PDF (JavaScript, Launch, fichiers embarqués) est **indicatif** : un PDF peut masquer ces marqueurs. La protection réelle est que les PDF ne sont jamais affichés dans le Studio ni publiés dans les sites.
- Les médias orphelins de plus de 24 h sont supprimés par le cron quotidien.

## 7. Secrets

- Toutes les variables sont côté serveur ; aucune n’est préfixée `NEXT_PUBLIC_`. `lib/server/db.ts` et `lib/server/env.ts` importent `server-only` : une importation accidentelle côté navigateur fait échouer le build.
- L’interface affiche seulement « configuré / non configuré ». Le test E2E vérifie qu’aucun hash, chaîne de connexion ou clé n’apparaît dans les pages.
- Les logs passent par `logError` : JSON structuré, référence d’erreur, masquage des clés `sk-ant-`, jetons GitHub, `Bearer`, chaînes PostgreSQL et hash scrypt.
- Le jeton Vercel servant aux sites clients doit être **distinct** de celui du projet Harmony Studio, idéalement limité à une équipe dédiée.

## 8. En-têtes HTTP

CSP (nonce, `strict-dynamic`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`), HSTS en production, `X-Frame-Options: DENY` (sauf aperçus encadrables par le Studio), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` restrictive et `Cross-Origin-Opener-Policy: same-origin`.

## 9. Limites connues

- **Hébergement hors Vercel** : `x-forwarded-for` et `x-forwarded-host` sont fiables derrière Vercel, qui les réécrit. Derrière un autre proxy, configurez-le pour qu’il les écrase, sinon la limite par IP peut être contournée.
- **`/api/health`** est public : il indique seulement l’état de la base et si les migrations sont à jour, sans version, chemin ni secret.
- **Dépendances de développement** : `eslint-config-next` dépend d’une version de `braces` signalée pour un déni de service sur des motifs très imbriqués. Il n’existe pas de version corrigée. C’est sans impact en production (outil de lint, motifs écrits par nous).
- Les appels réels à Claude, Brave, GitHub, Vercel et Vercel Sandbox n’ont pas été exécutés pendant le développement (clés absentes). Leur code est testé contre des réponses simulées. La recette de [DEPLOYMENT.md](DEPLOYMENT.md#7-recette-après-déploiement-avec-vos-vraies-clés) est indispensable.

## 10. Signaler un problème, réagir à un incident

1. **Suspicion de compromission** : Paramètres → Sécurité → « Déconnecter les autres sessions ». Changez ensuite le mot de passe et `SESSION_SECRET`, révoquez les clés d’API concernées chez chaque fournisseur, puis redéployez (procédures dans ENVIRONMENT.md).
2. **Comprendre ce qui s’est passé** : Journal & coûts → journal des actions (connexions, refus, publications) et Vercel → Logs (erreurs avec leur référence).
3. **Restaurer les données** si nécessaire : BACKUP.md.
