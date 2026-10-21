/**
 * Sites clients en React (Vite + React 19 + React Router + Motion), déployables sur Vercel.
 * - Le « kit Harmony » (templates/react-site) est injecté tel quel : coquille, routeur, kit motion,
 *   composants honnêtes (formulaire mailto, « À renseigner », « non configuré »).
 * - Claude ne génère que : site.config.js, theme.css, Layout.jsx, favicon et les pages.
 * - Aperçu : compilation esbuild côté serveur (aucune exécution du code généré dans Harmony Studio),
 *   puis affichage dans une iframe isolée.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import type { GenFile } from '../ai/fileformat';
import type { Plan } from '../ai/prompts';
import type { BriefData } from '../ai/matrices';

export const REACT_DEPENDENCIES = {
  react: '19.1.10',
  'react-dom': '19.1.10',
  'react-router-dom': '7.18.4',
  motion: '12.43.0',
  'lucide-react': '0.577.0',
};
export const REACT_DEV_DEPENDENCIES = { vite: '7.3.7', '@vitejs/plugin-react': '5.2.0' };
export const ALLOWED_IMPORTS = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react-router-dom', 'motion/react', 'lucide-react'];
/** Fichiers du kit que l'IA ne doit jamais remplacer. */
export const KIT_LOCKED = ['src/App.jsx', 'src/main.jsx', 'src/styles/kit.css', 'src/components/Kit.jsx', 'vite.config.js', 'vercel.json', 'index.html'];

let kitCache: GenFile[] | null = null;
export function kitDir() {
  return join(process.cwd(), 'templates', 'react-site');
}
export function loadKit(): GenFile[] {
  if (kitCache) return kitCache;
  const root = kitDir();
  const out: GenFile[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ path: relative(root, full).split('\\').join('/'), content: readFileSync(full, 'utf8') });
    }
  };
  walk(root);
  kitCache = out;
  return out;
}

export function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'page';
}

export type RoutePlan = { path: string; component: string; file: string; title: string };

