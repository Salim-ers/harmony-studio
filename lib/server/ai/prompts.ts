/** Consignes envoyées à Claude pour chaque étape. Le contenu métier vient du brief et des matrices. */
import { z } from 'zod';
import type { BriefData } from './matrices';
import { KIT_API_DOC, type RoutePlan } from '../studio/react-site';

export const planSchema = z.object({
  brief_enrichi: z.string().min(10),
  concept: z.string().default(''),
  palette: z.array(z.object({ nom: z.string(), hex: z.string() })).default([]),
  typographies: z.object({ titres: z.string().default(''), texte: z.string().default('') }).default({ titres: '', texte: '' }),
  pages: z.array(z.object({ fichier: z.string(), titre: z.string(), objectif: z.string().default(''), sections: z.array(z.string()).default([]) })).min(1).max(12),
  photos: z.array(z.object({ fichier: z.string(), description: z.string().default(''), usage: z.string().default('') })).default([]),
  fonctionnalites: z.array(z.object({ nom: z.string(), mise_en_oeuvre: z.string().default(''), statut: z.string().default('') })).default([]),
  a_renseigner: z.array(z.string()).default([]),
  questions_bloquantes: z.array(z.string()).default([]),
  modules: z.array(z.object({ nom: z.string(), description: z.string().default(''), fichiers: z.array(z.string()).default([]) })).default([]),
  modele_donnees: z.string().default(''),
  roles: z.array(z.string()).default([]),
  integrations: z.array(z.object({ nom: z.string(), statut: z.string().default('Non configurée') })).default([]),
});
export type Plan = z.infer<typeof planSchema>;

const FORMAT_RULES = `FORMAT DE SORTIE OBLIGATOIRE
Pour chaque fichier, écris exactement :
<<<FICHIER chemin="chemin/relatif/du/fichier.ext">>>
(contenu complet du fichier, sans bloc de code markdown)
<<<FIN>>>
Termine par :
<<<RESUME>>>
(3 à 6 lignes en français : ce qui a été fait, points « À renseigner », limites)
<<<FIN>>>
Aucun texte hors de ces blocs.`;

export function systemPrompt(composedMatrices: string, kind: 'static' | 'app') {
  return `Tu es l'équipe de production senior de Harmony Solutions (direction artistique, développement, SEO, accessibilité, sécurité).
Tu produis du code RÉEL, complet et fonctionnel, en français, pour un client de Harmony Solutions.
Règles absolues :
- Ne jamais inventer d'informations sur le client (avis, chiffres, tarifs, horaires, adresse, téléphone, équipe, certifications, SIRET). Une information absente devient « À renseigner » visible.
- Ne jamais ajouter de contenu, de rubrique ou de vocabulaire d'un autre métier ou d'un autre client.
- Aucun bouton ou formulaire factice : destination réelle ou mention explicite « non configuré ».
- ${kind === 'static' ? 'Site statique multi-fichiers : HTML/CSS/JS sans dépendance, chemins RELATIFS uniquement, images uniquement depuis le dossier images/ fourni.' : 'Application Next.js (App Router, TypeScript strict) déployable sur Vercel avec base PostgreSQL : composants serveur, routes API validées (zod), migrations SQL, authentification/autorisations côté serveur, tests (vitest), .env.example sans secret, README.'}

=== MATRICES HARMONY SOLUTIONS (référence de qualité et de règles) ===
${composedMatrices}`;
}

function briefBlock(brief: BriefData, deliverableLabel: string) {
  const lines: [string, string | undefined][] = [
    ['Client / projet', brief.clientName], ['Métier / domaine', brief.sector], ['Ville', brief.city], ['Zone de chalandise', brief.zone],
    ['Type de livrable', deliverableLabel], ['Brief libre', brief.brief], ['Style souhaité', brief.style], ['Palette', brief.palette],
    ['Typographies', brief.typography], ['Fonctionnalités requises', brief.features?.join(', ')], ['CTA principal', brief.cta],
    ['Prestations réelles', brief.services], ['Objectifs', brief.objectives], ['Clientèle', brief.audience], ['Adresse', brief.address],
    ['Téléphone', brief.phone], ['E-mail', brief.email], ['Horaires', brief.hours], ['Réseaux sociaux', brief.socials],
    ['Tarifs confirmés', brief.prices], ['Mentions légales', brief.legal], ['Références autorisées', brief.references],
    ['Contraintes', brief.constraints], ['Pages souhaitées', brief.pages],
  ];
  return lines.map(([k, v]) => `- ${k} : ${v && v.trim() ? v.trim() : 'non fourni'}`).join('\n');
}

