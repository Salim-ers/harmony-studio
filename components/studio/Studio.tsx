'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, CheckCircle2, Download, ExternalLink, FileCode2, GitBranch, History, ImagePlus, ListChecks, Loader2, MessageSquare, Monitor, RefreshCw,
  Rocket, Send, Settings2, Smartphone, Tablet, Trash2, Wand2, Wrench,
} from 'lucide-react';
import { api, download } from '@/lib/client/api';
import { fmtDateTime, relative } from '@/lib/client/format';
import { uploadMedia } from '@/lib/client/upload';
import { ASSET_ROLES, deliverableLabel } from '@/lib/shared/constants';
import { Alert, ConfirmDialog, DemoBadge, Modal, SkeletonRows, StatusBadge, useErrorToast, useToast } from '../ui';
import JobPanel, { type Job } from './JobPanel';

type Asset = { id: string; media_id: string; role: string; alt: string; slug: string; kind: string; mime: string; width: number | null; height: number | null; size: number };
type Version = { id: string; number: number; summary: string; origin: string; instructions: string; created_at: string; file_count: number; errors: number | null };
type CheckItem = { id: string; level: 'erreur' | 'avertissement' | 'info'; file: string; message: string };
type Detail = {
  project: { id: string; name: string; client_name: string; sector: string; city: string; deliverable: string; render: string; status: string; brief: string; brief_data: Record<string, string | string[]>; matrix_overrides: Record<string, string>; images: string[]; is_demo: boolean; current_version_id: string | null; prospect_id: string | null; archived_at: string | null };
  assets: Asset[]; versions: Version[];
  messages: { id: string; role: string; content: string; created_at: string }[];
  jobs: { id: string; kind: string; status: string; created_at: string }[];
  deployments: { id: string; provider: string; target: string; status: string; url: string; detail: string; created_at: string }[];
  quotes: { id: string; number: string; title: string; status: string }[];
  current: { checks: { items: CheckItem[]; counts: Record<string, number>; not_executed: string[]; ran_at: string } | null; build_report: { executed: boolean; ok: boolean; reason?: string; steps: { name: string; command: string; exitCode: number | null; output: string }[] } | null; has_bundle: boolean } | null;
  integrations: Record<string, boolean>;
};
type Tab = 'conversation' | 'brief' | 'versions' | 'qualite' | 'fichiers' | 'publication';
const ACTIVE = ['en_attente', 'en_cours', 'attente_reponse'];
const SUGGESTIONS = ['Rends la page d’accueil plus spectaculaire sans toucher au contact', 'Change la typographie des titres pour plus d’élégance', 'Ajoute une page prestations', 'Rends la version mobile plus lisible', 'Mets en avant la photo principale dans le hero'];

