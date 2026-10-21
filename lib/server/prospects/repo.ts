/** Requêtes du CRM prospects (toujours paramétrées, paginées). */
import { z } from 'zod';
import { db } from '../db';
import { PIPELINE } from '@/lib/shared/constants';

export const listQuerySchema = z.object({
  q: z.string().max(120).optional(),
  strategy: z.enum(['explicite', 'signal', 'marche', 'manuel']).optional(),
  status: z.enum(PIPELINE).optional(),
  archived: z.enum(['0', '1']).optional(),
  favorite: z.enum(['0', '1']).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  website: z.enum(['avec', 'sans', 'inconnu']).optional(),
  budget: z.enum(['1']).optional(),
  zone: z.string().max(80).optional(),
  sector: z.string().max(80).optional(),
  source: z.string().max(80).optional(),
  fresh: z.enum(['7', '30', '90']).optional(),
  tag: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(5).max(200).default(25),
  sort: z.enum(['recent', 'score', 'publication', 'activite', 'nom']).default('recent'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const LIST_COLUMNS = `id, name, source_url, platform, strategy, activity, city, location_verified, need_type, need_status, confidence, score, status,
  published_at, created_at, updated_at, website, budget_text, deadline, tags, favorite, archived_at, do_not_contact, stale, is_demo, next_action, estimated_value, evidence, signal`;

export function buildWhere(query: Omit<ListQuery, 'page' | 'pageSize' | 'sort'>) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value?: unknown) => {
    if (value !== undefined) { params.push(value); where.push(sql.replace('?', `$${params.length}`)); } else where.push(sql);
  };
  add(query.archived === '1' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL');
  if (query.q) add(`(name ILIKE ? OR city ILIKE $${params.length + 1} OR activity ILIKE $${params.length + 1} OR evidence ILIKE $${params.length + 1} OR need_type ILIKE $${params.length + 1} OR array_to_string(tags, ' ') ILIKE $${params.length + 1})`, `%${query.q.replace(/[%_\\]/g, (c) => '\\' + c)}%`);
  if (query.strategy) add('strategy = ?', query.strategy);
  if (query.status) add('status = ?', query.status);
  if (query.favorite === '1') add('favorite');
  if (query.minScore !== undefined) add('score >= ?', query.minScore);
  if (query.website === 'avec') add('website IS NOT NULL');
  if (query.website === 'sans') add("website IS NULL AND website_check IS NOT NULL");
  if (query.website === 'inconnu') add('website IS NULL AND website_check IS NULL');
  if (query.budget === '1') add("budget_text <> ''");
  if (query.zone) add('city ILIKE ?', `%${query.zone}%`);
  if (query.sector) add('activity ILIKE ?', `%${query.sector}%`);
  if (query.source) add('platform ILIKE ?', `%${query.source}%`);
  if (query.fresh) add(`coalesce(published_at, created_at) > now() - make_interval(days => ?)`, Number(query.fresh));
  if (query.tag) add('? = ANY(tags)', query.tag);
  return { where: where.join(' AND '), params };
}

const ORDER: Record<ListQuery['sort'], string> = {
  recent: 'created_at DESC',
  score: 'score DESC, created_at DESC',
  publication: 'published_at DESC NULLS LAST, created_at DESC',
  activite: 'last_activity_at DESC',
  nom: 'name ASC',
};

export async function listProspects(query: ListQuery) {
  const { where, params } = buildWhere(query);
  const sql = db();
  const offset = (query.page - 1) * query.pageSize;
  const rows = await sql.query(`SELECT ${LIST_COLUMNS} FROM prospects WHERE ${where} ORDER BY ${ORDER[query.sort]} LIMIT ${query.pageSize} OFFSET ${offset}`, params);
  const [count] = await sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM prospects WHERE ${where}`, params);
  const byStatus = await sql.query<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM prospects WHERE archived_at IS NULL GROUP BY status`);
  return { items: rows, total: Number(count?.n ?? 0), page: query.page, pageSize: query.pageSize, byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])) };
}

export async function addEvent(prospectId: string, kind: string, detail: string, from?: string | null, to?: string | null) {
  await db()`INSERT INTO pipeline_events(prospect_id, kind, from_status, to_status, detail) VALUES (${prospectId}, ${kind}, ${from ?? null}, ${to ?? null}, ${detail.slice(0, 1000)})`;
  await db()`UPDATE prospects SET last_activity_at = now() WHERE id = ${prospectId}`;
}
