import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json } from '@/lib/server/http';
import { importLegacyBlob } from '@/lib/server/studio/media';
import { getProject, nextSlug } from '@/lib/server/studio/projects';

export const maxDuration = 60;
type P = { id: string };

/** Rapatrie les photos V1 (Vercel Blob public) dans le stockage privé et les associe au projet. */
export const POST = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const project = await getProject(params.id);
  const urls = (Array.isArray(project.images) ? project.images : []).filter((u): u is string => typeof u === 'string');
  const sql = db();
  const results: { url: string; ok: boolean; error?: string }[] = [];
  for (const url of urls.slice(0, 10)) {
    try {
      const media = await importLegacyBlob(url);
      const slug = await nextSlug(params.id, 'photo', 'image');
      const [{ n }] = await sql<{ n: number }>`SELECT count(*)::int AS n FROM project_assets WHERE project_id = ${params.id}`;
      await sql`INSERT INTO project_assets(project_id, media_id, role, slug, position) VALUES (${params.id}, ${media.id}, 'photo', ${slug}, ${Number(n)}) ON CONFLICT DO NOTHING`;
      results.push({ url, ok: true });
    } catch (e) {
      results.push({ url, ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'Erreur' });
    }
  }
  const imported = results.filter((r) => r.ok).map((r) => r.url);
  if (imported.length) {
    const remaining = urls.filter((u) => !imported.includes(u));
    await sql`UPDATE projects SET images = ${JSON.stringify(remaining)}::jsonb WHERE id = ${params.id}`;
  }
  return json({ results });
}, { limit: 'upload' });
