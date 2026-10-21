import { describe, expect, it } from 'vitest';
import { composeAuditPrompt, composeGenerationPrompt, fillTemplate, variablesFor, type MatrixSet } from '@/lib/server/ai/matrices';
import { DEFAULT_MATRICES } from '@/lib/server/ai/default-matrices';
import { runReactChecks, runStaticChecks } from '@/lib/server/studio/checks';
import { diffVersions } from '@/lib/server/studio/versions';
import { computeTotals } from '@/lib/server/quotes';
import { costOf, priceFor } from '@/lib/server/ai/anthropic';
import { DEFAULT_PRICING } from '@/lib/server/settings';

const set: MatrixSet = Object.fromEntries(Object.entries(DEFAULT_MATRICES).map(([k, v]) => [k, { content: v, version: null, isDefault: true }])) as MatrixSet;

describe('Matrices génériques', () => {
  it('ne contiennent aucun contenu Royal Auto-école', () => {
    for (const content of Object.values(DEFAULT_MATRICES)) {
      expect(content).not.toMatch(/Royal|Brueil|permis B|code de la route|panneaux/i);
    }
  });
  it('remplacent les variables et marquent les données manquantes', () => {
    const vars = variablesFor({ clientName: 'Boulangerie Dupont', sector: 'boulangerie', city: 'Creil' }, [{ slug: 'photo-01.webp', role: 'photo', alt: 'Vitrine' }]);
    const prompt = composeGenerationPrompt(set, vars, { design: 'Utiliser du vert sauge.' });
    expect(prompt).toContain('Boulangerie Dupont');
    expect(prompt).toContain('images/photo-01.webp');
    expect(prompt).toContain('À renseigner');
    expect(prompt).toContain('Utiliser du vert sauge.');
    expect(prompt).not.toMatch(/\{\{[a-z_]+\}\}/);
    expect(prompt).not.toContain('MATRICE AUDIT');
    expect(composeAuditPrompt(set, vars)).toContain('NE RIEN CASSER');
    expect(fillTemplate('{{inconnue}}', {})).toBe('{{inconnue}}');
  });
});

describe('Contrôles qualité statiques', () => {
  const brief = { clientName: 'Boulangerie Dupont', sector: 'boulangerie', phone: '' };
  it('accepte une page saine', () => {
    const r = runStaticChecks([
      { path: 'index.html', content: '<!DOCTYPE html><html lang="fr"><head><meta name="viewport" content="width=device-width"><title>Accueil</title><meta name="description" content="Boulangerie artisanale"><link rel="stylesheet" href="assets/css/styles.css"></head><body><h1>Dupont</h1><img src="images/photo-01.webp" alt="Pain"><a href="contact.html">Contact</a></body></html>' },
      { path: 'contact.html', content: '<!DOCTYPE html><html lang="fr"><head><meta name="viewport" content="x"><title>Contact</title><meta name="description" content="Nous contacter"></head><body><h1>Contact</h1><p>Formulaire non encore relié</p></body></html>' },
      { path: 'assets/css/styles.css', content: '@media (prefers-reduced-motion: reduce){*{animation:none}}' },
    ], { brief, assetSlugs: ['photo-01.webp'], clientName: 'Boulangerie Dupont' });
    expect(r.counts.erreur).toBe(0);
  });
  it('détecte boutons factices, avis inventés, autre métier, fuite Royal, liens cassés, images externes', () => {
    const r = runStaticChecks([{ path: 'index.html', content: '<html lang="fr"><head><title>A</title></head><body><h1>A</h1><h1>B</h1><button>Payer</button><p>★★★★★ Super !</p><p>Code de la route et permis B</p><p>Royal Auto-école</p><a href="absent.html">x</a><a href="#">y</a><img src="https://cdn.x/a.jpg" alt=""><p>15 ans d’expérience</p></body></html>' }], { brief, assetSlugs: [], clientName: 'Boulangerie Dupont' });
    const ids = r.items.filter((i) => i.level === 'erreur').map((i) => i.id);
    for (const id of ['h1', 'bouton-factice', 'avis', 'autre-metier', 'fuite-reference', 'lien-casse', 'lien-vide', 'img-externe', 'chiffre', 'description', 'viewport']) expect(ids).toContain(id);
  });
  it('contrôle les pages React (Seo, H1, Link, données inventées)', () => {
    const r = runReactChecks([
      { path: 'src/pages/AccueilPage.jsx', content: '<><Seo title="Accueil" description="x" /><main id="contenu"><h1>A</h1><a href="/contact">c</a><Link to="/inexistant">x</Link><CountUp value={250} /></main></>' },
      { path: 'src/site.config.js', content: "export default { contact: { phone: '01 23 45 67 89', email: 'faux@x.fr' } }" },
    ], { brief, assetSlugs: [], clientName: 'Boulangerie Dupont', routes: [{ path: '/', file: 'src/pages/AccueilPage.jsx' }], bundle: { ok: false, errors: ['Dépendance non autorisée : « axios »'] } });
    const ids = r.items.filter((i) => i.level === 'erreur').map((i) => i.id);
    for (const id of ['compilation', 'lien-interne', 'lien-casse', 'chiffre', 'donnee-inventee', 'socle']) expect(ids).toContain(id);
  });
});

describe('Versions, devis, coûts', () => {
  it('calcule un différentiel par fichier', () => {
    const d = diffVersions([{ path: 'a.html', content: 'x\ny' }, { path: 'b.css', content: 'z' }], [{ path: 'a.html', content: 'x\nY' }, { path: 'c.js', content: '1' }]);
    expect(d.map((f) => `${f.path}:${f.status}`)).toEqual(['a.html:modifié', 'b.css:supprimé', 'c.js:ajouté']);
  });
  it('calcule les totaux de devis selon le régime de TVA', () => {
    const lines = [{ label: 'Site', description: '', quantity: 1, unitPrice: 900, unit: 'forfait' }, { label: 'Maintenance', description: '', quantity: 12, unitPrice: 39.99, unit: 'mois' }];
    expect(computeTotals(lines, 'tva', 20)).toEqual({ ht: 1379.88, tva: 275.98, ttc: 1655.86 });
    expect(computeTotals(lines, 'franchise', 20)).toEqual({ ht: 1379.88, tva: 0, ttc: 1379.88 });
  });
  it('estime le coût Claude ou le déclare indisponible', () => {
    const usage = { input_tokens: 10_000, output_tokens: 20_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 5_000 };
    expect(costOf(priceFor(DEFAULT_PRICING, 'claude-sonnet-5-5'), usage)).toBeCloseTo(0.2205, 4);
    expect(costOf(priceFor(DEFAULT_PRICING, 'modele-inconnu'), usage)).toBeNull();
  });
});
