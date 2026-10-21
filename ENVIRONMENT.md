# Variables d’environnement

Toutes les variables sont **côté serveur**. Aucune n’est préfixée `NEXT_PUBLIC_` : rien n’est envoyé au navigateur. L’interface affiche seulement « configuré / non configuré » (Paramètres → Intégrations & coûts).

## Obligatoires

| Variable | Rôle | Comment l’obtenir |
|---|---|---|
| `ADMIN_EMAIL` | E-mail du propriétaire unique | Votre adresse |
| `ADMIN_PASSWORD_HASH` | Hash scrypt du mot de passe (format `scrypt2:N:r:p:sel:hash`) | `npm run hash-password` (12 caractères minimum). Un hash V1 (`scrypt:sel:hash`) reste accepté ; régénérez-le au prochain changement de mot de passe |
| `SESSION_SECRET` | Clé de dérivation (jetons d’aperçu, empreintes) — 32 caractères minimum | `openssl rand -hex 32` |
| `DATABASE_URL` | Connexion Neon PostgreSQL | Console Neon → Connection string (`sslmode=require`) |
| `ANTHROPIC_API_KEY` | Génération par Claude | [Anthropic Console](https://console.anthropic.com) → API Keys |
| `BRAVE_SEARCH_API_KEY` | Recherche de prospects | [Brave Search API](https://api-dashboard.search.brave.com) |

## Recommandées

| Variable | Rôle |
|---|---|
| `ADMIN_TOTP_SECRET` | Double authentification (TOTP). `npm run totp:generate`, ajoutez le secret dans votre application d’authentification, puis sur Vercel. Les sessions ouvertes sans 2FA sont alors invalidées. **Fortement recommandé** : sans 2FA, une attaque distribuée (40 échecs de connexion en une heure) suspend la connexion jusqu’à la fin de l’heure ; avec 2FA, le propriétaire peut toujours entrer. |
| `CRON_SECRET` | Protège `/api/cron` (Vercel l’envoie automatiquement en `Authorization: Bearer`). 16 caractères minimum. |
| `ANTHROPIC_MODEL` | Modèle par défaut au premier lancement (`claude-sonnet-5-5`). Ensuite, le choix se fait dans Paramètres. |
| `APP_ORIGIN` | Origine publique (ex. `https://studio.harmony-solutions.fr`) : utilisée pour le contrôle d’origine et l’autorisation d’encadrement des aperçus. |
| `PREVIEW_ORIGIN` | Domaine **distinct** pointant vers le même projet Vercel (ex. `https://apercu.harmony-solutions.fr`) : isole encore davantage les aperçus. |

## Facultatives

| Variable | Rôle |
|---|---|
| `SANDBOX_ENABLED=1` (+ `SANDBOX_VERCEL_TOKEN`, `SANDBOX_VERCEL_TEAM_ID`, `SANDBOX_VERCEL_PROJECT_ID` hors Vercel) | Active le runner Vercel Sandbox (construction et tests des applications générées). Sur Vercel, l’authentification OIDC est automatique. |
| `GITHUB_TOKEN`, `GITHUB_OWNER` | Dépôts **privés** des projets clients. Jeton *fine-grained* limité au compte/organisation, permissions : Administration (lecture/écriture, pour créer le dépôt) et Contents (lecture/écriture). |
| `VERCEL_DEPLOY_TOKEN`, `VERCEL_DEPLOY_TEAM_ID` | Déploiement des sites clients (jeton dédié, idéalement limité à une équipe réservée aux sites clients — jamais celui du projet Harmony Studio). |
| `CRON_HOURLY=1` | Cron horaire (Vercel Pro) pour respecter l’heure choisie par recherche ; modifier aussi `vercel.json` (`0 * * * *`). |
| `SESSION_TTL_HOURS` (72), `SESSION_IDLE_HOURS` (12) | Durée maximale d’une session et délai d’inactivité. |
| `DATABASE_DRIVER` | `neon` ou `pg` (par défaut : `neon`, ou `pg` pour localhost). |
| `HARMONY_MOCKS=1` | **Tests locaux uniquement** : réponses Brave/Claude simulées et marquées. Ignoré si `VERCEL`/`VERCEL_ENV` est défini. |

## Coûts à prévoir (relevés le 21/10/2026 — à vérifier)

- **Claude (API Anthropic)** : facturé à l’usage, distinct de l’abonnement Claude.ai (Pro/Max). Grille par défaut (USD / million de tokens) : Sonnet 5.5 = 2 $ en entrée / 10 $ en sortie ; Opus 5.5 = 4 / 20 ; Haiku 5.5 = 0,10 / 0,50. Un site vitrine de 5 pages demande typiquement 7 à 9 appels ; le coût réel s’affiche à chaque étape et dans Journal & coûts. Plafonds : budget mensuel et budget par génération (Paramètres).
- **Brave Search API** : offre gratuite supprimée début 2026 ; environ 5 $ / 1 000 requêtes avec 5 $ de crédit mensuel. Plafond mensuel de requêtes configurable (1 000 par défaut).
- **Vercel** : Pro recommandé (usage commercial, fonctions jusqu’à 800 s, cron horaire). Hobby : usage non commercial, cron quotidien, 300 s max.
- **Vercel Sandbox** (facultatif) : Hobby 5 h CPU/mois incluses ; Pro ≈ 0,128 $/h CPU + 0,0212 $/Go·h mémoire (une construction de 5 à 10 min coûte quelques centimes).
- **Neon** : le stockage des médias privés (BYTEA) consomme l’espace de la base ; la formule gratuite (0,5 Go) convient pour démarrer, Launch pour un usage régulier.

## Rotation des secrets

| Secret | Procédure | Effet |
|---|---|---|
| Mot de passe | `npm run hash-password` → remplacer `ADMIN_PASSWORD_HASH` → redéployer | Les sessions existantes restent valides : utilisez « Déconnecter les autres sessions » |
| `SESSION_SECRET` | Nouvelle valeur → redéployer | Invalide les jetons d’aperçu ; à faire au moindre doute |
| `ADMIN_TOTP_SECRET` | `npm run totp:generate` → ré-enrôler l’application → redéployer | Toutes les sessions sans 2FA valide sont refusées |
| Clés Anthropic / Brave / GitHub / Vercel | Révoquer dans la console du fournisseur, créer une nouvelle clé, mettre à jour Vercel | Immédiat après redéploiement |
| `CRON_SECRET` | Nouvelle valeur → redéployer | Vercel utilise automatiquement la nouvelle |

Ne jamais coller une clé dans l’interface, un ticket, un message ou un dépôt Git. `.env*` est ignoré par Git ; `npm run self-check` vérifie `.env.example`.
