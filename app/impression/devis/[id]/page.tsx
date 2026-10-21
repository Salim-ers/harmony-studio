import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/server/auth';
import { db, UUID_RE } from '@/lib/server/db';
import { getConfig } from '@/lib/server/settings';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';
const euro = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

/** Version imprimable (PDF via le navigateur). Les informations manquantes de l'entreprise sont signalées, jamais inventées. */
export default async function PrintQuote({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) redirect('/');
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [q] = await db()`SELECT * FROM quotes WHERE id = ${id}`;
  if (!q) notFound();
  const config = await getConfig();
  const c = config.company;
  const missing = [!c.address && 'adresse', !c.siren && 'SIREN', !c.legalForm && 'forme juridique'].filter(Boolean);
  const lines = q.lines as { label: string; description: string; quantity: number; unitPrice: number; unit: string }[];
  return (
    <main style={{ background: '#eee', minHeight: '100vh', padding: '1px 0' }}>
      <div className="no-print" style={{ maxWidth: 820, margin: '16px auto 0', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#555' }}>{missing.length ? `⚠️ À compléter dans Paramètres → Entreprise : ${missing.join(', ')}.` : 'Utilisez « Imprimer » puis « Enregistrer en PDF ».'}</span>
        <PrintButton />
      </div>
      <article className="print-page">
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 30, letterSpacing: '.12em' }}>{c.name || 'Harmony Solutions'}</div>
            <div style={{ fontSize: 12, color: '#555', whiteSpace: 'pre-line' }}>{[c.legalForm, c.address, c.siren && `SIREN ${c.siren}`, c.phone, c.email, c.website].filter(Boolean).join('\n') || 'Coordonnées à compléter'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>DEVIS</div>
            <div style={{ fontFamily: 'monospace' }}>{q.number}</div>
            <div style={{ fontSize: 12, color: '#555' }}>Date : {new Date(q.created_at).toLocaleDateString('fr-FR')}{q.valid_until ? <><br />Valable jusqu’au : {new Date(q.valid_until).toLocaleDateString('fr-FR')}</> : null}</div>
          </div>
        </header>
        <section style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#777', textTransform: 'uppercase', letterSpacing: '.1em' }}>Client</div>
          <div style={{ fontWeight: 600 }}>{q.client_name || '—'}</div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{q.client_details}</div>
        </section>
        <h2 style={{ fontSize: 17, marginBottom: 10 }}>{q.title}</h2>
        <table>
          <thead><tr><th>Désignation</th><th className="num">Qté</th><th className="num">Prix unitaire HT</th><th className="num">Total HT</th></tr></thead>
          <tbody>{lines.map((l, i) => <tr key={i}><td><b>{l.label}</b>{l.description ? <div style={{ fontSize: 12, color: '#555', whiteSpace: 'pre-line' }}>{l.description}</div> : null}</td><td className="num">{l.quantity} {l.unit}</td><td className="num">{euro(Number(l.unitPrice))}</td><td className="num">{euro(Number(l.quantity) * Number(l.unitPrice))}</td></tr>)}</tbody>
        </table>
        <div style={{ marginLeft: 'auto', width: 300, marginTop: 16, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total HT</span><b>{euro(Number(q.total_ht))}</b></div>
          {q.vat_regime === 'tva' ? <><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA {Number(q.vat_rate)} %</span><b>{euro(Number(q.total_tva))}</b></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, marginTop: 6 }}><span>Total TTC</span><b>{euro(Number(q.total_ttc))}</b></div></> : null}
          {q.vat_regime === 'franchise' ? <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>{config.vat.franchiseMention}</div> : null}
        </div>
        {q.notes ? <section style={{ marginTop: 28, fontSize: 13, whiteSpace: 'pre-line' }}><b>Conditions</b><br />{q.notes}</section> : null}
        {c.quoteFooter ? <footer style={{ marginTop: 32, fontSize: 11, color: '#666', whiteSpace: 'pre-line' }}>{c.quoteFooter}</footer> : null}
        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{c.signatory ? `${c.signatory} — ${c.name}` : ''}</span><span>Bon pour accord (date, signature) :</span></div>
      </article>
    </main>
  );
}