export function planPrompt(p: { brief: BriefData; deliverableLabel: string; kind: 'static' | 'app'; assets: { slug: string; role: string; alt: string }[]; answers?: string; feedback?: string }) {
  const assetList = p.assets.length ? p.assets.map((a) => `- images/${a.slug} (${a.role}${a.alt ? ` — ${a.alt}` : ''})`).join('\n') : '- aucun média fourni';
  return `[[etape:plan]]
Analyse ce brief et les médias joints (si présents), puis propose le plan de conception.

BRIEF
${briefBlock(p.brief, p.deliverableLabel)}

MÉDIAS DISPONIBLES (chemins à utiliser tels quels)
${assetList}
${p.answers ? `\nRÉPONSES DU PROPRIÉTAIRE AUX QUESTIONS PRÉCÉDENTES\n${p.answers}\n` : ''}${p.feedback ? `\nCORRECTIONS DEMANDÉES SUR LE PLAN PRÉCÉDENT\n${p.feedback}\n` : ''}
CONSIGNES
- Un brief de 2–3 phrases doit suffire : enrichis-le intelligemment SANS inventer de faits (ce qui manque va dans "a_renseigner").
- Choisis uniquement les pages utiles à CE métier et à CE livrable (${p.kind === 'static' ? '1 page pour une landing ou une carte de visite, 3 à 7 pages pour une vitrine' : 'les écrans et modules nécessaires'}).
- "questions_bloquantes" : uniquement ce qui empêche réellement de produire (ex. fournisseur de paiement, destinataire du formulaire) — souvent aucune.
- Pour chaque photo, décris-la objectivement et propose son usage.
- Fonctionnalités : précise la mise en œuvre réelle et le statut ("statique", "non configuré", "intégration requise : …").
${p.kind === 'app' ? '- Application : décris les modules (avec la liste des fichiers prévus), le modèle de données, les rôles et les intégrations (statut "Non configurée" si clés absentes).' : '- Les noms de fichiers des pages sont en minuscules, sans accent, terminés par .html ; la première est index.html.'}

Réponds UNIQUEMENT avec un objet JSON valide de la forme :
{"brief_enrichi":"…","concept":"…","palette":[{"nom":"…","hex":"#…"}],"typographies":{"titres":"…","texte":"…"},
"pages":[{"fichier":"index.html","titre":"Accueil","objectif":"…","sections":["…"]}],
"photos":[{"fichier":"images/…","description":"…","usage":"…"}],
"fonctionnalites":[{"nom":"…","mise_en_oeuvre":"…","statut":"…"}],
"a_renseigner":["…"],"questions_bloquantes":[],
"modules":[{"nom":"…","description":"…","fichiers":["…"]}],"modele_donnees":"…","roles":["…"],"integrations":[{"nom":"…","statut":"Non configurée"}]}`;
}

function planBlock(plan: Plan) {
  return `PLAN VALIDÉ
Brief enrichi : ${plan.brief_enrichi}
Concept : ${plan.concept}
Palette : ${plan.palette.map((c) => `${c.nom} ${c.hex}`).join(', ') || 'à définir'}
Typographies : titres ${plan.typographies.titres || 'à définir'} / texte ${plan.typographies.texte || 'à définir'}
Pages :
${plan.pages.map((pg) => `- ${pg.fichier} — ${pg.titre} : ${pg.objectif} [${pg.sections.join(' ; ')}]`).join('\n')}
Photos :
${plan.photos.map((ph) => `- ${ph.fichier} : ${ph.description} → ${ph.usage}`).join('\n') || '- aucune'}
Fonctionnalités : ${plan.fonctionnalites.map((f) => `${f.nom} (${f.statut || f.mise_en_oeuvre})`).join(' ; ') || 'aucune'}
À renseigner : ${plan.a_renseigner.join(' ; ') || 'rien'}`;
}

