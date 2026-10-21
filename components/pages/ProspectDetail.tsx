'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Archive, ArrowLeft, CalendarPlus, Check, Copy, ExternalLink, FileText, Globe, Loader2, MessageSquareText, PhoneCall, Search, ShieldOff, Sparkles, Star, Trash2, Wand2,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtDate, fmtDateTime, fmtEuro, isUrn, relative } from '@/lib/client/format';
import { PIPELINE, STRATEGIES, TASK_KINDS, type Strategy } from '@/lib/shared/constants';
import { Alert, ConfirmDialog, DemoBadge, Modal, ScoreBadge, SkeletonRows, StatusBadge, StrategyBadge, useErrorToast, useLoad, useToast } from '../ui';

type Detail = {
  prospect: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  sources: { id: string; url: string; platform: string; title: string; excerpt: string; published_at: string | null; published_label: string; query: string; discovered_at: string }[];
  notes: { id: string; body: string; created_at: string }[];
  tasks: { id: string; title: string; kind: string; due_at: string | null; done_at: string | null }[];
  events: { id: string; kind: string; detail: string; created_at: string }[];
  quotes: { id: string; number: string; title: string; status: string; total_ttc: string }[];
  projects: { id: string; name: string; status: string }[];
};

export default function ProspectDetail({ id }: { id: string }) {
  const router = useRouter();
  const notify = useToast().notify;
  const onError = useErrorToast();
  const { data, error, loading, reload } = useLoad(() => api<Detail>(`/api/prospects/${id}`), [id]);
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState<'' | 'message' | 'contact' | 'delete' | 'opposition'>('');
  const [note, setNote] = useState('');
  const [task, setTask] = useState({ title: '', kind: 'relance', due: '' });

  if (loading && !data) return <div className="card"><SkeletonRows rows={10} /></div>;
  if (error || !data) return <Alert kind="error">{error || 'Prospect introuvable.'}</Alert>;
  const p = data.prospect;
  const details = (p.score_details ?? []) as { label: string; points: number }[];
  const contacts = (p.contacts ?? []) as { type: string; value: string; source: string; found_at: string }[];
  const check = p.website_check as { hints?: string[]; positives?: string[]; checked_at?: string; error?: string; robots_blocked?: boolean; title?: string } | null;

  async function patch(body: Record<string, unknown>, message = 'Fiche mise à jour.') {
    try { await api(`/api/prospects/${id}`, { method: 'PATCH', json: body }); notify(message); await reload(); } catch (e) { onError(e); }
  }
  async function action(path: string, label: string) {
    setBusy(path);
    try { await api(`/api/prospects/${id}/${path}`, { method: 'POST' }); notify(label); await reload(); } catch (e) { onError(e); } finally { setBusy(''); }
  }

  return (
    <>
      <Link href="/prospection" className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }}><ArrowLeft size={15} />Opportunités</Link>
      <div className="page-head">
        <div>
          <div className="row row-wrap" style={{ marginBottom: 8 }}><StrategyBadge strategy={p.strategy} /><StatusBadge status={p.status} /><DemoBadge show={p.is_demo} />{p.do_not_contact ? <span className="badge badge-red">Opposition RGPD</span> : null}{p.stale ? <span className="badge badge-amber">Source ancienne</span> : null}</div>
          <h1 className="page-title">{p.name}</h1>
          <p className="page-desc">{p.activity || 'Activité inconnue'} · {p.city || 'Localisation inconnue'}{p.city ? (p.location_verified ? ' (mentionnée dans la source)' : ' (non vérifiée)') : ''}</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-icon" aria-label={p.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => patch({ favorite: !p.favorite })}><Star size={16} fill={p.favorite ? 'var(--gold)' : 'none'} color={p.favorite ? 'var(--gold)' : 'currentColor'} /></button>
          <button className="btn" onClick={() => patch({ archived: !p.archived_at }, p.archived_at ? 'Fiche désarchivée.' : 'Fiche archivée.')}><Archive size={15} />{p.archived_at ? 'Désarchiver' : 'Archiver'}</button>
          <button className="btn" disabled={p.do_not_contact} onClick={() => setModal('message')}><MessageSquareText size={15} />Préparer un message</button>
          <button className="btn btn-primary" disabled={p.do_not_contact} onClick={() => setModal('contact')}><PhoneCall size={15} />J’ai contacté</button>
        </div>
      </div>
      <div className="grid g-main-side">
        <div className="stack">
          <section className="card">
            <div className="card-head"><div className="card-title">Qualification</div><ScoreBadge score={p.score} /></div>
            <div className="card-pad stack" style={{ gap: 12 }}>
              <Alert kind={p.strategy === 'signal' ? 'warn' : 'info'}>{STRATEGIES[p.strategy as Strategy]?.description}</Alert>
              <div className="grid g-2" style={{ gap: 12 }}>
                <Info label="Besoin" value={p.need_type || 'À préciser'} sub={p.need_status === 'confirmé' ? 'Exprimé dans la source' : p.need_status === 'supposé' ? 'Supposé — hypothèse à valider' : 'Inconnu'} />
                <Info label="Confiance" value={p.confidence} sub={p.confidence_reason} />
                <Info label="Publication" value={p.published_at ? fmtDate(p.published_at) : 'inconnue'} sub={`Découverte ${relative(p.created_at)}${p.platform ? ` · ${p.platform}` : ''}`} />
                <Info label="Budget / échéance" value={p.budget_text || 'inconnu'} sub={p.deadline ? `Échéance ${fmtDate(p.deadline)}` : 'Pas d’échéance connue'} />
              </div>
              {p.evidence ? <blockquote style={{ margin: 0, padding: '10px 14px', borderLeft: '3px solid var(--gold)', background: 'var(--surface-2)', borderRadius: 8 }} className="small">{p.evidence}</blockquote> : null}
              <details>
                <summary className="small strong" style={{ cursor: 'pointer' }}>Pourquoi ce score ? (indicateur, pas une probabilité d’achat)</summary>
                <table className="table" style={{ marginTop: 8 }}><tbody>{details.length ? details.map((d) => <tr key={d.label}><td className="small">{d.label}</td><td className="small strong" style={{ textAlign: 'right', color: d.points < 0 ? 'var(--red)' : 'var(--green)' }}>{d.points > 0 ? '+' : ''}{d.points}</td></tr>) : <tr><td className="small muted">Fiche sans détail de score (reprise V1 ou import).</td></tr>}</tbody></table>
              </details>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><div className="card-title">Sources et preuves</div><span className="badge">{data.sources.length}</span></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              {data.sources.length ? data.sources.map((s) => (
                <div key={s.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                  <div className="row between"><span className="small strong">{s.platform || 'Source'}</span><span className="tiny muted">{s.published_at ? `Publié ${fmtDate(s.published_at)}` : 'Date inconnue'} · trouvé {relative(s.discovered_at)}</span></div>
                  {s.excerpt ? <p className="small muted clamp-2" style={{ margin: '4px 0' }}>{s.excerpt}</p> : null}
                  {!isUrn(s.url) ? <a className="tiny" style={{ color: 'var(--gold-ink)' }} href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.url.slice(0, 90)} <ExternalLink size={11} /></a> : null}
                  {s.query ? <div className="tiny faint">Requête : {s.query}</div> : null}
                </div>
              )) : <p className="small muted">Aucune source en ligne (fiche manuelle).</p>}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><div className="card-title"><Globe size={16} color="var(--gold)" />Présence en ligne</div></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              <div className="row row-wrap between">
                <div className="small">{p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--gold-ink)' }}>{p.website} <ExternalLink size={11} /></a> : <span className="muted">Aucun site identifié publiquement.</span>}</div>
                <div className="row">
                  <button className="btn btn-sm" disabled={!!busy} onClick={() => action('lookup-site', 'Recherche du site terminée.')}>{busy === 'lookup-site' ? <Loader2 size={14} className="spin" /> : <Search size={14} />}Chercher son site</button>
                  <button className="btn btn-sm" disabled={!!busy || !p.website} onClick={() => action('website-check', 'Analyse terminée.')}>{busy === 'website-check' ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}Analyser le site</button>
                </div>
              </div>
              {check ? (
                <div className="small">
                  {check.robots_blocked ? <Alert kind="warn">robots.txt interdit l’analyse automatique de ce site.</Alert> : null}
                  {check.error ? <Alert kind="warn">Analyse impossible : {check.error}</Alert> : null}
                  {check.hints?.length ? <><div className="strong" style={{ marginTop: 6 }}>Indices (hypothèses, pas des certitudes)</div><ul style={{ margin: '4px 0', paddingLeft: 18 }}>{check.hints.map((h) => <li key={h}>{h}</li>)}</ul></> : null}
                  {check.positives?.length ? <><div className="strong">Points présents</div><ul style={{ margin: '4px 0', paddingLeft: 18 }} className="muted">{check.positives.map((h) => <li key={h}>{h}</li>)}</ul></> : null}
                  <div className="tiny faint">Dernière vérification : {fmtDateTime(check.checked_at)}</div>
                </div>
              ) : <p className="tiny muted">« Chercher son site » effectue une seule requête de recherche ; « Analyser le site » lit uniquement la page d’accueil publique en respectant robots.txt.</p>}
              {contacts.length ? (
                <div><div className="small strong">Coordonnées professionnelles trouvées</div>{contacts.map((c) => <div key={c.value} className="small">{c.type} : {c.value} <span className="tiny faint">— source : {isUrn(c.source) ? 'saisie' : new URL(c.source).hostname}, {fmtDate(c.found_at)}</span></div>)}</div>
              ) : <p className="tiny muted">Aucune coordonnée trouvée dans les sources (aucune n’est devinée).</p>}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><div className="card-title">Notes</div></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              <form className="stack" style={{ gap: 8 }} onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; try { await api(`/api/prospects/${id}/notes`, { json: { body: note } }); setNote(''); notify('Note ajoutée.'); await reload(); } catch (err) { onError(err); } }}>
                <textarea className="textarea" rows={3} placeholder="Interlocuteur, échange, besoin précisé…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nouvelle note" />
                <button className="btn btn-sm" style={{ justifySelf: 'end' }} disabled={!note.trim()}>Ajouter la note</button>
              </form>
              {data.notes.map((n) => (
                <div key={n.id} className="row" style={{ alignItems: 'flex-start', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <div style={{ flex: 1, whiteSpace: 'pre-wrap' }} className="small">{n.body}<div className="tiny faint">{fmtDateTime(n.created_at)}</div></div>
                  <button className="btn btn-ghost btn-icon btn-sm" aria-label="Supprimer la note" onClick={async () => { try { await api(`/api/prospects/${id}/notes?noteId=${n.id}`, { method: 'DELETE' }); await reload(); } catch (e) { onError(e); } }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card card-pad stack" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="st">Statut commercial</label><select id="st" className="select" value={p.status} onChange={(e) => patch({ status: e.target.value }, `Statut : ${e.target.value}`)}>{PIPELINE.map((s) => <option key={s}>{s}</option>)}</select></div>
            <EditableField label="Prochaine action" value={p.next_action} onSave={(v) => patch({ next_action: v })} />
            <EditableField label="Valeur estimée (€, indicative)" value={p.estimated_value ?? ''} type="number" display={fmtEuro(p.estimated_value)} onSave={(v) => patch({ estimated_value: v === '' ? null : Number(v) })} />
            <EditableField label="Tags (séparés par des virgules)" value={(p.tags ?? []).join(', ')} onSave={(v) => patch({ tags: v.split(',').map((t) => t.trim()).filter(Boolean) })} />
            <EditableField label="Activité" value={p.activity} onSave={(v) => patch({ activity: v })} />
            <div className="row between"><EditableField label="Localisation" value={p.city} onSave={(v) => patch({ city: v })} /></div>
            <label className="check"><input type="checkbox" checked={p.location_verified} onChange={(e) => patch({ location_verified: e.target.checked })} />Localisation vérifiée</label>
          </section>

          <section className="card">
            <div className="card-head"><div className="card-title"><CalendarPlus size={16} color="var(--gold)" />Relances et tâches</div></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              <form className="stack" style={{ gap: 8 }} onSubmit={async (e) => { e.preventDefault(); try { await api(`/api/prospects/${id}/tasks`, { json: { title: task.title, kind: task.kind, due_at: task.due ? new Date(task.due).toISOString() : null } }); setTask({ title: '', kind: 'relance', due: '' }); notify('Tâche planifiée.'); await reload(); } catch (err) { onError(err); } }}>
                <input className="input" placeholder="ex. Relancer par téléphone" value={task.title} onChange={(e) => setTask((t) => ({ ...t, title: e.target.value }))} aria-label="Titre de la tâche" required />
                <div className="row"><select className="select" value={task.kind} onChange={(e) => setTask((t) => ({ ...t, kind: e.target.value }))} aria-label="Type">{Object.entries(TASK_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><input className="input" type="datetime-local" value={task.due} onChange={(e) => setTask((t) => ({ ...t, due: e.target.value }))} aria-label="Échéance" /></div>
                <button className="btn btn-sm" style={{ justifySelf: 'end' }}>Planifier</button>
              </form>
              {data.tasks.map((t) => (
                <label key={t.id} className="check" style={{ alignItems: 'flex-start', opacity: t.done_at ? 0.55 : 1 }}>
                  <input type="checkbox" checked={!!t.done_at} onChange={async (e) => { try { await api(`/api/tasks/${t.id}`, { method: 'PATCH', json: { done: e.target.checked } }); await reload(); } catch (err) { onError(err); } }} />
                  <span><span className="small" style={{ textDecoration: t.done_at ? 'line-through' : 'none' }}>{t.title}</span><span className="tiny muted" style={{ display: 'block', color: !t.done_at && t.due_at && new Date(t.due_at) < new Date() ? 'var(--red)' : undefined }}>{TASK_KINDS[t.kind as keyof typeof TASK_KINDS]} · {t.due_at ? fmtDateTime(t.due_at) : 'sans échéance'}</span></span>
                </label>
              ))}
            </div>
          </section>

          <section className="card card-pad stack" style={{ gap: 10 }}>
            <div className="card-title">Devis et projets liés</div>
            {data.quotes.map((q) => <Link key={q.id} href={`/devis/${q.id}`} className="row between small"><span>{q.number} — {q.title}</span><StatusBadge status={q.status} /></Link>)}
            {data.projects.map((pr) => <Link key={pr.id} href={`/creation/${pr.id}`} className="row between small"><span>{pr.name}</span><StatusBadge status={pr.status} /></Link>)}
            <div className="row row-wrap">
              <Link className="btn btn-sm" href={`/devis/nouveau?prospect=${id}`}><FileText size={14} />Créer un devis</Link>
              <Link className="btn btn-sm" href={`/creation/nouveau?prospect=${id}`}><Wand2 size={14} />Créer un projet</Link>
            </div>
          </section>

          <section className="card card-pad stack" style={{ gap: 10 }}>
            <div className="card-title"><ShieldOff size={16} color="var(--gold)" />Données personnelles (RGPD)</div>
            <p className="tiny muted">Provenance : {p.platform || p.source_type}. Données limitées aux informations professionnelles publiques. Conservation : voir Paramètres → Prospection.</p>
            {p.do_not_contact ? (
              <><Alert kind="warn">Opposition enregistrée le {fmtDate(p.opposition_at)}{p.opposition_note ? ` : ${p.opposition_note}` : ''}. Plus aucun message ne peut être préparé.</Alert><button className="btn btn-sm" onClick={() => patch({ do_not_contact: false }, 'Opposition levée.')}>Lever l’opposition</button></>
            ) : <button className="btn btn-sm" onClick={() => setModal('opposition')}><ShieldOff size={14} />Enregistrer une opposition</button>}
            <button className="btn btn-sm btn-danger" onClick={() => setModal('delete')}><Trash2 size={14} />Supprimer définitivement (droit à l’effacement)</button>
          </section>

          <section className="card">
            <div className="card-head"><div className="card-title">Historique</div></div>
            <div className="card-pad timeline">
              {data.events.map((ev) => <div key={ev.id} className="tl-item"><div className="small">{ev.detail || ev.kind}</div><div className="tiny faint">{fmtDateTime(ev.created_at)}</div></div>)}
            </div>
          </section>
        </div>
      </div>

      {modal === 'message' ? <MessageModal id={id} onClose={() => { setModal(''); void reload(); }} /> : null}
      {modal === 'contact' ? <ContactModal id={id} onClose={() => setModal('')} onDone={() => { setModal(''); void reload(); }} /> : null}
      {modal === 'opposition' ? <OppositionModal onClose={() => setModal('')} onSave={(note) => patch({ do_not_contact: true, opposition_note: note }, 'Opposition enregistrée.').then(() => setModal(''))} /> : null}
      {modal === 'delete' ? <ConfirmDialog title="Supprimer ce prospect" danger confirmLabel="Supprimer" requireText="SUPPRIMER" message="La fiche, ses sources, notes, tâches et son historique seront définitivement effacés." onClose={() => setModal('')} onConfirm={async () => { try { await api(`/api/prospects/${id}`, { method: 'DELETE' }); notify('Prospect supprimé.'); router.push('/prospection'); } catch (e) { onError(e); } }} /> : null}
    </>
  );
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div><div className="tiny muted">{label}</div><div className="small strong">{value}</div>{sub ? <div className="tiny faint">{sub}</div> : null}</div>;
}

function EditableField({ label, value, onSave, type = 'text', display }: { label: string; value: string | number; onSave: (v: string) => Promise<void> | void; type?: string; display?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value ?? ''));
  if (!editing) return <div style={{ flex: 1 }}><div className="tiny muted">{label}</div><button className="small" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }} onClick={() => { setV(String(value ?? '')); setEditing(true); }}>{display ?? (String(value ?? '') || <span className="faint">Ajouter…</span>)}</button></div>;
  return (
    <form style={{ flex: 1 }} onSubmit={async (e) => { e.preventDefault(); await onSave(v); setEditing(false); }}>
      <div className="tiny muted">{label}</div>
      <div className="row"><input className="input" type={type} autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label={label} /><button className="btn btn-icon" aria-label="Enregistrer"><Check size={15} /></button></div>
    </form>
  );
}

function MessageModal({ id, onClose }: { id: string; onClose: () => void }) {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [channel, setChannel] = useState('E-mail');
  const [tone, setTone] = useState('professionnel');
  const [draft, setDraft] = useState<{ objet: string; message: string } | null>(null);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  async function generate(mode: 'claude' | 'modele') {
    setBusy(true);
    try { const r = await api<{ draft: { objet: string; message: string }; source: string }>(`/api/prospects/${id}/message`, { json: { channel, tone, mode } }); setDraft(r.draft); setSource(r.source); }
    catch (e) { onError(e); } finally { setBusy(false); }
  }
  return (
    <Modal title="Préparer un message" size="lg" onClose={onClose}>
      <Alert kind="info">Rédigé uniquement à partir des faits vérifiés de la fiche. <b>Rien n’est envoyé automatiquement</b> : relisez, adaptez et envoyez vous-même, puis cliquez « J’ai contacté ».</Alert>
      <div className="row row-wrap">
        <div className="segmented">{['E-mail', 'Formulaire de contact', 'Téléphone', 'LinkedIn'].map((c) => <button key={c} aria-pressed={channel === c} onClick={() => setChannel(c)}>{c}</button>)}</div>
        <select className="select" style={{ width: 170 }} value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Ton"><option value="professionnel">Professionnel</option><option value="chaleureux">Chaleureux</option><option value="direct">Direct</option></select>
        <button className="btn btn-gold" disabled={busy} onClick={() => generate('claude')}>{busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}Rédiger avec Claude</button>
        <button className="btn" disabled={busy} onClick={() => generate('modele')}>Modèle simple (gratuit)</button>
      </div>
      {draft ? (
        <div className="stack" style={{ gap: 8 }}>
          {source === 'simulation' ? <Alert kind="warn">Brouillon de SIMULATION (aucune clé Claude).</Alert> : null}
          {draft.objet ? <div className="field"><label htmlFor="m-obj">Objet</label><input id="m-obj" className="input" value={draft.objet} onChange={(e) => setDraft({ ...draft, objet: e.target.value })} /></div> : null}
          <div className="field"><label htmlFor="m-body">Message</label><textarea id="m-body" className="textarea" rows={12} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></div>
          <button className="btn" style={{ justifySelf: 'end' }} onClick={async () => { try { await navigator.clipboard.writeText(`${draft.objet ? `Objet : ${draft.objet}\n\n` : ''}${draft.message}`); notify('Copié — à relire avant envoi.'); } catch { onError(new Error('Copie impossible : sélectionnez le texte manuellement.')); } }}><Copy size={15} />Copier</button>
        </div>
      ) : null}
    </Modal>
  );
}

function ContactModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const onError = useErrorToast();
  const [form, setForm] = useState({ channel: 'Téléphone', summary: '', followUpDays: 7 });
  return (
    <Modal title="Déclarer un contact" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={async () => { try { await api(`/api/prospects/${id}/contact-log`, { json: form }); onDone(); } catch (e) { onError(e); } }}>Enregistrer</button></>}>
      <p className="small muted">Harmony Studio n’envoie aucun message : vous déclarez ici un contact que <b>vous</b> avez effectué. L’historique l’indique comme tel.</p>
      <div className="field"><label htmlFor="c-ch">Canal</label><select id="c-ch" className="select" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>{['Téléphone', 'E-mail', 'Formulaire de contact', 'LinkedIn', 'Visite', 'Autre'].map((c) => <option key={c}>{c}</option>)}</select></div>
      <div className="field"><label htmlFor="c-sum">Résumé</label><textarea id="c-sum" className="textarea" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
      <div className="field"><label htmlFor="c-fu">Relance automatique dans (jours, 0 = aucune)</label><input id="c-fu" className="input" type="number" min={0} max={120} value={form.followUpDays} onChange={(e) => setForm({ ...form, followUpDays: Number(e.target.value) })} /></div>
    </Modal>
  );
}

function OppositionModal({ onClose, onSave }: { onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal title="Enregistrer une opposition" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={() => onSave(note)}>Enregistrer</button></>}>
      <p className="small muted">Le prospect ne souhaite plus être contacté. La fiche est conservée pour garantir le respect de son choix (sauf demande d’effacement).</p>
      <div className="field"><label htmlFor="op">Contexte (facultatif)</label><input id="op" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. demande reçue par e-mail le …" /></div>
    </Modal>
  );
}
