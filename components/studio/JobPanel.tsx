'use client';
import { useState } from 'react';
import { AlertTriangle, Check, Loader2, Pause, Play, RefreshCw, Square, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtUsd } from '@/lib/client/format';
import { Alert, useErrorToast } from '../ui';

export type Plan = {
  brief_enrichi: string; concept: string; palette: { nom: string; hex: string }[]; typographies: { titres: string; texte: string };
  pages: { fichier: string; titre: string; objectif: string; sections: string[] }[]; photos: { fichier: string; description: string; usage: string }[];
  fonctionnalites: { nom: string; mise_en_oeuvre: string; statut: string }[]; a_renseigner: string[]; questions_bloquantes: string[];
  modules: { nom: string; description: string; fichiers: string[] }[]; modele_donnees: string; roles: string[]; integrations: { nom: string; statut: string }[];
};
export type Job = {
  id: string; kind: string; status: string; error: string; costUsd: number; inputTokens: number; outputTokens: number; plan?: Plan | null; projectStatus?: string;
  steps: { key: string; label: string; status: string; detail: string; costUsd: number | null }[]; build: { executed: boolean; ok: boolean; reason?: string } | null;
};

const KIND_LABEL: Record<string, string> = { creation: 'Création', modification: 'Modification', correction: 'Correction', construction: 'Construction' };

export default function JobPanel({ job, running, onUpdate, onResume }: { job: Job; running: boolean; onUpdate: (j: Job) => void; onResume: () => void }) {
  const onError = useErrorToast();
  const done = job.steps.filter((s) => ['termine', 'ignore', 'bloque'].includes(s.status)).length;
  const pct = job.steps.length ? Math.round((done / job.steps.length) * 100) : 0;
  const act = async (path: string, body?: unknown) => {
    try { onUpdate(await api<Job>(`/api/jobs/${job.id}/${path}`, body ? { json: body } : { method: 'POST' })); } catch (e) { onError(e); }
  };
  const active = ['en_attente', 'en_cours'].includes(job.status);
  return (
    <section className="card" style={{ marginBottom: 16, animation: 'rise .4s var(--ease) both' }}>
      <div className="card-head">
        <div>
          <div className="card-title">{active ? <Loader2 size={16} className="spin" color="var(--gold)" /> : job.status === 'echec' ? <AlertTriangle size={16} color="var(--red)" /> : job.status === 'attente_reponse' ? <Pause size={16} color="var(--gold)" /> : <Check size={16} color="var(--green)" />}
            {KIND_LABEL[job.kind]} — {job.status === 'attente_reponse' ? 'plan à valider' : job.status === 'en_cours' || job.status === 'en_attente' ? 'en cours' : job.status === 'echec' ? 'échec' : job.status === 'bloque' ? 'bloqué' : job.status === 'annule' ? 'annulé' : 'terminé'}</div>
          <div className="card-sub">Coût estimé : {fmtUsd(job.costUsd, 3)} · {job.inputTokens.toLocaleString('fr-FR')} tokens en entrée, {job.outputTokens.toLocaleString('fr-FR')} en sortie</div>
        </div>
        <div className="row">
          {active && !running ? <button className="btn btn-sm btn-primary" onClick={onResume}><Play size={14} />Reprendre</button> : null}
          {job.status === 'echec' ? <button className="btn btn-sm btn-primary" onClick={() => act('retry').then(onResume)}><RefreshCw size={14} />Réessayer l’étape</button> : null}
          {['en_attente', 'en_cours', 'attente_reponse'].includes(job.status) ? <button className="btn btn-sm btn-ghost" onClick={() => act('cancel')}><Square size={13} />Annuler</button> : null}
        </div>
      </div>
      <div className="card-pad stack" style={{ gap: 10 }}>
        <div className="progress" aria-label={`Progression ${pct} %`}><span style={{ width: `${pct}%` }} /></div>
        {job.error ? <Alert kind="error">{job.error}</Alert> : null}
        {job.build && !job.build.executed ? <Alert kind="warn">{job.build.reason}</Alert> : null}
        <div className="steps">
          {job.steps.map((s) => (
            <div key={s.key} className="step" data-status={s.status}>
              <span className="step-icon">{s.status === 'termine' ? <Check size={13} /> : s.status === 'echec' ? <X size={13} /> : s.status === 'en_cours' ? <Loader2 size={13} className="spin" /> : s.status === 'bloque' ? '!' : null}</span>
              <div style={{ minWidth: 0 }}><div className="small strong">{s.label}</div>{s.detail ? <div className="tiny muted" style={{ wordBreak: 'break-word' }}>{s.detail}</div> : null}</div>
              <span className="tiny faint">{s.costUsd !== null ? fmtUsd(s.costUsd, 3) : ''}</span>
            </div>
          ))}
        </div>
        {job.status === 'attente_reponse' && job.plan ? <PlanReview job={job} plan={job.plan} onUpdate={(j) => { onUpdate(j); onResume(); }} /> : null}
      </div>
    </section>
  );
}

