import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json } from '@/lib/server/http';
import { monthSpendUsd } from '@/lib/server/ai/anthropic';
import { getConfig } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async () => {
  const sql = db();
  const [kpi] = await sql`SELECT
      count(*) FILTER (WHERE created_at > now() - interval '7 days' AND archived_at IS NULL) AS nouveaux_7j,
      count(*) FILTER (WHERE status = 'À contacter' AND archived_at IS NULL AND NOT do_not_contact) AS a_contacter,
      count(*) FILTER (WHERE strategy IN ('explicite','marche') AND archived_at IS NULL AND NOT stale) AS demandes,
      count(*) FILTER (WHERE status <> 'À examiner' AND archived_at IS NULL) AS qualifies,
      count(*) FILTER (WHERE archived_at IS NULL) AS actifs,
      count(*) FILTER (WHERE status = 'Gagné') AS gagnes,
      count(*) FILTER (WHERE is_demo) AS demo
    FROM prospects`;
  const [tasks] = await sql`SELECT count(*) FILTER (WHERE done_at IS NULL AND due_at <= now() + interval '1 day') AS relances_dues,
      count(*) FILTER (WHERE done_at IS NULL AND due_at < now()) AS en_retard FROM prospect_tasks`;
  const [jobs] = await sql`SELECT count(*) FILTER (WHERE status IN ('en_attente','en_cours')) AS en_cours,
      count(*) FILTER (WHERE status = 'attente_reponse') AS en_attente,
      count(*) FILTER (WHERE status = 'echec' AND updated_at > now() - interval '14 days') AS echecs,
      count(*) FILTER (WHERE status = 'bloque' AND updated_at > now() - interval '14 days') AS bloques FROM generation_jobs`;
  const projects = await sql`SELECT id, name, status, render, deliverable, updated_at FROM projects WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT 6`;
  const priorities = await sql`SELECT id, name, strategy, score, status, city, need_type, created_at FROM prospects
    WHERE archived_at IS NULL AND NOT do_not_contact AND status IN ('À examiner','Qualifié','À contacter') AND NOT stale
    ORDER BY (strategy <> 'signal') DESC, score DESC, created_at DESC LIMIT 6`;
  const dueTasks = await sql`SELECT t.id, t.title, t.kind, t.due_at, p.id AS prospect_id, p.name AS prospect_name FROM prospect_tasks t
    LEFT JOIN prospects p ON p.id = t.prospect_id WHERE t.done_at IS NULL ORDER BY t.due_at NULLS LAST LIMIT 6`;
  const [brave] = await sql`SELECT count(*)::int AS n FROM usage_events WHERE provider = 'brave' AND created_at >= date_trunc('month', now()) AND NOT is_demo`;
  const spend = await monthSpendUsd();
  const config = await getConfig();
  const actifs = Number(kpi.actifs) || 0;
  return json({
    kpi: {
      nouveaux7j: Number(kpi.nouveaux_7j), aContacter: Number(kpi.a_contacter), demandes: Number(kpi.demandes),
      tauxQualification: actifs ? Math.round((Number(kpi.qualifies) / actifs) * 100) : null, gagnes: Number(kpi.gagnes), demo: Number(kpi.demo),
      relancesDues: Number(tasks.relances_dues), relancesEnRetard: Number(tasks.en_retard),
      jobsEnCours: Number(jobs.en_cours), jobsEnAttente: Number(jobs.en_attente), jobsEchecs: Number(jobs.echecs), jobsBloques: Number(jobs.bloques),
    },
    usage: { claudeUsd: spend.total, claudeUnknownCalls: spend.unknownCalls, budgetUsd: config.ai.monthlyBudgetUsd, braveQueries: Number(brave.n), braveCap: config.brave.monthlyQueryCap },
    projects, priorities, dueTasks,
  });
});
