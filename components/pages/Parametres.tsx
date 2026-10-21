'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, Download, Eye, KeyRound, Loader2, Plus, RotateCcw, Save, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, download } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/client/format';
import { MATRIX_KINDS, type MatrixKind } from '@/lib/shared/constants';
import { Alert, ConfirmDialog, Modal, PageHead, SkeletonRows, useErrorToast, useLoad, useToast } from '../ui';

type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };
type CatalogItem = { id: string; label: string; price: number | null; priceMax?: number | null; unit: 'forfait' | 'mois' | 'heure' | 'jour' | 'unité'; note: string };
type Config = {
  company: Record<string, string>;
  ai: { planModel: string; generationModel: string; maxOutputTokens: number; monthlyBudgetUsd: number; jobBudgetUsd: number; maxConcurrentJobs: number; autoFixAttempts: number };
  pricing: Record<string, Price>; pricingNote: string;
  brave: { costPer1000Usd: number | null; monthlyQueryCap: number };
  prospecting: { preferredZones: string[]; retentionMonths: number; defaultFreshness: string };
  catalog: CatalogItem[];
  vat: { regime: 'a_definir' | 'franchise' | 'tva'; rate: number; franchiseMention: string };
  legacy: { watch_city: string; watch_enabled: boolean };
};
type Settings = { config: Config; defaults: { catalog: CatalogItem[]; pricing: Record<string, Price> }; integrations: { key: string; label: string; configured: boolean; required: boolean; detail: string }[]; mocks: boolean };
const TABS = [['entreprise', 'Entreprise'], ['ia', 'Intégrations & coûts'], ['matrices', 'Matrices'], ['tarifs', 'Tarifs & TVA'], ['prospection', 'Prospection & RGPD'], ['securite', 'Sécurité & sauvegarde']] as const;

