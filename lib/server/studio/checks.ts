/**
 * Contrôles qualité AUTOMATIQUES exécutés sur chaque version générée.
 * Ils vérifient ce qui est vérifiable statiquement (structure, SEO, liens, médias,
 * boutons factices, données inventées probables, contenu d'un autre métier).
 * Ils ne remplacent PAS une validation visuelle ni un audit complet : le rapport le dit.
 */
import { parse, type HTMLElement } from 'node-html-parser';
import type { GenFile } from '../ai/fileformat';
import type { BriefData } from '../ai/matrices';

export type CheckLevel = 'erreur' | 'avertissement' | 'info';
export type CheckItem = { id: string; level: CheckLevel; file: string; message: string };
export type CheckReport = {
  ran_at: string;
  kind: 'static' | 'app';
  items: CheckItem[];
  counts: Record<CheckLevel, number>;
  placeholders: number;
  not_executed: string[];
};

const FOREIGN_SECTORS: { sector: RegExp; terms: RegExp; label: string }[] = [
  { sector: /auto-?[ée]cole|conduite/i, terms: /\b(permis b|code de la route|s[ée]curit[ée] routi[èe]re|conduite accompagn[ée]e|auto-?[ée]cole)\b/i, label: 'auto-école' },
  { sector: /restaur|caf[ée]|brasserie|pizz|traiteur|bar/i, terms: /\b(r[ée]server une table|carte des vins|menu du jour)\b/i, label: 'restauration' },
  { sector: /boulang|p[âa]tiss/i, terms: /\b(viennoiseries|baguette tradition)\b/i, label: 'boulangerie' },
];

function textOf(el: HTMLElement) {
  return el.textContent.replace(/\s+/g, ' ').trim();
}

