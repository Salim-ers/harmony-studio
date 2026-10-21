/**
 * Moteur de prospection : exécute des requêtes réelles (Brave Search), qualifie,
 * déduplique et enregistre chaque opportunité avec sa provenance. Jamais de fiche inventée.
 */
import { db, type Db } from '../db';
import { notify } from '../audit';
import { HttpError, logError } from '../http';
import { getConfig } from '../settings';
import type { Strategy } from '@/lib/shared/constants';
import { braveSearch, BraveRateLimitError } from './brave';
import { classify, type Classified } from './classify';
import { buildQueries } from './queries';
import { computeScore } from './score';
import { canonicalUrl, domainOf, isThirdParty, normalizeName } from './url';

export type SearchParams = {
  strategy: Exclude<Strategy, 'manuel'>;
  zones: string[];
  sectors: string[];
  needs: string[];
  customQuery: string;
  freshness: 'pd' | 'pw' | 'pm' | 'py' | 'all';
  maxQueries: number;
  pages?: number;
};

export type RunSummary = {
  runId: string;
  status: 'terminé' | 'partiel' | 'échec';
  queries: string[];
  found: number;
  created: number;
  merged: number;
  duplicates: number;
  rejected: number;
  apiCalls: number;
  demo: boolean;
  error: string;
  newIds: string[];
};

type Accepted = Extract<Classified, { rejected: false }>;

export function dedupeKey(c: Accepted, canonical: string, fallbackZone: string) {
  if (c.strategy !== 'signal') return `u:${canonical}`;
  if (!isThirdParty(canonical)) return `d:${domainOf(canonical)}`;
  const place = normalizeName(c.locationMatch || fallbackZone || '');
  return `n:${normalizeName(c.name)}|${place}`;
}

