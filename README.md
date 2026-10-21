# Harmony Studio — Harmony Solutions

Cockpit **privé** (un seul propriétaire) qui réunit deux espaces :

- **Prospection intelligente** : recherche d’opportunités réelles et sourcées (Brave Search API), qualification explicable, CRM avec pipeline, relances, devis, conformité RGPD.
- **Création IA** : une idée + des photos → un vrai projet généré par Claude (sites **React + Motion** ou HTML, applications Next.js), avec plan validé, aperçu isolé, modifications par conversation, versions, contrôles qualité et export.

Interface 100 % en français, responsive, thème clair/sombre. Hébergement : **Vercel** + **Neon PostgreSQL**.

> Mode d’emploi pas à pas : [MODE-EMPLOI.md](MODE-EMPLOI.md) · Déploiement : [DEPLOYMENT.md](DEPLOYMENT.md) · Variables : [ENVIRONMENT.md](ENVIRONMENT.md) · Sécurité : [SECURITY.md](SECURITY.md) · Sauvegarde : [BACKUP.md](BACKUP.md) · Audit : [AUDIT-FINAL.md](AUDIT-FINAL.md)

## Ce qui est réellement implémenté et testé

| Domaine | Fonctionnalités | Vérification |
|---|---|---|
| Accès | Compte unique (scrypt renforcé), sessions en base révocables, cookie `HttpOnly`/`Secure`/`SameSite=Strict`, expiration absolue (3 j) et d’inactivité (12 h), 2FA TOTP facultative avec anti-rejeu, limitation des tentatives qui ne peut pas bloquer le propriétaire équipé de la 2FA, contrôle d’origine (CSRF), CSP à nonce | tests d’intégration + E2E |
| Prospection | 3 stratégies distinctes (demandes explicites, signaux d’opportunité, projets/marchés), zones, métiers, besoins, fraîcheur, requêtes variées, rejet des faux positifs (agences, emplois, classements, profils freelances), déduplication (URL canonique + entité), provenance et preuves, score explicable, recherches enregistrées, veille planifiée (Vercel Cron), historique des exécutions | tests unitaires + intégration (Brave simulé) |
| CRM | Tableau + pipeline glisser-déposer, fiche détaillée, notes, tâches/relances, historique, tags, favoris, archivage, actions groupées, import/export CSV (anti-injection de formules), assistant de message (Claude ou modèle), contact « déclaré » (aucun envoi automatique), opposition RGPD, effacement, purge selon durée de conservation, analyse de site (anti-SSRF, respect de robots.txt) | intégration + E2E |
| Devis | Catalogue de tarifs de référence modifiable, régime de TVA configurable (à définir / franchise / assujetti), totaux calculés côté serveur, numérotation, version imprimable/PDF signalant les mentions manquantes | intégration |
| Création IA | Assistant en 5 étapes, médias **privés** (upload découpé, type réel vérifié, EXIF, originaux conservés, dérivés), 4 matrices génériques versionnées (Design, Technique, SEO, Audit) issues de vos fichiers, pipeline persistant étape par étape (plan à valider → génération → assemblage → compilation → contrôles → correction automatique → version), budget plafonné, coûts par étape, aperçu isolé (jeton signé + CSP `sandbox`), desktop/tablette/mobile, modifications ciblées, différentiel, restauration, ZIP, GitHub privé et déploiement Vercel avec confirmation | intégration + E2E (Claude simulé) + build Vite réel du site exporté |
| Kit React + Motion | Coquille, routeur, transitions de pages, Reveal, Stagger, TextReveal, Parallax/ParallaxImage, Magnetic, TiltCard, Marquee, CountUp, ScrollProgress, formulaire honnête (mailto), composants « À renseigner » / « Non configuré », `prefers-reduced-motion` | compilation esbuild + `vite build` réel |

**Non vérifié en conditions réelles (clés absentes dans l’environnement de développement)** : appels réels à Claude, à Brave, à GitHub, à Vercel et au runner Vercel Sandbox. Leur code est implémenté et testé contre des réponses simulées conformes aux API officielles ; un premier essai avec vos clés est indispensable (voir DEPLOYMENT.md, « Recette après déploiement »).