export default function Studio({ id }: { id: string }) {
  const router = useRouter();
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>('conversation');
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewVersion, setPreviewVersion] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [modal, setModal] = useState<'' | 'delete' | 'github' | 'deploy-preview' | 'deploy-prod'>('');
  const runningRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const d = await api<Detail>(`/api/projects/${id}`);
      setData(d);
      setError('');
      const active = d.jobs.find((j) => ACTIVE.includes(j.status)) ?? (d.jobs[0] && ['echec', 'bloque'].includes(d.jobs[0].status) ? d.jobs[0] : null);
      if (active) setJob(await api<Job>(`/api/jobs/${active.id}`));
      return d;
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null; }
  }, [id]);

  const loadPreview = useCallback(async (versionId?: string | null) => {
    try {
      const r = await api<{ url: string; versionId: string }>(`/api/projects/${id}/preview-url${versionId ? `?version=${versionId}` : ''}`);
      setPreviewUrl(r.url);
      setPreviewVersion(r.versionId);
      setFrameKey((k) => k + 1);
    } catch { setPreviewUrl(''); }
  }, [id]);

  const drive = useCallback(async (jobId: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      for (let i = 0; i < 120 && mounted.current; i++) {
        const snap = await api<Job>(`/api/jobs/${jobId}/advance`, { method: 'POST' });
        setJob(snap);
        if (!['en_attente', 'en_cours'].includes(snap.status)) break;
        if (snap.steps.some((s) => s.status === 'en_cours')) await new Promise((r) => setTimeout(r, 4000));
      }
    } catch (e) { onError(e); }
    finally {
      runningRef.current = false;
      if (mounted.current) {
        setRunning(false);
        const d = await load();
        if (d?.project.current_version_id) await loadPreview();
      }
    }
  }, [load, loadPreview, onError]);

  useEffect(() => {
    void (async () => {
      const d = await load();
      if (d?.project.current_version_id) await loadPreview();
      const active = d?.jobs.find((j) => ['en_attente', 'en_cours'].includes(j.status));
      if (active) void drive(active.id);
    })();
  }, [load, loadPreview, drive]);

  async function startJob(kind: 'creation' | 'modification' | 'correction' | 'construction', instruction?: string) {
    try {
      const snap = await api<Job>(`/api/projects/${id}/jobs`, { json: { kind, instruction } });
      setJob(snap);
      if (kind === 'modification') setTab('conversation');
      await load();
      void drive(snap.id);
    } catch (e) { onError(e); }
  }

  if (error && !data) return <Alert kind="error">{error}</Alert>;
  if (!data) return <div className="card"><SkeletonRows rows={10} /></div>;
  const p = data.project;
  const busy = !!job && ACTIVE.includes(job.status);
  const checks = data.current?.checks;
  const isApp = p.render === 'nextjs';

  return (
    <>
      <Link href="/creation" className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }}><ArrowLeft size={15} />Projets</Link>
      <div className="page-head">
        <div>
          <div className="row row-wrap" style={{ marginBottom: 8 }}><StatusBadge status={p.status} live={busy} /><span className="badge badge-outline">{p.render === 'react' ? 'React + Motion' : isApp ? 'Application Next.js' : 'HTML statique'}</span><span className="badge">{deliverableLabel(p.deliverable)}</span><DemoBadge show={p.is_demo} /></div>
          <h1 className="page-title">{p.name}</h1>
          <p className="page-desc">{p.client_name || 'Client à préciser'}{p.city ? ` · ${p.city}` : ''}{data.versions[0] ? ` · version ${data.versions[0].number}, ${relative(data.versions[0].created_at)}` : ''}</p>
        </div>
        <div className="head-actions">
          {!data.versions.length && !busy ? <button className="btn btn-gold" onClick={() => startJob('creation')}><Wand2 size={16} />Lancer la génération</button> : null}
          {data.versions.length && p.status !== 'Approuvé' && p.status !== 'Déployé' ? <button className="btn" disabled={busy || (checks?.counts?.erreur ?? 0) > 0} title={(checks?.counts?.erreur ?? 0) > 0 ? 'Corrigez d’abord les erreurs bloquantes' : ''} onClick={async () => { try { await api(`/api/projects/${id}`, { method: 'PATCH', json: { status: 'Approuvé' } }); notify('Projet approuvé.'); await load(); } catch (e) { onError(e); } }}><CheckCircle2 size={16} />Approuver</button> : null}
          {data.versions.length ? <button className="btn" onClick={async () => { try { await download(`/api/projects/${id}/export${previewVersion ? `?version=${previewVersion}` : ''}`, 'projet.zip'); notify('ZIP téléchargé.'); } catch (e) { onError(e); } }}><Download size={16} />ZIP</button> : null}
          <button className="btn btn-ghost btn-icon" aria-label="Archiver" onClick={async () => { await api(`/api/projects/${id}`, { method: 'PATCH', json: { archived: !p.archived_at } }); notify(p.archived_at ? 'Projet désarchivé.' : 'Projet archivé.'); await load(); }}><Archive size={16} /></button>
          <button className="btn btn-ghost btn-icon btn-danger" aria-label="Supprimer le projet" onClick={() => setModal('delete')}><Trash2 size={16} /></button>
        </div>
      </div>

      {job && (ACTIVE.includes(job.status) || ['echec', 'bloque'].includes(job.status)) ? <JobPanel job={job} running={running} onUpdate={setJob} onResume={() => void drive(job.id)} /> : null}
      {p.images?.length ? <div style={{ marginBottom: 12 }}><Alert kind="warn">Ce projet V1 référence {p.images.length} photo(s) stockée(s) en Vercel Blob <b>public</b>. <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={async () => { try { const r = await api<{ results: { ok: boolean }[] }>(`/api/projects/${id}/import-legacy`, { method: 'POST' }); notify(`${r.results.filter((x) => x.ok).length} photo(s) rapatriée(s) en stockage privé.`); await load(); } catch (e) { onError(e); } }}>Rapatrier en stockage privé</button></Alert></div> : null}

      <div className="studio">
        <aside className="card studio-panel">
          <div className="tabs" role="tablist">
            {([['conversation', MessageSquare, 'Échanges'], ['brief', Settings2, 'Brief'], ['versions', History, 'Versions'], ['qualite', ListChecks, 'Qualité'], ['fichiers', FileCode2, 'Fichiers'], ['publication', Rocket, 'Publier']] as const).map(([k, Icon, l]) => (
              <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)} title={l}><Icon size={15} style={{ verticalAlign: '-3px' }} /> <span className="hide-sm">{l}</span>{k === 'qualite' && checks?.counts?.erreur ? <span className="badge badge-red" style={{ marginLeft: 4 }}>{checks.counts.erreur}</span> : null}</button>
            ))}
          </div>
          <div className="studio-scroll">
            {tab === 'conversation' ? <Conversation data={data} busy={busy} onSend={(text) => startJob('modification', text)} /> : null}
            {tab === 'brief' ? <BriefPanel data={data} onChange={load} /> : null}
            {tab === 'versions' ? <Versions id={id} versions={data.versions} current={p.current_version_id} previewing={previewVersion} busy={busy} onPreview={(v) => loadPreview(v)} onRestored={async () => { await load(); await loadPreview(); }} /> : null}
            {tab === 'qualite' ? <Quality data={data} busy={busy} onFix={() => startJob('correction')} onBuild={() => startJob('construction')} /> : null}
            {tab === 'fichiers' ? <Files id={id} versionId={previewVersion ?? p.current_version_id} /> : null}
            {tab === 'publication' ? <Publication data={data} onAction={setModal} /> : null}
          </div>
        </aside>
        <section className="card" style={{ overflow: 'hidden' }}>
          <div className="card-head">
            <div className="row">
              <div className="segmented" role="group" aria-label="Appareil">
                <button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} title="Ordinateur"><Monitor size={15} /></button>
                <button aria-pressed={device === 'tablet'} onClick={() => setDevice('tablet')} title="Tablette"><Tablet size={15} /></button>
                <button aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')} title="Mobile"><Smartphone size={15} /></button>
              </div>
              {previewVersion && previewVersion !== p.current_version_id ? <span className="badge badge-amber">Ancienne version</span> : null}
            </div>
            <div className="row">
              {previewUrl ? <button className="btn btn-sm btn-ghost" onClick={() => loadPreview(previewVersion)}><RefreshCw size={14} />Recharger</button> : null}
              {previewUrl ? <a className="btn btn-sm" href={previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Onglet isolé</a> : null}
            </div>
          </div>
          <div className="preview-frame">
            {isApp ? (
              <div className="empty" style={{ alignSelf: 'center' }}><div className="empty-icon"><Wrench size={22} /></div><h3>Aperçu non disponible pour une application</h3><p className="small" style={{ maxWidth: 440, margin: '0 auto' }}>Une application full-stack doit être installée, compilée et testée dans le runner isolé avant toute prévisualisation. Consultez l’onglet Fichiers et Qualité.</p></div>
            ) : previewUrl ? (
              <div className={`device ${device}`}>
                <iframe key={frameKey} title="Aperçu isolé du site généré" src={previewUrl} sandbox="allow-scripts allow-popups allow-forms" referrerPolicy="no-referrer" loading="lazy" />
              </div>
            ) : (
              <div className="empty" style={{ alignSelf: 'center' }}><div className="empty-icon">{busy ? <Loader2 size={22} className="spin" /> : <Wand2 size={22} />}</div><h3>{busy ? 'Génération en cours…' : 'Aucune version pour le moment'}</h3><p className="small">{busy ? 'L’aperçu apparaîtra dès que la première version sera enregistrée.' : 'Lancez la génération pour obtenir une première proposition.'}</p></div>
            )}
          </div>
        </section>
      </div>
      {modal === 'delete' ? <ConfirmDialog title="Supprimer le projet" danger requireText="SUPPRIMER" confirmLabel="Supprimer" message="Le projet, toutes ses versions, ses échanges et ses médias privés non partagés seront définitivement supprimés." onClose={() => setModal('')} onConfirm={async () => { try { await api(`/api/projects/${id}`, { method: 'DELETE' }); notify('Projet supprimé.'); router.push('/creation'); } catch (e) { onError(e); } }} /> : null}
      {modal === 'github' ? <GithubModal id={id} name={p.client_name || p.name} versionId={previewVersion} onClose={() => setModal('')} onDone={load} /> : null}
      {modal === 'deploy-preview' || modal === 'deploy-prod' ? <DeployModal id={id} target={modal === 'deploy-prod' ? 'production' : 'preview'} versionId={previewVersion} onClose={() => setModal('')} onDone={load} /> : null}
    </>
  );
}

