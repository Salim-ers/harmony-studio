/**
 * Réponses SIMULÉES de Claude pour tester la mécanique (jobs, versions, aperçu, export)
 * sans clé API. Activées uniquement par HARMONY_MOCKS=1 hors Vercel.
 * Chaque page générée porte un bandeau « SIMULATION » : ce n'est jamais un livrable.
 */
import type { ClaudeRequest } from './anthropic';

function lastUserText(req: ClaudeRequest) {
  const m = req.messages[req.messages.length - 1];
  if (typeof m.content === 'string') return m.content;
  return m.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
}

const BANNER = '<div class="simulation" role="note">SIMULATION — contenu factice généré sans IA pour tester Harmony Studio</div>';

export function mockClaude(req: ClaudeRequest): string {
  const text = lastUserText(req);
  const step = text.match(/\[\[etape:([a-z-]+)\]\]/)?.[1] ?? '';
  const target = text.match(/\[\[cible:([^\]]+)\]\]/)?.[1] ?? '';
  const client = text.match(/Client \/ projet : (.+)/)?.[1]?.trim() || 'Client';
  if (step === 'plan') {
    const isApp = /\[\[app\]\]|Application Next\.js/.test(req.system);
    const photos = [...text.matchAll(/- (images\/[^\s]+) \(([^)—]+)/g)].map((m) => ({ fichier: m[1], description: `Photo fournie (${m[2].trim()})`, usage: 'Galerie' }));
    return JSON.stringify({
      brief_enrichi: `[SIMULATION] Brief enrichi pour ${client}.`,
      concept: 'Concept simulé', palette: [{ nom: 'Encre', hex: '#14213d' }, { nom: 'Or', hex: '#c9a24a' }],
      typographies: { titres: 'Serif élégante', texte: 'Sans-serif lisible' },
      pages: isApp ? [{ fichier: 'app', titre: 'Application', objectif: 'Gestion', sections: [] }] : [
        { fichier: 'index.html', titre: 'Accueil', objectif: 'Présenter', sections: ['Hero', 'Produits', 'Contact'] },
        { fichier: 'contact.html', titre: 'Contact', objectif: 'Contacter', sections: ['Coordonnées', 'Formulaire'] },
      ],
      photos, fonctionnalites: [{ nom: 'Formulaire de contact', mise_en_oeuvre: 'mailto', statut: 'statique' }],
      a_renseigner: ['Horaires', 'Adresse'], questions_bloquantes: [],
      modules: isApp ? [{ nom: 'devis', description: 'Suivi des devis', fichiers: ['app/devis/page.tsx'] }] : [],
      modele_donnees: isApp ? 'users, quotes' : '', roles: isApp ? ['admin', 'commercial'] : [], integrations: [],
    });
  }
  if (step === 'design-system') {
    return `<<<FICHIER chemin="assets/css/styles.css">>>
:root{--ink:#14213d;--gold:#c9a24a;--bg:#faf8f3}*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--ink)}
.simulation{background:#b91c1c;color:#fff;text-align:center;padding:6px;font-weight:700}.a-renseigner{background:#fff3c4;padding:0 4px}
header{display:flex;justify-content:space-between;padding:16px 24px}nav a{margin-left:16px;color:inherit}.hero{padding:80px 24px}
.hero img{width:100%;max-height:420px;object-fit:cover}@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
<<<FIN>>>
<<<FICHIER chemin="assets/js/main.js">>>
document.querySelectorAll('[data-year]').forEach(function(el){el.textContent=String(new Date().getFullYear())});
<<<FIN>>>
<<<FICHIER chemin="_layout.html">>>
<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{TITRE}}</title><meta name="description" content="{{DESCRIPTION}}"><link rel="icon" href="favicon.svg"><link rel="stylesheet" href="assets/css/styles.css"><script src="assets/js/main.js" defer></script></head><body>${BANNER}<header><strong>${client}</strong><nav><a href="index.html">Accueil</a><a href="contact.html">Contact</a></nav></header><!-- CONTENU --><footer><p>© <span data-year></span> ${client}</p></footer></body></html>
<<<FIN>>>
<<<FICHIER chemin="favicon.svg">>>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#14213d"/><text x="16" y="22" font-size="16" text-anchor="middle" fill="#c9a24a">S</text></svg>
<<<FIN>>>
<<<RESUME>>>
Système de design simulé.
<<<FIN>>>`;
  }
  if (step === 'page') {
    const photo = text.match(/- (images\/[^\s]+) :/)?.[1];
    const isContact = target.startsWith('contact');
    const body = isContact
      ? `<main><h1>Contact</h1><section id="contact"><p>Téléphone : <span class="a-renseigner">À renseigner</span></p><p>Formulaire non encore relié : contactez-nous par téléphone ou e-mail.</p></section></main>`
      : `<main><section class="hero"><h1>${client}</h1><p>Page d’accueil simulée.</p>${photo ? `<img src="${photo}" alt="Photo fournie par le client" width="1200" height="800">` : ''}<a href="contact.html">Nous contacter</a></section><section id="contact-rapide"><h2>Contact</h2><p><a href="contact.html">Voir les coordonnées</a></p></section></main>`;
    return `<<<FICHIER chemin="${target}">>>
<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${isContact ? 'Contact' : 'Accueil'} — ${client}</title><meta name="description" content="Page ${isContact ? 'contact' : 'accueil'} simulée de ${client} pour tester Harmony Studio."><link rel="icon" href="favicon.svg"><link rel="stylesheet" href="assets/css/styles.css"><script src="assets/js/main.js" defer></script></head><body>${BANNER}<header><strong>${client}</strong><nav><a href="index.html"${isContact ? '' : ' aria-current="page"'}>Accueil</a><a href="contact.html"${isContact ? ' aria-current="page"' : ''}>Contact</a></nav></header>${body}<footer><p>© <span data-year></span> ${client}</p></footer></body></html>
<<<FIN>>>
<<<RESUME>>>
Page simulée ${target}.
<<<FIN>>>`;
  }
  if (step === 'design-system-react') {
    const routes = [...text.matchAll(/(\/[a-z0-9-]*) → ([^;\n]+)/g)].map((m) => ({ to: m[1], label: m[2].trim() }));
    return `<<<FICHIER chemin="src/site.config.js">>>
export default {
  name: ${JSON.stringify(client)},
  tagline: 'Site de démonstration (SIMULATION)',
  motion: 'spectaculaire',
  contact: { phone: 'À renseigner', email: 'À renseigner', address: 'À renseigner' },
  hours: 'À renseigner',
  socials: [],
  nav: ${JSON.stringify(routes)},
  cta: { label: 'Nous contacter', to: '${routes[routes.length - 1]?.to ?? '/'}' },
};
<<<FIN>>>
<<<FICHIER chemin="src/styles/theme.css">>>
:root{--ink:#14213d;--accent:#c9a24a;--bg:#faf8f3}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--ink)}
.simulation{background:#b91c1c;color:#fff;text-align:center;padding:6px;font-weight:700}
.container{max-width:1100px;margin:0 auto;padding:0 24px}.section{padding:80px 0}.btn{display:inline-block;padding:12px 20px;border-radius:999px}
.btn-primary{background:var(--accent);color:var(--ink)}header{position:sticky;top:0;display:flex;justify-content:space-between;padding:16px 24px;background:var(--bg)}
nav a{margin-left:16px;color:inherit}.hero-media{height:420px;border-radius:24px}
<<<FIN>>>
<<<FICHIER chemin="src/components/Layout.jsx">>>
import { NavLink } from 'react-router-dom';
import { ScrollProgress, Magnetic } from '../motion';
import { Missing } from './Kit.jsx';
import site from '../site.config.js';

export default function Layout({ children }) {
  return (
    <>
      <ScrollProgress />
      <div className="simulation" role="note">SIMULATION — contenu factice généré sans IA pour tester Harmony Studio</div>
      <header>
        <strong>{site.name}</strong>
        <nav aria-label="Navigation principale">
          {site.nav.map((item) => <NavLink key={item.to} to={item.to} end>{item.label}</NavLink>)}
          <Magnetic><NavLink className="btn btn-primary" to={site.cta.to}>{site.cta.label}</NavLink></Magnetic>
        </nav>
      </header>
      {children}
      <footer className="container"><p>Téléphone : <Missing value={site.contact.phone} /></p></footer>
    </>
  );
}
<<<FIN>>>
<<<FICHIER chemin="public/favicon.svg">>>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#14213d"/></svg>
<<<FIN>>>
<<<RESUME>>>
Socle React simulé.
<<<FIN>>>`;
  }
  if (step === 'page-react') {
    const component = target.match(/([A-Za-z0-9]+)\.jsx$/)?.[1] ?? 'AccueilPage';
    const photo = text.match(/- (images\/[^\s]+) :/)?.[1];
    const isHome = component === 'AccueilPage';
    const body = isHome
      ? `<section className="section container">
          <TextReveal as="h1" text={${JSON.stringify(client)}} />
          <Reveal><p>Page d’accueil simulée — version React avec motion design.</p></Reveal>
          ${photo ? `<ParallaxImage src="${photo}" alt="Photo fournie par le client" className="hero-media" priority />` : ''}
          <Magnetic><Link className="btn btn-primary" to="/contact">Nous contacter</Link></Magnetic>
        </section>
        <section className="section container" id="contact-rapide">
          <h2>Contact</h2>
          <Stagger><StaggerItem><p>Téléphone : <Missing value={site.contact.phone} /></p></StaggerItem></Stagger>
        </section>`
      : `<section className="section container"><h1>Contact</h1><ContactForm /></section>`;
    return `<<<FICHIER chemin="${target}">>>
import { Link } from 'react-router-dom';
import { Reveal, Stagger, StaggerItem, TextReveal, ParallaxImage, Magnetic } from '../motion';
import { Seo, Missing, ContactForm } from '../components/Kit.jsx';
import site from '../site.config.js';

export default function ${component}() {
  void Link; void Reveal; void Stagger; void StaggerItem; void TextReveal; void ParallaxImage; void Magnetic; void Missing; void ContactForm; void site;
  return (
    <>
      <Seo title="${isHome ? 'Accueil' : 'Contact'}" description="Page ${isHome ? 'd’accueil' : 'contact'} simulée de ${client.replace(/"/g, '')} pour tester Harmony Studio." />
      <main id="contenu">
        ${body}
      </main>
    </>
  );
}
<<<FIN>>>
<<<RESUME>>>
Page React simulée ${target}.
<<<FIN>>>`;
  }
  if (step === 'modification' || step === 'correction') {
    const reactPage = [...text.matchAll(/<<<FICHIER chemin="(src\/pages\/AccueilPage\.jsx)">>>\n([\s\S]*?)\n<<<FIN>>>/g)][0];
    if (reactPage) {
      const changed = reactPage[2].replace('Page d’accueil simulée — version React avec motion design.', 'Page d’accueil simulée — version React encore plus spectaculaire.').replace('<Reveal>', '<Reveal from="left" scale>');
      return `<<<FICHIER chemin="src/pages/AccueilPage.jsx">>>\n${changed}\n<<<FIN>>>\n<<<RESUME>>>\nHero rendu plus spectaculaire (simulation). Contact inchangé.\n<<<FIN>>>`;
    }
    const files = [...text.matchAll(/<<<FICHIER chemin="([^"]+)">>>\n([\s\S]*?)\n<<<FIN>>>/g)].map((m) => ({ path: m[1], content: m[2] }));
    const index = files.find((f) => f.path === 'index.html');
    if (!index) return '<<<RESUME>>>\nAucune modification simulée.\n<<<FIN>>>';
    const changed = index.content.replace(/<section class="hero">/, '<section class="hero hero--spectaculaire">').replace(/<p>Page d’accueil simulée\.<\/p>/, '<p>Page d’accueil simulée — version plus spectaculaire.</p>');
    return `<<<FICHIER chemin="index.html">>>\n${changed}\n<<<FIN>>>\n<<<RESUME>>>\nHero rendu plus spectaculaire (simulation). Contact inchangé.\n<<<FIN>>>`;
  }
  if (step === 'scaffold') {
    return `<<<FICHIER chemin="package.json">>>
{"name":"simulation-app","private":true,"scripts":{"build":"echo simulation"}}
<<<FIN>>>
<<<FICHIER chemin="README.md">>>
# [SIMULATION] Application non générée par l'IA
<<<FIN>>>
<<<FICHIER chemin=".env.example">>>
DATABASE_URL=
<<<FIN>>>
<<<RESUME>>>
Socle simulé.
<<<FIN>>>`;
  }
  if (step === 'module') {
    return `<<<FICHIER chemin="app/${target.replace(/[^a-z0-9-]/gi, '') || 'module'}/page.tsx">>>
export default function Page() { return <main>[SIMULATION] Module ${target}</main>; }
<<<FIN>>>
<<<RESUME>>>
Module simulé.
<<<FIN>>>`;
  }
  if (step === 'message') {
    return JSON.stringify({ objet: '[SIMULATION] Votre présence en ligne', message: '[SIMULATION] Bonjour, ceci est un brouillon factice généré sans IA pour tester l’interface. Si vous ne souhaitez plus être contacté, répondez simplement STOP.' });
  }
  return '[SIMULATION] Réponse générique.';
}
