'use client';
import { useState } from 'react';
import { CalendarClock, History, Loader2, Pencil, Play, Radar, Trash2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtDateTime, relative } from '@/lib/client/format';
import { NEEDS, SECTORS, STRATEGIES, ZONES } from '@/lib/shared/constants';
import { Alert, ConfirmDialog, Empty, Modal, PageHead, SkeletonRows, useErrorToast, useLoad, useToast } from '../ui';

type Profile = { id: string; name: string; strategy: 'explicite' | 'signal' | 'marche'; zones: string[]; sectors: string[]; needs: string[]; custom_query: string; freshness: string; max_queries: number; schedule_enabled: boolean; schedule_days: number[]; schedule_hour: number; alert_min_score: number; last_run_at: string | null };
type Run = { id: string; trigger: string; queries: string[]; status: string; results_found: number; results_new: number; results_merged: number; results_rejected: number; api_calls: number; error: string; is_demo: boolean; started_at: string; profile_name: string | null; rejections: { title: string; url: string; reason: string }[] };
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function Recherches() {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const profiles = useLoad(() => api<{ profiles: Profile[] }>('/api/search-profiles'));
  const runs = useLoad(() => api<{ runs: Run[] }>('/api/search-runs'));
  const [running, setRunning] = useState('');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [removing, setRemoving] = useState<Profile | null>(null);

  async function run(p: Profile) {
    setRunning(p.id);
    try {
      const r = await api<{ created: number; merged: number; duplicates: number; rejected: number; status: string; error: string }>(`/api/search-profiles/${p.id}/run`, { method: 'POST' });
      notify(r.status === 'échec' ? r.error : `${r.created} nouvelle(s) piste(s), ${r.merged + r.duplicates} déjà connue(s), ${r.rejected} écartée(s).`, r.status === 'échec' ? 'error' : 'success');
      await Promise.all([profiles.reload(), runs.reload()]);
    } catch (e) { onError(e); } finally { setRunning(''); }
  }

  return (
    <>
      <PageHead eyebrow="Prospection" title="Recherches & veille" desc="Recherches enregistrées, veille planifiée et historique complet des exécutions (requêtes, résultats, rejets)." />
      <Alert kind="info">La veille s’exécute via Vercel Cron (une exécution par jour sur le forfait Hobby, horaire possible sur Pro avec CRON_HOURLY=1). Vous êtes notifié uniquement des nouveaux résultats au-dessus du seuil choisi.</Alert>
      <div className="grid g-main-side" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-head"><div className="card-title"><Radar size={16} color="var(--gold)" />Recherches enregistrées</div></div>
          {profiles.loading && !profiles.data ? <SkeletonRows /> : profiles.data?.profiles.length ? (
            <div className="table-wrap"><table className="table"><tbody>
              {profiles.data.profiles.map((p) => (
                <tr key={p.id}>
                  <td className="name-cell"><div className="strong">{p.name}</div><div className="tiny muted">{STRATEGIES[p.strategy].label} · {p.zones.join(', ')}{p.sectors.length ? ` · ${p.sectors.length} métier(s)` : ''}</div>
                    <div className="tiny">{p.schedule_enabled ? <span style={{ color: 'var(--green)' }}><CalendarClock size={11} /> Veille : {p.schedule_days.map((d) => DAYS[d - 1]).join(' ')} vers {p.schedule_hour} h · alerte ≥ {p.alert_min_score}</span> : <span className="faint">Veille désactivée</span>} · dernière exécution {relative(p.last_run_at)}</div></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" disabled={!!running} onClick={() => run(p)}>{running === p.id ? <Loader2 size={14} className="spin" /> : <Play size={14} />}Lancer</button>
                    <button className="btn btn-sm btn-ghost btn-icon" aria-label="Modifier" onClick={() => setEditing(p)}><Pencil size={14} /></button>
                    <button className="btn btn-sm btn-ghost btn-icon" aria-label="Supprimer" onClick={() => setRemoving(p)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <Empty icon={<Radar size={22} />} title="Aucune recherche enregistrée">Depuis « Opportunités », configurez une recherche puis cliquez « Enregistrer ».</Empty>}
        </section>
        <section className="card">
          <div className="card-head"><div className="card-title"><History size={16} color="var(--gold)" />Dernières exécutions</div></div>
          {runs.loading && !runs.data ? <SkeletonRows /> : runs.data?.runs.length ? (
            <div className="card-pad stack" style={{ gap: 10 }}>
              {runs.data.runs.slice(0, 20).map((r) => (
                <details key={r.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                  <summary style={{ cursor: 'pointer' }} className="small"><b>{r.profile_name ?? 'Recherche manuelle'}</b> · {fmtDateTime(r.started_at)} · <span style={{ color: r.status === 'terminé' ? 'var(--green)' : r.status === 'échec' ? 'var(--red)' : 'var(--amber)' }}>{r.status}</span>{r.is_demo ? ' · SIMULATION' : ''}
                    <div className="tiny muted">{r.results_new} nouveau(x) · {r.results_merged} connu(s) · {r.results_rejected} écarté(s) · {r.api_calls} requête(s) · {r.trigger}</div></summary>
                  {r.error ? <Alert kind="warn">{r.error}</Alert> : null}
                  <ul className="tiny mono">{r.queries.map((q) => <li key={q}>{q}</li>)}</ul>
                  {r.rejections.length ? <div className="tiny muted">Rejets : {r.rejections.slice(0, 8).map((x) => x.reason).join(' · ')}</div> : null}
                </details>
              ))}
            </div>
          ) : <div className="card-pad small muted">Aucune exécution.</div>}
        </section>
      </div>
      {editing ? <EditProfile profile={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void profiles.reload(); }} /> : null}
      {removing ? <ConfirmDialog title="Supprimer la recherche" danger confirmLabel="Supprimer" message={`Supprimer « ${removing.name} » ? Les prospects déjà trouvés sont conservés.`} onClose={() => setRemoving(null)} onConfirm={async () => { try { await api(`/api/search-profiles/${removing.id}`, { method: 'DELETE' }); notify('Recherche supprimée.'); await profiles.reload(); } catch (e) { onError(e); } }} /> : null}
    </>
  );
}

function EditProfile({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const onError = useErrorToast();
  const [p, setP] = useState(profile);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  async function save() {
    try {
      await api(`/api/search-profiles/${p.id}`, { method: 'PATCH', json: { name: p.name, strategy: p.strategy, zones: p.zones, sectors: p.sectors, needs: p.needs, customQuery: p.custom_query, freshness: p.freshness, maxQueries: p.max_queries, schedule_enabled: p.schedule_enabled, schedule_days: p.schedule_days, schedule_hour: p.schedule_hour, alert_min_score: p.alert_min_score } });
      onSaved();
    } catch (e) { onError(e); }
  }
  return (
    <Modal title="Modifier la recherche" size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <div className="field span-2"><label htmlFor="p-name">Nom</label><input id="p-name" className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="p-st">Stratégie</label><select id="p-st" className="select" value={p.strategy} onChange={(e) => setP({ ...p, strategy: e.target.value as Profile['strategy'] })}>{(['explicite', 'signal', 'marche'] as const).map((s) => <option key={s} value={s}>{STRATEGIES[s].label}</option>)}</select></div>
        <div className="field"><label htmlFor="p-mq">Requêtes par exécution</label><input id="p-mq" className="input" type="number" min={1} max={20} value={p.max_queries} onChange={(e) => setP({ ...p, max_queries: Number(e.target.value) })} /></div>
      </div>
      <div className="field"><span className="label">Zones</span><div className="chips">{ZONES.map((z) => <button key={z} className="chip" aria-pressed={p.zones.includes(z)} onClick={() => setP({ ...p, zones: toggle(p.zones, z) })}>{z}</button>)}</div></div>
      <div className="field"><span className="label">Métiers</span><div className="chips">{SECTORS.map((s) => <button key={s.key} className="chip" aria-pressed={p.sectors.includes(s.key)} onClick={() => setP({ ...p, sectors: toggle(p.sectors, s.key) })}>{s.label}</button>)}</div></div>
      <div className="field"><span className="label">Besoins</span><div className="chips">{NEEDS.map((n) => <button key={n.key} className="chip" aria-pressed={p.needs.includes(n.key)} onClick={() => setP({ ...p, needs: toggle(p.needs, n.key) })}>{n.label}</button>)}</div></div>
      <div className="divider" />
      <label className="check"><input type="checkbox" checked={p.schedule_enabled} onChange={(e) => setP({ ...p, schedule_enabled: e.target.checked })} />Activer la veille planifiée</label>
      <div className="field"><span className="label">Jours</span><div className="chips">{DAYS.map((d, i) => <button key={d} className="chip" aria-pressed={p.schedule_days.includes(i + 1)} onClick={() => setP({ ...p, schedule_days: p.schedule_days.includes(i + 1) ? p.schedule_days.filter((x) => x !== i + 1) : [...p.schedule_days, i + 1].sort() })}>{d}</button>)}</div></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="p-h">Heure (Europe/Paris, cron horaire uniquement)</label><input id="p-h" className="input" type="number" min={0} max={23} value={p.schedule_hour} onChange={(e) => setP({ ...p, schedule_hour: Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor="p-a">Alerte si score ≥</label><input id="p-a" className="input" type="number" min={0} max={100} value={p.alert_min_score} onChange={(e) => setP({ ...p, alert_min_score: Number(e.target.value) })} /></div>
      </div>
    </Modal>
  );
}