export default function Parametres() {
  const params = useSearchParams();
  const router = useRouter();
  const notify = useToast().notify;
  const onError = useErrorToast();
  const tab = (params.get('onglet') ?? 'entreprise') as (typeof TABS)[number][0];
  const { data, loading, reload } = useLoad(() => api<Settings>('/api/settings'));
  const [cfg, setCfg] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setCfg(data.config); }, [data]);

  async function save(partial: Partial<Config>) {
    setSaving(true);
    try { await api('/api/settings', { method: 'PATCH', json: partial }); notify('Paramètres enregistrés.'); await reload(); }
    catch (e) { onError(e); } finally { setSaving(false); }
  }

  return (
    <>
      <PageHead eyebrow="Configuration" title="Paramètres" desc="Les clés API restent des variables d’environnement serveur : seul leur état « configuré / non configuré » est affiché ici." />
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => router.replace(`/parametres?onglet=${k}`)}>{l}</button>)}</div>
      {loading && !cfg ? <div className="card"><SkeletonRows rows={8} /></div> : !cfg || !data ? null : (
        <div key={tab} className="page-enter">
          {tab === 'entreprise' ? (
            <section className="card card-pad stack">
              <Alert kind="info">Utilisé sur les devis et dans les messages de prospection. Laissez vide ce qui n’est pas confirmé : rien n’est inventé sur les documents.</Alert>
              <div className="form-grid">
                {([['name', 'Nom commercial'], ['legalForm', 'Forme juridique'], ['siren', 'SIREN / SIRET'], ['phone', 'Téléphone'], ['email', 'E-mail'], ['website', 'Site web'], ['signatory', 'Signataire']] as const).map(([k, l]) => (
                  <div key={k} className="field"><label htmlFor={`c-${k}`}>{l}</label><input id={`c-${k}`} className="input" value={cfg.company[k] ?? ''} onChange={(e) => setCfg({ ...cfg, company: { ...cfg.company, [k]: e.target.value } })} /></div>
                ))}
                <div className="field span-2"><label htmlFor="c-address">Adresse</label><input id="c-address" className="input" value={cfg.company.address ?? ''} onChange={(e) => setCfg({ ...cfg, company: { ...cfg.company, address: e.target.value } })} /></div>
                <div className="field span-2"><label htmlFor="c-vp">Proposition de valeur (messages)</label><textarea id="c-vp" className="textarea" value={cfg.company.valueProposition ?? ''} onChange={(e) => setCfg({ ...cfg, company: { ...cfg.company, valueProposition: e.target.value } })} /></div>
                <div className="field span-2"><label htmlFor="c-ft">Pied de page des devis (mentions)</label><textarea id="c-ft" className="textarea" value={cfg.company.quoteFooter ?? ''} onChange={(e) => setCfg({ ...cfg, company: { ...cfg.company, quoteFooter: e.target.value } })} placeholder="Conditions de paiement, pénalités de retard, indemnité forfaitaire… à valider avec votre comptable." /></div>
              </div>
              <button className="btn btn-primary" style={{ justifySelf: 'end' }} disabled={saving} onClick={() => save({ company: cfg.company })}><Save size={15} />Enregistrer</button>
            </section>
          ) : null}

          {tab === 'ia' ? (
            <div className="stack">
              {data.mocks ? <Alert kind="warn">Mode simulation local actif (HARMONY_MOCKS=1) : les intégrations manquantes sont remplacées par des réponses factices clairement marquées. Impossible sur Vercel.</Alert> : null}
              <section className="card">
                <div className="card-head"><div className="card-title">État des intégrations</div></div>
                <div className="table-wrap"><table className="table"><tbody>
                  {data.integrations.map((i) => (
                    <tr key={i.key}><td><div className="strong small">{i.label}</div><div className="tiny muted">{i.detail}</div></td>
                      <td style={{ textAlign: 'right' }}>{i.configured ? <span className="badge badge-green"><Check size={12} />Configuré</span> : <span className={`badge ${i.required ? 'badge-red' : ''}`}><X size={12} />Non configuré{i.required ? ' (requis)' : ''}</span>}</td></tr>
                  ))}
                </tbody></table></div>
              </section>
              <section className="card card-pad stack">
                <div className="card-title">Claude : modèles et budget</div>
                <Alert kind="info"><b>Abonnement Claude.ai ≠ API.</b> Votre abonnement Claude (Pro/Max) donne accès à claude.ai et à Claude Code, mais ne finance pas les appels API faits par Harmony Studio sur Vercel : ceux-ci sont facturés à l’usage sur votre compte <b>Anthropic Console</b> (clé ANTHROPIC_API_KEY), selon la grille ci-dessous. Harmony Studio n’utilise jamais vos cookies ou votre session claude.ai.</Alert>
                <div className="form-grid">
                  <div className="field"><label htmlFor="m-plan">Modèle de planification / messages</label><input id="m-plan" className="input" list="models" value={cfg.ai.planModel} onChange={(e) => setCfg({ ...cfg, ai: { ...cfg.ai, planModel: e.target.value } })} /></div>
                  <div className="field"><label htmlFor="m-gen">Modèle de génération</label><input id="m-gen" className="input" list="models" value={cfg.ai.generationModel} onChange={(e) => setCfg({ ...cfg, ai: { ...cfg.ai, generationModel: e.target.value } })} /></div>
                  <datalist id="models">{Object.keys(cfg.pricing).map((m) => <option key={m} value={m} />)}</datalist>
                  <div className="field"><label htmlFor="m-max">Tokens de sortie max par étape</label><input id="m-max" className="input" type="number" min={4000} max={128000} value={cfg.ai.maxOutputTokens} onChange={(e) => setCfg({ ...cfg, ai: { ...cfg.ai, maxOutputTokens: Number(e.target.value) } })} /></div>
                  <div className="field"><label htmlFor="m-month">Budget mensuel (USD)</label><input id="m-month" className="input" type="number" min={0} value={cfg.ai.monthlyBudgetUsd} onChange={(e) => setCfg({ ...cfg, ai: { ...cfg.ai, monthlyBudgetUsd: Number(e.target.value) } })} /><span className="hint">0 = pas de plafond (déconseillé).</span></div>
                  <div className="field"><label htmlFor="m-job">Plafond par génération (USD)</label><input id="m-job" className="input" type="number" min={0} step="0.5" value={cfg.ai.jobBudgetUsd} onChange={(e) => setCfg({ ...cfg, ai: { ...cfg.ai, jobBudgetUsd: Number(e.target.value) } })} /></div>
                  <div className="field"><label htmlFor="m-conc">Générations simultanées</label><input id="m-conc" className="input" type="number" min={1} max={5} value={cfg.ai.maxConcurrentJobs} onChange={(e) => setCfg({ ...cfg, ai: { ...cfg.ai, maxConcurrentJobs: Number(e.target.value) } })} /></div>
                  <div className="field"><label htmlFor="m-fix">Passes de correction automatique</label><input id="m-fix" className="input" type="number" min={0} max={3} value={cfg.ai.autoFixAttempts} onChange={(e) => setCfg({ ...cfg, ai: { ...cfg.ai, autoFixAttempts: Number(e.target.value) } })} /></div>
                </div>
                <div className="label">Grille tarifaire API (USD par million de tokens)</div>
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Modèle</th><th>Entrée</th><th>Sortie</th><th>Écriture cache</th><th>Lecture cache</th><th /></tr></thead>
                  <tbody>{Object.entries(cfg.pricing).map(([model, p]) => (
                    <tr key={model}><td className="mono">{model}</td>
                      {(['input', 'output', 'cacheWrite', 'cacheRead'] as const).map((k) => <td key={k}><input className="input" style={{ width: 90, height: 32 }} type="number" step="0.001" min={0} value={p[k]} aria-label={`${model} ${k}`} onChange={(e) => setCfg({ ...cfg, pricing: { ...cfg.pricing, [model]: { ...p, [k]: Number(e.target.value) } } })} /></td>)}
                      <td><button className="btn btn-ghost btn-icon btn-sm" aria-label="Retirer" onClick={() => { const next = { ...cfg.pricing }; delete next[model]; setCfg({ ...cfg, pricing: next }); }}><Trash2 size={14} /></button></td></tr>
                  ))}</tbody>
                </table></div>
                <AddModel onAdd={(m) => setCfg({ ...cfg, pricing: { ...cfg.pricing, [m]: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 } } })} />
                <p className="tiny faint">{cfg.pricingNote} Source : platform.claude.com/docs/en/about-claude/pricing. Un modèle absent de la grille est refusé (le budget ne pourrait pas être contrôlé).</p>
                <div className="divider" />
                <div className="card-title">Brave Search</div>
                <div className="form-grid">
                  <div className="field"><label htmlFor="b-cap">Plafond de requêtes par mois</label><input id="b-cap" className="input" type="number" min={0} value={cfg.brave.monthlyQueryCap} onChange={(e) => setCfg({ ...cfg, brave: { ...cfg.brave, monthlyQueryCap: Number(e.target.value) } })} /></div>
                  <div className="field"><label htmlFor="b-cost">Coût pour 1 000 requêtes (USD, selon votre offre)</label><input id="b-cost" className="input" type="number" min={0} step="0.01" value={cfg.brave.costPer1000Usd ?? ''} placeholder="inconnu" onChange={(e) => setCfg({ ...cfg, brave: { ...cfg.brave, costPer1000Usd: e.target.value === '' ? null : Number(e.target.value) } })} /></div>
                </div>
                <button className="btn btn-primary" style={{ justifySelf: 'end' }} disabled={saving} onClick={() => save({ ai: cfg.ai, pricing: cfg.pricing, brave: cfg.brave })}><Save size={15} />Enregistrer</button>
              </section>
            </div>
          ) : null}

          {tab === 'matrices' ? <Matrices /> : null}

          {tab === 'tarifs' ? (
            <section className="card card-pad stack">
              <Alert kind="info">Tarifs de <b>référence indicatifs</b> pour accélérer le chiffrage (prompt maître + plaquette). Ce ne sont jamais des offres fermes ; un ERP ou un projet complexe impose une estimation personnalisée.</Alert>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Prestation</th><th>Prix (€ HT)</th><th>Max</th><th>Unité</th><th>Note</th><th /></tr></thead>
                <tbody>{cfg.catalog.map((c, i) => {
                  const up = (patch: Partial<CatalogItem>) => setCfg({ ...cfg, catalog: cfg.catalog.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <tr key={c.id}>
                      <td><input className="input" value={c.label} aria-label="Prestation" onChange={(e) => up({ label: e.target.value })} /></td>
                      <td><input className="input" style={{ width: 100 }} type="number" min={0} step="0.01" value={c.price ?? ''} placeholder="sur devis" aria-label="Prix" onChange={(e) => up({ price: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                      <td><input className="input" style={{ width: 90 }} type="number" min={0} value={c.priceMax ?? ''} aria-label="Prix maximum" onChange={(e) => up({ priceMax: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                      <td><select className="select" style={{ width: 110 }} value={c.unit} aria-label="Unité" onChange={(e) => up({ unit: e.target.value as CatalogItem['unit'] })}>{['forfait', 'mois', 'heure', 'jour', 'unité'].map((u) => <option key={u}>{u}</option>)}</select></td>
                      <td><input className="input" value={c.note} aria-label="Note" onChange={(e) => up({ note: e.target.value })} /></td>
                      <td><button className="btn btn-ghost btn-icon btn-sm" aria-label="Retirer" onClick={() => setCfg({ ...cfg, catalog: cfg.catalog.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
              <div className="row"><button className="btn btn-sm" onClick={() => setCfg({ ...cfg, catalog: [...cfg.catalog, { id: `p-${Date.now().toString(36)}`, label: 'Nouvelle prestation', price: null, unit: 'forfait', note: '' }] })}><Plus size={14} />Ajouter</button><button className="btn btn-sm btn-ghost" onClick={() => setCfg({ ...cfg, catalog: data.defaults.catalog })}><RotateCcw size={14} />Valeurs par défaut</button></div>
              <div className="divider" />
              <div className="card-title">Régime de TVA par défaut</div>
              <div className="form-grid">
                <div className="field"><label htmlFor="v-reg">Régime</label><select id="v-reg" className="select" value={cfg.vat.regime} onChange={(e) => setCfg({ ...cfg, vat: { ...cfg.vat, regime: e.target.value as Config['vat']['regime'] } })}><option value="a_definir">À définir</option><option value="franchise">Franchise en base</option><option value="tva">Assujetti</option></select></div>
                <div className="field"><label htmlFor="v-rate">Taux (%)</label><input id="v-rate" className="input" type="number" min={0} max={30} step="0.1" value={cfg.vat.rate} onChange={(e) => setCfg({ ...cfg, vat: { ...cfg.vat, rate: Number(e.target.value) } })} /></div>
                <div className="field span-2"><label htmlFor="v-mention">Mention en franchise</label><input id="v-mention" className="input" value={cfg.vat.franchiseMention} onChange={(e) => setCfg({ ...cfg, vat: { ...cfg.vat, franchiseMention: e.target.value } })} /><span className="hint">À valider avec votre comptable selon votre situation.</span></div>
              </div>
              <button className="btn btn-primary" style={{ justifySelf: 'end' }} disabled={saving} onClick={() => save({ catalog: cfg.catalog, vat: cfg.vat })}><Save size={15} />Enregistrer</button>
            </section>
          ) : null}

          {tab === 'prospection' ? <ProspectionSettings cfg={cfg} setCfg={setCfg} save={save} saving={saving} /> : null}
          {tab === 'securite' ? <Security integrations={data.integrations} /> : null}
        </div>
      )}
    </>
  );
}

function AddModel({ onAdd }: { onAdd: (m: string) => void }) {
  const [m, setM] = useState('');
  return <form className="row" onSubmit={(e) => { e.preventDefault(); if (/^[a-z0-9.-]{3,80}$/.test(m)) { onAdd(m); setM(''); } }}><input className="input" style={{ width: 240 }} placeholder="identifiant-du-modele" value={m} onChange={(e) => setM(e.target.value.trim())} aria-label="Ajouter un modèle" /><button className="btn btn-sm"><Plus size={14} />Ajouter un modèle</button></form>;
}

function ProspectionSettings({ cfg, setCfg, save, saving }: { cfg: Config; setCfg: (c: Config) => void; save: (p: Partial<Config>) => Promise<void>; saving: boolean }) {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [purge, setPurge] = useState<{ months: number; items: { id: string; name: string; last_activity_at: string }[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="card card-pad stack">
      <div className="form-grid">
        <div className="field span-2"><label htmlFor="pz">Zones préférées (séparées par des virgules)</label><input id="pz" className="input" value={cfg.prospecting.preferredZones.join(', ')} onChange={(e) => setCfg({ ...cfg, prospecting: { ...cfg.prospecting, preferredZones: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } })} /></div>
        <div className="field"><label htmlFor="pr">Durée de conservation sans activité (mois)</label><input id="pr" className="input" type="number" min={1} max={120} value={cfg.prospecting.retentionMonths} onChange={(e) => setCfg({ ...cfg, prospecting: { ...cfg.prospecting, retentionMonths: Number(e.target.value) } })} /><span className="hint">La CNIL recommande au plus 3 ans après le dernier contact pour un prospect.</span></div>
        <div className="field"><label htmlFor="lw">Veille V1 (demandes explicites quotidiennes)</label><div className="row"><input id="lw" className="input" value={cfg.legacy.watch_city} onChange={(e) => setCfg({ ...cfg, legacy: { ...cfg.legacy, watch_city: e.target.value } })} /><label className="check"><input type="checkbox" checked={cfg.legacy.watch_enabled} onChange={(e) => setCfg({ ...cfg, legacy: { ...cfg.legacy, watch_enabled: e.target.checked } })} />Active</label></div></div>
      </div>
      <button className="btn btn-primary" style={{ justifySelf: 'end' }} disabled={saving} onClick={() => save({ prospecting: cfg.prospecting, legacy: cfg.legacy } as Partial<Config>)}><Save size={15} />Enregistrer</button>
      <div className="divider" />
      <div className="card-title">RGPD — prospection B2B</div>
      <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Seules des informations professionnelles publiques sont collectées, avec leur provenance et leur date.</li>
        <li>Chaque message est rédigé pour être relu et envoyé par vous ; il propose un moyen simple de s’opposer.</li>
        <li>Les oppositions bloquent toute préparation de message ; l’effacement est disponible sur chaque fiche.</li>
      </ul>
      <div className="row"><button className="btn" onClick={async () => { try { setPurge(await api('/api/prospects/purge')); } catch (e) { onError(e); } }}><Eye size={15} />Voir les fiches à purger</button></div>
      {purge ? (
        <div className="stack" style={{ gap: 8 }}>
          <p className="small">{purge.items.length} fiche(s) sans activité depuis plus de {purge.months} mois (hors clients gagnés).</p>
          {purge.items.slice(0, 20).map((x) => <div key={x.id} className="tiny muted">{x.name} — dernière activité {fmtDateTime(x.last_activity_at)}</div>)}
          {purge.items.length ? <button className="btn btn-danger" style={{ justifySelf: 'start' }} onClick={() => setConfirm(true)}><Trash2 size={15} />Purger ces fiches</button> : null}
        </div>
      ) : null}
      {confirm ? <ConfirmDialog title="Purge RGPD" danger requireText="PURGER" confirmLabel="Purger" message="Les fiches listées et leur historique seront définitivement supprimés." onClose={() => setConfirm(false)} onConfirm={async () => { const r = await api<{ deleted: number }>('/api/prospects/purge', { json: { confirm: 'PURGER' } }); notify(`${r.deleted} fiche(s) supprimée(s).`); setPurge(null); }} /> : null}
    </section>
  );
}

function Matrices() {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [kind, setKind] = useState<MatrixKind>('design');
  const { data, loading, reload } = useLoad(() => api<{ label: string; active: { content: string; version: number | null; isDefault: boolean }; defaultContent: string; versions: { id: string; version: number; note: string; is_active: boolean; created_at: string; length: number }[] }>(`/api/matrices/${kind}`), [kind]);
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<{ generation: string; audit: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => { if (data) setContent(data.active.content); }, [data]);
  const dirty = data && content !== data.active.content;
  return (
    <div className="stack">
      <Alert kind="info">Les matrices Design, Technique et SEO sont <b>généralisées à tous les métiers</b> à partir de votre matrice Royal Auto-école (niveau d’exigence conservé, aucun contenu sectoriel). La matrice Audit est utilisée à la <b>phase de validation</b>, jamais à la place du brief. Variables : <span className="mono">{'{{nom_entreprise}} {{secteur}} {{ville}} {{prestations}} {{photos}} {{coordonnees_confirmees}}'}</span>…</Alert>
      <div className="segmented" role="tablist">{(Object.keys(MATRIX_KINDS) as MatrixKind[]).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{MATRIX_KINDS[k].replace('Matrice ', '')}</button>)}</div>
      {loading && !data ? <div className="card"><SkeletonRows /></div> : data ? (
        <div className="grid g-main-side">
          <section className="card card-pad stack">
            <div className="row between"><div className="card-title">{data.label}</div><span className="badge">{data.active.isDefault ? 'Version par défaut' : `Version ${data.active.version}`}</span></div>
            <textarea className="textarea mono" style={{ minHeight: 480, fontSize: 12 }} value={content} onChange={(e) => setContent(e.target.value)} aria-label="Contenu de la matrice" spellCheck={false} />
            <div className="row row-wrap between">
              <input className="input" style={{ maxWidth: 320 }} placeholder="Note de version (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note de version" />
              <div className="row">
                <button className="btn" onClick={async () => { try { setPreview(await api('/api/matrices/preview')); } catch (e) { onError(e); } }}><Eye size={15} />Prompt composé</button>
                <button className="btn btn-primary" disabled={!dirty || content.length < 30} onClick={async () => { try { const r = await api<{ version: number }>(`/api/matrices/${kind}`, { json: { action: 'enregistrer', content, note } }); notify(`Version ${r.version} enregistrée et activée.`); setNote(''); await reload(); } catch (e) { onError(e); } }}><Save size={15} />Enregistrer une version</button>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><div className="card-title">Versions</div><button className="btn btn-sm btn-ghost" disabled={data.active.isDefault} onClick={() => setRestoring(true)}><RotateCcw size={14} />Défaut</button></div>
            <div className="card-pad stack" style={{ gap: 8 }}>
              {data.versions.map((v) => (
                <div key={v.id} className="row between small" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                  <div><b>v{v.version}</b>{v.is_active ? <span className="badge badge-gold" style={{ marginLeft: 6 }}>active</span> : null}<div className="tiny muted">{v.note || '—'} · {fmtDateTime(v.created_at)}</div></div>
                  <div className="row">
                    <button className="btn btn-sm btn-ghost" onClick={async () => { try { const r = await api<{ content: string }>(`/api/matrices/${kind}?version=${v.version}`); setContent(r.content); } catch (e) { onError(e); } }}>Charger</button>
                    {!v.is_active ? <button className="btn btn-sm" onClick={async () => { try { await api(`/api/matrices/${kind}`, { json: { action: 'activer', version: v.version } }); notify(`Version ${v.version} activée.`); await reload(); } catch (e) { onError(e); } }}>Activer</button> : null}
                  </div>
                </div>
              ))}
              {!data.versions.length ? <p className="small muted">Aucune version personnalisée : la matrice par défaut est utilisée.</p> : null}
              <p className="tiny faint">Les fichiers d’origine (Matrice Royal, Audit final) sont conservés dans db/reference du code source.</p>
            </div>
          </section>
        </div>
      ) : null}
      {preview ? <Modal title="Prompt composé (exemple neutre)" size="lg" onClose={() => setPreview(null)}><div className="label">Génération (Design + Technique + SEO)</div><pre className="code" style={{ whiteSpace: 'pre-wrap' }}>{preview.generation}</pre><div className="label">Validation (Audit)</div><pre className="code" style={{ whiteSpace: 'pre-wrap' }}>{preview.audit}</pre></Modal> : null}
      {restoring ? <ConfirmDialog title="Restaurer la matrice par défaut" message="Les versions personnalisées sont conservées (désactivées) et peuvent être réactivées." confirmLabel="Restaurer" onClose={() => setRestoring(false)} onConfirm={async () => { await api(`/api/matrices/${kind}`, { json: { action: 'defaut' } }); notify('Matrice par défaut restaurée.'); await reload(); }} /> : null}
    </div>
  );
}

function Security({ integrations }: { integrations: Settings['integrations'] }) {
  const notify = useToast().notify;
  const onError = useErrorToast();
  const { data, reload } = useLoad(() => api<{ sessions: { id: string; created_at: string; last_seen_at: string; expires_at: string; user_agent: string; mfa: boolean; current: boolean }[] }>('/api/security/sessions'));
  const [busy, setBusy] = useState(false);
  const totp = integrations.find((i) => i.key === 'totp')?.configured;
  return (
    <div className="grid g-2">
      <section className="card card-pad stack">
        <div className="card-title"><ShieldCheck size={16} color="var(--gold)" />Accès</div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Compte propriétaire unique, aucune inscription publique.</li>
          <li>Mot de passe haché (scrypt), sessions en base, cookie HttpOnly / Secure / SameSite=Strict.</li>
          <li>Connexion limitée (5 essais / 15 min par IP, 40 / h au total) et journalisée.</li>
          <li>Toutes les API vérifient la session côté serveur ; requêtes mutantes contrôlées par origine.</li>
        </ul>
        {totp ? <Alert kind="success"><KeyRound size={14} /> Double authentification TOTP active.</Alert> : <Alert kind="warn">Double authentification non activée. Générez un secret avec <span className="mono">npm run totp:generate</span>, ajoutez-le à votre application d’authentification, puis définissez <span className="mono">ADMIN_TOTP_SECRET</span> sur Vercel.</Alert>}
      </section>
      <section className="card">
        <div className="card-head"><div className="card-title">Sessions actives</div><button className="btn btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api<{ count: number }>('/api/security/sessions', { method: 'DELETE' }); notify(`${r.count} autre(s) session(s) révoquée(s).`); await reload(); } catch (e) { onError(e); } finally { setBusy(false); } }}>{busy ? <Loader2 size={14} className="spin" /> : null}Déconnecter les autres</button></div>
        <div className="card-pad stack" style={{ gap: 8 }}>
          {data?.sessions.map((s) => <div key={s.id} className="small" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}><b>{s.current ? 'Cette session' : 'Autre session'}</b>{s.mfa ? <span className="badge badge-green" style={{ marginLeft: 6 }}>2FA</span> : null}<div className="tiny muted ellipsis">{s.user_agent || 'Navigateur inconnu'}</div><div className="tiny faint">Ouverte {fmtDateTime(s.created_at)} · vue {fmtDateTime(s.last_seen_at)} · expire {fmtDateTime(s.expires_at)}</div></div>)}
        </div>
      </section>
      <section className="card card-pad stack">
        <div className="card-title">Sauvegarde</div>
        <p className="small muted">La sauvegarde principale repose sur Neon (historique de restauration point-in-time). Cet export JSON complète la sauvegarde : prospects, CRM, devis, projets, versions et matrices (médias binaires exclus). Procédure de restauration : BACKUP.md.</p>
        <button className="btn" style={{ justifySelf: 'start' }} onClick={async () => { try { await download('/api/backup', 'sauvegarde.json'); notify('Export de sauvegarde téléchargé.'); } catch (e) { onError(e); } }}><Download size={15} />Exporter mes données (JSON)</button>
      </section>
    </div>
  );
}