function Conversation({ data, busy, onSend }: { data: Detail; busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data.messages.length]);
  const canModify = !!data.project.current_version_id && !busy;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="chat">
        {data.messages.length ? data.messages.map((m) => <div key={m.id} className={`bubble ${m.role}`}>{m.content}<div className="tiny" style={{ opacity: 0.6, marginTop: 4 }}>{fmtDateTime(m.created_at)}</div></div>)
          : <p className="small muted">Les demandes de modification et les comptes rendus de génération apparaîtront ici.</p>}
        <div ref={end} />
      </div>
      <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip" style={{ height: 'auto', padding: '5px 10px', textAlign: 'left' }} disabled={!canModify} onClick={() => setText(s)}>{s}</button>)}</div>
      <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSend(text.trim()); setText(''); } }}>
        <textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={canModify ? 'Décrivez la modification : « change le hero », « ajoute une page prestations »…' : busy ? 'Génération en cours…' : 'Générez d’abord une première version.'} disabled={!canModify} aria-label="Demande de modification"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) { e.preventDefault(); onSend(text.trim()); setText(''); } }} />
        <div className="row between"><span className="tiny faint">Seuls les fichiers nécessaires sont modifiés · Ctrl+Entrée</span><button className="btn btn-primary btn-sm" disabled={!canModify || !text.trim()}><Send size={14} />Envoyer</button></div>
      </form>
    </div>
  );
}