function PlanReview({ job, plan: initial, onUpdate }: { job: Job; plan: Plan; onUpdate: (j: Job) => void }) {
  const onError = useErrorToast();
  const [plan, setPlan] = useState<Plan>(initial);
  const [answers, setAnswers] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const upPage = (i: number, patch: Partial<Plan['pages'][number]>) => setPlan({ ...plan, pages: plan.pages.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <div className="stack" style={{ gap: 12, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div className="eyebrow" style={{ margin: 0 }}>Plan proposé par Claude — modifiable</div>
      {plan.questions_bloquantes.length ? (
        <Alert kind="warn"><b>Questions bloquantes</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{plan.questions_bloquantes.map((q) => <li key={q}>{q}</li>)}</ul></Alert>
      ) : null}
      {plan.questions_bloquantes.length ? <div className="field"><label htmlFor="pl-ans">Vos réponses</label><textarea id="pl-ans" className="textarea" rows={3} value={answers} onChange={(e) => setAnswers(e.target.value)} /></div> : null}
      <div className="field"><label htmlFor="pl-brief">Brief enrichi</label><textarea id="pl-brief" className="textarea" rows={5} value={plan.brief_enrichi} onChange={(e) => setPlan({ ...plan, brief_enrichi: e.target.value })} /></div>
      {plan.concept ? <div className="small"><b>Concept :</b> {plan.concept}</div> : null}
      {plan.palette.length ? <div className="row row-wrap">{plan.palette.map((c) => <span key={c.hex + c.nom} className="row tiny" style={{ gap: 6 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: /^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : 'transparent', border: '1px solid var(--line)' }} />{c.nom} {c.hex}</span>)}</div> : null}
      <div className="stack" style={{ gap: 8 }}>
        <span className="label">{plan.modules.length ? 'Écrans' : 'Pages'} ({plan.pages.length})</span>
        {plan.pages.map((p, i) => (
          <div key={i} className="card card-pad" style={{ boxShadow: 'none', display: 'grid', gap: 6 }}>
            <div className="row"><input className="input" value={p.titre} aria-label="Titre de la page" onChange={(e) => upPage(i, { titre: e.target.value })} /><span className="tiny mono faint">{p.fichier}</span>
              {plan.pages.length > 1 && i > 0 ? <button className="btn btn-ghost btn-icon btn-sm" aria-label="Retirer la page" onClick={() => setPlan({ ...plan, pages: plan.pages.filter((_, j) => j !== i) })}><X size={14} /></button> : null}</div>
            <input className="input" value={p.objectif} aria-label="Objectif" onChange={(e) => upPage(i, { objectif: e.target.value })} />
            <textarea className="textarea" rows={2} aria-label="Sections" value={p.sections.join('\n')} onChange={(e) => upPage(i, { sections: e.target.value.split('\n').filter(Boolean) })} />
          </div>
        ))}
        {!plan.modules.length && plan.pages.length < 10 ? <button className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => setPlan({ ...plan, pages: [...plan.pages, { fichier: `page-${plan.pages.length + 1}.html`, titre: 'Nouvelle page', objectif: '', sections: [] }] })}>+ Ajouter une page</button> : null}
      </div>
      {plan.modules.length ? <div className="small"><b>Modules :</b> {plan.modules.map((m) => m.nom).join(', ')}<br /><b>Données :</b> {plan.modele_donnees}<br /><b>Rôles :</b> {plan.roles.join(', ')}</div> : null}
      {plan.fonctionnalites.length ? <div className="small"><b>Fonctionnalités :</b><ul style={{ margin: '4px 0', paddingLeft: 18 }}>{plan.fonctionnalites.map((f) => <li key={f.nom}>{f.nom} — <span className="muted">{f.statut || f.mise_en_oeuvre}</span></li>)}</ul></div> : null}
      {plan.a_renseigner.length ? <Alert kind="info"><b>Restera « À renseigner » :</b> {plan.a_renseigner.join(' · ')}</Alert> : null}
      <div className="row row-wrap between">
        <div className="row" style={{ flex: 1, minWidth: 240 }}><input className="input" placeholder="Remarque pour un nouveau plan…" value={feedback} onChange={(e) => setFeedback(e.target.value)} aria-label="Remarque" /><button className="btn" disabled={busy || feedback.trim().length < 3} onClick={async () => { setBusy(true); try { onUpdate(await api<Job>(`/api/jobs/${job.id}/replan`, { json: { feedback } })); } catch (e) { onError(e); } finally { setBusy(false); } }}>Nouveau plan</button></div>
        <button className="btn btn-gold" disabled={busy} onClick={async () => { setBusy(true); try { onUpdate(await api<Job>(`/api/jobs/${job.id}/approve`, { json: { plan, answers: answers || undefined } })); } catch (e) { onError(e); } finally { setBusy(false); } }}>{busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}Valider le plan et générer</button>
      </div>
    </div>
  );
}
