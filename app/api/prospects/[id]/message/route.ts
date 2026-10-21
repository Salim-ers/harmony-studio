import { z } from 'zod';
import { adminRoute } from '@/lib/server/api';
import { db, UUID_RE } from '@/lib/server/db';
import { badRequest, json, notFound, readJson } from '@/lib/server/http';
import { callClaude } from '@/lib/server/ai/anthropic';
import { extractJson } from '@/lib/server/ai/fileformat';
import { messagePrompt } from '@/lib/server/ai/prompts';
import { getConfig } from '@/lib/server/settings';
import { addEvent } from '@/lib/server/prospects/repo';

export const maxDuration = 120;
type P = { id: string };
const schema = z.object({
  channel: z.enum(['E-mail', 'Formulaire de contact', 'Téléphone', 'LinkedIn']),
  tone: z.enum(['chaleureux', 'professionnel', 'direct']).default('professionnel'),
  mode: z.enum(['claude', 'modele']).default('claude'),
});

/** Faits VÉRIFIÉS uniquement : ce qui est supposé est présenté comme tel. */
function facts(p: Record<string, unknown>) {
  const lines = [
    `Nom / enseigne : ${p.name}`,
    p.activity ? `Activité : ${p.activity}` : '',
    p.city ? `Localisation : ${p.city}${p.location_verified ? '' : ' (non vérifiée)'}` : '',
    p.need_type ? `Besoin : ${p.need_type} — statut ${p.need_status === 'confirmé' ? 'EXPRIMÉ dans la source' : 'SUPPOSÉ (ne pas l’affirmer)'}` : '',
    p.platform ? `Source : ${p.platform}${p.published_label ? `, publiée ${p.published_label}` : ''}` : '',
    p.evidence ? `Extrait de la source : ${String(p.evidence).slice(0, 400)}` : '',
    p.website ? `Site actuel : ${p.website}` : 'Site actuel : inconnu',
  ];
  const check = p.website_check as { hints?: string[] } | null;
  if (check?.hints?.length) lines.push(`Observations sur le site (indices, pas des certitudes) : ${check.hints.slice(0, 4).join(' ; ')}`);
  return lines.filter(Boolean).join('\n');
}

function template(p: Record<string, unknown>, channel: string, company: string, signatory: string) {
  const need = p.need_status === 'confirmé' && p.need_type ? `J’ai vu que vous recherchiez un prestataire pour : ${String(p.need_type).toLowerCase()}.` : `Je me permets de vous écrire pour savoir si la création ou la modernisation de votre présence en ligne est un sujet pour ${p.name}.`;
  const body = `Bonjour,\n\n${need}\n\n${company} accompagne les commerçants, artisans et PME dans la création de sites internet modernes, d’outils de gestion et de solutions digitales sur mesure.\n\nSeriez-vous disponible pour un échange de 15 minutes cette semaine ou la suivante ?\n\nBien cordialement,\n${signatory} — ${company}${channel === 'E-mail' ? '\n\nSi vous ne souhaitez plus être contacté, répondez simplement STOP.' : ''}`;
  return { objet: channel === 'E-mail' ? `${p.name} — votre présence en ligne` : '', message: body };
}

export const POST = adminRoute<P>(async ({ request, params }) => {
  if (!UUID_RE.test(params.id)) throw badRequest('Identifiant invalide.');
  const body = await readJson(request, schema);
  const [p] = await db()`SELECT * FROM prospects WHERE id = ${params.id}`;
  if (!p) throw notFound('Prospect introuvable.');
  if (p.do_not_contact) throw badRequest('Ce prospect s’est opposé à être contacté : aucun message ne peut être préparé.');
  const config = await getConfig();
  if (body.mode === 'modele') return json({ draft: template(p, body.channel, config.company.name, config.company.signatory), source: 'modèle', sent: false });
  const res = await callClaude({
    purpose: 'message', model: config.ai.planModel, maxTokens: 1500,
    system: 'Tu es l’assistant commercial de Harmony Solutions. Tu rédiges en français des messages de prospection B2B personnalisés, sobres et conformes au RGPD. Tu n’inventes jamais de fait.',
    messages: [{ role: 'user', content: messagePrompt({ channel: body.channel, facts: facts(p), company: config.company.name, valueProposition: config.company.valueProposition, signatory: config.company.signatory, tone: body.tone }) }],
  });
  let draft: { objet: string; message: string };
  try { draft = extractJson(res.text); } catch { draft = { objet: '', message: res.text.trim() }; }
  await addEvent(params.id, 'message', `Brouillon ${body.channel} préparé (non envoyé)`);
  return json({ draft, source: res.demo ? 'simulation' : 'claude', costUsd: res.costUsd, sent: false });
});