function BriefPanel({ data, onChange }: { data: Detail; onChange: () => Promise<unknown> }) {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const p = data.project;
  const [brief, setBrief] = useState<Record<string, string>>(Object.fromEntries(Object.entries(p.brief_data ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')])));
  const [overrides, setOverrides] = useState<Record<string, string>>(p.matrix_overrides ?? {});
  const [uploading, setUploading] = useState('');
  const fields: [string, string, boolean?][] = [['brief', 'Brief libre', true], ['services', 'Prestations réelles', true], ['phone', 'Téléphone'], ['email', 'E-mail'], ['address', 'Adresse'], ['hours', 'Horaires', true], ['prices', 'Tarifs confirmés', true], ['legal', 'Mentions légales', true], ['cta', 'CTA principal'], ['palette', 'Palette'], ['domain', 'Domaine du site']];
  async function save() {
    try {
      const payload: Record<string, unknown> = { ...brief };
      if (typeof payload.features === 'string') payload.features = (payload.features as string).split(',').map((x) => x.trim()).filter(Boolean);
      await api(`/api/projects/${p.id}`, { method: 'PATCH', json: { brief: payload, matrix_overrides: overrides } });
      notify('Brief enregistré : il sera utilisé pour les prochaines générations et modifications.');
      await onChange();
    } catch (e) { onError(e); }
  }
  async function addFiles(list: FileList | null) {
    if (!list) return;
    for (const file of [...list]) {
      setUploading(file.name);
      try {
        const media = await uploadMedia(file);
        await api(`/api/projects/${p.id}/assets`, { json: { mediaId: media.id, role: file.type === 'application/pdf' ? 'document' : /logo/i.test(file.name) ? 'logo' : 'photo' } });
      } catch (e) { onError(e); }
    }
    setUploading('');
    await onChange();
  }
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="label">Médias privés ({data.assets.length})</div>
      <div className="thumbs">
        {data.assets.map((a) => (
          <div key={a.id} className="thumb" title={a.alt || a.slug}>
            {a.kind === 'image' ? <img src={`/api/media/${a.media_id}/thumb`} alt={a.alt || a.slug} loading="lazy" /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 11 }}>PDF</div>}
            <span className="thumb-tag">{ASSET_ROLES[a.role as keyof typeof ASSET_ROLES] ?? a.role}</span>
            <button className="thumb-x" aria-label={`Retirer ${a.slug}`} onClick={async () => { try { await api(`/api/projects/${p.id}/assets/${a.id}`, { method: 'DELETE' }); await onChange(); } catch (e) { onError(e); } }}><Trash2 size={12} /></button>
          </div>
        ))}
        <label className="thumb dropzone" style={{ display: 'grid', placeItems: 'center', padding: 4 }}>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" className="sr-only" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
          {uploading ? <Loader2 size={18} className="spin" /> : <ImagePlus size={18} />}
        </label>
      </div>
      {data.assets.map((a) => (
        <div key={a.id} className="row"><span className="tiny mono faint" style={{ width: 92 }}>{a.slug}</span><input className="input" style={{ height: 30 }} defaultValue={a.alt} placeholder="Texte alternatif" aria-label={`Description de ${a.slug}`} onBlur={async (e) => { if (e.target.value !== a.alt) { try { await api(`/api/projects/${p.id}/assets/${a.id}`, { method: 'PATCH', json: { alt: e.target.value } }); } catch (err) { onError(err); } } }} /></div>
      ))}
      <div className="divider" />
      {fields.map(([k, l, area]) => (
        <div key={k} className="field"><label htmlFor={`b-${k}`}>{l}</label>{area ? <textarea id={`b-${k}`} className="textarea" rows={3} value={brief[k] ?? ''} onChange={(e) => setBrief({ ...brief, [k]: e.target.value })} /> : <input id={`b-${k}`} className="input" value={brief[k] ?? ''} onChange={(e) => setBrief({ ...brief, [k]: e.target.value })} />}</div>
      ))}
      <details>
        <summary className="small strong" style={{ cursor: 'pointer' }}>Règles spécifiques à ce projet (surcharges de matrices)</summary>
        {(['design', 'technique', 'seo', 'audit'] as const).map((k) => <div key={k} className="field" style={{ marginTop: 8 }}><label htmlFor={`o-${k}`}>{k === 'design' ? 'Design' : k === 'technique' ? 'Technique' : k === 'seo' ? 'SEO & contenu' : 'Audit'}</label><textarea id={`o-${k}`} className="textarea" rows={2} value={overrides[k] ?? ''} onChange={(e) => setOverrides({ ...overrides, [k]: e.target.value })} placeholder="Ces règles complètent la matrice globale sans la modifier." /></div>)}
      </details>
      <button className="btn btn-primary" onClick={save}>Enregistrer le brief</button>
    </div>
  );
}

