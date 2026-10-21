'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell, BookOpenText, CalendarCheck2, FileText, FolderKanban, LayoutDashboard, LogOut, Menu, Moon, Plus, Radar, ScrollText, Search, Settings2, Sparkles, Sun, Target, X,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { relative } from '@/lib/client/format';
import { Modal, ToastProvider } from './ui';

const NAV: { section?: string; href: string; label: string; icon: typeof Search; match?: RegExp }[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { section: 'Prospection', href: '/prospection', label: 'Opportunités', icon: Target, match: /^\/prospection(\/(?!recherches)|$)/ },
  { href: '/prospection/recherches', label: 'Recherches & veille', icon: Radar },
  { href: '/taches', label: 'Tâches & relances', icon: CalendarCheck2 },
  { href: '/devis', label: 'Devis', icon: FileText },
  { section: 'Création IA', href: '/creation', label: 'Projets', icon: FolderKanban, match: /^\/creation(\/(?!nouveau)|$)/ },
  { href: '/creation/nouveau', label: 'Nouveau projet', icon: Sparkles },
];
const BOTTOM = [
  { href: '/parametres', label: 'Paramètres', icon: Settings2 },
  { href: '/journal', label: 'Journal & coûts', icon: ScrollText },
];

type Notif = { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string };