export function runStaticChecks(files: GenFile[], ctx: { brief: BriefData; assetSlugs: string[]; clientName: string }): CheckReport {
  const items: CheckItem[] = [];
  const add = (id: string, level: CheckLevel, file: string, message: string) => items.push({ id, level, file, message });
  const map = new Map(files.map((f) => [f.path, f.content]));
  const pages = files.filter((f) => f.path.endsWith('.html') && !f.path.startsWith('_'));
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const allCss = files.filter((f) => f.path.endsWith('.css')).map((f) => f.content).join('\n');
  let placeholders = 0;
  const briefText = Object.values(ctx.brief).flat().join(' ').toLowerCase();
  const sector = `${ctx.brief.sector ?? ''} ${ctx.brief.brief ?? ''}`;

  if (!pages.length) add('pages', 'erreur', '—', 'Aucune page HTML générée.');
  if (!map.has('index.html')) add('index', 'erreur', '—', 'La page d’accueil index.html est absente.');

  for (const page of pages) {
    const root = parse(page.content, { comment: false });
    const html = root.querySelector('html');
    if (!html || !/^fr/i.test(html.getAttribute('lang') ?? '')) add('lang', 'avertissement', page.path, 'Attribut lang="fr" absent.');
    const h1 = root.querySelectorAll('h1');
    if (h1.length !== 1) add('h1', 'erreur', page.path, `La page doit contenir exactement un H1 (trouvé : ${h1.length}).`);
    const title = textOf(root.querySelector('title') ?? parse('<i></i>'));
    if (!title || /\{\{/.test(title)) add('title', 'erreur', page.path, 'Balise <title> absente ou non remplie.');
    else if (titles.has(title)) add('title-unique', 'avertissement', page.path, `Titre identique à ${titles.get(title)}.`);
    else titles.set(title, page.path);
    const desc = root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '';
    if (!desc || /\{\{/.test(desc)) add('description', 'erreur', page.path, 'Meta description absente ou non remplie.');
    else if (descriptions.has(desc)) add('description-unique', 'avertissement', page.path, `Meta description identique à ${descriptions.get(desc)}.`);
    else descriptions.set(desc, page.path);
    if (!root.querySelector('meta[name="viewport"]')) add('viewport', 'erreur', page.path, 'Balise meta viewport absente (responsive).');

    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? '';
      if (img.getAttribute('alt') === undefined) add('alt', 'erreur', page.path, `Image sans attribut alt : ${src.slice(0, 80)}`);
      if (/^(https?:)?\/\//i.test(src)) add('img-externe', 'erreur', page.path, `Image externe interdite (droits non vérifiés) : ${src.slice(0, 100)}`);
      else if (src.startsWith('images/') && !ctx.assetSlugs.includes(src.slice(7)) && !map.has(src)) add('img-manquante', 'erreur', page.path, `Image inexistante : ${src}`);
    }
    for (const script of root.querySelectorAll('script[src]')) {
      const src = script.getAttribute('src') ?? '';
      if (/^(https?:)?\/\//i.test(src)) add('script-tiers', 'erreur', page.path, `Script tiers chargé : ${src.slice(0, 100)} (non autorisé sans validation).`);
      else if (!map.has(src.replace(/^\.\//, ''))) add('script-manquant', 'erreur', page.path, `Script introuvable : ${src}`);
    }
    for (const link of root.querySelectorAll('link[rel="stylesheet"]')) {
      const href = link.getAttribute('href') ?? '';
      if (!/^(https?:)?\/\//i.test(href) && !map.has(href.replace(/^\.\//, ''))) add('css-manquant', 'erreur', page.path, `Feuille de style introuvable : ${href}`);
    }
    for (const a of root.querySelectorAll('a')) {
      const href = (a.getAttribute('href') ?? '').trim();
      const label = textOf(a).slice(0, 60) || a.getAttribute('aria-label') || 'lien';
      if (!href || href === '#' || /^javascript:/i.test(href)) { add('lien-vide', 'erreur', page.path, `Lien sans destination réelle : « ${label} ».`); continue; }
      if (/^(mailto:|tel:|https?:\/\/)/i.test(href)) continue;
      const [file, anchor] = href.split('#');
      const target = file ? file.replace(/^\.\//, '') : page.path;
      if (file && !map.has(target)) add('lien-casse', 'erreur', page.path, `Lien interne cassé vers « ${href} ».`);
      else if (anchor && map.has(target) && !new RegExp(`id=["']${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(map.get(target)!)) add('ancre', 'avertissement', page.path, `Ancre introuvable : ${href}`);
    }
    for (const b of root.querySelectorAll('button, a, input[type="submit"]')) {
      const label = (textOf(b) || b.getAttribute('value') || '').toLowerCase();
      const inForm = !!b.closest('form');
      const href = b.getAttribute('href');
      if (/\b(payer|paiement|r[ée]server|se connecter|connexion|commander|acheter)\b/.test(label) && !href && !inForm)
        add('bouton-factice', 'erreur', page.path, `Bouton « ${label.slice(0, 40)} » sans destination ni intégration réelle.`);
    }
    for (const form of root.querySelectorAll('form')) {
      const action = form.getAttribute('action') ?? '';
      if (/^https?:\/\//i.test(action)) add('form-externe', 'erreur', page.path, `Formulaire envoyé vers un service externe non configuré : ${action.slice(0, 80)}`);
      const notice = /non (encore )?(configur|reli)|mailto:/i.test(form.toString() + (form.parentNode?.toString() ?? ''));
      if (!action.startsWith('mailto:') && !notice) add('form-statique', 'avertissement', page.path, 'Formulaire sans traitement ni mention « non configuré » : le visiteur pourrait croire son message envoyé.');
      for (const input of form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea, select')) {
        const id = input.getAttribute('id');
        const labelled = input.getAttribute('aria-label') || (id && root.querySelector(`label[for="${id}"]`)) || input.closest('label');
        if (!labelled) add('label', 'avertissement', page.path, `Champ de formulaire sans étiquette (${input.getAttribute('name') ?? input.tagName}).`);
      }
    }
    const text = textOf(root.querySelector('body') ?? root);
    placeholders += (text.match(/à renseigner/gi) ?? []).length;
    if (/★★★★★|⭐/.test(page.content) && !/avis|témoignage/i.test(briefText)) add('avis', 'erreur', page.path, 'Notes / étoiles d’avis détectées alors qu’aucun avis réel n’a été fourni.');
    else if (/\b(t[ée]moignages?|avis clients?|ils nous font confiance)\b/i.test(text) && !/avis|témoignage/i.test(briefText)) add('avis-section', 'avertissement', page.path, 'Section avis/témoignages détectée : vérifier qu’elle ne contient que de vrais avis.');
    const claims = text.match(/\b\d[\d\s]*\s?(ans d['’]exp[ée]rience|% de r[ée]ussite|clients satisfaits|projets r[ée]alis[ée]s|[ée]l[èe]ves form[ée]s)/gi) ?? [];
    for (const claim of claims) if (!briefText.includes(claim.toLowerCase().replace(/\s+/g, ' ').trim().split(' ')[0])) add('chiffre', 'erreur', page.path, `Chiffre non fourni par le client : « ${claim.trim()} ».`);
    for (const foreign of FOREIGN_SECTORS) if (!foreign.sector.test(sector) && foreign.terms.test(text)) add('autre-metier', 'erreur', page.path, `Vocabulaire d’un autre métier (${foreign.label}) détecté.`);
    if (/royal\s+auto/i.test(text) && !/royal/i.test(ctx.clientName)) add('fuite-reference', 'erreur', page.path, 'Mention de « Royal Auto-école » (exemple de référence) dans un autre projet.');
    for (const ld of root.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = ld.textContent;
      const phone = raw.match(/"telephone"\s*:\s*"([^"]+)"/)?.[1];
      if (phone && !(ctx.brief.phone ?? '').replace(/\D/g, '').includes(phone.replace(/\D/g, '').slice(-9))) add('jsonld', 'erreur', page.path, 'JSON-LD contenant un téléphone non confirmé.');
      if (/"streetAddress"/.test(raw) && !ctx.brief.address) add('jsonld', 'erreur', page.path, 'JSON-LD contenant une adresse non confirmée.');
    }
    if (Buffer.byteLength(page.content) > 300_000) add('poids', 'avertissement', page.path, 'Page HTML > 300 Ko.');
  }
  if (allCss && !/prefers-reduced-motion/.test(allCss)) add('reduced-motion', 'avertissement', 'assets/css', 'Aucune règle prefers-reduced-motion : animations non désactivables.');
  if (pages.length > 1 && !map.has('sitemap.xml')) add('sitemap', 'avertissement', '—', 'sitemap.xml absent.');
  if (!map.has('robots.txt')) add('robots', 'info', '—', 'robots.txt absent.');
  if (placeholders) add('a-renseigner', 'info', '—', `${placeholders} mention(s) « À renseigner » à compléter avec le client.`);
  const counts = { erreur: 0, avertissement: 0, info: 0 } as Record<CheckLevel, number>;
  for (const i of items) counts[i.level]++;
  return {
    ran_at: new Date().toISOString(), kind: 'static', items, counts, placeholders,
    not_executed: ['Validation visuelle (captures multi-largeurs)', 'Mesure Core Web Vitals', 'Contraste des couleurs calculé', 'Audit de sécurité de l’hébergement'],
  };
}

const SECRET_RE = /(sk-ant-[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY-----|postgres(ql)?:\/\/[^\s"'`]*:[^\s"'`@]+@)/;

export function runAppChecks(files: GenFile[]): CheckReport {
  const items: CheckItem[] = [];
  const add = (id: string, level: CheckLevel, file: string, message: string) => items.push({ id, level, file, message });
  const map = new Map(files.map((f) => [f.path, f.content]));
  const pkg = map.get('package.json');
  if (!pkg) add('package', 'erreur', 'package.json', 'package.json absent.');
  else {
    try {
      const json = JSON.parse(pkg);
      if (!json.scripts?.build) add('build-script', 'erreur', 'package.json', 'Script « build » absent.');
      if (!json.scripts?.test) add('test-script', 'avertissement', 'package.json', 'Script « test » absent.');
    } catch { add('package-json', 'erreur', 'package.json', 'package.json invalide (JSON).'); }
  }
  if (!map.has('.env.example')) add('env-example', 'avertissement', '.env.example', '.env.example absent.');
  if (!map.has('README.md')) add('readme', 'avertissement', 'README.md', 'README absent.');
  if (![...map.keys()].some((p) => p.startsWith('db/migrations/'))) add('migrations', 'avertissement', 'db/migrations', 'Aucune migration SQL.');
  if (![...map.keys()].some((p) => /(^|\/)tests?\/|\.test\.tsx?$/.test(p))) add('tests', 'avertissement', 'tests', 'Aucun test.');
  for (const [path, content] of map) {
    if (SECRET_RE.test(content)) add('secret', 'erreur', path, 'Secret probable dans le code.');
    if (/dangerouslySetInnerHTML/.test(content)) add('xss', 'avertissement', path, 'dangerouslySetInnerHTML utilisé : vérifier l’échappement.');
    if (/\$\{[^}]+\}/.test(content) && /(query|execute)\(\s*`[^`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/i.test(content)) add('sqli', 'erreur', path, 'Requête SQL construite par interpolation : utiliser des paramètres.');
    if (/(stripe|paiement|payment)/i.test(path) && /amount\s*[:=]\s*(req|body|request)/i.test(content)) add('montant-client', 'erreur', path, 'Montant de paiement lu depuis le client.');
  }
  const counts = { erreur: 0, avertissement: 0, info: 0 } as Record<CheckLevel, number>;
  for (const i of items) counts[i.level]++;
  return { ran_at: new Date().toISOString(), kind: 'app', items, counts, placeholders: 0, not_executed: ['Installation des dépendances', 'Typecheck', 'Build', 'Tests'] };
}

/** Contrôles des sites React (analyse statique du JSX + résultat de compilation). */
export function runReactChecks(
  files: GenFile[],
  ctx: { brief: BriefData; assetSlugs: string[]; clientName: string; routes: { path: string; file: string }[]; bundle: { ok: boolean; errors: string[] } | null },
): CheckReport {
  const items: CheckItem[] = [];
  const add = (id: string, level: CheckLevel, file: string, message: string) => items.push({ id, level, file, message });
  const map = new Map(files.map((f) => [f.path, f.content]));
  const briefText = Object.values(ctx.brief).flat().join(' ').toLowerCase();
  const sector = `${ctx.brief.sector ?? ''} ${ctx.brief.brief ?? ''}`;
  const routePaths = new Set(ctx.routes.map((r) => r.path));
  let placeholders = 0;
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();

  if (!ctx.bundle) add('compilation', 'avertissement', '—', 'Compilation non exécutée.');
  else if (!ctx.bundle.ok) for (const e of ctx.bundle.errors) add('compilation', 'erreur', '—', `Compilation : ${e}`);
  for (const r of ctx.routes) if (!map.has(r.file)) add('page-absente', 'erreur', r.file, `Page manquante pour la route ${r.path}.`);
  for (const required of ['src/site.config.js', 'src/styles/theme.css', 'src/components/Layout.jsx'])
    if (!map.has(required)) add('socle', 'erreur', required, 'Fichier du socle visuel absent.');

  const jsxFiles = files.filter((f) => /^src\/(pages|components)\/.+\.jsx$/.test(f.path) && f.path !== 'src/components/Kit.jsx');
  for (const f of jsxFiles) {
    const src = f.content;
    const isPage = f.path.startsWith('src/pages/');
    const textOnly = src.replace(/<[^>]+>/g, ' ').replace(/[{}]/g, ' ');
    if (isPage) {
      const h1 = (src.match(/<h1[\s>]/g) ?? []).length + (src.match(/<TextReveal[^>]*as=["']h1["']/g) ?? []).length;
      if (h1 !== 1) add('h1', 'erreur', f.path, `La page doit contenir exactement un H1 (trouvé : ${h1}).`);
      const seo = src.match(/<Seo\b[^>]*>/);
      if (!seo) add('seo', 'erreur', f.path, 'Composant <Seo title description /> absent (title et meta description).');
      else {
        const title = seo[0].match(/title=["']([^"']+)["']/)?.[1] ?? '';
        const desc = seo[0].match(/description=["']([^"']+)["']/)?.[1] ?? '';
        if (!desc) add('description', 'avertissement', f.path, 'Meta description absente ou dynamique.');
        if (title && titles.has(title)) add('title-unique', 'avertissement', f.path, `Titre identique à ${titles.get(title)}.`); else if (title) titles.set(title, f.path);
        if (desc && descriptions.has(desc)) add('description-unique', 'avertissement', f.path, `Description identique à ${descriptions.get(desc)}.`); else if (desc) descriptions.set(desc, f.path);
      }
      if (!/id=["']contenu["']/.test(src)) add('main', 'avertissement', f.path, '<main id="contenu"> absent (lien d’évitement).');
    }
    for (const img of src.matchAll(/<(img|ParallaxImage)\b([^>]*)>/g)) {
      const attrs = img[2];
      const srcAttr = attrs.match(/src=["']([^"']+)["']/)?.[1] ?? '';
      if (!/\balt=/.test(attrs)) add('alt', 'erreur', f.path, `Image sans alt : ${srcAttr || '(dynamique)'}`);
      if (/^(https?:)?\/\//i.test(srcAttr)) add('img-externe', 'erreur', f.path, `Image externe interdite : ${srcAttr.slice(0, 100)}`);
      else if (srcAttr.replace(/^\//, '').startsWith('images/') && !ctx.assetSlugs.includes(srcAttr.replace(/^\/?images\//, '')) && !map.has(`public/${srcAttr.replace(/^\//, '')}`)) add('img-manquante', 'erreur', f.path, `Image inexistante : ${srcAttr}`);
    }
    for (const a of src.matchAll(/<a\b([^>]*)>/g)) {
      const href = a[1].match(/href=["']([^"']*)["']/)?.[1];
      if (href === undefined) continue;
      if (!href || href === '#' || /^javascript:/i.test(href)) add('lien-vide', 'erreur', f.path, 'Lien sans destination réelle (href vide ou « # »).');
      else if (href.startsWith('/') && !href.startsWith('//')) add('lien-interne', 'erreur', f.path, `Lien interne en <a href="${href}"> : utiliser <Link to>.`);
    }
    for (const l of src.matchAll(/<(?:Link|NavLink)\b[^>]*\bto=["']([^"'#?]*)/g)) {
      if (l[1] && !routePaths.has(l[1])) add('lien-casse', 'erreur', f.path, `Lien vers une route inexistante : ${l[1]}`);
    }
    for (const b of src.matchAll(/<button\b([^>]*)>([\s\S]{0,80}?)<\/button>/g)) {
      const label = b[2].replace(/<[^>]+>|\{[^}]*\}/g, '').trim().toLowerCase();
      if (/\b(payer|paiement|r[ée]server|se connecter|connexion|commander|acheter)\b/.test(label) && !/onClick|type=["']submit["']/.test(b[1]))
        add('bouton-factice', 'erreur', f.path, `Bouton « ${label.slice(0, 40)} » sans action réelle.`);
    }
    if (/<form\b/.test(src) && !/onSubmit|action=["']mailto:/.test(src)) add('form-statique', 'erreur', f.path, 'Formulaire sans traitement : utiliser <ContactForm /> ou <NotConfigured>.');
    if (/<form\b[^>]*action=["']https?:/.test(src)) add('form-externe', 'erreur', f.path, 'Formulaire envoyé vers un service externe non configuré.');
    placeholders += (src.match(/À renseigner/g) ?? []).length + (src.match(/<Missing\b/g) ?? []).length;
    if (/★★★★★|⭐/.test(src) && !/avis|témoignage/i.test(briefText)) add('avis', 'erreur', f.path, 'Étoiles d’avis détectées alors qu’aucun avis réel n’a été fourni.');
    else if (/\b(t[ée]moignages?|avis clients?|ils nous font confiance)\b/i.test(textOnly) && !/avis|témoignage/i.test(briefText)) add('avis-section', 'avertissement', f.path, 'Section avis/témoignages : vérifier qu’elle ne contient que de vrais avis.');
    for (const claim of textOnly.match(/\b\d[\d\s]*\s?(ans d['’]exp[ée]rience|% de r[ée]ussite|clients satisfaits|projets r[ée]alis[ée]s)/gi) ?? [])
      if (!briefText.includes(claim.trim().split(/\s/)[0])) add('chiffre', 'erreur', f.path, `Chiffre non fourni par le client : « ${claim.trim()} ».`);
    for (const c of src.matchAll(/<CountUp\b[^>]*value=\{?["']?([\d.]+)/g)) if (!briefText.includes(c[1])) add('chiffre', 'erreur', f.path, `Compteur sur un chiffre non fourni : ${c[1]}.`);
    for (const foreign of FOREIGN_SECTORS) if (!foreign.sector.test(sector) && foreign.terms.test(textOnly)) add('autre-metier', 'erreur', f.path, `Vocabulaire d’un autre métier (${foreign.label}) détecté.`);
    if (/royal\s+auto/i.test(textOnly) && !/royal/i.test(ctx.clientName)) add('fuite-reference', 'erreur', f.path, 'Mention de « Royal Auto-école » (exemple de référence) dans un autre projet.');
  }
  const config = map.get('src/site.config.js') ?? '';
  const phone = config.match(/phone\s*:\s*['"]([^'"]+)['"]/)?.[1];
  if (phone && phone !== 'À renseigner' && !(ctx.brief.phone ?? '').replace(/\D/g, '').includes(phone.replace(/\D/g, '').slice(-9))) add('donnee-inventee', 'erreur', 'src/site.config.js', `Téléphone non confirmé par le brief : ${phone}.`);
  const email = config.match(/email\s*:\s*['"]([^'"]+)['"]/)?.[1];
  if (email && email !== 'À renseigner' && email.toLowerCase() !== (ctx.brief.email ?? '').trim().toLowerCase()) add('donnee-inventee', 'erreur', 'src/site.config.js', `E-mail non confirmé par le brief : ${email}.`);
  placeholders += (config.match(/À renseigner/g) ?? []).length;
  const css = files.filter((f) => f.path.endsWith('.css')).map((f) => f.content).join('\n');
  if (!/prefers-reduced-motion/.test(css)) add('reduced-motion', 'info', 'src/styles', 'prefers-reduced-motion géré par le kit (MotionConfig) ; aucune règle CSS supplémentaire.');
  if (placeholders) add('a-renseigner', 'info', '—', `${placeholders} élément(s) « À renseigner » à compléter avec le client.`);
  const counts = { erreur: 0, avertissement: 0, info: 0 } as Record<CheckLevel, number>;
  for (const i of items) counts[i.level]++;
  return {
    ran_at: new Date().toISOString(), kind: 'static', items, counts, placeholders,
    not_executed: ['Contrôle du rendu final dans le navigateur (lancez « Contrôler le rendu » dans l’aperçu)', 'Build Vite de production (effectué par Vercel au déploiement)', 'Mesure Core Web Vitals'],
  };
}