function Versions({ id, versions, current, previewing, busy, onPreview, onRestored }: { id: string; versions: Version[]; current: string | null; previewing: string | null; busy: boolean; onPreview: (v: string) => void; onRestored: () => Promise<void> }) {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [diff, setDiff] = useState<{ number: number; base: { number: number } | null; files: { path: string; status: string; added: number; removed: number; patch: string }[] } | null>(null);
  const [restore, setRestore] = useState<Version | null>(null);
  async function showDiff(v: Version) {
    try { const r = await api<{ base: { number: number } | null; diff: { path: string; status: string; added: number; removed: number; patch: string }[] }>(`/api/projects/${id}/versions/${v.id}/diff`); setDiff({ number: v.number, base: r.base, files: r.diff }); }
    catch (e) { onError(e); }
  }
  return (
    <div className="timeline">
      {versions.map((v) => (
        <div key={v.id} className="tl-item">
          <div className="row between"><span className="strong small">Version {v.number}{v.id === current ? <span className="badge badge-gold" style={{ marginLeft: 6 }}>actuelle</span> : null}</span><span className="tiny faint">{relative(v.created_at)}</span></div>
          <div className="tiny muted">{v.origin} · {v.file_count} fichier(s){v.errors ? ` · ${v.errors} erreur(s)` : ''}</div>
          {v.instructions ? <div className="tiny" style={{ fontStyle: 'italic' }}>« {v.instructions} »</div> : null}
          <div className="tiny muted clamp-2" style={{ whiteSpace: 'pre-wrap' }}>{v.summary}</div>
          <div className="row" style={{ marginTop: 4 }}>
            <button className="btn btn-sm" aria-pressed={previewing === v.id} onClick={() => onPreview(v.id)}>Aperçu</button>
            <button className="btn btn-sm btn-ghost" onClick={() => showDiff(v)}>Différences</button>
            {v.id !== current ? <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setRestore(v)}>Restaurer</button> : null}
          </div>
        </div>
      ))}
      {!versions.length ? <p className="small muted">Aucune version.</p> : null}
      {diff ? (
        <Modal title={`Version ${diff.number} ${diff.base ? `vs ${diff.base.number}` : '(première version)'}`} size="lg" onClose={() => setDiff(null)}>
          {diff.files.length ? diff.files.map((f) => (
            <details key={f.path} open={diff.files.length <= 3}>
              <summary className="small" style={{ cursor: 'pointer' }}><b className="mono">{f.path}</b> — {f.status} <span style={{ color: 'var(--green)' }}>+{f.added}</span> <span style={{ color: 'var(--red)' }}>−{f.removed}</span></summary>
              {f.patch ? <pre className="diff">{f.patch.split('\n').slice(4).map((line, i) => <span key={i} className={line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : undefined}>{line}{'\n'}</span>)}</pre> : null}
            </details>
          )) : <p className="small muted">Aucune différence.</p>}
        </Modal>
      ) : null}
      {restore ? <ConfirmDialog title={`Restaurer la version ${restore.number}`} message="Une NOUVELLE version identique sera créée : l’historique n’est jamais effacé." confirmLabel="Restaurer" onClose={() => setRestore(null)} onConfirm={async () => { try { const r = await api<{ number: number }>(`/api/projects/${id}/versions/${restore.id}/restore`, { method: 'POST' }); notify(`Version ${r.number} créée par restauration.`); await onRestored(); } catch (e) { onError(e); } }} /> : null}
    </div>
  );
}

