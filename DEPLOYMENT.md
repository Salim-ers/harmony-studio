# Déploiement sur Vercel

## 1. Base Neon

1. Créez un projet sur [console.neon.tech](https://console.neon.tech) (région Europe, ex. Francfort).
2. Copiez la *connection string* (avec `sslmode=require`).
3. Réglez l’historique de restauration (Settings → Postgres → History window) au maximum de votre formule (voir BACKUP.md).
4. Appliquez les migrations **depuis votre poste** :
   ```bash
   DATABASE_URL="postgresql://…" npm run db:migrate
   DATABASE_URL="postgresql://…" npm run db:status
   ```
   Base V1 existante : faites d’abord une sauvegarde (BACKUP.md), puis lancez la même commande — `001` est rejouable sans effet, `002` et `003` reprennent les données V1.

## 2. Projet Vercel

1. Poussez ce dossier dans un dépôt GitHub **privé** (le dépôt ne contient aucun secret).
2. Vercel → *Add New Project* → importer le dépôt (framework Next.js détecté). Plan **Pro** recommandé pour un usage professionnel.
3. *Settings → Environment Variables* : renseignez les variables d’[ENVIRONMENT.md](ENVIRONMENT.md) pour **Production** (et Preview si vous utilisez des previews : idéalement une base Neon distincte, une *branch* Neon).
4. *Settings → Functions* : vérifiez que Fluid compute est actif (par défaut). Les étapes de génération utilisent `maxDuration = 300` (compatible Hobby et Pro).
5. *Settings → Deployment Protection* : activez **Vercel Authentication** pour les déploiements *Preview* (le Studio a sa propre connexion, mais les previews ne doivent pas être publiques).
6. Déployez. Ouvrez l’URL : vous arrivez sur la page de connexion.

## 3. Domaines

- Domaine principal du Studio, ex. `studio.harmony-solutions.fr` → `APP_ORIGIN=https://studio.harmony-solutions.fr`.
- (Recommandé) un second domaine pour les aperçus, ex. `apercu.harmony-solutions.fr`, ajouté au **même** projet → `PREVIEW_ORIGIN=https://apercu.harmony-solutions.fr`. Les aperçus sont alors servis depuis une origine distincte en plus de la CSP `sandbox`.
- HSTS est envoyé en production (`max-age=31536000`). N’ajoutez `includeSubDomains`/`preload` qu’en connaissance de cause.

## 4. Veille planifiée

`vercel.json` déclare un cron quotidien (`30 5 * * *` UTC ≈ 7 h 30 heure de Paris l’été, 6 h 30 l’hiver ; précision ±59 min sur Hobby). Il exécute les recherches enregistrées dont la veille est active pour le jour courant, la veille V1, le nettoyage (sessions, limites, médias orphelins) et l’alerte RGPD hebdomadaire. Sur Pro, pour respecter l’heure de chaque recherche : `"schedule": "0 * * * *"` + `CRON_HOURLY=1`.

## 5. Runner isolé (applications métier)

1. *Vercel → Sandbox* : activez la fonctionnalité pour l’équipe.
2. `SANDBOX_ENABLED=1` (sur Vercel, l’OIDC fournit l’authentification).
3. Le runner : micro-VM éphémère, 2 vCPU, réseau limité au registre npm pendant l’installation puis coupé, **aucune variable d’environnement** transmise, arrêt systématique. Coûts : voir ENVIRONMENT.md.
Sans runner, les applications générées restent au statut « Construction » avec un message explicite.

## 6. Publication des sites clients

- **ZIP** : toujours disponible.
- **GitHub** : `GITHUB_TOKEN` + `GITHUB_OWNER` ; dépôt créé **privé**, refus si le dépôt existe et est public.
- **Vercel** : `VERCEL_DEPLOY_TOKEN` (jeton dédié, équipe dédiée aux clients de préférence). Preview par défaut ; production uniquement pour un projet « Approuvé », avec saisie de « PRODUCTION ». Les sites React sont construits par Vercel (préréglage Vite). Définissez `SITE_URL` dans le projet Vercel du client pour générer `sitemap.xml`.

## 7. Recette après déploiement (avec vos vraies clés)

1. `GET /api/health` → `{"status":"ok","database":"ok","migrations":"à jour"}`.
2. Connexion (+ 2FA). Paramètres → Intégrations : tout ce qui est requis est « Configuré ».
3. Prospection → « recherche site internet Oise » (Demandes explicites, 2 requêtes) : vérifiez sources, dates, rejets.
4. Prospection → Signal, Creil, Boulangerie : ouvrez une fiche, « Chercher son site », « Analyser le site ».
5. Nouveau projet (vitrine React, 2–3 photos) avec budget par génération à 2 $ : validez le plan, laissez générer, vérifiez coûts, aperçu desktop/mobile, contrôles qualité, ZIP.
6. Modification ciblée, différentiel, restauration.
7. Journal & coûts : comparez avec la console Anthropic sous 24 h.

## 8. Mise à jour

```bash
git pull
npm ci
npm run typecheck && npm test
DATABASE_URL="…" npm run db:migrate   # avant le déploiement si une migration est ajoutée
git push                              # Vercel redéploie
```

Retour arrière applicatif : *Vercel → Deployments → Promote* une version précédente. Retour arrière de schéma : `db/rollback/*.down.sql` (après sauvegarde, voir BACKUP.md).
