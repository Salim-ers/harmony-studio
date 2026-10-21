'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ChevronLeft, ChevronRight, Columns3, Download, ExternalLink, Filter, Info, Loader2, Plus, Radar, Save, Search, Star, Table2, Trash2, Upload, X,
} from 'lucide-react';
import { api, download } from '@/lib/client/api';
import { fmtDate, isUrn, relative } from '@/lib/client/format';
import { NEEDS, PIPELINE, SECTORS, STRATEGIES, ZONES } from '@/lib/shared/constants';
import { Alert, ConfirmDialog, DemoBadge, Empty, Modal, PageHead, ScoreBadge, SkeletonRows, StatusBadge, StrategyBadge, useErrorToast, usePersistentState, useToast } from '../ui';

export type ProspectRow = {
  id: string; name: string; source_url: string; platform: string; strategy: string; activity: string; city: string; location_verified: boolean; need_type: string;
  need_status: string; confidence: string; score: number; status: string; published_at: string | null; created_at: string; website: string | null; budget_text: string;
  deadline: string | null; tags: string[]; favorite: boolean; archived_at: string | null; do_not_contact: boolean; stale: boolean; is_demo: boolean; next_action: string; evidence: string;
};
type ListResponse = { items: ProspectRow[]; total: number; page: number; pageSize: number; byStatus: Record<string, number> };
type RunSummary = { runId: string; status: string; queries: string[]; found: number; created: number; merged: number; duplicates: number; rejected: number; apiCalls: number; demo: boolean; error: string };

type Filters = { strategy: string; status: string; q: string; minScore: string; website: string; budget: boolean; fresh: string; zone: string; source: string; favorite: boolean; archived: boolean; sort: string };
const DEFAULT_FILTERS: Filters = { strategy: '', status: '', q: '', minScore: '', website: '', budget: false, fresh: '', zone: '', source: '', favorite: false, archived: false, sort: 'recent' };

