/**
 * Client de l'API Messages d'Anthropic (appel HTTPS officiel, côté serveur uniquement).
 * - Clé : ANTHROPIC_API_KEY (facturation API, distincte d'un abonnement Claude.ai).
 * - Réponses en streaming (SSE) pour éviter les délais d'inactivité sur les longues générations.
 * - Chaque appel est journalisé dans usage_events avec son coût estimé (grille modifiable).
 * - Contrôle de budget AVANT l'appel : aucun frais disproportionné silencieux.
 */
import { db } from '../db';
import { env, mocksEnabled } from '../env';
import { HttpError, notConfigured, upstream } from '../http';
import { getConfig } from '../settings';
import { mockClaude } from './mock';

export type ContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string }; title?: string };

export type ClaudeRequest = {
  purpose: string;
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string | ContentBlock[] }[];
  maxTokens: number;
  projectId?: string | null;
  jobId?: string | null;
  cacheSystem?: boolean;
};

export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number };
export type ClaudeResult = { text: string; stopReason: string; usage: Usage; costUsd: number | null; demo: boolean; model: string };

export class BudgetError extends HttpError {
  constructor(message: string) {
    super(402, message, 'BUDGET');
  }
}

export function priceFor(pricing: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }>, model: string) {
  if (pricing[model]) return pricing[model];
  const base = Object.keys(pricing).find((k) => model.startsWith(k));
  return base ? pricing[base] : null;
}

export function costOf(price: ReturnType<typeof priceFor>, usage: Usage) {
  if (!price) return null;
  return (usage.input_tokens * price.input + usage.output_tokens * price.output + usage.cache_creation_input_tokens * price.cacheWrite + usage.cache_read_input_tokens * price.cacheRead) / 1_000_000;
}

export function estimateInputTokens(req: Pick<ClaudeRequest, 'system' | 'messages'>) {
  let chars = req.system.length;
  let extra = 0;
  for (const m of req.messages) {
    if (typeof m.content === 'string') chars += m.content.length;
    else for (const b of m.content) {
      if (b.type === 'text') chars += b.text.length;
      else if (b.type === 'image') extra += 2300;
      else extra += Math.ceil((b.source.data.length * 0.75) / 1000) * 3;
    }
  }
  return Math.ceil(chars / 3.2) + extra;
}

export async function monthSpendUsd() {
  const rows = await db()<{ total: string | null; unknown: string }>`
    SELECT coalesce(sum(cost_usd), 0) AS total, count(*) FILTER (WHERE cost_usd IS NULL AND provider = 'anthropic' AND NOT is_demo) AS unknown
    FROM usage_events WHERE provider = 'anthropic' AND created_at >= date_trunc('month', now())`;
  return { total: Number(rows[0]?.total ?? 0), unknownCalls: Number(rows[0]?.unknown ?? 0) };
}

/** Vérifie le budget mensuel et, si fourni, le budget restant du job. Retourne l'estimation maximale. */
export async function checkBudget(req: ClaudeRequest, jobSpent?: number) {
  const config = await getConfig();
  const price = priceFor(config.pricing, req.model);
  if (!price) throw new BudgetError(`Aucune grille tarifaire pour le modèle « ${req.model} » : ajoutez-la dans Paramètres → Intégrations & coûts pour que le budget puisse être contrôlé.`);
  const maxCost = (estimateInputTokens(req) * price.input + req.maxTokens * price.output) / 1_000_000;
  const { total } = await monthSpendUsd();
  if (config.ai.monthlyBudgetUsd > 0 && total + maxCost > config.ai.monthlyBudgetUsd)
    throw new BudgetError(`Budget IA mensuel atteint ou insuffisant : ${total.toFixed(2)} $ consommés sur ${config.ai.monthlyBudgetUsd.toFixed(2)} $ (cet appel peut coûter jusqu’à ${maxCost.toFixed(2)} $). Augmentez le plafond dans Paramètres si vous le souhaitez.`);
  if (jobSpent !== undefined && config.ai.jobBudgetUsd > 0 && jobSpent + maxCost > config.ai.jobBudgetUsd)
    throw new BudgetError(`Plafond par génération atteint : ${jobSpent.toFixed(2)} $ dépensés, plafond ${config.ai.jobBudgetUsd.toFixed(2)} $ (prochain appel jusqu’à ${maxCost.toFixed(2)} $).`);
  return { maxCost, price };
}

