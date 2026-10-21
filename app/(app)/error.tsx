'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card card-pad" style={{ textAlign: 'center' }}>
      <h2 className="page-title" style={{ fontSize: 26 }}>Une erreur est survenue</h2>
      <p className="muted" style={{ margin: '8px 0 14px' }}>L’incident est enregistré côté serveur. Réessayez ; si le problème persiste, consultez les journaux Vercel.</p>
      <button className="btn btn-primary" onClick={reset}>Réessayer</button>
    </div>
  );
}
