/**
 * Contrôle de santé public : aucune donnée sensible (ni version, ni configuration détaillée).
 * Renvoie 200 si l'application et la base répondent, 503 sinon.
 */
import { db } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  let database: 'ok' | 'erreur' | 'non configurée' = 'non configurée';
  let migrations: 'à jour' | 'en retard' | 'inconnu' = 'inconnu';
  if (process.env.DATABASE_URL) {
    try {
      const rows = await db()<{ n: number }>`SELECT count(*)::int AS n FROM schema_migrations WHERE name IN ('001_v1_schema.sql','002_harmony_v2.sql','003_react_sites.sql')`;
      database = 'ok';
      migrations = Number(rows[0]?.n) >= 3 ? 'à jour' : 'en retard';
    } catch {
      database = 'erreur';
    }
  }
  const ok = database === 'ok' && migrations === 'à jour';
  return Response.json({ status: ok ? 'ok' : 'dégradé', database, migrations, latence_ms: Date.now() - started }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