function Quality({ data, busy, onFix, onBuild }: { data: Detail; busy: boolean; onFix: () => void; onBuild: () => void }) {
  const checks = data.current?.checks;
  const build = data.current?.build_report;
  const isApp = data.project.render === 'nextjs';
  if (!checks) return <p className="small muted">Aucun contrôle exécuté pour la version actuelle.</p>;
  const groups = (['erreur', 'avertissement', 'info'] as const).map((l) => [l, checks.items.filter((i) => i.level === l)] as const);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid g-3" style={{ gap: 8 }}>
        {groups.map(([l, list]) => <div key={l} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px' }}><div className="tiny muted">{l === 'erreur' ? 'Erreurs' : l === 'avertissement' ? 'Avertissements' : 'Infos'}</div><div className="num" style={{ fontSize: 22, color: l === 'erreur' && list.length ? 'var(--red)' : undefined }}>{list.length}</div></div>)}
      </div>
      {checks.counts.erreur ? <button className="btn btn-gold" disabled={busy} onClick={onFix}><Wrench size={15} />Corriger automatiquement (ciblé)</button> : <Alert kind="success">Aucune erreur bloquante détectée par les contrôles automatiques.</Alert>}
      {groups.map(([l, list]) => list.length ? (
        <div key={l}><div className="label" style={{ marginBottom: 6 }}>{l === 'erreur' ? 'Erreurs bloquantes' : l === 'avertissement' ? 'Avertissements' : 'Informations'}</div>
          {list.map((i, k) => <div key={k} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="mono tiny faint">{i.file}</span><div>{i.message}</div></div>)}
        </div>
      ) : null)}
      <Alert kind="warn"><b>Non exécuté automatiquement :</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{checks.not_executed.map((x) => <li key={x}>{x}</li>)}</ul>Appliquez la matrice d’audit final (Paramètres → Matrices) avant toute mise en production.</Alert>
      {isApp ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="label">Construction dans le runner isolé</div>
          {!build ? <p className="small muted">Pas encore exécutée.</p> : !build.executed ? <Alert kind="warn">{build.reason}</Alert> : (
            <>{build.steps.map((s) => <details key={s.name}><summary className="small" style={{ cursor: 'pointer', color: s.exitCode === 0 ? 'var(--green)' : 'var(--red)' }}>{s.exitCode === 0 ? '✓' : '✗'} {s.name} <span className="mono tiny faint">{s.command}</span></summary><pre className="code">{s.output}</pre></details>)}</>
          )}
          <button className="btn" disabled={busy || !data.integrations.sandbox} onClick={onBuild} title={!data.integrations.sandbox ? 'Runner non configuré' : ''}><Wrench size={15} />Construire et tester</button>
        </div>
      ) : null}
    </div>
  );
}

