/**
 * Veille planifiée (Vercel Cron). Protégée par CRON_SECRET (en-tête Authorization: Bearer …).
 * - Exécute les recherches enregistrées dont le jour (et l'heure, si le cron est horaire) correspondent.
 * - Conserve la veille V1 (watch_enabled / watch_city) : recherche « demandes explicites ».
 * - Notifie uniquement les nouveaux résultats au-dessus du seuil.
 */
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { logError } from '@/lib/server/http';
import { runSearch } from '@/lib/server/prospects/engine';
import { getConfig } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = env.cronSecret();
  if (secret.length < 16) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Non autorisé' }, { status: 401 });
  const sql = db();
  const now = new Date();
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const day = ((now.getUTCDay() + 6) % 7) + 1; // 1 = lundi
  const hourly = process.env.CRON_HOURLY === '1';
  const runs: unknown[] = [];
  try {
    const profiles = await sql`SELECT * FROM search_profiles WHERE schedule_enabled AND ${day} = ANY(schedule_days)
      AND (last_run_at IS NULL OR last_run_at < now() - interval '20 hours')`;
    for (const p of profiles) {
      if (hourly && p.schedule_hour !== hour) continue;
      runs.push(await runSearch({ strategy: p.strategy, zones: p.zones, sectors: p.sectors, needs: p.needs, customQuery: p.custom_query, freshness: p.freshness, maxQueries: p.max_queries },
        { trigger: 'planifié', profileId: p.id, alertMinScore: p.alert_min_score }));
    }
    const config = await getConfig();
    if (config.legacy.watch_enabled && (!hourly || hour === 7)) {
      runs.push(await runSearch({ strategy: 'explicite', zones: [config.legacy.watch_city || 'Oise'], sectors: [], needs: [], customQuery: '', freshness: 'pw', maxQueries: 4 }, { trigger: 'planifié' }));
    }
    const [{ n }] = await sql<{ n: number }>`SELECT count(*)::int AS n FROM prospects WHERE status <> 'Gagné' AND last_activity_at < now() - make_interval(months => ${config.prospecting.retentionMonths})`;
    if (Number(n) > 0 && day === 1) await sql`INSERT INTO notifications(kind, title, body, link) VALUES ('rgpd', 'Durée de conservation dépassée', ${`${n} fiche(s) prospect sans activité depuis plus de ${config.prospecting.retentionMonths} mois.`}, '/parametres?onglet=prospection')`;
    await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`;
    await sql`DELETE FROM admin_sessions WHERE expires_at < now() - interval '30 days'`;
    // Médias orphelins (envoi abandonné ou jamais rattaché à un projet) : suppression après 24 h.
    await sql`DELETE FROM media_files f WHERE f.created_at < now() - interval '24 hours'
      AND (f.status <> 'pret' OR NOT EXISTS (SELECT 1 FROM project_assets a WHERE a.media_id = f.id))`;
    return Response.json({ ok: true, runs: runs.length });
  } catch (e) {
    logError('cron', e);
    return Response.json({ error: 'Échec de la veille, consulter les journaux.' }, { status: 500 });
  }
}