export default function Prospection() {
  const params = useSearchParams();
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [filters, setFilters] = usePersistentState<Filters>('prospect-filters', DEFAULT_FILTERS);
  const [view, setView] = usePersistentState<'table' | 'pipeline'>('prospect-view', 'table');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [modal, setModal] = useState<'' | 'add' | 'import'>('');
  const [confirm, setConfirm] = useState<null | { action: string; label: string }>(null);

  useEffect(() => {
    const strat = params.get('strategie');
    const statut = params.get('statut');
    if (strat || statut) setFilters((f) => ({ ...f, strategy: strat ?? f.strategy, status: statut ?? f.status }));
    if (params.get('recherche') === '1') setSearchOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (filters.strategy) q.set('strategy', filters.strategy);
    if (filters.status && view === 'table') q.set('status', filters.status);
    if (filters.q) q.set('q', filters.q);
    if (filters.minScore) q.set('minScore', filters.minScore);
    if (filters.website) q.set('website', filters.website);
    if (filters.budget) q.set('budget', '1');
    if (filters.fresh) q.set('fresh', filters.fresh);
    if (filters.zone) q.set('zone', filters.zone);
    if (filters.source) q.set('source', filters.source);
    if (filters.favorite) q.set('favorite', '1');
    if (filters.archived) q.set('archived', '1');
    q.set('sort', filters.sort);
    q.set('page', String(view === 'pipeline' ? 1 : page));
    q.set('pageSize', view === 'pipeline' ? '200' : '25');
    return q.toString();
  }, [filters, page, view]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api<ListResponse>(`/api/prospects?${query}`)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); setSelected([]); }, [filters, view]);
  useEffect(() => { if (data && data.total === 0 && !filters.q && !filters.strategy && !filters.archived) setSearchOpen(true); }, [data, filters]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const activeFilters = ['minScore', 'website', 'budget', 'fresh', 'zone', 'source', 'favorite', 'archived'].filter((k) => !!filters[k as keyof Filters]).length;

  async function bulk(action: string, status?: string) {
    try {
      const r = await api<{ count: number }>('/api/prospects/bulk', { json: { ids: selected, action, status } });
      notify(`${r.count} fiche(s) mise(s) à jour.`);
      setSelected([]);
      await load();
    } catch (e) { onError(e); }
  }
  async function moveTo(id: string, status: string) {
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === id ? { ...x, status } : x)) });
    try { await api(`/api/prospects/${id}`, { method: 'PATCH', json: { status } }); notify(`Statut : ${status}`); }
    catch (e) { onError(e); await load(); }
  }
  async function exportCsv() {
    try { const q = new URLSearchParams(query); q.delete('page'); q.delete('pageSize'); await download(`/api/prospects/export?${q}`, 'prospects.csv'); notify('Export CSV téléchargé.'); }
    catch (e) { onError(e); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <>
      <PageHead eyebrow="Prospection" title="Opportunités"
        desc="Pistes réelles et sourcées. Les demandes explicites et les simples signaux d’opportunité ne sont jamais confondus."
        actions={<>
          <button className="btn" onClick={() => setModal('import')}><Upload size={16} /><span className="hide-sm">Importer</span></button>
          <button className="btn" onClick={exportCsv}><Download size={16} /><span className="hide-sm">Exporter CSV</span></button>
          <button className="btn" onClick={() => setModal('add')}><Plus size={16} /><span className="hide-sm">Ajouter</span></button>
          <button className="btn btn-primary" onClick={() => setSearchOpen((o) => !o)} aria-expanded={searchOpen}><Radar size={16} />{searchOpen ? 'Masquer la recherche' : 'Rechercher'}</button>
        </>} />

      {searchOpen ? <SearchPanel onDone={() => { void load(); }} /> : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-pad row row-wrap" style={{ gap: 10 }}>
          <div className="segmented" role="group" aria-label="Stratégie">
            {[['', 'Toutes'], ['explicite', 'Demandes'], ['signal', 'Signaux'], ['marche', 'Marchés'], ['manuel', 'Manuels']].map(([k, l]) => (
              <button key={k} aria-pressed={filters.strategy === k} onClick={() => set('strategy', k)}>{l}</button>
            ))}
          </div>
          {view === 'table' ? (
            <select className="select" style={{ width: 170 }} aria-label="Statut" value={filters.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Tous les statuts</option>
              {PIPELINE.map((s) => <option key={s} value={s}>{s}{data?.byStatus[s] ? ` (${data.byStatus[s]})` : ''}</option>)}
            </select>
          ) : null}
          <div className="row" style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, color: 'var(--faint)' }} />
            <input className="input" style={{ paddingLeft: 32 }} placeholder="Nom, ville, activité, tag…" value={filters.q} onChange={(e) => set('q', e.target.value)} aria-label="Filtrer" />
          </div>
          <button className="btn" onClick={() => setMoreFilters((m) => !m)} aria-expanded={moreFilters}><Filter size={15} />Filtres{activeFilters ? <span className="badge badge-gold">{activeFilters}</span> : null}</button>
          <select className="select" style={{ width: 170 }} aria-label="Tri" value={filters.sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="recent">Plus récents</option><option value="score">Meilleur score</option><option value="publication">Date de publication</option><option value="activite">Dernière activité</option><option value="nom">Nom</option>
          </select>
          <div className="segmented" role="group" aria-label="Affichage">
            <button aria-pressed={view === 'table'} onClick={() => setView('table')} title="Tableau"><Table2 size={15} /></button>
            <button aria-pressed={view === 'pipeline'} onClick={() => setView('pipeline')} title="Pipeline"><Columns3 size={15} /></button>
          </div>
        </div>
        {moreFilters ? (
          <div className="card-pad" style={{ borderTop: '1px solid var(--line)', display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div className="field"><label htmlFor="f-score">Score minimum</label><input id="f-score" className="input" type="number" min={0} max={100} value={filters.minScore} onChange={(e) => set('minScore', e.target.value)} /></div>
            <div className="field"><label htmlFor="f-site">Site web</label><select id="f-site" className="select" value={filters.website} onChange={(e) => set('website', e.target.value)}><option value="">Indifférent</option><option value="avec">Site identifié</option><option value="sans">Aucun site trouvé</option><option value="inconnu">Non vérifié</option></select></div>
            <div className="field"><label htmlFor="f-fresh">Nouveauté</label><select id="f-fresh" className="select" value={filters.fresh} onChange={(e) => set('fresh', e.target.value)}><option value="">Toutes dates</option><option value="7">7 derniers jours</option><option value="30">30 jours</option><option value="90">90 jours</option></select></div>
            <div className="field"><label htmlFor="f-zone">Zone</label><input id="f-zone" className="input" list="zones-list" value={filters.zone} onChange={(e) => set('zone', e.target.value)} placeholder="Creil, Oise…" /></div>
            <div className="field"><label htmlFor="f-source">Source / plateforme</label><input id="f-source" className="input" value={filters.source} onChange={(e) => set('source', e.target.value)} placeholder="Codeur, BOAMP…" /></div>
            <div className="field" style={{ alignContent: 'end', gap: 8 }}>
              <label className="check"><input type="checkbox" checked={filters.budget} onChange={(e) => set('budget', e.target.checked)} />Budget mentionné</label>
              <label className="check"><input type="checkbox" checked={filters.favorite} onChange={(e) => set('favorite', e.target.checked)} />Favoris</label>
              <label className="check"><input type="checkbox" checked={filters.archived} onChange={(e) => set('archived', e.target.checked)} />Archivés</label>
            </div>
            <div style={{ alignSelf: 'end' }}><button className="btn btn-ghost" onClick={() => setFilters({ ...DEFAULT_FILTERS })}><X size={14} />Réinitialiser</button></div>
            <datalist id="zones-list">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
          </div>
        ) : null}
      </div>

      {error ? <Alert kind="error">{error}</Alert> : null}
      {selected.length ? (
        <div className="card card-pad row row-wrap" style={{ marginBottom: 12, background: 'var(--gold-soft)', borderColor: 'var(--gold)' }}>
          <strong className="small">{selected.length} sélectionné(s)</strong>
          <select className="select" style={{ width: 200 }} defaultValue="" aria-label="Changer le statut" onChange={(e) => { if (e.target.value) void bulk('statut', e.target.value); e.target.value = ''; }}>
            <option value="">Changer le statut…</option>{PIPELINE.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => bulk('favori')}><Star size={14} />Favori</button>
          <button className="btn btn-sm" onClick={() => bulk(filters.archived ? 'desarchiver' : 'archiver')}><Archive size={14} />{filters.archived ? 'Désarchiver' : 'Archiver'}</button>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ action: 'supprimer', label: `Supprimer définitivement ${selected.length} fiche(s) et tout leur historique ?` })}><Trash2 size={14} />Supprimer</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected([])}>Annuler</button>
        </div>
      ) : null}

      {view === 'pipeline' ? (
        <Pipeline items={data?.items ?? []} loading={loading} onMove={moveTo} />
      ) : (
        <div className="card">
          {loading && !data ? <SkeletonRows rows={8} /> : data?.items.length ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr>
                    <th style={{ width: 36 }}><input type="checkbox" aria-label="Tout sélectionner" checked={selected.length === data.items.length} onChange={(e) => setSelected(e.target.checked ? data.items.map((x) => x.id) : [])} /></th>
                    <th>Prospect</th><th>Type</th><th>Besoin</th><th className="hide-sm">Source</th><th>Statut</th><th>Score</th><th className="hide-sm">Découvert</th>
                  </tr></thead>
                  <tbody>
                    {data.items.map((p) => (
                      <tr key={p.id} style={{ opacity: p.do_not_contact ? 0.6 : 1 }}>
                        <td><input type="checkbox" aria-label={`Sélectionner ${p.name}`} checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} /></td>
                        <td className="name-cell">
                          <div className="row">{p.favorite ? <Star size={13} fill="var(--gold)" color="var(--gold)" /> : null}<Link className="row-link" href={`/prospection/${p.id}`}>{p.name}</Link><DemoBadge show={p.is_demo} />{p.do_not_contact ? <span className="badge badge-red">Opposition</span> : null}{p.stale ? <span className="badge badge-amber">Ancienne</span> : null}</div>
                          <div className="tiny muted">{p.activity || 'Activité inconnue'} · {p.city || 'Lieu inconnu'}{p.city && !p.location_verified ? ' (non vérifiée)' : ''}</div>
                        </td>
                        <td><StrategyBadge strategy={p.strategy} /></td>
                        <td><div className="small">{p.need_type || '—'}</div><div className="tiny" style={{ color: p.need_status === 'confirmé' ? 'var(--green)' : 'var(--faint)' }}>{p.need_status === 'confirmé' ? 'Exprimé dans la source' : p.need_status === 'supposé' ? 'Hypothèse à valider' : 'Inconnu'}</div></td>
                        <td className="hide-sm"><div className="small ellipsis" style={{ maxWidth: 160 }}>{p.platform || '—'}</div>{!isUrn(p.source_url) ? <a className="tiny" style={{ color: 'var(--gold-ink)' }} href={p.source_url} target="_blank" rel="noopener noreferrer nofollow">Ouvrir la source <ExternalLink size={11} /></a> : <span className="tiny faint">Sans lien</span>}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td><ScoreBadge score={p.score} /></td>
                        <td className="hide-sm tiny muted">{relative(p.created_at)}{p.published_at ? <div>Publié : {fmtDate(p.published_at)}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-pad row between small" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="muted">{data.total} fiche(s){loading ? <Loader2 size={13} className="spin" style={{ marginLeft: 8 }} /> : null}</span>
                <div className="row">
                  <button className="btn btn-sm btn-icon" aria-label="Page précédente" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={15} /></button>
                  <span>Page {page} / {pages}</span>
                  <button className="btn btn-sm btn-icon" aria-label="Page suivante" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={15} /></button>
                </div>
              </div>
            </>
          ) : (
            <Empty icon={<Radar size={22} />} title="Aucune fiche pour ces critères" action={<button className="btn btn-primary" onClick={() => setSearchOpen(true)}><Radar size={15} />Lancer une recherche</button>}>
              Aucun prospect n’est inventé : seules les pistes trouvées dans des sources réelles (ou ajoutées par vous) apparaissent ici.
            </Empty>
          )}
        </div>
      )}
      {modal === 'add' ? <AddProspect onClose={() => setModal('')} onDone={() => { setModal(''); void load(); }} /> : null}
      {modal === 'import' ? <ImportCsv onClose={() => setModal('')} onDone={() => { setModal(''); void load(); }} /> : null}
      {confirm ? <ConfirmDialog title="Confirmation" message={confirm.label} danger confirmLabel="Supprimer" onConfirm={() => bulk(confirm.action)} onClose={() => setConfirm(null)} /> : null}
    </>
  );
}

function Pipeline({ items, loading, onMove }: { items: ProspectRow[]; loading: boolean; onMove: (id: string, status: string) => void }) {
  const [over, setOver] = useState('');
  if (loading && !items.length) return <div className="card"><SkeletonRows rows={6} /></div>;
  return (
    <div className="kanban" aria-label="Pipeline commercial (glisser-déposer pour changer de statut)">
      {PIPELINE.map((status) => {
        const col = items.filter((p) => p.status === status);
        return (
          <div key={status} className={`kanban-col ${over === status ? 'drop' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(status); }} onDragLeave={() => setOver('')}
            onDrop={(e) => { e.preventDefault(); setOver(''); const id = e.dataTransfer.getData('text/plain'); if (id) onMove(id, status); }}>
            <h3><span>{status}</span><span className="badge">{col.length}</span></h3>
            {col.map((p) => (
              <Link key={p.id} href={`/prospection/${p.id}`} className="kanban-card" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}>
                <div className="row between"><span className="strong small ellipsis">{p.name}</span><ScoreBadge score={p.score} /></div>
                <div className="tiny muted ellipsis" style={{ margin: '4px 0 6px' }}>{p.need_type || 'Besoin à préciser'} · {p.city || '—'}</div>
                <div className="row"><StrategyBadge strategy={p.strategy} /><DemoBadge show={p.is_demo} /></div>
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SearchPanel({ onDone }: { onDone: () => void }) {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [strategy, setStrategy] = usePersistentState<'explicite' | 'signal' | 'marche'>('search-strategy', 'explicite');
  const [zones, setZones] = usePersistentState<string[]>('search-zones', ['Oise']);
  const [sectors, setSectors] = usePersistentState<string[]>('search-sectors', []);
  const [needs, setNeeds] = usePersistentState<string[]>('search-needs', []);
  const [freshness, setFreshness] = usePersistentState<string>('search-fresh', 'pm');
  const [maxQueries, setMaxQueries] = usePersistentState<number>('search-max', 6);
  const [customQuery, setCustomQuery] = useState('');
  const [freeZone, setFreeZone] = useState('');
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [rejections, setRejections] = useState<{ title: string; url: string; reason: string }[] | null>(null);
  const [saveName, setSaveName] = useState('');
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function run() {
    setRunning(true);
    setSummary(null);
    setRejections(null);
    try {
      const r = await api<RunSummary>('/api/prospects/search', { json: { strategy, zones: zones.length ? zones : ['Oise'], sectors, needs, customQuery, freshness, maxQueries } });
      setSummary(r);
      if (r.status === 'échec') notify(r.error || 'Recherche en échec.', 'error');
      else notify(`${r.created} nouvelle(s) piste(s), ${r.merged + r.duplicates} déjà connue(s), ${r.rejected} écartée(s).`);
      onDone();
    } catch (e) { onError(e); } finally { setRunning(false); }
  }
  async function showRejections() {
    if (!summary) return;
    const d = await api<{ runs: { id: string; rejections: { title: string; url: string; reason: string }[] }[] }>('/api/search-runs');
    setRejections(d.runs.find((r) => r.id === summary.runId)?.rejections ?? []);
  }
  async function saveProfile() {
    try {
      await api('/api/search-profiles', { json: { name: saveName || `${STRATEGIES[strategy].label} — ${zones.join(', ')}`, strategy, zones: zones.length ? zones : ['Oise'], sectors, needs, customQuery, freshness, maxQueries } });
      notify('Recherche enregistrée. Planifiez-la dans « Recherches & veille ».');
      setSaveName('');
    } catch (e) { onError(e); }
  }

  const tones = { explicite: 'var(--gold)', signal: 'var(--blue)', marche: 'var(--violet)' } as const;
  return (
    <section className="card" style={{ marginBottom: 16, animation: 'rise .45s var(--ease) both' }}>
      <div className="card-head"><div><div className="card-title"><Radar size={16} color="var(--gold)" />Recherche d’opportunités</div><div className="card-sub">Requêtes réelles via Brave Search API — résultats sourcés, dédupliqués et qualifiés. Aucune fiche n’est inventée.</div></div></div>
      <div className="card-pad stack">
        <div className="grid g-3">
          {(['explicite', 'signal', 'marche'] as const).map((s) => (
            <button key={s} className="card card-pad card-hover" style={{ textAlign: 'left', borderColor: strategy === s ? tones[s] : undefined, boxShadow: strategy === s ? `0 0 0 3px color-mix(in srgb, ${tones[s]} 20%, transparent)` : undefined, background: 'var(--surface)' }} aria-pressed={strategy === s} onClick={() => setStrategy(s)}>
              <div className="row between"><span className="strong">{STRATEGIES[s].label}</span><span className="dot" style={{ color: tones[s] }} /></div>
              <p className="tiny muted" style={{ marginTop: 6 }}>{STRATEGIES[s].description}</p>
            </button>
          ))}
        </div>
        <div className="field"><span className="label">Zones géographiques</span>
          <div className="chips">
            {ZONES.map((z) => <button key={z} type="button" className="chip" aria-pressed={zones.includes(z)} onClick={() => setZones(toggle(zones, z))}>{z}</button>)}
            {zones.filter((z) => !(ZONES as readonly string[]).includes(z)).map((z) => <button key={z} type="button" className="chip" aria-pressed onClick={() => setZones(toggle(zones, z))}>{z} ×</button>)}
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (freeZone.trim()) { setZones([...zones, freeZone.trim()]); setFreeZone(''); } }}><input className="input" style={{ height: 30, width: 160 }} placeholder="Autre zone…" value={freeZone} onChange={(e) => setFreeZone(e.target.value)} aria-label="Ajouter une zone libre" /></form>
          </div>
          <span className="hint">Rayon kilométrique non proposé : la localisation provient du texte des sources et n’est pas géocodée de façon fiable.</span>
        </div>
        <div className="field"><span className="label">Métiers ciblés <span className="hint">(aucun = tous, variés automatiquement)</span></span>
          <div className="chips">{SECTORS.map((s) => <button key={s.key} type="button" className="chip" aria-pressed={sectors.includes(s.key)} onClick={() => setSectors(toggle(sectors, s.key))}>{s.label}</button>)}</div>
        </div>
        {strategy !== 'signal' ? (
          <div className="field"><span className="label">Besoins recherchés</span>
            <div className="chips">{NEEDS.map((n) => <button key={n.key} type="button" className="chip" aria-pressed={needs.includes(n.key)} onClick={() => setNeeds(toggle(needs, n.key))}>{n.label}</button>)}</div>
          </div>
        ) : null}
        <div className="form-grid">
          <div className="field"><label htmlFor="cq">Recherche libre (facultatif)</label><input id="cq" className="input" maxLength={250} value={customQuery} onChange={(e) => setCustomQuery(e.target.value)} placeholder="ex. « recherche site internet » boulangerie" /><span className="hint">Remplace les requêtes automatiques (la zone est ajoutée si absente).</span></div>
          <div className="row row-wrap" style={{ alignItems: 'end', gap: 12 }}>
            <div className="field"><label htmlFor="fresh">Nouveauté</label><select id="fresh" className="select" value={freshness} onChange={(e) => setFreshness(e.target.value)}><option value="pd">24 h</option><option value="pw">7 jours</option><option value="pm">1 mois</option><option value="py">1 an</option><option value="all">Toutes dates</option></select></div>
            <div className="field" style={{ width: 120 }}><label htmlFor="mq">Requêtes</label><input id="mq" className="input" type="number" min={1} max={20} value={maxQueries} onChange={(e) => setMaxQueries(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></div>
          </div>
        </div>
        <div className="row row-wrap between">
          <div className="row row-wrap">
            <input className="input" style={{ width: 240 }} placeholder="Nom de la recherche à enregistrer" value={saveName} onChange={(e) => setSaveName(e.target.value)} aria-label="Nom de la recherche" />
            <button className="btn" onClick={saveProfile}><Save size={15} />Enregistrer</button>
          </div>
          <button className="btn btn-gold btn-lg" onClick={run} disabled={running}>{running ? <Loader2 size={17} className="spin" /> : <Radar size={17} />}{running ? 'Recherche et qualification…' : 'Lancer l’analyse'}</button>
        </div>
        {summary ? (
          <div className="stack" style={{ gap: 10 }}>
            {summary.demo ? <Alert kind="warn">Résultats de SIMULATION (aucune clé Brave) : ce ne sont pas de vrais prospects.</Alert> : null}
            {summary.error ? <Alert kind={summary.status === 'échec' ? 'error' : 'warn'}>{summary.error}</Alert> : null}
            <div className="grid g-4" style={{ gap: 10 }}>
              {[['Nouvelles pistes', summary.created, 'var(--green)'], ['Déjà connues', summary.merged + summary.duplicates, undefined], ['Écartées (faux positifs)', summary.rejected, 'var(--amber)'], ['Requêtes API', summary.apiCalls, undefined]].map(([l, v, c]) => (
                <div key={String(l)} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}><div className="tiny muted">{l}</div><div className="serif" style={{ fontSize: 26, fontWeight: 600, color: c as string | undefined }}>{v as number}</div></div>
              ))}
            </div>
            <details><summary className="small muted" style={{ cursor: 'pointer' }}>Requêtes exécutées ({summary.queries.length})</summary><ul className="small mono">{summary.queries.map((q) => <li key={q}>{q}</li>)}</ul></details>
            {summary.rejected ? <button className="btn btn-sm btn-ghost" style={{ justifySelf: 'start' }} onClick={showRejections}><Info size={14} />Voir pourquoi des résultats ont été écartés</button> : null}
            {rejections ? <div className="table-wrap card" style={{ maxHeight: 280, overflow: 'auto' }}><table className="table"><tbody>{rejections.map((r) => <tr key={r.url}><td className="small"><a href={r.url} target="_blank" rel="noopener noreferrer nofollow">{r.title}</a></td><td className="tiny muted">{r.reason}</td></tr>)}</tbody></table></div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AddProspect({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const onError = useErrorToast();
  const notify = useToast().notify;
  const [form, setForm] = useState({ name: '', source_url: '', city: '', activity: '', need_type: '', website: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal title="Ajouter un prospect" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={async () => { setBusy(true); try { await api('/api/prospects', { json: form }); notify('Prospect ajouté.'); onDone(); } catch (e) { onError(e); } finally { setBusy(false); } }}>Ajouter</button></>}>
      <div className="form-grid">
        <div className="field span-2"><label htmlFor="a-name">Nom / enseigne *</label><input id="a-name" className="input" value={form.name} onChange={up('name')} /></div>
        <div className="field span-2"><label htmlFor="a-url">Lien source (annonce, fiche, page)</label><input id="a-url" className="input" placeholder="https://…" value={form.source_url} onChange={up('source_url')} /><span className="hint">Facultatif — la provenance est conservée pour la traçabilité.</span></div>
        <div className="field"><label htmlFor="a-city">Ville</label><input id="a-city" className="input" value={form.city} onChange={up('city')} /></div>
        <div className="field"><label htmlFor="a-act">Activité</label><input id="a-act" className="input" value={form.activity} onChange={up('activity')} /></div>
        <div className="field"><label htmlFor="a-need">Besoin</label><input id="a-need" className="input" value={form.need_type} onChange={up('need_type')} /></div>
        <div className="field"><label htmlFor="a-site">Site web actuel</label><input id="a-site" className="input" value={form.website} onChange={up('website')} /></div>
        <div className="field span-2"><label htmlFor="a-notes">Notes</label><textarea id="a-notes" className="textarea" value={form.notes} onChange={up('notes')} /></div>
      </div>
    </Modal>
  );
}

function ImportCsv({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const onError = useErrorToast();
  const notify = useToast().notify;
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{ rows: number; unknownColumns: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(file?: File) {
    if (!file) return;
    if (file.size > 3_000_000) { onError(new Error('Fichier trop volumineux (3 Mo maximum).')); return; }
    const text = await file.text();
    setCsv(text);
    try { setPreview(await api('/api/prospects/import', { json: { csv: text, dryRun: true } })); } catch (e) { onError(e); }
  }
  return (
    <Modal title="Importer des prospects (CSV)" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!preview?.rows || busy} onClick={async () => { setBusy(true); try { const r = await api<{ created: number; duplicates: number; invalid: number }>('/api/prospects/import', { json: { csv } }); notify(`${r.created} importé(s), ${r.duplicates} doublon(s), ${r.invalid} ligne(s) invalide(s).`); onDone(); } catch (e) { onError(e); } finally { setBusy(false); } }}>Importer {preview?.rows ?? ''} ligne(s)</button></>}>
      <p className="small muted">Colonnes reconnues : Nom, URL source, Ville, Activité, Besoin, Statut, Site web, Notes, Tags, Valeur estimée. Séparateur « ; » ou « , ». Les fiches importées sont marquées « provenance à vérifier ».</p>
      <label className="dropzone"><input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /><Upload size={20} /><div className="small strong" style={{ marginTop: 6 }}>Choisir un fichier CSV</div></label>
      {preview ? <Alert kind={preview.rows ? 'success' : 'warn'}>{preview.rows} ligne(s) détectée(s).{preview.unknownColumns.length ? ` Colonnes ignorées : ${preview.unknownColumns.join(', ')}.` : ''}</Alert> : null}
    </Modal>
  );
}