export default function AppShell({ children, demo }: { children: ReactNode; demo: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [notifs, setNotifs] = useState<{ items: Notif[]; unread: number }>({ items: [], unread: 0 });
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => { setOpen(false); setNotifOpen(false); }, [pathname]);
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ items: Notif[]; unread: number }>('/api/notifications').then((d) => alive && setNotifs(d)).catch(() => undefined);
    void load();
    const t = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('hs:theme', next); } catch { /* ignore */ }
  };
  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/'; }
  };
  const isActive = (item: { href: string; match?: RegExp }) => (item.match ? item.match.test(pathname) : pathname === item.href || pathname.startsWith(item.href + '/'));

  return (
    <ToastProvider>
      <a className="skip-link" href="#contenu-principal">Aller au contenu</a>
      {demo ? <div className="demo-banner">MODE SIMULATION LOCAL — Brave et Claude sont remplacés par des réponses factices. Aucune donnée ne correspond à de vrais prospects.</div> : null}
      <div className="shell">
        {open ? <button className="scrim" aria-label="Fermer le menu" onClick={() => setOpen(false)} /> : null}
        <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigation principale">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">H</div>
            <div><div className="brand-name">HARMONY</div><div className="brand-sub">STUDIO</div></div>
            <button className="btn btn-ghost btn-icon mobile-only" style={{ marginLeft: 'auto' }} aria-label="Fermer le menu" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>
          <nav style={{ display: 'grid', gap: 2 }}>
            {NAV.map((item) => (
              <div key={item.href}>
                {item.section ? <div className="nav-section">{item.section}</div> : null}
                <Link href={item.href} className="nav-link" aria-current={isActive(item) ? 'page' : undefined}><item.icon size={17} />{item.label}</Link>
              </div>
            ))}
          </nav>
          <div className="nav-space" />
          <div className="sidebar-foot">
            {BOTTOM.map((item) => <Link key={item.href} href={item.href} className="nav-link" aria-current={isActive(item) ? 'page' : undefined}><item.icon size={17} />{item.label}</Link>)}
            <button className="nav-link btn-ghost" style={{ border: 0, background: 'none', width: '100%' }} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</button>
            <button className="nav-link" style={{ border: 0, background: 'none', width: '100%' }} onClick={logout}><LogOut size={17} />Se déconnecter</button>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <button className="btn btn-ghost btn-icon mobile-only" aria-label="Ouvrir le menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={19} /></button>
            <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Recherche globale (Ctrl+K)"><Search size={16} /><span className="hide-sm">Rechercher un prospect, un projet, un devis…</span><span className="kbd">Ctrl K</span></button>
            <div className="topbar-actions">
              <div style={{ position: 'relative' }}>
                <button className="btn btn-ghost btn-icon" aria-label={`Notifications (${notifs.unread} non lues)`} aria-expanded={notifOpen} onClick={() => setNotifOpen((o) => !o)}>
                  <Bell size={18} />{notifs.unread ? <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 9, background: 'var(--gold)' }} /> : null}
                </button>
                {notifOpen ? (
                  <div className="card" style={{ position: 'absolute', right: 0, top: 44, width: 340, zIndex: 40, boxShadow: 'var(--shadow-3)', animation: 'modalIn .25s var(--ease) both' }}>
                    <div className="card-head"><span className="card-title">Notifications</span>{notifs.unread ? <button className="btn btn-sm btn-ghost" onClick={async () => { await api('/api/notifications', { method: 'PATCH', json: { all: true } }); setNotifs((n) => ({ ...n, unread: 0 })); }}>Tout marquer lu</button> : null}</div>
                    <div style={{ maxHeight: 360, overflow: 'auto' }}>
                      {notifs.items.length ? notifs.items.map((n) => (
                        <button key={n.id} className="palette-item" style={{ borderRadius: 0, borderBottom: '1px solid var(--line)' }} onClick={() => n.link && router.push(n.link)}>
                          <span className="dot" style={{ color: n.read_at ? 'transparent' : 'var(--gold)' }} />
                          <span style={{ minWidth: 0 }}><span className="strong small" style={{ display: 'block' }}>{n.title}</span><span className="tiny muted">{n.body} · {relative(n.created_at)}</span></span>
                        </button>
                      )) : <div className="card-pad small muted">Aucune notification. Les alertes de veille apparaîtront ici.</div>}
                    </div>
                  </div>
                ) : null}
              </div>
              <Link href="/creation/nouveau" className="btn btn-gold btn-sm hide-sm"><Plus size={15} />Nouveau projet</Link>
              <span className="badge badge-outline hide-sm" title="Espace privé — propriétaire unique"><span className="dot" style={{ color: 'var(--green)' }} />Privé</span>
            </div>
          </header>
          <main id="contenu-principal" className="content page-enter" key={pathname}>{children}</main>
        </div>
      </div>
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </ToastProvider>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ type: string; label: string; detail: string; href: string }[]>([]);
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commands = useMemo(() => [
    { type: 'Aller à', label: 'Tableau de bord', detail: '', href: '/dashboard' },
    { type: 'Aller à', label: 'Opportunités', detail: 'CRM prospects', href: '/prospection' },
    { type: 'Action', label: 'Lancer une recherche de prospects', detail: '', href: '/prospection?recherche=1' },
    { type: 'Aller à', label: 'Recherches & veille', detail: '', href: '/prospection/recherches' },
    { type: 'Aller à', label: 'Tâches & relances', detail: '', href: '/taches' },
    { type: 'Aller à', label: 'Devis', detail: '', href: '/devis' },
    { type: 'Action', label: 'Nouveau projet de création', detail: '', href: '/creation/nouveau' },
    { type: 'Aller à', label: 'Projets', detail: 'Bibliothèque', href: '/creation' },
    { type: 'Aller à', label: 'Paramètres — matrices', detail: '', href: '/parametres?onglet=matrices' },
    { type: 'Aller à', label: 'Journal & coûts', detail: '', href: '/journal' },
  ], []);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      api<{ results: typeof results }>(`/api/search?q=${encodeURIComponent(q)}`).then((d) => setResults(d.results)).catch(() => setResults([]));
    }, 180);
  }, [q]);
  const items = [...results, ...commands.filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()))];
  const go = (href: string) => { onClose(); router.push(href); };
  return (
    <Modal title="Recherche" onClose={onClose}>
      <div className="palette" style={{ margin: '-20px -22px' }}>
        <input autoFocus placeholder="Rechercher ou aller à…" value={q} aria-label="Recherche globale"
          onChange={(e) => { setQ(e.target.value); setIndex(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
            if (e.key === 'Enter' && items[index]) go(items[index].href);
          }} />
        <div className="palette-list" role="listbox">
          {items.map((it, i) => (
            <button key={`${it.href}-${i}`} role="option" aria-selected={i === index} className="palette-item" onMouseEnter={() => setIndex(i)} onClick={() => go(it.href)}>
              <span className="badge badge-outline">{it.type}</span><span className="strong small ellipsis">{it.label}</span><span className="tiny muted ellipsis">{it.detail}</span>
            </button>
          ))}
          {!items.length ? <div className="card-pad small muted">Aucun résultat.</div> : null}
        </div>
        <div className="tiny muted" style={{ padding: '8px 16px 12px', display: 'flex', gap: 12 }}><BookOpenText size={13} /> ↑↓ pour naviguer · Entrée pour ouvrir · Échap pour fermer</div>
      </div>
    </Modal>
  );
}
