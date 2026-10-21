import { afterEach, describe, expect, it } from 'vitest';
import { callClaude } from '@/lib/server/ai/anthropic';
import { braveSearch, BraveRateLimitError } from '@/lib/server/prospects/brave';
import { deployToVercel, pushToGithub } from '@/lib/server/studio/export';
import { saveConfig } from '@/lib/server/settings';
import { db } from '@/lib/server/db';

function sse(events: unknown[]) {
  const text = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text.slice(0, 40))); c.enqueue(new TextEncoder().encode(text.slice(40))); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => { delete process.env.ANTHROPIC_API_KEY; delete process.env.BRAVE_SEARCH_API_KEY; delete process.env.GITHUB_TOKEN; delete process.env.GITHUB_OWNER; delete process.env.VERCEL_DEPLOY_TOKEN; });

describe('Client Claude (API officielle, streaming, coûts, budget)', () => {
  it('lit le flux SSE, calcule et journalise le coût', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    await saveConfig({ ai: { planModel: 'claude-sonnet-5-5', generationModel: 'claude-sonnet-5-5', maxOutputTokens: 32000, monthlyBudgetUsd: 50, jobBudgetUsd: 5, maxConcurrentJobs: 2, autoFixAttempts: 1 } });
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test');
      return sse([
        { type: 'message_start', message: { usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Bon' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'jour' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 800 } },
        { type: 'message_stop' },
      ]);
    }) as unknown as typeof fetch;
    const r = await callClaude({ purpose: 'test', model: 'claude-sonnet-5-5', system: 'S', maxTokens: 1000, messages: [{ role: 'user', content: 'x' }] }, { fetchImpl });
    expect(sent).toMatchObject({ model: 'claude-sonnet-5-5', stream: true, max_tokens: 1000 });
    expect(r.text).toBe('Bonjour');
    expect(r.costUsd).toBeCloseTo((1200 * 2 + 800 * 10) / 1e6, 8);
    const [row] = await db()`SELECT cost_usd, ok FROM usage_events WHERE operation = 'test' ORDER BY id DESC LIMIT 1`;
    expect(Number(row.cost_usd)).toBeCloseTo(0.0104, 6);
  });

  it('refuse avant tout appel si le budget mensuel serait dépassé', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    await saveConfig({ ai: { planModel: 'claude-sonnet-5-5', generationModel: 'claude-sonnet-5-5', maxOutputTokens: 32000, monthlyBudgetUsd: 0.01, jobBudgetUsd: 5, maxConcurrentJobs: 2, autoFixAttempts: 1 } });
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    await expect(callClaude({ purpose: 'test', model: 'claude-sonnet-5-5', system: 'S', maxTokens: 32000, messages: [{ role: 'user', content: 'x' }] }, { fetchImpl })).rejects.toMatchObject({ status: 402 });
    expect(called).toBe(false);
    await saveConfig({ ai: { planModel: 'claude-sonnet-5-5', generationModel: 'claude-sonnet-5-5', maxOutputTokens: 32000, monthlyBudgetUsd: 50, jobBudgetUsd: 5, maxConcurrentJobs: 2, autoFixAttempts: 1 } });
  });

  it('refuse un modèle sans grille tarifaire et remonte quota / clé invalide clairement', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    await expect(callClaude({ purpose: 'test', model: 'modele-inconnu', system: 'S', maxTokens: 100, messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ status: 402 });
    const quota = (async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 })) as unknown as typeof fetch;
    await expect(callClaude({ purpose: 'test', model: 'claude-sonnet-5-5', system: 'S', maxTokens: 100, messages: [{ role: 'user', content: 'x' }] }, { fetchImpl: quota })).rejects.toMatchObject({ status: 429 });
    const badKey = (async () => new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 })) as unknown as typeof fetch;
    await expect(callClaude({ purpose: 'test', model: 'claude-sonnet-5-5', system: 'S', maxTokens: 100, messages: [{ role: 'user', content: 'x' }] }, { fetchImpl: badKey })).rejects.toMatchObject({ publicMessage: expect.stringContaining('ANTHROPIC_API_KEY') });
  });
});