function Files({ id, versionId }: { id: string; versionId: string | null }) {
  const [files, setFiles] = useState<{ path: string; content: string }[]>([]);
  const [selected, setSelected] = useState('');
  const onError = useErrorToast();
  useEffect(() => {
    if (!versionId) return;
    api<{ version: { files: { path: string; content: string }[] } }>(`/api/projects/${id}/versions/${versionId}`).then((r) => { setFiles(r.version.files); setSelected((s) => s || r.version.files.find((f) => /index\.html$|AccueilPage|package\.json/.test(f.path))?.path || r.version.files[0]?.path || ''); }).catch(onError);
  }, [id, versionId, onError]);
  if (!versionId) return <p className="small muted">Aucune version.</p>;
  const file = files.find((f) => f.path === selected);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="file-list" style={{ maxHeight: 220, overflow: 'auto' }}>
        {files.map((f) => <button key={f.path} className="file-item mono" aria-current={f.path === selected} onClick={() => setSelected(f.path)}>{f.path}<span className="tiny faint" style={{ marginLeft: 'auto' }}>{(f.content.length / 1024).toFixed(1)} Ko</span></button>)}
      </div>
      {file ? <pre className="code">{file.content}</pre> : null}
    </div>
  );
}

function Publication({ data, onAction }: { data: Detail; onAction: (m: 'github' | 'deploy-preview' | 'deploy-prod') => void }) {
  const p = data.project;
  const hasVersion = !!p.current_version_id;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <Alert kind="info">Aucune action externe sans votre confirmation. Le ZIP du code source reste toujours disponible, même sans GitHub ni Vercel.</Alert>
      <div className="card card-pad" style={{ boxShadow: 'none' }}>
        <div className="strong small row"><GitBranch size={15} />Dépôt GitHub privé</div>
        <p className="tiny muted">{data.integrations.github ? 'Crée ou met à jour un dépôt PRIVÉ (refus si le dépôt est public).' : 'Non configuré (GITHUB_TOKEN, GITHUB_OWNER).'}</p>
        <button className="btn btn-sm" disabled={!hasVersion || !data.integrations.github} onClick={() => onAction('github')}>Envoyer vers GitHub…</button>
      </div>
      <div className="card card-pad" style={{ boxShadow: 'none' }}>
        <div className="strong small row"><Rocket size={15} />Déploiement Vercel</div>
        <p className="tiny muted">{p.render === 'nextjs' ? 'Application : déployez via GitHub + Vercel (variables et base à configurer).' : data.integrations.vercel ? 'Preview protégée d’abord ; production seulement après approbation et double confirmation.' : 'Non configuré (VERCEL_DEPLOY_TOKEN).'}</p>
        <div className="row">
          <button className="btn btn-sm" disabled={!hasVersion || !data.integrations.vercel || p.render === 'nextjs'} onClick={() => onAction('deploy-preview')}>Déployer en preview…</button>
          <button className="btn btn-sm" disabled={!hasVersion || !data.integrations.vercel || p.render === 'nextjs' || !['Approuvé', 'Déployé'].includes(p.status)} onClick={() => onAction('deploy-prod')}>Mettre en production…</button>
        </div>
      </div>
      <div className="label">Historique</div>
      {data.deployments.length ? data.deployments.map((d) => (
        <div key={d.id} className="small" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
          <b>{d.provider}</b> · {d.target} · <span style={{ color: d.status === 'succes' ? 'var(--green)' : d.status === 'echec' ? 'var(--red)' : undefined }}>{d.status}</span> · <span className="tiny faint">{fmtDateTime(d.created_at)}</span>
          {d.url ? <div><a className="tiny" style={{ color: 'var(--gold-ink)' }} href={d.url} target="_blank" rel="noopener noreferrer">{d.url}</a></div> : null}
          {d.detail ? <div className="tiny muted">{d.detail}</div> : null}
        </div>
      )) : <p className="small muted">Aucun export ni déploiement.</p>}
    </div>
  );
}

