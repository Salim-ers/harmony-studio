'use client';
/** Composants d'interface partagés de Harmony Studio. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { STRATEGIES, type Strategy } from '@/lib/shared/constants';

// ───────── Toasts ─────────
type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };
const ToastCtx = createContext<{ notify: (message: string, kind?: Toast['kind']) => void }>({ notify: () => undefined });
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 5000);
  }, []);
  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'error' ? <XCircle size={17} /> : t.kind === 'info' ? <Info size={17} /> : <CheckCircle2 size={17} />}
            <span>{t.message}</span>
            <button aria-label="Fermer" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={15} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
export function useErrorToast() {
  const { notify } = useToast();
  return useCallback((e: unknown) => notify(e instanceof Error ? e.message : 'Une erreur est survenue.', 'error'), [notify]);
}

// ───────── Modale accessible ─────────
export function Modal({ title, onClose, children, footer, size }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, textarea, select, [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; previous?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button data-close className="btn btn-ghost btn-icon" aria-label="Fermer" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Confirmation explicite pour les actions destructrices ou externes (option : mot à saisir). */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirmer', danger, requireText, onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; requireText?: string; onConfirm: () => Promise<void> | void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = !requireText || text.trim() === requireText;
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Annuler</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>
        {busy ? <Loader2 size={15} className="spin" /> : null}{confirmLabel}
      </button>
    </>}>
      <div className="muted">{message}</div>
      {requireText ? <div className="field"><label htmlFor="confirm-text">Tapez <b>{requireText}</b> pour confirmer</label><input id="confirm-text" className="input" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" /></div> : null}
    </Modal>
  );
}

// ───────── Petits composants ─────────
export function PageHead({ eyebrow, title, desc, actions }: { eyebrow?: string; title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h1 className="page-title">{title}</h1>{desc ? <p className="page-desc">{desc}</p> : null}</div>
      {actions ? <div className="head-actions">{actions}</div> : null}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3>{children ? <p className="small" style={{ maxWidth: 420, margin: '0 auto' }}>{children}</p> : null}{action ? <div style={{ marginTop: 14 }}>{action}</div> : null}</div>;
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return <div className="card-pad stack" aria-busy="true" aria-label="Chargement">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={18} w={`${90 - (i % 3) * 15}%`} />)}</div>;
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode }) {
  const Icon = kind === 'warn' ? AlertTriangle : kind === 'error' ? XCircle : kind === 'success' ? CheckCircle2 : Info;
  return <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : undefined}><Icon size={17} /><div>{children}</div></div>;
}

export function StrategyBadge({ strategy }: { strategy: string }) {
  const s = STRATEGIES[strategy as Strategy] ?? STRATEGIES.manuel;
  const tone = { gold: 'badge-gold', blue: 'badge-blue', violet: 'badge-violet', neutral: '' }[s.tone];
  return <span className={`badge ${tone}`} title={s.description}>{s.short}</span>;
}

export function ScoreBadge({ score }: { score: number }) {
  return <span className={`score ${score >= 70 ? 'hot' : score >= 45 ? 'warm' : ''}`} title="Score commercial indicatif (pas une probabilité d’achat)">{score}</span>;
}

const STATUS_TONE: Record<string, string> = {
  'À examiner': '', Qualifié: 'badge-blue', 'À contacter': 'badge-gold', Contacté: 'badge-violet', 'Réponse reçue': 'badge-violet', 'Rendez-vous': 'badge-blue',
  'Devis envoyé': 'badge-amber', Gagné: 'badge-green', Perdu: 'badge-red', 'À relancer': 'badge-amber',
  Brouillon: '', Planification: 'badge-blue', Génération: 'badge-violet', Construction: 'badge-amber', Tests: 'badge-blue', 'À corriger': 'badge-red',
  'Prêt pour revue': 'badge-gold', Approuvé: 'badge-green', Déployé: 'badge-green', Échec: 'badge-red',
  brouillon: '', 'envoyé': 'badge-violet', 'accepté': 'badge-green', 'refusé': 'badge-red', 'expiré': 'badge-amber',
};
export function StatusBadge({ status, live }: { status: string; live?: boolean }) {
  return <span className={`badge ${STATUS_TONE[status] ?? ''}`}>{live ? <span className="dot live" /> : null}{status}</span>;
}
export function DemoBadge({ show }: { show?: boolean }) {
  return show ? <span className="badge badge-demo" title="Donnée de test produite en mode simulation : ce n’est pas un vrai prospect / projet">Donnée de test</span> : null;
}

/** Compteur animé discret pour les indicateurs (désactivé si mouvement réduit). */
export function CountUp({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value === null) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || value === 0) { setShown(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value === null) return <>—</>;
  return <>{shown.toLocaleString('fr-FR')}{suffix}</>;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-label="Chargement" />;
}

/** Hook de chargement simple avec état d'erreur et rechargement. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await loaderRef.current()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data, error, loading, reload, setData };
}

/** Mémorise un filtre de l'interface dans le navigateur (confort personnel, non critique). */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try { const raw = localStorage.getItem(`hs:${key}`); if (raw) setValue(JSON.parse(raw) as T); } catch { /* stockage indisponible */ }
  }, [key]);
  const update = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      try { localStorage.setItem(`hs:${key}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [key]);
  return [value, update] as const;
}
