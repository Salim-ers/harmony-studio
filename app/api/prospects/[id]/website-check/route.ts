import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound } from '@/lib/server/http';
import { addEvent } from '@/lib/server/prospects/repo';
import { checkWebsite } from '@/lib/server/prospects/website-check';
import { assertPublicUrl } from '@/lib/server/safe-fetch';

export const maxDuration = 30;
type P = { id: string };

export const POST = adminRoute<P>(async ({ params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const [p] = await db()<{ website: string | null }>`SELECT website FROM prospects WHERE id = ${params.id}`;
  if (!p) throw notFound('Prospect introuvable.');
  if (!p.website) throw badRequest('Aucun site connu pour ce prospect : lancez d’abord « Chercher son site » ou renseignez-le.');
  try { assertPublicUrl(p.website); } catch (e) { throw badRequest(e instanceof Error ? e.message : 'URL refusée.'); }
  const result = await checkWebsite(p.website);
  await db()`UPDATE prospects SET website_check = ${JSON.stringify(result)}::jsonb, updated_at = now() WHERE id = ${params.id}`;
  await addEvent(params.id, 'analyse', `Analyse du site : ${result.hints.length} indice(s)`);
  return json({ check: result });
}, { limit: 'websiteCheck' });