async function readStream(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason = '';
  const usage: Usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload) continue;
      const event = JSON.parse(payload);
      if (event.type === 'message_start') Object.assign(usage, Object.fromEntries(Object.entries(event.message?.usage ?? {}).filter(([, v]) => typeof v === 'number')));
      else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') text += event.delta.text;
      else if (event.type === 'message_delta') {
        stopReason = event.delta?.stop_reason ?? stopReason;
        if (typeof event.usage?.output_tokens === 'number') usage.output_tokens = event.usage.output_tokens;
      } else if (event.type === 'error') throw upstream(`Claude : ${event.error?.message ?? 'erreur de streaming'}`);
    }
  }
  return { text, stopReason, usage };
}

export async function callClaude(req: ClaudeRequest, opts: { jobSpent?: number; fetchImpl?: typeof fetch } = {}): Promise<ClaudeResult> {
  const key = env.anthropicKey();
  const sql = db();
  if (!key) {
    if (mocksEnabled()) {
      const text = mockClaude(req);
      const usage = { input_tokens: estimateInputTokens(req), output_tokens: Math.ceil(text.length / 3.5), cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      await sql`INSERT INTO usage_events(provider, operation, model, input_tokens, output_tokens, cost_usd, ok, project_id, job_id, is_demo, detail)
        VALUES ('anthropic', ${req.purpose}, ${req.model}, ${usage.input_tokens}, ${usage.output_tokens}, 0, true, ${req.projectId ?? null}, ${req.jobId ?? null}, true, 'SIMULATION')`;
      return { text, stopReason: 'end_turn', usage, costUsd: 0, demo: true, model: req.model };
    }
    throw notConfigured('ANTHROPIC_API_KEY non configurée : la génération par Claude est indisponible. Ajoutez la clé dans les variables d’environnement Vercel.');
  }
  const { price } = await checkBudget(req, opts.jobSpent);
  const system = req.cacheSystem ? [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }] : req.system;
  const doFetch = opts.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: req.model, max_tokens: req.maxTokens, system, messages: req.messages, stream: true }),
      signal: AbortSignal.timeout(780_000),
      cache: 'no-store',
    });
  } catch (e) {
    await sql`INSERT INTO usage_events(provider, operation, model, ok, project_id, job_id, detail) VALUES ('anthropic', ${req.purpose}, ${req.model}, false, ${req.projectId ?? null}, ${req.jobId ?? null}, 'réseau/timeout')`;
    throw upstream(`Claude injoignable (${e instanceof Error && e.name === 'TimeoutError' ? 'délai dépassé' : 'erreur réseau'}).`);
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { message = ((await response.json()) as { error?: { message?: string } }).error?.message ?? message; } catch { /* corps non JSON */ }
    await sql`INSERT INTO usage_events(provider, operation, model, ok, project_id, job_id, detail) VALUES ('anthropic', ${req.purpose}, ${req.model}, false, ${req.projectId ?? null}, ${req.jobId ?? null}, ${String(response.status)})`;
    if (response.status === 429) throw new HttpError(429, 'Limite de débit ou quota de l’API Claude atteint. Réessayez plus tard.', 'QUOTA');
    if (response.status === 401) throw upstream('Clé API Claude refusée (401) : vérifiez ANTHROPIC_API_KEY.');
    if (response.status === 404) throw upstream(`Modèle « ${req.model} » introuvable : changez-le dans Paramètres.`);
    if (response.status === 529 || response.status === 503) throw upstream('API Claude temporairement surchargée. Réessayez dans quelques minutes.');
    throw upstream(`Claude : ${message.slice(0, 300)}`);
  }
  const { text, stopReason, usage } = await readStream(response);
  const cost = costOf(price, usage);
  await sql`INSERT INTO usage_events(provider, operation, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, ok, project_id, job_id)
    VALUES ('anthropic', ${req.purpose}, ${req.model}, ${usage.input_tokens}, ${usage.output_tokens}, ${usage.cache_read_input_tokens}, ${usage.cache_creation_input_tokens}, ${cost}, true, ${req.projectId ?? null}, ${req.jobId ?? null})`;
  return { text, stopReason, usage, costUsd: cost, demo: false, model: req.model };
}
