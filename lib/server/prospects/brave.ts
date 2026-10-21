/**
 * Client Brave Search API (API officielle, clé serveur). Aucun scraping.
 * En mode simulation locale (HARMONY_MOCKS=1), renvoie des résultats factices
 * explicitement marqués — jamais en production.
 */
import { env, mocksEnabled } from '../env';
import { notConfigured, upstream } from '../http';
import type { RawResult } from './classify';
import { mockBraveResults } from './mock-results';

export type BraveParams = { q: string; count?: number; offset?: number; freshness?: string };
export type BraveResponse = { results: RawResult[]; moreAvailable: boolean; demo: boolean };

export class BraveRateLimitError extends Error {}

export async function braveSearch(params: BraveParams, fetchImpl: typeof fetch = fetch): Promise<BraveResponse> {
  const key = env.braveKey();
  if (!key) {
    if (mocksEnabled()) return { results: mockBraveResults(params.q), moreAvailable: false, demo: true };
    throw notConfigured('BRAVE_SEARCH_API_KEY non configurée : la recherche de prospects est indisponible.');
  }
  const search = new URLSearchParams({
    q: params.q.slice(0, 380),
    count: String(Math.min(20, params.count ?? 20)),
    offset: String(Math.min(9, params.offset ?? 0)),
    country: 'FR',
    search_lang: 'fr',
    ui_lang: 'fr-FR',
    safesearch: 'moderate',
    extra_snippets: 'true',
    text_decorations: 'false',
  });
  if (params.freshness && params.freshness !== 'all') search.set('freshness', params.freshness);
  const response = await fetchImpl(`https://api.search.brave.com/res/v1/web/search?${search}`, {
    headers: { 'X-Subscription-Token': key, Accept: 'application/json', 'Accept-Encoding': 'gzip' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 429) throw new BraveRateLimitError('Quota ou débit Brave Search atteint (429).');
  if (response.status === 401 || response.status === 403) throw upstream('Brave Search refuse la clé API (401/403) : vérifiez BRAVE_SEARCH_API_KEY et votre abonnement.');
  if (!response.ok) throw upstream(`Recherche Brave indisponible (${response.status}).`);
  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string; page_age?: string; extra_snippets?: string[] }> };
    query?: { more_results_available?: boolean };
  };
  return {
    results: (data.web?.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({ title: r.title ?? '', url: r.url ?? '', description: r.description ?? '', age: r.age, pageAge: r.page_age, extraSnippets: r.extra_snippets ?? [] })),
    moreAvailable: !!data.query?.more_results_available,
    demo: false,
  };
}