async function upsert(sql: Db, c: Accepted, canonical: string, ctx: { runId: string; query: string; zone: string; demo: boolean }) {
  const existing = await sql<{ id: string }>`SELECT id FROM prospects WHERE canonical_url = ${canonical} LIMIT 1`;
  if (existing[0]) {
    await sql`INSERT INTO prospect_sources(prospect_id, url, platform, title, excerpt, published_at, published_label, query, search_run_id)
      VALUES (${existing[0].id}, ${canonical}, ${c.platform}, ${c.name}, ${c.evidence}, ${c.publishedAt}, ${c.publishedLabel}, ${ctx.query}, ${ctx.runId})
      ON CONFLICT (prospect_id, url) DO NOTHING`;
    return { kind: 'duplicate' as const, id: existing[0].id };
  }
  const key = dedupeKey(c, canonical, ctx.zone);
  const sameEntity = await sql<{ id: string; strategy: string }>`SELECT id, strategy FROM prospects WHERE dedupe_key = ${key} AND dedupe_key <> '' LIMIT 1`;
  if (sameEntity[0]) {
    const id = sameEntity[0].id;
    await sql.batch([
      { text: `INSERT INTO prospect_sources(prospect_id, url, platform, title, excerpt, published_at, published_label, query, search_run_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (prospect_id, url) DO NOTHING`,
        params: [id, canonical, c.platform, c.name, c.evidence, c.publishedAt, c.publishedLabel, ctx.query, ctx.runId] },
      { text: `INSERT INTO pipeline_events(prospect_id, kind, detail) VALUES ($1, 'source', $2)`, params: [id, `Nouvelle source rattachée : ${c.platform}`] },
      { text: `UPDATE prospects SET last_activity_at = now(), updated_at = now() WHERE id = $1`, params: [id] },
    ]);
    return { kind: 'merged' as const, id };
  }
  const { score, details, stale } = computeScore({
    strategy: c.strategy, confidence: c.confidence, publishedAt: c.publishedAt, needType: c.needType, locationMatch: c.locationMatch,
    urgent: c.urgent, budgetText: c.budgetText, hasQuote: !!c.quote, platformType: c.platformType, deadline: c.deadline,
    websiteKnown: c.strategy === 'signal' && !isThirdParty(canonical) ? true : null,
  });
  const website = c.strategy === 'signal' && !isThirdParty(canonical) ? canonical : null;
  const contacts = c.contacts.map((x) => ({ ...x, source: canonical, found_at: new Date().toISOString(), note: 'Extrait du résultat de recherche public' }));
  const city = c.locationMatch || ctx.zone;
  const evidence = c.quote ? `« ${c.quote} »` : c.evidence;
  const nextAction = c.strategy === 'signal' ? 'Vérifier la présence en ligne puis qualifier' : 'Lire la source et confirmer le besoin';
  const rows = await sql<{ id: string }>`
    INSERT INTO prospects(name, source_url, canonical_url, source_type, city, location_verified, category, evidence, signal, score, score_details,
      status, strategy, activity, domain, dedupe_key, platform, published_at, published_label, need_type, need_status, confidence,
      confidence_reason, website, contacts, budget_text, deadline, next_action, stale, is_demo, search_run_id)
    VALUES (${c.name}, ${canonical}, ${canonical}, ${'Recherche ' + c.strategy}, ${city}, ${!!c.locationMatch}, ${c.needType.slice(0, 100)},
      ${evidence.slice(0, 900)}, ${c.signalLabel}, ${score}, ${JSON.stringify(details)}::jsonb, 'À examiner', ${c.strategy}, ${c.activity},
      ${domainOf(canonical)}, ${key}, ${c.platform}, ${c.publishedAt}, ${c.publishedLabel}, ${c.needType}, ${c.needStatus}, ${c.confidence},
      ${c.confidenceReason}, ${website}, ${JSON.stringify(contacts)}::jsonb, ${c.budgetText}, ${c.deadline}, ${nextAction}, ${stale}, ${ctx.demo}, ${ctx.runId})
    ON CONFLICT DO NOTHING RETURNING id`;
  const id = rows[0]?.id;
  if (!id) return { kind: 'duplicate' as const, id: '' };
  await sql.batch([
    { text: `INSERT INTO prospect_sources(prospect_id, url, platform, title, excerpt, published_at, published_label, query, search_run_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      params: [id, canonical, c.platform, c.name, c.evidence, c.publishedAt, c.publishedLabel, ctx.query, ctx.runId] },
    { text: `INSERT INTO pipeline_events(prospect_id, kind, to_status, detail) VALUES ($1, 'création', 'À examiner', $2)`, params: [id, `Découvert par recherche (${c.platform})`] },
  ]);
  return { kind: 'created' as const, id, score };
}

export async function runSearch(
  params: SearchParams,
  opts: { trigger: 'manuel' | 'planifié'; profileId?: string | null; fetchImpl?: typeof fetch; delayMs?: number; alertMinScore?: number } = { trigger: 'manuel' },
): Promise<RunSummary> {
  const sql = db();
  const queries = buildQueries({ ...params, maxQueries: params.maxQueries });
  // Plafond mensuel Brave appliqué ici pour TOUS les déclencheurs (manuel, recherche enregistrée, veille planifiée).
  const config = await getConfig();
  const [used] = await sql<{ n: number }>`SELECT count(*)::int AS n FROM usage_events WHERE provider = 'brave' AND NOT is_demo AND created_at >= date_trunc('month', now())`;
  const planned = queries.length * Math.max(1, Math.min(2, params.pages ?? 1));
  if (config.brave.monthlyQueryCap > 0 && Number(used.n) + planned > config.brave.monthlyQueryCap)
    throw new HttpError(429, `Plafond mensuel de requêtes Brave atteint (${used.n}/${config.brave.monthlyQueryCap}). Modifiez-le dans Paramètres si votre abonnement le permet.`, 'QUOTA');
  const [run] = await sql<{ id: string }>`INSERT INTO search_runs(profile_id, trigger, params, queries)
    VALUES (${opts.profileId ?? null}, ${opts.trigger}, ${JSON.stringify(params)}::jsonb, ${JSON.stringify(queries)}::jsonb) RETURNING id`;
  const summary: RunSummary = { runId: run.id, status: 'terminé', queries, found: 0, created: 0, merged: 0, duplicates: 0, rejected: 0, apiCalls: 0, demo: false, error: '', newIds: [] };
  const rejections: { title: string; url: string; reason: string }[] = [];
  const zone = params.zones.find((z) => z !== 'France entière') ?? '';
  const pages = Math.max(1, Math.min(2, params.pages ?? 1));
  const delay = opts.delayMs ?? 1100;
  try {
    outer: for (const query of queries) {
      for (let page = 0; page < pages; page++) {
        if (summary.apiCalls > 0 && delay) await new Promise((r) => setTimeout(r, delay));
        let response;
        try {
          response = await braveSearch({ q: query, offset: page, freshness: params.strategy === 'signal' && params.freshness === 'pm' ? 'all' : params.freshness }, opts.fetchImpl);
        } catch (e) {
          if (e instanceof BraveRateLimitError) {
            summary.status = summary.apiCalls ? 'partiel' : 'échec';
            summary.error = 'Limite de débit ou quota Brave atteint : recherche interrompue. Les résultats déjà obtenus sont conservés.';
            await sql`INSERT INTO usage_events(provider, operation, units, ok, detail) VALUES ('brave', 'web_search', 1, false, '429')`;
            break outer;
          }
          throw e;
        }
        summary.apiCalls++;
        summary.demo = summary.demo || response.demo;
        await sql`INSERT INTO usage_events(provider, operation, units, ok, is_demo) VALUES ('brave', 'web_search', 1, true, ${response.demo})`;
        for (const result of response.results) {
          summary.found++;
          const canonical = canonicalUrl(result.url);
          if (!canonical) { summary.rejected++; continue; }
          const c = classify(result, params.strategy, params.zones);
          if (c.rejected) {
            summary.rejected++;
            if (rejections.length < 80) rejections.push({ title: result.title.slice(0, 160), url: canonical, reason: c.reason });
            continue;
          }
          const out = await upsert(sql, c, canonical, { runId: run.id, query, zone, demo: response.demo });
          if (out.kind === 'created') {
            summary.created++;
            summary.newIds.push(out.id);
            if (opts.trigger === 'planifié' && out.score >= (opts.alertMinScore ?? 70))
              await notify('prospect', `Nouvelle opportunité : ${c.name}`, `${c.signalLabel} — score ${out.score}/100`, `/prospection/${out.id}`);
          } else if (out.kind === 'merged') summary.merged++;
          else summary.duplicates++;
        }
        if (!response.moreAvailable) break;
      }
    }
  } catch (e) {
    summary.status = summary.apiCalls ? 'partiel' : 'échec';
    summary.error = e instanceof Error && 'publicMessage' in e ? String((e as { publicMessage: string }).publicMessage) : 'Erreur pendant la recherche (voir journaux serveur).';
    logError('prospect-search', e, { runId: run.id });
  }
  await sql`UPDATE search_runs SET status = ${summary.status}, results_found = ${summary.found}, results_new = ${summary.created},
    results_merged = ${summary.merged + summary.duplicates}, results_rejected = ${summary.rejected}, api_calls = ${summary.apiCalls},
    rejections = ${JSON.stringify(rejections)}::jsonb, error = ${summary.error}, is_demo = ${summary.demo}, finished_at = now()
    WHERE id = ${run.id}`;
  if (opts.profileId) await sql`UPDATE search_profiles SET last_run_at = now() WHERE id = ${opts.profileId}`;
  return summary;
}