export function designSystemPrompt(plan: Plan, brief: BriefData) {
  return `[[etape:design-system]]
${planBlock(plan)}

Données confirmées du client : nom ${brief.clientName || 'À renseigner'}, téléphone ${brief.phone || 'À renseigner'}, e-mail ${brief.email || 'À renseigner'}, adresse ${brief.address || 'À renseigner'}.

Produis le SYSTÈME DE DESIGN partagé par toutes les pages :
1. assets/css/styles.css — variables CSS (palette, typographies, espacements, rayons, ombres), reset, typographie, header fixe (état compact au scroll via classe .is-scrolled), menu mobile, boutons, cartes, grilles, sections, footer, formulaires, classe .a-renseigner (repère visible des données manquantes), animations d'apparition (.reveal / .is-visible), @media (prefers-reduced-motion: reduce) qui neutralise toutes les animations, responsive mobile-first.
2. assets/js/main.js — menu mobile accessible (aria-expanded, Échap), header compact au scroll, apparitions au scroll (IntersectionObserver), année courante dans le footer, sans dépendance.
3. _layout.html — gabarit HTML de référence : <head> type (meta charset, viewport, title/description à remplacer par {{TITRE}} et {{DESCRIPTION}}, Open Graph, favicon favicon.svg, feuille de style, script defer), <header> avec logo/nom et navigation vers TOUTES les pages du plan + CTA principal, <footer> complet. Marque l'emplacement du contenu par <!-- CONTENU -->.
4. favicon.svg — monogramme simple dérivé de la marque.

${FORMAT_RULES}`;
}

export function pagePrompt(plan: Plan, page: Plan['pages'][number], layout: string, css: string) {
  return `[[etape:page]] [[cible:${page.fichier}]]
${planBlock(plan)}

GABARIT COMMUN (_layout.html) À RÉUTILISER À L'IDENTIQUE (header, footer, head) :
${layout.slice(0, 20000)}

CLASSES ET VARIABLES DISPONIBLES (assets/css/styles.css, extrait) :
${css.slice(0, 18000)}

Produis la page « ${page.titre} » (${page.fichier}) : objectif « ${page.objectif} », sections ${page.sections.join(' ; ')}.
- Document HTML complet basé sur le gabarit : remplace {{TITRE}} et {{DESCRIPTION}} par un title et une meta description UNIQUES, marque le lien de navigation actif avec aria-current="page".
- Un seul H1, sections différenciées visuellement, contenu riche et spécifique au métier, aucune invention.
- Styles propres à la page : de préférence via les classes existantes ; si nécessaire, un fichier assets/css/${page.fichier.replace(/\.html$/, '')}.css référencé dans le <head>.
- Images uniquement depuis images/ (chemins du plan), avec alt, width/height si connus, loading="lazy" hors hero.

${FORMAT_RULES}`;
}

export function modifyPrompt(p: { instruction: string; plan: Plan | null; files: { path: string; content: string }[]; allPaths: string[]; assets: { slug: string; role: string; alt: string }[]; kind: 'static' | 'app' }) {
  return `[[etape:modification]]
${p.plan ? planBlock(p.plan) : ''}

DEMANDE DE MODIFICATION DU PROPRIÉTAIRE
« ${p.instruction} »

Règles :
- Ne modifie QUE ce qui est nécessaire à la demande. Préserve toutes les fonctionnalités, pages, contenus et liens existants qui ne sont pas concernés (ex. ne touche pas au contact si la demande ne le vise pas).
- Renvoie uniquement les fichiers modifiés ou créés, chacun en ENTIER. Pour supprimer un fichier : <<<SUPPRIMER chemin="…">>>.
- Si une nouvelle page est créée, mets à jour la navigation de toutes les pages et sitemap.xml.
- Médias disponibles : ${p.assets.map((a) => `images/${a.slug} (${a.role}${a.alt ? `, ${a.alt}` : ''})`).join(' ; ') || 'aucun'}.

Fichiers du projet : ${p.allPaths.join(', ')}

CONTENU ACTUEL DES FICHIERS UTILES :
${p.files.map((f) => `<<<FICHIER chemin="${f.path}">>>\n${f.content}\n<<<FIN>>>`).join('\n')}

${FORMAT_RULES}`;
}

