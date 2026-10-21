import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db } from '@/lib/server/db';
import { badRequest, json, readJson } from '@/lib/server/http';
import { listProspects, listQuerySchema } from '@/lib/server/prospects/repo';
import { canonicalUrl, domainOf, normalizeName, platformOf } from '@/lib/server/prospects/url';
import { computeScore } from '@/lib/server/prospects/score';
import { audit } from '@/lib/server/audit';

export const dynamic = 'force-dynamic';

export const GET = adminRoute(async ({ request }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return json(await listProspects(listQuerySchema.parse(params)));
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(180),
  source_url: z.string().trim().max(1500).optional().default(''),
  city: z.string().trim().max(90).default(''),
  activity: z.string().trim().max(100).default(''),
  need_type: z.string().trim().max(100).default(''),
  notes: z.string().max(3000).default(''),
  website: z.string().trim().max(500).optional().default(''),
});

export const POST = adminRoute(async ({ request }) => {
  const body = await readJson(request, createSchema);
  let canonical: string;
  if (body.source_url) {
    const c = canonicalUrl(body.source_url);
    if (!c) throw badRequest('URL source invalide : http(s) uniquement.');
    canonical = c;
  } else canonical = `urn:harmony:manuel:${randomUUID()}`;
  const website = body.website ? canonicalUrl(body.website) : null;
  if (body.website && !website) throw badRequest('URL du site invalide.');
  const { score, details } = computeScore({ strategy: 'manuel', confidence: 'faible', publishedAt: null, needType: body.need_type, locationMatch: '', urgent: false, budgetText: '', hasQuote: false, platformType: 'web', deadline: null });
  const sql = db();
  const rows = await sql<{ id: string }>`INSERT INTO prospects(name, source_url, canonical_url, source_type, city, category, evidence, signal, score, score_details, status, notes,
      strategy, activity, domain, dedupe_key, platform, need_type, need_status, confidence, confidence_reason, website, next_action)
    VALUES (${body.name}, ${canonical}, ${canonical}, 'Ajout manuel', ${body.city}, ${body.need_type || 'À préciser'}, '', 'Ajout manuel', ${score}, ${JSON.stringify(details)}::jsonb,
      'À examiner', ${body.notes}, 'manuel', ${body.activity}, ${body.source_url ? domainOf(canonical) : ''}, ${`n:${normalizeName(body.name)}|${normalizeName(body.city)}`},
      ${body.source_url ? platformOf(canonical).name : 'Ajout manuel'}, ${body.need_type}, 'inconnu', 'faible', 'Fiche saisie manuellement : besoin à qualifier.', ${website}, 'Qualifier le besoin')
    ON CONFLICT DO NOTHING RETURNING id`;
  if (!rows[0]) return json({ error: 'Ce lien existe déjà dans vos prospects.' }, { status: 409 });
  const id = rows[0].id;
  if (body.source_url) await sql`INSERT INTO prospect_sources(prospect_id, url, platform, title) VALUES (${id}, ${canonical}, ${platformOf(canonical).name}, ${body.name})`;
  if (body.notes.trim()) await sql`INSERT INTO prospect_notes(prospect_id, body) VALUES (${id}, ${body.notes})`;
  await sql`INSERT INTO pipeline_events(prospect_id, kind, to_status, detail) VALUES (${id}, 'création', 'À examiner', 'Ajout manuel')`;
  await audit('prospect_cree', { type: 'prospect', id });
  return json({ ok: true, id }, { status: 201 });
});
