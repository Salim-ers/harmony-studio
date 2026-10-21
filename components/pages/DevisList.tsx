'use client';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtDate, fmtEuro } from '@/lib/client/format';
import { Empty, PageHead, SkeletonRows, StatusBadge, useLoad } from '../ui';

type Q = { id: string; number: string; title: string; client_name: string; status: string; total_ht: string; total_ttc: string; vat_regime: string; created_at: string; prospect_id: string | null; prospect_name: string | null; project_name: string | null };

export default function DevisList() {
  const { data, loading } = useLoad(() => api<{ quotes: Q[] }>('/api/quotes'));
  return (
    <>
      <PageHead eyebrow="Prospection" title="Devis" desc="Chiffrages rattachés à vos prospects et projets. Les tarifs de référence sont indicatifs et entièrement modifiables." actions={<Link className="btn btn-primary" href="/devis/nouveau"><Plus size={16} />Nouveau devis</Link>} />
      <div className="card">
        {loading && !data ? <SkeletonRows /> : data?.quotes.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Numéro</th><th>Objet</th><th className="hide-sm">Client / prospect</th><th>Statut</th><th style={{ textAlign: 'right' }}>Total</th><th className="hide-sm">Date</th></tr></thead>
            <tbody>{data.quotes.map((q) => (
              <tr key={q.id}>
                <td><Link className="row-link mono" href={`/devis/${q.id}`}>{q.number}</Link></td>
                <td className="small">{q.title}{q.project_name ? <div className="tiny muted">Projet : {q.project_name}</div> : null}</td>
                <td className="hide-sm small">{q.client_name || q.prospect_name || '—'}</td>
                <td><StatusBadge status={q.status} /></td>
                <td className="small strong" style={{ textAlign: 'right' }}>{fmtEuro(q.vat_regime === 'tva' ? q.total_ttc : q.total_ht)}<div className="tiny muted">{q.vat_regime === 'tva' ? 'TTC' : q.vat_regime === 'franchise' ? 'TVA non applicable' : 'régime TVA à définir'}</div></td>
                <td className="hide-sm tiny muted">{fmtDate(q.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty icon={<FileText size={22} />} title="Aucun devis" action={<Link className="btn btn-primary" href="/devis/nouveau">Créer un devis</Link>}>Créez un devis depuis une fiche prospect ou ici.</Empty>}
      </div>
    </>
  );
}