## Architecture

```
app/
  page.tsx                 connexion
  (app)/                   pages privées (session vérifiée côté serveur) : dashboard, prospection, taches, devis, creation, parametres, journal
  impression/devis/[id]    version imprimable
  apercu/[token]/…         serveur d’aperçu isolé (jeton signé, CSP sandbox)
  api/…                    ~60 routes privées (adminRoute : session + origine + limitation) + health + cron
lib/server/                logique serveur (jamais importée côté navigateur)
  auth, api, http, ratelimit, totp, db, settings, env, audit, safe-fetch
  prospects/               moteur de recherche, classification, score, CSV, analyse de site
  ai/                      client Claude (streaming, coûts, budget), matrices, consignes, format de fichiers, simulation
  studio/                  jobs, médias, versions, contrôles, aperçu, sites React, export/GitHub/Vercel, runner
templates/react-site/      kit React + Motion injecté dans chaque site client
db/migrations/             001 (V1), 002 (V2), 003 (React) — non destructives ; db/rollback/ pour revenir en arrière
db/reference/              vos fichiers d’origine (matrice Royal, audit final)
tests/                     unitaires, intégration (Postgres réel), E2E Playwright
```

Choix techniques : Next.js 15 (App Router) + React 19 + TypeScript strict, **Zod** pour toute validation, **SQL paramétré** via un unique utilitaire (`lib/server/db.ts` : driver HTTP Neon en production, `pg` en local), migrations SQL versionnées (`npm run db:migrate`), CSS maison (aucun framework), `lucide-react` pour les icônes, `sharp` pour les images, `esbuild` pour compiler les aperçus React sans exécuter le code généré.

## Démarrage local

Prérequis : Node.js 22 (22.12 ou plus récent), PostgreSQL 14+ (ou une base Neon).

```bash
npm ci
cp .env.example .env.local        # puis compléter (voir ENVIRONMENT.md)
npm run hash-password             # → ADMIN_PASSWORD_HASH
npm run db:migrate                # applique les migrations
npm run dev                       # http://localhost:3000
```

Sans clés Claude/Brave, vous pouvez tester toute la mécanique avec `HARMONY_MOCKS=1` (réponses simulées, clairement marquées « SIMULATION » / « Donnée de test », impossible sur Vercel).

## Tests

```bash
npm run typecheck
npm run lint
npm test                      # unitaires + intégration (nécessite PostgreSQL local : postgresql://postgres@localhost:5432)
npm run build && npm start    # puis, dans un autre terminal :
npm run test:e2e              # Playwright (base locale, HARMONY_MOCKS=1, port 3100 par défaut — voir playwright.config.ts)
```

Résultats de la dernière exécution : voir [AUDIT-FINAL.md](AUDIT-FINAL.md#test-status).

## Reprise de la V1

La V1 n’est pas jetée : la migration `002` conserve prospects, projets, versions HTML et votre matrice personnalisée (statuts remappés, HTML converti en version `index.html`, sources et notes historisées). Les photos V1 stockées en Vercel Blob **public** peuvent être rapatriées en stockage privé depuis le projet concerné (bouton « Rapatrier en stockage privé »). Le code V1 reste consultable dans l’historique Git (premier commit).

## Limites connues (honnêtes)

- Les résultats de recherche dépendent de l’index Brave : certaines annonces, réseaux sociaux ou plateformes ne sont pas indexés. Aucun scraping de plateformes protégées n’est réalisé.
- Une demande « explicite » est détectée automatiquement dans un extrait : il faut toujours relire la source avant de contacter.
- Les applications métier générées doivent être construites et testées dans le runner isolé (Vercel Sandbox) ; sans lui, elles restent au statut « Construction » et ne sont jamais déclarées fonctionnelles.
- Les sites React sont des applications monopage : le contenu est rendu par JavaScript (Google l’indexe ; d’autres robots moins bien). Titres et descriptions sont posés par page ; un pré-rendu statique pourra être ajouté.
- Aucune intégration de paiement, de réservation ou d’envoi d’e-mail n’est branchée par défaut dans les sites générés : elles apparaissent « non configurées ».
