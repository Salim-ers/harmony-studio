import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { json, readJson } from '@/lib/server/http';
import { createProjectSchema } from '@/lib/server/studio/schemas';
import { deliverableKind, deliverableLabel } from '@/lib/shared/constants';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async ({ request }) => {
  const archived = new URL(request.url).searchParams.get('archived') === '1';
  const projects = await db()`SELECT p.id, p.name, p.client_name, p.sector, p.city, p.deliverable, p.render, p.status, p.summary, p.brief, p.category, p.style,
      p.prospect_id, p.current_version_id, p.is_demo, p.archived_at, p.created_at, p.updated_at, v.number AS version_number,
      (SELECT a.media_id FROM project_assets a WHERE a.project_id = p.id AND a.role IN ('photo','logo') ORDER BY (a.role = 'photo') DESC, a.position LIMIT 1) AS cover_media_id,
      (SELECT status FROM generation_jobs j WHERE j.project_id = p.id ORDER BY created_at DESC LIMIT 1) AS last_job_status
    FROM projects p LEFT JOIN project_versions v ON v.id = p.current_version_id
    WHERE (p.archived_at IS NOT NULL) = ${archived} ORDER BY p.updated_at DESC LIMIT 200`;
  return json({ projects });
});

export const POST = adminRoute(async ({ request }) => {
  const b = await readJson(request, createProjectSchema, 100_000);
  const render = deliverableKind(b.deliverable) === 'app' ? 'nextjs' : b.render;
  const [row] = await db()<{ id: string }>`INSERT INTO projects(name, category, style, brief, images, current_html, summary, client_name, sector, city, deliverable, render,
      brief_data, matrix_overrides, status, prospect_id)
    VALUES (${b.name}, ${deliverableLabel(b.deliverable)}, ${b.brief.style || 'À définir'}, ${b.brief.brief}, '[]'::jsonb, NULL, '', ${b.brief.clientName}, ${b.brief.sector},
      ${b.brief.city}, ${b.deliverable}, ${render}, ${JSON.stringify(b.brief)}::jsonb, ${JSON.stringify(b.matrix_overrides)}::jsonb, 'Brouillon', ${b.prospect_id})
    RETURNING id`;
  await audit('projet_cree', { type: 'project', id: row.id });
  return json({ id: row.id, render }, { status: 201 });
});
