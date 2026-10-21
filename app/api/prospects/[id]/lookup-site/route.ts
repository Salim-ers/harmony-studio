import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound } from '@/lib/server/http';
import { addEvent } from '@/lib/server/prospects/repo';
import { lookupOwnWebsite } from '@/lib/server/prospects/website-check';
import { computeScore } from '@/lib/server/prospects/score';
import { domainOf } from '@/lib/server/prospects/url';

export const maxDuration = 30;
type P = { id: string };

export const POST = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const sql = db();
  const [p] = await sql`SELECT * FROM prospects WHERE id = ${params.id}`;
  if (!p) throw notFound('Prospect introuvable.');
  const result = await lookupOwnWebsite(p.name, p.location_verified ? p.city : '');
  await sql`INSERT INTO usage_events(provider, operation, units, ok, is_demo) VALUES ('brave', 'recherche_site', 1, true, ${result.demo})`;
  const check = { checked_at: new Date().toISOString(), lookup: result, url: result.url ?? '', reachable: false, robots_blocked: false, https: false, status: 0, title: '', hints: result.found ? [] : [`Aucun site propre trouvé dans les 10 premiers résultats pour ${result.query} (recherche limitée, à confirmer).`], positives: result.found ? [`Site probable : ${result.url}`] : [], latest_year: null };
  if (p.strategy === 'signal') {
    const { score, details } = computeScore({ strategy: 'signal', confidence: p.confidence, publishedAt: p.published_at ? new Date(p.published_at) : null, needType: p.need_type, locationMatch: p.location_verified ? p.city : '', urgent: false, budgetText: p.budget_text, hasQuote: false, platformType: '', deadline: null, websiteKnown: result.found });
    await sql`UPDATE prospects SET score = ${score}, score_details = ${JSON.stringify(details)}::jsonb WHERE id = ${params.id}`;
  }
  await sql`UPDATE prospects SET website = coalesce(${result.url}, website), website_check = ${JSON.stringify(check)}::jsonb,
    domain = CASE WHEN ${!!result.url} THEN ${result.url ? domainOf(result.url) : ''} ELSE domain END, updated_at = now() WHERE id = ${params.id}`;
  await addEvent(params.id, 'analyse', result.found ? `Site probable trouvé : ${result.url}` : 'Aucun site propre trouvé (recherche limitée)');
  return json({ result });
}, { limit: 'search' });
