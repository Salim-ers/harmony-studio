'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtEuro } from '@/lib/client/format';
import { QUOTE_STATUSES } from '@/lib/shared/constants';
import { Alert, ConfirmDialog, PageHead, SkeletonRows, useErrorToast, useToast } from '../ui';

type Line = { label: string; description: string; quantity: number; unitPrice: number; unit: string };
type Catalog = { id: string; label: string; price: number | null; priceMax?: number | null; unit: string; note: string }[];
type Quote = { id?: string; number?: string; title: string; client_name: string; client_details: string; prospect_id: string | null; project_id: string | null; lines: Line[]; vat_regime: 'a_definir' | 'franchise' | 'tva'; vat_rate: number; valid_until: string | null; notes: string; status: string };

export default function DevisEditor({ id }: { id: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const notify = useToast().notify;
  const onError = useErrorToast();
  const [q, setQ] = useState<Quote | null>(null);
  const [catalog, setCatalog] = useState<Catalog>([]);
  const [vatMention, setVatMention] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await api<{ config: { catalog: Catalog; vat: { regime: Quote['vat_regime']; rate: number; franchiseMention: string } } }>('/api/settings');
        setCatalog(s.config.catalog);
        setVatMention(s.config.vat.franchiseMention);
        if (id) {
          const d = await api<{ quote: Quote & { vat_rate: string; valid_until: string | null } }>(`/api/quotes/${id}`);
          setQ({ ...d.quote, vat_rate: Number(d.quote.vat_rate), valid_until: d.quote.valid_until ? String(d.quote.valid_until).slice(0, 10) : null, lines: d.quote.lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })) });
        } else {
          const prospectId = params.get('prospect');
          let client = '';
          if (prospectId) { try { const p = await api<{ prospect: { name: string } }>(`/api/prospects/${prospectId}`); client = p.prospect.name; } catch { /* ignore */ } }
          const valid = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          setQ({ title: 'Création de site internet', client_name: client, client_details: '', prospect_id: prospectId, project_id: params.get('projet'), lines: [], vat_regime: s.config.vat.regime, vat_rate: s.config.vat.rate, valid_until: valid, notes: '', status: 'brouillon' });
        }
      } catch (e) { onError(e); }
    })();
  }, [id, params, onError]);

  const totals = useMemo(() => {
    if (!q) return { ht: 0, tva: 0, ttc: 0 };
    const ht = Math.round(q.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
    const tva = q.vat_regime === 'tva' ? Math.round(ht * q.vat_rate) / 100 : 0;
    return { ht, tva, ttc: ht + tva };
  }, [q]);

  if (!q) return <div className="card"><SkeletonRows rows={8} /></div>;
  const upLine = (i: number, patch: Partial<Line>) => setQ({ ...q, lines: q.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  async function save() {
    setSaving(true);
    try {
      const body = { title: q!.title, client_name: q!.client_name, client_details: q!.client_details, prospect_id: q!.prospect_id, project_id: q!.project_id, lines: q!.lines, vat_regime: q!.vat_regime, vat_rate: q!.vat_rate, valid_until: q!.valid_until, notes: q!.notes };
      if (id) { await api(`/api/quotes/${id}`, { method: 'PATCH', json: { ...body, status: q!.status } }); notify('Devis enregistré.'); }
      else { const r = await api<{ id: string; number: string }>('/api/quotes', { json: body }); notify(`Devis ${r.number} créé.`); router.replace(`/devis/${r.id}`); }
    } catch (e) { onError(e); } finally { setSaving(false); }
  }

  return (
    <>
      <Link href="/devis" className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }}><ArrowLeft size={15} />Devis</Link>
      <PageHead eyebrow={q.number ?? 'Nouveau devis'} title={q.title || 'Devis'}
        actions={<>
          {id ? <a className="btn" href={`/impression/devis/${id}`} target="_blank" rel="noopener"><Printer size={16} />Imprimer / PDF</a> : null}
          {id ? <button className="btn btn-danger" onClick={() => setRemoving(true)}><Trash2 size={16} /></button> : null}
          <button className="btn btn-primary" onClick={save} disabled={saving}><Save size={16} />Enregistrer</button>
        </>} />
      <div className="grid g-main-side">
        <div className="stack">
          <section className="card card-pad form-grid">
            <div className="field span-2"><label htmlFor="q-title">Objet</label><input id="q-title" className="input" value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} /></div>
            <div className="field"><label htmlFor="q-client">Client</label><input id="q-client" className="input" value={q.client_name} onChange={(e) => setQ({ ...q, client_name: e.target.value })} /></div>
            <div className="field"><label htmlFor="q-valid">Valable jusqu’au</label><input id="q-valid" className="input" type="date" value={q.valid_until ?? ''} onChange={(e) => setQ({ ...q, valid_until: e.target.value || null })} /></div>
            <div className="field span-2"><label htmlFor="q-cd">Coordonnées du client (confirmées)</label><textarea id="q-cd" className="textarea" rows={3} value={q.client_details} onChange={(e) => setQ({ ...q, client_details: e.target.value })} /></div>
          </section>
          <section className="card">
            <div className="card-head"><div className="card-title">Lignes</div><button className="btn btn-sm" onClick={() => setQ({ ...q, lines: [...q.lines, { label: '', description: '', quantity: 1, unitPrice: 0, unit: 'forfait' }] })}><Plus size={14} />Ligne libre</button></div>
            <div className="card-pad stack" style={{ gap: 10 }}>
              {q.lines.map((l, i) => (
                <div key={i} className="card card-pad" style={{ boxShadow: 'none', display: 'grid', gap: 8 }}>
                  <div className="row"><input className="input" placeholder="Désignation" value={l.label} onChange={(e) => upLine(i, { label: e.target.value })} aria-label="Désignation" /><button className="btn btn-ghost btn-icon" aria-label="Supprimer la ligne" onClick={() => setQ({ ...q, lines: q.lines.filter((_, j) => j !== i) })}><Trash2 size={15} /></button></div>
                  <textarea className="textarea" rows={2} placeholder="Description / périmètre" value={l.description} onChange={(e) => upLine(i, { description: e.target.value })} aria-label="Description" />
                  <div className="row row-wrap">
                    <label className="small">Qté <input className="input" style={{ width: 80 }} type="number" min={0} step="0.5" value={l.quantity} onChange={(e) => upLine(i, { quantity: Number(e.target.value) })} /></label>
                    <label className="small">Prix unitaire HT <input className="input" style={{ width: 120 }} type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => upLine(i, { unitPrice: Number(e.target.value) })} /></label>
                    <label className="small">Unité <input className="input" style={{ width: 100 }} value={l.unit} onChange={(e) => upLine(i, { unit: e.target.value })} /></label>
                    <span className="strong small" style={{ marginLeft: 'auto' }}>{fmtEuro(l.quantity * l.unitPrice)}</span>
                  </div>
                </div>
              ))}
              {!q.lines.length ? <p className="small muted">Ajoutez une prestation du catalogue (à droite) ou une ligne libre.</p> : null}
            </div>
          </section>
          <section className="card card-pad field"><label htmlFor="q-notes">Conditions / notes</label><textarea id="q-notes" className="textarea" rows={4} value={q.notes} onChange={(e) => setQ({ ...q, notes: e.target.value })} placeholder="Délais, acompte, ce qui est inclus ou exclu…" /></section>
        </div>
        <div className="stack">
          <section className="card card-pad stack" style={{ gap: 10 }}>
            {id ? <div className="field"><label htmlFor="q-st">Statut</label><select id="q-st" className="select" value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value })}>{Object.entries(QUOTE_STATUSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><span className="hint">« Envoyé » = envoi que vous déclarez avoir fait vous-même.</span></div> : null}
            <div className="field"><label htmlFor="q-vat">Régime de TVA</label><select id="q-vat" className="select" value={q.vat_regime} onChange={(e) => setQ({ ...q, vat_regime: e.target.value as Quote['vat_regime'] })}><option value="a_definir">À définir (aucune mention)</option><option value="franchise">Franchise en base de TVA</option><option value="tva">Assujetti à la TVA</option></select></div>
            {q.vat_regime === 'tva' ? <div className="field"><label htmlFor="q-rate">Taux (%)</label><input id="q-rate" className="input" type="number" min={0} max={30} step="0.1" value={q.vat_rate} onChange={(e) => setQ({ ...q, vat_rate: Number(e.target.value) })} /></div> : null}
            {q.vat_regime === 'franchise' ? <p className="tiny muted">Mention imprimée : « {vatMention} » (modifiable dans Paramètres).</p> : null}
            {q.vat_regime === 'a_definir' ? <Alert kind="warn">Régime de TVA à confirmer avec votre comptable avant tout envoi.</Alert> : null}
            <div className="divider" />
            <div className="row between small"><span>Total HT</span><b>{fmtEuro(totals.ht)}</b></div>
            {q.vat_regime === 'tva' ? <div className="row between small"><span>TVA {q.vat_rate} %</span><b>{fmtEuro(totals.tva)}</b></div> : null}
            <div className="row between"><span className="strong">Total {q.vat_regime === 'tva' ? 'TTC' : ''}</span><span className="serif" style={{ fontSize: 26, fontWeight: 600 }}>{fmtEuro(totals.ttc)}</span></div>
            <p className="tiny faint">Totaux recalculés côté serveur à l’enregistrement.</p>
          </section>
          <section className="card">
            <div className="card-head"><div className="card-title">Tarifs de référence</div></div>
            <div className="card-pad stack" style={{ gap: 6 }}>
              {catalog.map((c) => (
                <button key={c.id} className="file-item" onClick={() => setQ({ ...q, lines: [...q.lines, { label: c.label, description: c.note, quantity: 1, unitPrice: c.price ?? 0, unit: c.unit }] })}>
                  <Plus size={13} /><span style={{ flex: 1 }}>{c.label}</span><span className="tiny muted">{c.price === null ? 'sur devis' : `${fmtEuro(c.price)}${c.priceMax ? ` – ${fmtEuro(c.priceMax)}` : ''}${c.unit === 'mois' ? '/mois' : ''}`}</span>
                </button>
              ))}
              <p className="tiny faint">Indicatifs, non contractuels. Un ERP ou un projet complexe nécessite une estimation personnalisée.</p>
            </div>
          </section>
        </div>
      </div>
      {removing && id ? <ConfirmDialog title="Supprimer le devis" danger confirmLabel="Supprimer" message="Ce devis sera définitivement supprimé." onClose={() => setRemoving(false)} onConfirm={async () => { await api(`/api/quotes/${id}`, { method: 'DELETE' }); notify('Devis supprimé.'); router.push('/devis'); }} /> : null}
    </>
  );
}
