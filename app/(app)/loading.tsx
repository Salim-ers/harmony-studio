export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="Chargement">
      <div className="skeleton" style={{ height: 34, width: 280 }} />
      <div className="grid g-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}