export function fixPrompt(p: { problems: string[]; files: { path: string; content: string }[] }) {
  return `[[etape:correction]]
Le contrôle qualité automatique a relevé ces problèmes BLOQUANTS :
${p.problems.map((x) => `- ${x}`).join('\n')}

Corrige-les de façon ciblée, sans changer la direction artistique ni retirer de fonctionnalité. Renvoie uniquement les fichiers modifiés, en entier.

FICHIERS CONCERNÉS :
${p.files.map((f) => `<<<FICHIER chemin="${f.path}">>>\n${f.content}\n<<<FIN>>>`).join('\n')}

${FORMAT_RULES}`;
}

export function scaffoldPrompt(plan: Plan, brief: BriefData) {
  return `[[etape:scaffold]]
${planBlock(plan)}
Modèle de données : ${plan.modele_donnees}
Rôles : ${plan.roles.join(', ')}
Modules : ${plan.modules.map((m) => `${m.nom} (${m.description})`).join(' ; ')}
Intégrations : ${plan.integrations.map((i) => `${i.nom} : ${i.statut}`).join(' ; ') || 'aucune'}
Client : ${brief.clientName || 'À renseigner'}

Produis le SOCLE de l'application Next.js (App Router, TypeScript strict) :
package.json (scripts dev/build/start/typecheck/test, versions exactes et récentes, dépendances minimales : next, react, react-dom, zod, pg ; devDependencies typescript, vitest, @types/*), tsconfig.json, next.config.mjs (en-têtes de sécurité), .gitignore, .env.example (aucune valeur réelle), db/migrations/001_init.sql (tables, contraintes, index), lib/db.ts (pg, requêtes paramétrées), lib/auth.ts (sessions en base, mots de passe scrypt, cookies HttpOnly/Secure/SameSite), middleware.ts (protection des pages privées), app/layout.tsx, app/page.tsx, app/connexion/page.tsx, app/api/auth/login/route.ts, app/api/auth/logout/route.ts, app/api/health/route.ts, tests/auth.test.ts, README.md (installation, variables, déploiement Vercel, sauvegarde/restauration), DEPLOYMENT.md.
Aucune intégration tierce simulée : si une clé manque, l'interface affiche « Non configuré ».

${FORMAT_RULES}`;
}

export function modulePrompt(plan: Plan, module: Plan['modules'][number], context: { paths: string[]; keyFiles: { path: string; content: string }[] }) {
  return `[[etape:module]] [[cible:${module.nom}]]
${planBlock(plan)}
Modèle de données : ${plan.modele_donnees}
Rôles : ${plan.roles.join(', ')}

MODULE À PRODUIRE : ${module.nom} — ${module.description}
Fichiers prévus : ${module.fichiers.join(', ') || 'à déterminer'}

Fichiers existants : ${context.paths.join(', ')}
Fichiers de référence :
${context.keyFiles.map((f) => `<<<FICHIER chemin="${f.path}">>>\n${f.content.slice(0, 12000)}\n<<<FIN>>>`).join('\n')}

Produis ce module complet : pages (composants serveur), composants client minimaux, routes API (validation zod, contrôle d'accès serveur, requêtes paramétrées), migration SQL complémentaire si nécessaire (db/migrations/00X_*.sql), tests vitest. Réutilise lib/db.ts et lib/auth.ts.

${FORMAT_RULES}`;
}

export function messagePrompt(p: { channel: string; facts: string; company: string; valueProposition: string; signatory: string; tone: string }) {
  return `[[etape:message]]
Rédige un message de prospection B2B en français, canal : ${p.channel}.
Expéditeur : ${p.signatory} — ${p.company}. Proposition de valeur : ${p.valueProposition}

FAITS VÉRIFIÉS SUR LE PROSPECT (n'utilise RIEN d'autre) :
${p.facts}

Règles :
- Personnalisé à partir des faits ci-dessus uniquement ; ne prétends jamais connaître un besoin s'il est seulement supposé (formule-le comme une question).
- Ton ${p.tone}, concis (${p.channel === 'Téléphone' ? 'script d’appel en 5 étapes courtes avec réponses aux objections' : '90 à 160 mots'}), une seule demande claire (échange de 15 minutes).
- Conformité B2B France / RGPD : indiquer comment s'opposer à recevoir d'autres messages${p.channel === 'E-mail' ? ' (ligne finale « Si vous ne souhaitez plus être contacté, répondez simplement STOP. »)' : ''}.
- Pas de promesse chiffrée, pas de flatterie excessive, pas d'emoji.
Réponds en JSON : {"objet":"…","message":"…"} (objet vide si non pertinent).`;
}

