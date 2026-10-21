'use client';
import { useState } from 'react';
import { Coins, ScrollText } from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtDateTime, fmtUsd } from '@/lib/client/format';
import { Alert, PageHead, SkeletonRows, useLoad } from '../ui';

type Usage = {
  month: { total: number; unknownCalls: number };
  byOperation: { provider: string; operation: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: string | null; unknown_cost: number; failures: number }[];
  byDay: { day: string; provider: string; cost_usd: string; calls: number }[];
  recent: { provider: string; operation: string; model: string; input_tokens: number; output_tokens: number; cost_usd: string | null; ok: boolean; detail: string; is_demo: boolean; created_at: string }[];
};
type Log = { id: number; action: string; target_type: string; target_id: string; detail: Record<string, unknown>; created_at: string };

export default function Journal() {
  const [tab, setTab] = useState<'couts' | 'audit'>('couts');
  const usage = useLoad(() => api<Usage>('/api/usage'));
  const logs = useLoad(() => api<{ logs: Log[] }>('/api/audit-logs'));
  const days = usage.data ? [...new Set(usage.data.byDay.map((d) => d.day))].slice(-30) : [];
  const max = usage.data ? Math.max(0.01, ...days.map((d) => usage.data!.byDay.filter((x) => x.day === d && x.provider === 'anthropic').reduce((s, x) => s + Number(x.cost_usd), 0))) : 1;
  return (
    <>
      <PageHead eyebrow="Suivi" title="Journal & coûts" desc="Consommation des API (hors données de simulation) et journal des actions importantes." actions={<div className="segmented"><button aria-pressed={tab === 'couts'} onClick={() => setTab('couts')}><Coins size={14} />Coûts</button><button aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}><ScrollText size={14} />Journal</button></div>} />
      {tab === 'couts' ? (
        usage.loading && !usage.data ? <div className="card"><SkeletonRows /></div> : usage.data ? (
          <div className="stack">
            <div className="grid g-3">
              <div className="card kpi"><div className="kpi-label">Claude ce mois-ci (estimation)</div><div className="kpi-value">{fmtUsd(usage.data.month.total)}</div><div className="kpi-hint">Calculé avec la grille de Paramètres ; la facture Anthropic fait foi.</div></div>
              <div className="card kpi"><div className="kpi-label">Appels sans coût calculable</div><div className="kpi-value">{usage.data.month.unknownCalls}</div><div className="kpi-hint">« estimation indisponible » (modèle hors grille)</div></div>
              <div className="card kpi"><div className="kpi-label">Requêtes Brave ce mois-ci</div><div className="kpi-value">{usage.data.byOperation.filter((o) => o.provider === 'brave').reduce((s, o) => s + o.calls, 0)}</div><div className="kpi-hint">Coût selon votre offre Brave (grille modifiable dans Paramètres)</div></div>
            </div>
            <section className="card card-pad">
              <div className="card-title" style={{ marginBottom: 12 }}>Coût Claude par jour (30 j)</div>
              {days.length ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140 }} role="img" aria-label="Histogramme des coûts journaliers">
                  {days.map((d) => { const v = usage.data!.byDay.filter((x) => x.day === d && x.provider === 'anthropic').reduce((s, x) => s + Number(x.cost_usd), 0); return <div key={d} title={`${d} : ${fmtUsd(v, 3)}`} style={{ flex: 1, minWidth: 6, height: `${Math.max(2, (v / max) * 100)}%`, background: 'linear-gradient(180deg, var(--gold-2), var(--gold))', borderRadius: '4px 4px 0 0', transition: 'height .6s var(--ease)' }} />; })}
                </div>
              ) : <p className="small muted">Aucune consommation sur 30 jours.</p>}
            </section>
            <section className="card"><div className="card-head"><div className="card-title">Par opération (mois en cours)</div></div>
              <div className="table-wrap"><table className="table"><thead><tr><th>Fournisseur</th><th>Opération</th><th>Appels</th><th>Tokens entrée / sortie</th><th>Coût</th><th>Échecs</th></tr></thead>
                <tbody>{usage.data.byOperation.map((o) => <tr key={o.provider + o.operation}><td>{o.provider}</td><td>{o.operation}</td><td>{o.calls}</td><td className="small">{(o.input_tokens ?? 0).toLocaleString('fr-FR')} / {(o.output_tokens ?? 0).toLocaleString('fr-FR')}</td><td>{o.provider === 'anthropic' ? fmtUsd(o.cost_usd === null ? null : Number(o.cost_usd), 3) : '—'}{o.unknown_cost ? <div className="tiny" style={{ color: 'var(--amber)' }}>{o.unknown_cost} non chiffré(s)</div> : null}</td><td>{o.failures || ''}</td></tr>)}</tbody></table></div>
            </section>
            <section className="card"><div className="card-head"><div className="card-title">Derniers appels</div></div>
              <div className="table-wrap"><table className="table"><tbody>{usage.data.recent.map((r, i) => <tr key={i}><td className="tiny muted">{fmtDateTime(r.created_at)}</td><td className="small">{r.provider} · {r.operation}{r.is_demo ? <span className="badge badge-demo" style={{ marginLeft: 6 }}>simulation</span> : null}</td><td className="tiny mono">{r.model}</td><td className="small">{r.ok ? fmtUsd(r.cost_usd === null ? null : Number(r.cost_usd), 4) : <span style={{ color: 'var(--red)' }}>échec {r.detail}</span>}</td></tr>)}</tbody></table></div>
            </section>
          </div>
        ) : <Alert kind="error">{usage.error}</Alert>
      ) : (
        <section className="card">
          {logs.loading && !logs.data ? <SkeletonRows /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Action</th><th>Cible</th><th>Détail</th></tr></thead>
              <tbody>{logs.data?.logs.map((l) => <tr key={l.id}><td className="tiny muted">{fmtDateTime(l.created_at)}</td><td className="small strong">{l.action.replace(/_/g, ' ')}</td><td className="tiny mono">{l.target_type} {l.target_id.slice(0, 8)}</td><td className="tiny muted mono">{Object.keys(l.detail ?? {}).length ? JSON.stringify(l.detail).slice(0, 120) : ''}</td></tr>)}</tbody></table></div>
          )}
        </section>
      )}
    </>
  );
}
