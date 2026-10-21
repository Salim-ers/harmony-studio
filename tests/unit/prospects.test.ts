import { describe, expect, it } from 'vitest';
import { canonicalUrl, domainOf, isThirdParty, platformOf } from '@/lib/server/prospects/url';
import { classify, parsePublished, detectNeed } from '@/lib/server/prospects/classify';
import { computeScore } from '@/lib/server/prospects/score';
import { buildQueries } from '@/lib/server/prospects/queries';
import { csvCell, mapImport, parseCsv, toCsv } from '@/lib/server/prospects/csv';
import { analyzeHtml, robotsDisallowsRoot } from '@/lib/server/prospects/website-check';

const NOW = new Date('2026-10-21T12:00:00Z');

describe('URL canonique et plateformes', () => {
  it('supprime traceurs, www, ancre, slash final et force https', () => {
    expect(canonicalUrl('http://www.Exemple.fr/annonce/?utm_source=x&id=2&fbclid=y#top')).toBe('https://exemple.fr/annonce?id=2');
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalUrl('https://user:pass@exemple.fr')).toBeNull();
  });
  it('reconnaît les plateformes tierces', () => {
    expect(platformOf('https://www.codeur.com/projects/123').type).toBe('annonces');
    expect(platformOf('https://www.boamp.fr/avis/1').type).toBe('marches');
    expect(isThirdParty('https://www.pagesjaunes.fr/pros/1')).toBe(true);
    expect(isThirdParty('https://boulangerie-dupont.fr')).toBe(false);
    expect(domainOf('https://www.boulangerie-dupont.fr/x')).toBe('boulangerie-dupont.fr');
  });
});

describe('Classification anti-faux-positifs', () => {
  it('détecte une demande explicite datée et sourcée', () => {
    const c = classify({ title: 'Cherche développeur pour site vitrine - Creil', url: 'https://www.codeur.com/projects/1', description: 'Je recherche un développeur pour la création d’un site vitrine. Budget 900 €.', pageAge: '2026-10-18T10:00:00Z' }, 'explicite', ['Creil'], NOW);
    expect(c.rejected).toBe(false);
    if (c.rejected) return;
    expect(c.strategy).toBe('explicite');
    expect(c.needStatus).toBe('confirmé');
    expect(c.confidence).toBe('élevée');
    expect(c.budgetText).toContain('900');
    expect(c.locationMatch).toBe('Creil');
  });
  it('rejette les agences, les offres d’emploi et les classements', () => {
    expect(classify({ title: 'Agence web Oise', url: 'https://agence.fr', description: 'Notre agence crée votre site. Devis gratuit.' }, 'explicite', [], NOW).rejected).toBe(true);
    expect(classify({ title: 'Développeur web CDI', url: 'https://x.fr', description: 'Nous recrutons en CDI, salaire attractif.' }, 'explicite', [], NOW).rejected).toBe(true);
    expect(classify({ title: 'Les 10 meilleures boulangeries à Creil', url: 'https://x.fr', description: '' }, 'signal', [], NOW).rejected).toBe(true);
    expect(classify({ title: 'Jean, développeur freelance', url: 'https://www.malt.fr/profile/jean', description: 'disponible pour vos projets' }, 'explicite', [], NOW).rejected).toBe(true);
  });
  it('classe un signal comme hypothèse, jamais comme besoin confirmé', () => {
    const c = classify({ title: 'Boulangerie du Marché - Creil - PagesJaunes', url: 'https://www.pagesjaunes.fr/pros/1', description: 'Boulangerie artisanale à Creil. Tél : 03 44 00 00 00' }, 'signal', ['Creil'], NOW);
    expect(c.rejected).toBe(false);
    if (c.rejected) return;
    expect(c.strategy).toBe('signal');
    expect(c.needStatus).toBe('supposé');
    expect(c.name).toBe('Boulangerie du Marché');
    expect(c.contacts[0]).toMatchObject({ type: 'téléphone' });
  });
  it('détecte un marché public avec échéance', () => {
    const c = classify({ title: 'Avis d’appel public : refonte du site internet', url: 'https://www.boamp.fr/avis/9', description: 'Date limite de remise des offres : 15/12/2026.' }, 'marche', [], NOW);
    expect(c.rejected).toBe(false);
    if (!c.rejected) { expect(c.strategy).toBe('marche'); expect(c.deadline).toBe('2026-12-15'); }
  });
  it('n’accepte pas un résultat sans besoin en mode demande explicite', () => {
    expect(classify({ title: 'Boulangerie Dupont', url: 'https://dupont.fr', description: 'Pains et viennoiseries' }, 'explicite', [], NOW).rejected).toBe(true);
  });
  it('interprète les dates relatives', () => {
    expect(parsePublished(undefined, '3 days ago', NOW).date?.toISOString().slice(0, 10)).toBe('2026-10-18');
    expect(parsePublished(undefined, 'March 12, 2025', NOW).date?.toISOString().slice(0, 10)).toBe('2025-03-12');
    expect(parsePublished(undefined, '', NOW).date).toBeNull();
    expect(detectNeed('besoin d’un logiciel de gestion des stocks')).toContain('ERP');
  });
});

