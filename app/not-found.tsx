import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="eyebrow">Erreur 404</div>
        <h1 className="page-title">Page introuvable</h1>
        <p className="muted" style={{ margin: '8px 0 16px' }}>Cette page n’existe pas ou a été déplacée.</p>
        <Link className="btn btn-primary" href="/dashboard">Retour au tableau de bord</Link>
      </div>
    </main>
  );
}