// ───────────────────────── Sites React (Vite + Motion) ─────────────────────────

export function reactSystemAddendum(motion: string) {
  return `
=== RENDU REACT (prioritaire sur les consignes HTML statique) ===
Le site est un projet React 19 (Vite, React Router, Motion) déployé sur Vercel. Intensité du motion design demandée : « ${motion} ».
Motion design fort mais maîtrisé : hero spectaculaire (TextReveal, ParallaxImage, Magnetic), sections qui apparaissent (Reveal/Stagger), cartes interactives (TiltCard), rythme visuel varié. Jamais au détriment de la lisibilité ; le kit gère prefers-reduced-motion.
${KIT_API_DOC}`;
}

export function reactDesignSystemPrompt(plan: Plan, brief: BriefData, routes: RoutePlan[], motion: string) {
  return `[[etape:design-system-react]]
${planBlock(plan)}

Routes du site : ${routes.map((r) => `${r.path} → ${r.title}`).join(' ; ')}
Données confirmées : nom ${brief.clientName || 'À renseigner'}, téléphone ${brief.phone || 'À renseigner'}, e-mail ${brief.email || 'À renseigner'}, adresse ${brief.address || 'À renseigner'}, horaires ${brief.hours || 'À renseigner'}, réseaux ${brief.socials || 'À renseigner'}.

Produis le SOCLE VISUEL du site React :
1. src/site.config.js — export default { name, tagline, motion: '${motion}', contact: { phone, email, address }, hours, socials: [{ label, url }], nav: [{ label, to }] (une entrée par route), cta: { label, to } } ; toute donnée non confirmée vaut 'À renseigner' (jamais inventée), socials : [] si aucun.
2. src/styles/theme.css — variables CSS (palette, typographies, espacements, rayons, ombres, --accent), typographie fluide (clamp), .container, .section, .btn, .btn-primary, .btn-ghost, .card, .grid, header fixe (classe .is-scrolled compacte et opaque), menu mobile, hero, footer, focus visibles, responsive mobile-first. Polices Google Fonts possibles via @import (display=swap).
3. src/components/Layout.jsx — export default function Layout({ children }) : <ScrollProgress />, en-tête (logo/nom, NavLink pour chaque route avec état actif, CTA en <Magnetic>, menu mobile accessible avec aria-expanded et fermeture à l'Échap / au changement de page, header compact au scroll), {children}, pied de page complet (coordonnées via <Missing>, liens, mentions légales à renseigner). Liens internes via NavLink/Link.
4. public/favicon.svg — monogramme dérivé de la marque.

${FORMAT_RULES}`;
}

export function reactPagePrompt(plan: Plan, route: RoutePlan, page: Plan['pages'][number], context: { siteConfig: string; theme: string; layout: string }) {
  return `[[etape:page-react]] [[cible:${route.file}]]
${planBlock(plan)}

src/site.config.js :
${context.siteConfig.slice(0, 6000)}

src/styles/theme.css (extrait, classes disponibles) :
${context.theme.slice(0, 14000)}

src/components/Layout.jsx (pour cohérence, ne pas le renvoyer) :
${context.layout.slice(0, 6000)}

Produis la page « ${page.titre} » : fichier ${route.file}, composant par défaut ${route.component}, route ${route.path}.
Objectif : ${page.objectif}. Sections : ${page.sections.join(' ; ')}.
- Commence par <Seo title="…" description="…" /> (uniques), puis <main id="contenu"> avec UN SEUL <h1> (TextReveal as="h1" pour la page d'accueil).
- Exploite pleinement le kit motion, avec des sections visuellement différenciées et un contenu riche, concret, propre au métier — sans aucune invention.
- Styles propres à la page dans src/styles/pages/${route.component}.css importé par la page si nécessaire. Composants additionnels éventuels dans src/components/.
- Images : "images/…" du plan uniquement, avec alt et dimensions si connues.

${FORMAT_RULES}`;
}
