import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Recherche globale (prospects, projets, devis) pour la palette de commandes. */
export const GET = adminRoute(async ({ request }) => {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const sql = db();
  const [prospects, projects, quotes] = await Promise.all([
    sql`SELECT id, name, city, status FROM prospects WHERE name ILIKE ${like} OR city ILIKE ${like} OR activity ILIKE ${like} ORDER BY updated_at DESC LIMIT 8`,
    sql`SELECT id, name, status FROM projects WHERE name ILIKE ${like} OR client_name ILIKE ${like} ORDER BY updated_at DESC LIMIT 6`,
    sql`SELECT id, number, title FROM quotes WHERE number ILIKE ${like} OR title ILIKE ${like} OR client_name ILIKE ${like} ORDER BY created_at DESC LIMIT 5`,
  ]);
  return json({
    results: [
      ...prospects.map((p) => ({ type: 'Prospect', label: p.name, detail: `${p.city || 'Lieu inconnu'} · ${p.status}`, href: `/prospection/${p.id}` })),
      ...projects.map((p) => ({ type: 'Projet', label: p.name, detail: p.status, href: `/creation/${p.id}` })),
      ...quotes.map((q) => ({ type: 'Devis', label: `${q.number} — ${q.title}`, detail: '', href: `/devis/${q.id}` })),
    ],
  });
});