describe('Score explicable', () => {
  it('privilégie les demandes récentes et justifie chaque point', () => {
    const fresh = computeScore({ strategy: 'explicite', confidence: 'élevée', publishedAt: new Date('2026-10-19'), needType: 'Site internet', locationMatch: 'Creil', urgent: true, budgetText: '900 €', hasQuote: true, platformType: 'annonces', deadline: null }, NOW);
    const signal = computeScore({ strategy: 'signal', confidence: 'faible', publishedAt: null, needType: 'Présence en ligne à évaluer', locationMatch: '', urgent: false, budgetText: '', hasQuote: false, platformType: 'annuaire', deadline: null }, NOW);
    expect(fresh.score).toBeGreaterThan(80);
    expect(signal.score).toBeLessThan(30);
    expect(fresh.details.every((d) => d.label && Number.isFinite(d.points))).toBe(true);
  });
  it('marque les sources anciennes et les échéances dépassées', () => {
    const old = computeScore({ strategy: 'explicite', confidence: 'moyenne', publishedAt: new Date('2024-01-01'), needType: 'Site', locationMatch: '', urgent: false, budgetText: '', hasQuote: true, platformType: 'web', deadline: '2026-01-01' }, NOW);
    expect(old.stale).toBe(true);
    expect(old.details.some((d) => d.points < 0)).toBe(true);
  });
});

describe('Requêtes générées', () => {
  it('varie les requêtes, respecte le maximum et la zone', () => {
    const qs = buildQueries({ strategy: 'explicite', zones: ['Creil', 'Oise'], sectors: [], needs: ['site'], maxQueries: 5 }, () => 0.42);
    expect(qs).toHaveLength(5);
    expect(new Set(qs).size).toBe(5);
    const signal = buildQueries({ strategy: 'signal', zones: ['Creil'], sectors: ['boulangerie'], needs: [], maxQueries: 3 });
    expect(signal.every((q) => /boulang|pâtiss/i.test(q) && q.includes('Creil'))).toBe(true);
  });
  it('utilise la recherche libre en ajoutant la zone', () => {
    expect(buildQueries({ strategy: 'explicite', zones: ['Oise'], sectors: [], needs: [], customQuery: 'recherche site internet', maxQueries: 6 })).toEqual(['recherche site internet Oise']);
  });
});

describe('CSV', () => {
  it('neutralise l’injection de formules', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(toCsv([{ name: '@cmd', tags: ['a', 'b'] }])).toContain("\"'@cmd\"");
  });
  it('relit un export et mappe les colonnes françaises', () => {
    const rows = parseCsv('﻿Nom;Ville;URL source;Statut\n"Boulangerie ""Le Four""";Creil;https://x.fr;Qualifié\n');
    const { items, unknownColumns } = mapImport(rows);
    expect(items[0]).toMatchObject({ name: 'Boulangerie "Le Four"', city: 'Creil', source_url: 'https://x.fr', status: 'Qualifié' });
    expect(unknownColumns).toEqual([]);
  });
});

describe('Analyse de site (indices)', () => {
  it('produit des indices sans affirmer de besoin', () => {
    const a = analyzeHtml('<html><head><title>Garage</title></head><body>© 2015 Garage <script src="jquery-1.8.js"></script></body></html>', 'http://garage.fr/', NOW);
    expect(a.hints.join(' ')).toMatch(/HTTPS/);
    expect(a.hints.join(' ')).toMatch(/viewport/);
    expect(a.latest_year).toBe(2015);
  });
  it('respecte robots.txt', () => {
    expect(robotsDisallowsRoot('User-agent: *\nDisallow: /')).toBe(true);
    expect(robotsDisallowsRoot('User-agent: *\nDisallow: /admin')).toBe(false);
    expect(robotsDisallowsRoot('User-agent: Googlebot\nDisallow: /')).toBe(false);
  });
});
