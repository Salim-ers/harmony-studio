'use client';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, Coins, FolderKanban, Gauge, Megaphone, Radar, Sparkles, Target, TrendingUp, Wand2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtDate, fmtUsd, relative } from '@/lib/client/format';
import { deliverableLabel } from '@/lib/shared/constants';
import { Alert, CountUp, Empty, PageHead, ScoreBadge, SkeletonRows, StatusBadge, StrategyBadge, useLoad } from '../ui';

type Data = {
  kpi: { nouveaux7j: number; aContacter: number; demandes: number; tauxQualification: number | null; gagnes: number; demo: number; relancesDues: number; relancesEnRetard: number; jobsEnCours: number; jobsEnAttente: number; jobsEchecs: number; jobsBloques: number };
  usage: { claudeUsd: number; claudeUnknownCalls: number; budgetUsd: number; braveQueries: number; braveCap: number };
  projects: { id: string; name: string; status: string; render: string; deliverable: string; updated_at: string }[];
  priorities: { id: string; name: string; strategy: string; score: number; status: string; city: string; need_type: string; created_at: string }[];
  dueTasks: { id: string; title: string; kind: string; due_at: string | null; prospect_id: string | null; prospect_name: string | null }[];
};

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
}

export default function Dashboard() {
  const { data, error, loading } = useLoad(() => api<Data>('/api/dashboard'));
  const k = data?.kpi;
  const budgetPct = data && data.usage.budgetUsd > 0 ? Math.min(100, Math.round((data.usage.claudeUsd / data.usage.budgetUsd) * 100)) : 0;
  return (
    <>
      <PageHead eyebrow={new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} title={`${greeting()}, Salim.`}
        desc="Vos opportunités, vos relances et vos créations en cours, en un coup d’œil."
        actions={<><Link className="btn" href="/prospection?recherche=1"><Radar size={16} />Chercher des clients</Link><Link className="btn btn-gold" href="/creation/nouveau"><Wand2 size={16} />Créer un site</Link></>} />
      {error ? <Alert kind="error">{error}</Alert> : null}
      {k?.demo ? <div style={{ marginBottom: 14 }}><Alert kind="warn">{k.demo} fiche(s) proviennent du mode simulation (données de test). Elles sont marquées « Donnée de test ».</Alert></div> : null}
      <div className="grid g-4 stagger" style={{ marginBottom: 16 }}>
        <Kpi icon={<TrendingUp size={16} />} label="Nouveaux prospects (7 j)" value={k?.nouveaux7j ?? null} hint="Fiches découvertes cette semaine" href="/prospection?tri=recent" />
        <Kpi icon={<Megaphone size={16} />} label="Demandes explicites actives" value={k?.demandes ?? null} hint="Annonces et marchés sourcés" href="/prospection?strategie=explicite" />
        <Kpi icon={<Target size={16} />} label="À contacter" value={k?.aContacter ?? null} hint="Hors oppositions RGPD" href="/prospection?statut=%C3%80%20contacter" />
        <Kpi icon={<CalendarClock size={16} />} label="Relances dues" value={k?.relancesDues ?? null} hint={k?.relancesEnRetard ? `${k.relancesEnRetard} en retard` : 'Aujourd’hui et demain'} href="/taches" alert={!!k?.relancesEnRetard} />
      </div>
      <div className="grid g-main-side">
        <div className="stack">
          <section className="card">
            <div className="card-head"><div><div className="card-title"><Sparkles size={16} color="var(--gold)" />Actions prioritaires</div><div className="card-sub">Demandes explicites et meilleurs scores à traiter</div></div><Link className="btn btn-sm btn-ghost" href="/prospection">Tout voir<ArrowUpRight size={14} /></Link></div>
            {loading ? <SkeletonRows /> : data?.priorities.length ? (
              <div className="table-wrap"><table className="table"><tbody>
                {data.priorities.map((p) => (
                  <tr key={p.id}>
                    <td className="name-cell"><Link className="row-link" href={`/prospection/${p.id}`}>{p.name}</Link><div className="tiny muted">{p.need_type || 'Besoin à préciser'} · {p.city || 'Lieu inconnu'}</div></td>
                    <td><StrategyBadge strategy={p.strategy} /></td>
                    <td><StatusBadge status={p.status} /></td>
                    <td style={{ textAlign: 'right' }}><ScoreBadge score={p.score} /></td>
                  </tr>
                ))}
              </tbody></table></div>
            ) : <Empty icon={<Radar size={22} />} title="Aucune opportunité à traiter" action={<Link className="btn btn-primary" href="/prospection?recherche=1">Lancer une recherche</Link>}>Les résultats réels de vos recherches apparaîtront ici, avec leur source.</Empty>}
          </section>
          <section className="card">
            <div className="card-head"><div><div className="card-title"><FolderKanban size={16} color="var(--gold)" />Projets récents</div><div className="card-sub">Création IA</div></div><Link className="btn btn-sm btn-ghost" href="/creation">Bibliothèque<ArrowUpRight size={14} /></Link></div>
            {loading ? <SkeletonRows rows={3} /> : data?.projects.length ? (
              <div className="grid g-3 card-pad stagger">
                {data.projects.map((p) => (
                  <Link key={p.id} href={`/creation/${p.id}`} className="card card-hover card-pad" style={{ boxShadow: 'none' }}>
                    <div className="row between"><span className="badge badge-outline">{p.render === 'react' ? 'React + Motion' : p.render === 'nextjs' ? 'Application' : 'HTML'}</span><StatusBadge status={p.status} live={['Planification', 'Génération', 'Construction', 'Tests'].includes(p.status)} /></div>
                    <div className="strong" style={{ marginTop: 10 }}>{p.name}</div>
                    <div className="tiny muted">{deliverableLabel(p.deliverable)} · {relative(p.updated_at)}</div>
                  </Link>
                ))}
              </div>
            ) : <Empty icon={<Wand2 size={22} />} title="Aucun projet" action={<Link className="btn btn-gold" href="/creation/nouveau">Créer un premier site</Link>}>Une idée, quelques photos : Claude propose un plan, puis génère un vrai projet.</Empty>}
          </section>
        </div>
        <div className="stack">
          <section className="card card-pad">
            <div className="card-title" style={{ marginBottom: 12 }}><Gauge size={16} color="var(--gold)" />Activité de génération</div>
            <div className="grid g-2" style={{ gap: 10 }}>
              <Mini label="En cours" value={k?.jobsEnCours} />
              <Mini label="Plan à valider" value={k?.jobsEnAttente} />
              <Mini label="Échecs (14 j)" value={k?.jobsEchecs} tone={k?.jobsEchecs ? 'var(--red)' : undefined} />
              <Mini label="Bloqués (runner)" value={k?.jobsBloques} tone={k?.jobsBloques ? 'var(--amber)' : undefined} />
            </div>
            <div className="divider" />
            <div className="row between small"><span className="muted">Taux de qualification</span><span className="strong">{k?.tauxQualification === null || k === undefined ? '—' : `${k.tauxQualification} %`}</span></div>
            <div className="row between small" style={{ marginTop: 6 }}><span className="muted">Clients gagnés</span><span className="strong">{k?.gagnes ?? '—'}</span></div>
          </section>
          <section className="card card-pad">
            <div className="card-title" style={{ marginBottom: 12 }}><Coins size={16} color="var(--gold)" />Consommation des API (mois)</div>
            <div className="row between small"><span className="muted">Claude (estimation)</span><span className="strong">{data ? fmtUsd(data.usage.claudeUsd) : '—'} / {data ? fmtUsd(data.usage.budgetUsd, 0) : '—'}</span></div>
            <div className="progress" style={{ margin: '8px 0 4px' }}><span style={{ width: `${budgetPct}%`, background: budgetPct > 85 ? 'var(--red)' : undefined }} /></div>
            {data?.usage.claudeUnknownCalls ? <div className="tiny" style={{ color: 'var(--amber)' }}>{data.usage.claudeUnknownCalls} appel(s) sans coût calculable (modèle hors grille).</div> : null}
            <div className="row between small" style={{ marginTop: 10 }}><span className="muted">Requêtes Brave</span><span className="strong">{data?.usage.braveQueries ?? '—'} / {data?.usage.braveCap ?? '—'}</span></div>
            <Link href="/journal" className="tiny" style={{ color: 'var(--gold-ink)', display: 'inline-block', marginTop: 10 }}>Détail des coûts →</Link>
          </section>
          <section className="card">
            <div className="card-head"><div className="card-title"><CalendarClock size={16} color="var(--gold)" />Prochaines relances</div><Link href="/taches" className="btn btn-sm btn-ghost">Tout</Link></div>
            {loading ? <SkeletonRows rows={3} /> : data?.dueTasks.length ? (
              <div className="card-pad" style={{ display: 'grid', gap: 10 }}>
                {data.dueTasks.map((t) => {
                  const late = t.due_at && new Date(t.due_at) < new Date();
                  return (
                    <div key={t.id} className="row" style={{ alignItems: 'flex-start' }}>
                      {late ? <AlertTriangle size={15} color="var(--red)" /> : <CheckCircle2 size={15} color="var(--faint)" />}
                      <div style={{ minWidth: 0 }}><div className="small strong ellipsis">{t.title}</div><div className="tiny muted">{t.prospect_id ? <Link href={`/prospection/${t.prospect_id}`}>{t.prospect_name}</Link> : 'Tâche libre'} · {t.due_at ? fmtDate(t.due_at) : 'sans échéance'}</div></div>
                    </div>
                  );
                })}
              </div>
            ) : <div className="card-pad small muted">Aucune relance planifiée.</div>}
          </section>
        </div>
      </div>
    </>
  );
}

function Kpi({ icon, label, value, hint, href, alert }: { icon: React.ReactNode; label: string; value: number | null; hint: string; href: string; alert?: boolean }) {
  return (
    <Link href={href} className="card kpi card-hover">
      <div className="kpi-label"><span className="kpi-icon" style={alert ? { background: 'var(--red-soft)', color: 'var(--red)' } : undefined}>{icon}</span>{label}</div>
      <div className="kpi-value"><CountUp value={value} /></div>
      <div className="kpi-hint">{hint}</div>
    </Link>
  );
}
function Mini({ label, value, tone }: { label: string; value?: number; tone?: string }) {
  return <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}><div className="tiny muted">{label}</div><div className="serif" style={{ fontSize: 26, fontWeight: 600, color: tone }}>{value ?? '—'}</div></div>;
}
