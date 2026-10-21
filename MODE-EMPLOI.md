# Mode d’emploi — Harmony Studio

## 1. Je me connecte
1. Ouvrez l’adresse de votre Studio. Saisissez votre e-mail, votre mot de passe et, si la double authentification est active, le code à 6 chiffres de votre application.
2. Après 5 erreurs depuis votre connexion internet, l’accès est bloqué 15 minutes. En cas d’attaque massive (40 échecs en une heure au total), seule une connexion avec le code 2FA reste possible : activez la 2FA (Paramètres → Sécurité). Une session expire après 12 h sans activité et au plus tard après 3 jours.
3. Pour vous déconnecter : barre latérale → « Se déconnecter ». Paramètres → Sécurité permet de fermer toutes vos autres sessions.

## 2. Je trouve un prospect
1. **Opportunités → Rechercher**. Choisissez une stratégie :
   - **Demande explicite** : annonces où quelqu’un cherche réellement un site, une refonte, un logiciel…
   - **Signal d’opportunité** : entreprises identifiées (ex. boulangeries à Creil). Elles n’ont rien demandé : c’est une **hypothèse** à valider.
   - **Projet / marché** : appels d’offres et consultations.
2. Cochez les zones, les métiers, les besoins, la fraîcheur, puis **Lancer l’analyse**. Le bilan indique les nouvelles pistes, celles déjà connues et celles **écartées** (agences, offres d’emploi, classements…) avec la raison.
3. **Enregistrer** une recherche permet de la relancer en un clic et de l’activer en veille (Recherches & veille → crayon → « Activer la veille »).

## 3. Je qualifie et je suis un prospect
1. Cliquez sur un nom : la fiche montre la **preuve** (extrait, source, date), le besoin (exprimé ou supposé), la confiance et « Pourquoi ce score ? ».
2. « Chercher son site » puis « Analyser le site » donnent des **indices** (pas de HTTPS, pas adapté au mobile, copyright ancien…).
3. Changez le **statut** (À examiner → Qualifié → À contacter → …), ajoutez des **notes**, planifiez une **relance** avec date. Vue **Pipeline** : faites glisser les cartes d’une colonne à l’autre.
4. **Préparer un message** : choisissez le canal et le ton ; Claude rédige à partir des seuls faits vérifiés (ou « Modèle simple », gratuit). Relisez, copiez, **envoyez vous-même**, puis cliquez **J’ai contacté** (une relance peut être créée automatiquement).
5. Si la personne refuse d’être contactée : **Enregistrer une opposition**. Pour un effacement : **Supprimer définitivement**.
6. **Exporter CSV** (compatible Excel) ou **Importer** un fichier CSV depuis la page Opportunités.

## 4. Je prépare un devis
Fiche prospect → **Créer un devis**, ou menu **Devis → Nouveau devis**. Ajoutez des prestations depuis les **tarifs de référence** (modifiables dans Paramètres → Tarifs & TVA) ou des lignes libres. Choisissez le régime de TVA (à confirmer avec votre comptable). **Imprimer / PDF** ouvre une version propre à enregistrer en PDF. Passez le statut à « Envoyé » quand vous l’avez envoyé.

## 5. Je crée un site avec des photos
1. **Nouveau projet** : nom, client, métier, ville.
2. **Livrable** : « Site vitrine multi-pages » par exemple ; technologie **React + Motion** (recommandé) et **intensité du motion** (Sobre, Dynamique, Spectaculaire).
3. **Brief** : 2–3 phrases suffisent (« Site premium avec carte de produits et prise de contact »). Ajoutez les données confirmées (téléphone, horaires…) : tout ce qui manque restera « À renseigner », jamais inventé.
4. **Médias** : glissez vos photos et votre logo (stockés en privé, originaux conservés). Ajoutez une courte description.
5. **Style** : style, palette, appel à l’action, fonctionnalités vraiment nécessaires → **Créer et lancer la planification**.
6. Claude propose un **plan** (brief enrichi, pages, palette). Modifiez-le si besoin, répondez aux questions bloquantes, puis **Valider le plan et générer**. Suivez les étapes et leur coût en direct. Vous pouvez fermer l’onglet : le travail reprend à la réouverture du projet.

## 6. Je vérifie et je corrige
- **Aperçu** : boutons ordinateur / tablette / mobile, « Onglet isolé » pour l’ouvrir en grand. Le lien d’aperçu est valable 30 minutes et uniquement pendant votre session : « Recharger » en crée un nouveau.
- **Échanges** : écrivez « change le hero », « ajoute une page prestations », « rends la version mobile plus lisible »… Seuls les fichiers nécessaires sont modifiés.
- **Versions** : « Différences » montre exactement ce qui a changé ; « Restaurer » recrée une version identique à une ancienne (rien n’est effacé).
- **Qualité** : erreurs, avertissements et ce qui n’a pas été vérifié automatiquement. « Corriger automatiquement » lance une correction ciblée.
- **Brief** : complétez les informations ou les règles propres au projet, puis demandez une modification.

## 7. Je télécharge
**ZIP** (en haut du projet) : code source complet, photos optimisées et rapport qualité. Pour un site React : `npm install` puis `npm run build`, ou import direct dans Vercel.

## 8. Je publie
1. Vérifiez les « À renseigner », les mentions légales et la matrice d’audit (Paramètres → Matrices → Audit).
2. **Approuver** le projet.
3. Onglet **Publier** : GitHub (dépôt privé) et/ou **Déployer en preview** sur Vercel, puis **Mettre en production** (saisie de « PRODUCTION » demandée). Rien n’est publié sans votre confirmation.

## 9. Je règle le Studio
- **Paramètres → Intégrations & coûts** : état des clés, modèles Claude, **budget mensuel** et **plafond par génération**, grille tarifaire.
- **Paramètres → Matrices** : modifier, versionner, réactiver ou restaurer les matrices Design / Technique / SEO / Audit ; « Prompt composé » montre ce qui est envoyé à Claude.
- **Journal & coûts** : consommation par jour et par opération, journal des actions.
- Raccourcis : **Ctrl + K** (ou /) pour la recherche globale ; thème clair/sombre dans la barre latérale.