function GithubModal({ id, name, versionId, onClose, onDone }: { id: string; name: string; versionId: string | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [repo, setRepo] = useState(name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'site-client');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Envoyer vers GitHub" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api<{ url: string }>(`/api/projects/${id}/github`, { json: { repo, versionId, confirm: true } }); notify(`Envoyé : ${r.url}`); await onDone(); onClose(); } catch (e) { onError(e); } finally { setBusy(false); } }}>{busy ? <Loader2 size={15} className="spin" /> : null}Confirmer l’envoi</button></>}>
      <p className="small muted">Le code de la version {versionId ? 'affichée' : 'actuelle'} sera poussé dans un dépôt <b>privé</b>. Aucun secret n’y est inclus.</p>
      <div className="field"><label htmlFor="gh-repo">Nom du dépôt</label><input id="gh-repo" className="input" value={repo} onChange={(e) => setRepo(e.target.value)} /></div>
    </Modal>
  );
}

function DeployModal({ id, target, versionId, onClose, onDone }: { id: string; target: 'preview' | 'production'; versionId: string | null; onClose: () => void; onDone: () => Promise<unknown> }) {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = target === 'preview' || text === 'PRODUCTION';
  return (
    <Modal title={target === 'production' ? 'Mise en production' : 'Déploiement preview'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!ok || busy} onClick={async () => { setBusy(true); try { const r = await api<{ url: string }>(`/api/projects/${id}/deploy`, { json: { target, versionId, confirm: true, confirmProduction: text } }); notify(`Déploiement lancé : ${r.url}`); await onDone(); onClose(); } catch (e) { onError(e); } finally { setBusy(false); } }}>{busy ? <Loader2 size={15} className="spin" /> : null}Déployer</button></>}>
      {target === 'production' ? <Alert kind="warn">Le site sera <b>publiquement accessible</b>. Vérifiez la matrice d’audit, les mentions légales et les « À renseigner » avant de continuer.</Alert> : <p className="small muted">Crée un déploiement de prévisualisation sur votre compte Vercel (activez la protection des previews dans Vercel pour en restreindre l’accès).</p>}
      {target === 'production' ? <div className="field"><label htmlFor="dp">Tapez PRODUCTION pour confirmer</label><input id="dp" className="input" value={text} onChange={(e) => setText(e.target.value)} /></div> : null}
    </Modal>
  );
}