describe('Client Brave Search', () => {
  it('envoie les bons paramètres et normalise les résultats', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-test';
    let url = '';
    const fetchImpl = (async (u: string, init: RequestInit) => {
      url = u;
      expect((init.headers as Record<string, string>)['X-Subscription-Token']).toBe('brave-test');
      return new Response(JSON.stringify({ web: { results: [{ title: 'A', url: 'https://a.fr', description: 'd', page_age: '2026-10-01T00:00:00', extra_snippets: ['e'] }] }, query: { more_results_available: false } }));
    }) as unknown as typeof fetch;
    const r = await braveSearch({ q: 'site internet Creil', freshness: 'pw' }, fetchImpl);
    expect(url).toContain('country=FR');
    expect(url).toContain('search_lang=fr');
    expect(url).toContain('freshness=pw');
    expect(r.results[0]).toMatchObject({ url: 'https://a.fr', pageAge: '2026-10-01T00:00:00', extraSnippets: ['e'] });
    expect(r.demo).toBe(false);
  });
  it('signale le dépassement de quota', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-test';
    await expect(braveSearch({ q: 'x' }, (async () => new Response('', { status: 429 })) as unknown as typeof fetch)).rejects.toBeInstanceOf(BraveRateLimitError);
  });
});

describe('GitHub et Vercel (avec confirmation, simulés)', () => {
  const files = [{ path: 'index.html', data: new TextEncoder().encode('<h1>x</h1>') }];
  it('refuse d’envoyer vers un dépôt public', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test'; process.env.GITHUB_OWNER = 'salim';
    const fetchImpl = (async (u: string) => (u.endsWith('/repos/salim/site') ? new Response(JSON.stringify({ private: false, html_url: 'https://github.com/salim/site', default_branch: 'main' })) : new Response('{}', { status: 500 }))) as unknown as typeof fetch;
    await expect(pushToGithub({ repo: 'site', files, message: 'm' }, fetchImpl)).rejects.toMatchObject({ status: 403 });
  });
  it('crée un dépôt privé et pousse un commit', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test'; process.env.GITHUB_OWNER = 'salim';
    const calls: string[] = [];
    const fetchImpl = (async (u: string, init: RequestInit = {}) => {
      const path = u.replace('https://api.github.com', '');
      calls.push(`${init.method ?? 'GET'} ${path}`);
      if (path === '/repos/salim/site') return new Response('{}', { status: 404 });
      if (path === '/users/salim') return new Response(JSON.stringify({ type: 'User' }));
      if (path === '/user/repos') { expect(JSON.parse(String(init.body)).private).toBe(true); return new Response(JSON.stringify({ private: true, html_url: 'https://github.com/salim/site', default_branch: 'main' }), { status: 201 }); }
      if (path.endsWith('/git/ref/heads/main')) return new Response(JSON.stringify({ object: { sha: 'p1' } }));
      if (path.endsWith('/git/blobs') || path.endsWith('/git/trees') || path.endsWith('/git/commits')) return new Response(JSON.stringify({ sha: 's1' }), { status: 201 });
      if (path.endsWith('/git/refs/heads/main')) return new Response('{}');
      return new Response('{}', { status: 500 });
    }) as unknown as typeof fetch;
    const r = await pushToGithub({ repo: 'site', files, message: 'm' }, fetchImpl);
    expect(r.url).toBe('https://github.com/salim/site');
    expect(calls).toContain('PATCH /repos/salim/site/git/refs/heads/main');
  });
  it('déploie sur Vercel en preview par défaut (fichiers envoyés par empreinte)', async () => {
    process.env.VERCEL_DEPLOY_TOKEN = 'v-test';
    let deployment: Record<string, unknown> = {};
    const fetchImpl = (async (u: string, init: RequestInit) => {
      if (u.includes('/v2/files')) return new Response('{}');
      deployment = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ id: 'dpl_1', url: 'site-xyz.vercel.app', readyState: 'QUEUED' }));
    }) as unknown as typeof fetch;
    const r = await deployToVercel({ name: 'Boulangerie Dupont', files, render: 'react', target: 'preview' }, fetchImpl);
    expect(r.url).toBe('https://site-xyz.vercel.app');
    expect(deployment.target).toBeUndefined();
    expect(deployment.projectSettings).toMatchObject({ framework: 'vite' });
    await expect(deployToVercel({ name: 'App', files, render: 'nextjs', target: 'preview' }, fetchImpl)).rejects.toMatchObject({ status: 400 });
  });
});
