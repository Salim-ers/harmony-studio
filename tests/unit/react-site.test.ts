import { describe, expect, it } from 'vitest';
import { assembleReactProject, bundleReact, routesFromPlan, previewIndexHtml } from '@/lib/server/studio/react-site';
import { mockClaude } from '@/lib/server/ai/mock';
import { parseFiles, filesToMap } from '@/lib/server/ai/fileformat';
import type { Plan } from '@/lib/server/ai/prompts';

const plan: Plan = {
  brief_enrichi: 'Boulangerie artisanale à Creil.', concept: '', palette: [{ nom: 'Encre', hex: '#14213d' }], typographies: { titres: '', texte: '' },
  pages: [{ fichier: 'index.html', titre: 'Accueil', objectif: 'x', sections: [] }, { fichier: 'contact.html', titre: 'Contact', objectif: 'y', sections: [] }],
  photos: [], fonctionnalites: [], a_renseigner: [], questions_bloquantes: [], modules: [], modele_donnees: '', roles: [], integrations: [],
};

describe('sites React', () => {
  it('dérive les routes du plan', () => {
    const routes = routesFromPlan(plan);
    expect(routes.map((r) => r.path)).toEqual(['/', '/contact']);
    expect(routes[0].file).toBe('src/pages/AccueilPage.jsx');
  });

  it('assemble puis compile un site React + Motion sans exécuter le code', async () => {
    const routes = routesFromPlan(plan);
    const sys = { purpose: 'x', model: 'm', system: '', maxTokens: 10, messages: [] as never[] };
    const ds = mockClaude({ ...sys, messages: [{ role: 'user', content: `[[etape:design-system-react]]\nClient / projet : Test\nRoutes du site : ${routes.map((r) => `${r.path} → ${r.title}`).join(' ; ')}` }] });
    let files = filesToMap(parseFiles(ds, 'react').files);
    for (const r of routes) {
      const page = mockClaude({ ...sys, messages: [{ role: 'user', content: `[[etape:page-react]] [[cible:${r.file}]]` }] });
      files = { ...files, ...filesToMap(parseFiles(page, 'react').files) };
    }
    const all = assembleReactProject({ plan, files, brief: { clientName: 'Boulangerie Test' }, projectName: 'Test', motion: 'spectaculaire' });
    expect(all['src/App.jsx']).toContain('AnimatePresence');
    expect(all['package.json']).toContain('"motion": "12.43.0"');
    const bundle = await bundleReact(all);
    expect(bundle.errors).toEqual([]);
    expect(bundle.ok).toBe(true);
    expect(bundle.js.length).toBeGreaterThan(50_000);
    const html = previewIndexHtml(all['index.html'], '/apercu/abc/');
    expect(html).toContain('<base href="/apercu/abc/" />');
    expect(html).toContain('__apercu/app.js');
  });

  it('refuse les dépendances non autorisées et les imports introuvables', async () => {
    const all = assembleReactProject({ plan, files: { 'src/pages/AccueilPage.jsx': "import x from 'axios';\nexport default function A(){return null}", 'src/pages/ContactPage.jsx': "import y from './absent.jsx';\nexport default function B(){return null}", 'src/site.config.js': 'export default {}', 'src/styles/theme.css': '', 'src/components/Layout.jsx': 'export default function L({children}){return children}' }, brief: {}, projectName: 'T', motion: 'sobre' });
    const bundle = await bundleReact(all);
    expect(bundle.ok).toBe(false);
    expect(bundle.errors.join(' ')).toMatch(/non autorisée|introuvable/);
  });
});