export function routesFromPlan(plan: Plan): RoutePlan[] {
  const used = new Set<string>();
  return plan.pages.map((page, i) => {
    const base = slugify(page.fichier.replace(/\.html?$/i, '').replace(/^\//, '') || page.titre);
    let slug = i === 0 ? 'accueil' : base;
    while (used.has(slug)) slug += '-2';
    used.add(slug);
    const component = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/^(\d)/, 'P$1') + 'Page';
    return { path: i === 0 ? '/' : `/${slug}`, component, file: `src/pages/${component}.jsx`, title: page.titre };
  });
}

export function assembleReactProject(p: { plan: Plan; files: Record<string, string>; brief: BriefData; projectName: string; motion: string }): Record<string, string> {
  const files = { ...p.files };
  // Tous les fichiers du kit sont réimposés à chaque assemblage : une version antérieure ou une réponse
  // de Claude ne peut pas remplacer la configuration de build (vite.config.js, vercel.json…).
  for (const kit of loadKit()) files[kit.path] = kit.content;
  for (const path of Object.keys(files)) if (/^(postcss|tailwind|babel)\.config\.|^\.(postcssrc|babelrc)/i.test(path)) delete files[path];
  const routes = routesFromPlan(p.plan).filter((r) => Object.hasOwn(files, r.file));
  files['src/routes.js'] = `// Généré par Harmony Studio à partir du plan validé.\n${routes.map((r) => `import ${r.component} from './pages/${r.component}.jsx';`).join('\n')}\n\nexport const routes = [\n${routes.map((r) => `  { path: '${r.path}', label: ${JSON.stringify(r.title)}, Component: ${r.component} },`).join('\n')}\n];\n`;
  files['src/routes.paths.js'] = `// Chemins des pages (utilisé par vite.config.js pour le sitemap).\nexport const routes = ${JSON.stringify(routes.map((r) => r.path))};\n`;
  const name = p.brief.clientName || p.projectName;
  const desc = (p.plan.brief_enrichi || '').replace(/\s+/g, ' ').slice(0, 155);
  const theme = p.plan.palette[0]?.hex && /^#[0-9a-f]{3,8}$/i.test(p.plan.palette[0].hex) ? p.plan.palette[0].hex : '#111111';
  const contact = [p.brief.phone, p.brief.email].filter(Boolean).join(' · ') || 'voir nos coordonnées';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  files['index.html'] = (loadKit().find((f) => f.path === 'index.html')?.content ?? '')
    .replace('%SITE_NAME%', esc(name)).replace('%SITE_DESCRIPTION%', esc(desc)).replace('%THEME_COLOR%', theme).replace('%SITE_CONTACT%', esc(contact));
  files['package.json'] = JSON.stringify({
    name: slugify(name) || 'site-client', private: true, version: '1.0.0', type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: REACT_DEPENDENCIES, devDependencies: REACT_DEV_DEPENDENCIES,
  }, null, 2) + '\n';
  files['.gitignore'] = 'node_modules\ndist\n.env\n.env.*\n!.env.example\n.DS_Store\n';
  files['.env.example'] = '# Domaine public du site (facultatif) : génère sitemap.xml et robots.txt au build\nSITE_URL=\n';
  files['README.md'] = `# ${name}\n\nSite React (Vite + React 19 + React Router + Motion) réalisé par Harmony Solutions avec Harmony Studio.\n\n## Démarrer\n\n\`\`\`bash\nnpm install\nnpm run dev      # http://localhost:5173\nnpm run build    # dossier dist/\n\`\`\`\n\n## Déployer sur Vercel\n\n1. Importer le dépôt dans Vercel (préréglage **Vite** détecté automatiquement, voir \`vercel.json\`).\n2. Variable facultative \`SITE_URL\` (ex. https://www.exemple.fr) pour générer \`sitemap.xml\` et \`robots.txt\`.\n3. Brancher le nom de domaine du client.\n\n## Modifier le contenu\n\n- **Coordonnées, horaires, réseaux, intensité des animations** : \`src/site.config.js\` (les valeurs « À renseigner » s'affichent en surligné jaune tant qu'elles ne sont pas confirmées).\n- **Couleurs et typographies** : variables CSS en haut de \`src/styles/theme.css\`.\n- **Pages** : \`src/pages/\`. **En-tête / pied de page** : \`src/components/Layout.jsx\`.\n- **Photos** : \`public/images/\`.\n- **Animations** : kit \`src/motion/\` (Reveal, Stagger, TextReveal, Parallax, ParallaxImage, Magnetic, TiltCard, Marquee, CountUp, ScrollProgress) — réglage global \`motion: 'sobre' | 'dynamique' | 'spectaculaire'\` dans \`src/site.config.js\`. Les animations respectent le réglage « réduire les animations » du visiteur.\n\n## Formulaire de contact\n\nLe composant \`ContactForm\` prépare un e-mail dans la messagerie du visiteur (mailto) : aucun message n'est envoyé par le site lui-même tant qu'aucun service d'envoi n'est branché.\n`;
  return files;
}

/** Contenu de l'aperçu : index.html réécrit pour charger le bundle esbuild sous la base fournie. */
export function previewIndexHtml(indexHtml: string, basePath: string) {
  return indexHtml
    .replace(/<base href="[^"]*"\s*\/?>/i, `<base href="${basePath}" />`)
    .replace(/<script type="module" src="\/src\/main\.jsx"><\/script>/i, '<script src="__apercu/app.js" defer></script>')
    .replace('</head>', '    <link rel="stylesheet" href="__apercu/app.css" />\n  </head>');
}

export type BundleResult = { ok: boolean; js: string; css: string; errors: string[]; warnings: string[] };

/** Compile le projet React en mémoire (esbuild). Seules les dépendances du kit sont autorisées. */
export async function bundleReact(files: Record<string, string>): Promise<BundleResult> {
  const esbuild = await import('esbuild');
  const resolveIn = (from: string, spec: string) => {
    const base = posix.normalize(posix.join(posix.dirname(from), spec));
    const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`];
    return candidates.find((c) => Object.hasOwn(files, c)) ?? null;
  };
  const loaderFor = (path: string) => (path.endsWith('.css') ? 'css' : path.endsWith('.json') ? 'json' : path.endsWith('.jsx') ? 'jsx' : 'js') as 'css' | 'json' | 'jsx' | 'js';
  try {
    const result = await esbuild.build({
      entryPoints: ['virtual:src/main.jsx'],
      bundle: true,
      write: false,
      outdir: 'out',
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      minify: true,
      jsx: 'automatic',
      logLevel: 'silent',
      absWorkingDir: process.cwd(),
      define: { 'import.meta.env.HARMONY_PREVIEW': 'true', 'process.env.NODE_ENV': '"production"', 'import.meta.env.MODE': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
      plugins: [{
        name: 'harmony-virtual',
        setup(build) {
          build.onResolve({ filter: /^virtual:/ }, (args) => ({ path: args.path.slice(8), namespace: 'virtual' }));
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.namespace !== 'virtual') return undefined;
            if (args.path.startsWith('.')) {
              const target = resolveIn(args.importer, args.path);
              if (!target) return { errors: [{ text: `Import introuvable : « ${args.path} » dans ${args.importer}` }] };
              return { path: target, namespace: 'virtual' };
            }
            if (/^(images\/|\/images\/|data:)/.test(args.path) || /^\/?favicon/.test(args.path)) return { path: args.path, external: true };
            if (ALLOWED_IMPORTS.includes(args.path)) return undefined;
            return { errors: [{ text: `Dépendance non autorisée : « ${args.path} » (autorisées : ${ALLOWED_IMPORTS.join(', ')})` }] };
          });
          build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
            if (!Object.hasOwn(files, args.path)) return { errors: [{ text: `Fichier absent : ${args.path}` }] };
            return { contents: files[args.path], loader: loaderFor(args.path), resolveDir: process.cwd() };
          });
        },
      }],
    });
    const js = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
    const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
    return { ok: true, js, css, errors: [], warnings: result.warnings.slice(0, 20).map((w) => w.text) };
  } catch (e) {
    const errs = (e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors;
    return { ok: false, js: '', css: '', errors: errs?.length ? errs.slice(0, 20).map((x) => `${x.text}${x.location ? ` (${x.location.file}:${x.location.line})` : ''}`) : [e instanceof Error ? e.message.slice(0, 500) : 'Erreur de compilation'], warnings: [] };
  }
}

export const KIT_API_DOC = `KIT HARMONY DISPONIBLE (déjà présent, ne pas le réécrire) :
- import { Reveal, Stagger, StaggerItem, TextReveal, Parallax, ParallaxImage, Magnetic, TiltCard, Marquee, CountUp, ScrollProgress } from '../motion';
  · <Reveal as="section" from="up|down|left|right|none" delay={0.1} scale>…</Reveal> apparition au scroll
  · <Stagger className="grid"><StaggerItem>…</StaggerItem></Stagger> cascade
  · <TextReveal as="h1" text="…" className="…" /> titre révélé mot par mot (texte accessible)
  · <Parallax speed={1}>…</Parallax> ; <ParallaxImage src="images/photo-01.webp" alt="…" className="…" priority position="center" width={…} height={…} />
  · <Magnetic><Link className="btn btn-primary" to="/contact">…</Link></Magnetic> CTA magnétique
  · <TiltCard className="card">…</TiltCard> carte 3D au survol
  · <Marquee items={[…]} speed={40} /> bandeau défilant (uniquement avec des éléments réels)
  · <CountUp value={123} suffix=" …" /> UNIQUEMENT avec un chiffre réel fourni
  · <ScrollProgress /> barre de progression (à placer dans Layout)
- import { Seo, Missing, NotConfigured, ContactForm, CallButton } from '../components/Kit.jsx';
  · <Seo title="…" description="…" /> OBLIGATOIRE en tête de chaque page (title/description uniques)
  · <Missing value={site.contact.phone} /> affiche la valeur ou « À renseigner »
  · <ContactForm fields={['nom','email','telephone','message']} /> formulaire honnête (mailto vers l'e-mail confirmé, sinon message « non relié »)
  · <CallButton>Appeler</CallButton> n'apparaît que si un téléphone confirmé existe
  · <NotConfigured>…</NotConfigured> pour toute fonctionnalité non branchée (réservation, paiement…)
- import site from '../site.config.js'; (données du client)
- import { Link, NavLink } from 'react-router-dom'; liens internes TOUJOURS via <Link to="/chemin"> (jamais <a href="/…">)
- import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react'; pour des effets sur mesure supplémentaires
- import { IconName } from 'lucide-react'; icônes (avec aria-hidden="true" si décoratives)
- Images : chemins relatifs "images/<fichier>" (sans barre initiale).
- Dépendances autorisées : react, react-router-dom, motion/react, lucide-react. Aucune autre.
- Classes de base fournies : .a-renseigner, .sr-only, .hs-form, .hs-field, .hs-not-configured, .hs-scroll-progress. Prévois dans theme.css : .btn, .btn-primary, .btn-ghost, .container, .section, .card, .grid, header/nav/footer, hero.
- Le contenu principal de chaque page est dans <main id="contenu">.`;
