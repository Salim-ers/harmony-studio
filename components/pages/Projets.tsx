'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Archive, FolderKanban, Plus, Wand2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { relative } from '@/lib/client/format';
import { deliverableLabel } from '@/lib/shared/constants';
import { DemoBadge, Empty, PageHead, Skeleton, StatusBadge, useLoad, usePersistentState } from '../ui';

type P = { id: string; name: string; client_name: string; deliverable: string; render: string; status: string; summary: string; brief: string; is_demo: boolean; updated_at: string; version_number: number | null; cover_media_id: string | null; last_job_status: string | null };

export default function Projets() {
  const [archived, setArchived] = useState(false);
  const [filter, setFilter] = usePersistentState('projects-filter', '');
  const { data, loading } = useLoad(() => api<{ projects: P[] }>(`/api/projects${archived ? '?archived=1' : ''}`), [archived]);
  const list = (data?.projects ?? []).filter((p) => !filter || p.status === filter);
  return (
    <>
      <PageHead eyebrow="Création IA" title="Projets" desc="Sites React avec motion design, vitrines HTML et applications : brief, médias, versions, aperçus et exports."
        actions={<><button className="btn" onClick={() => setArchived((a) => !a)}><Archive size={16} />{archived ? 'Projets actifs' : 'Archivés'}</button><Link className="btn btn-gold" href="/creation/nouveau"><Plus size={16} />Nouveau projet</Link></>} />
      <div className="chips" style={{ marginBottom: 14 }}>
        {['', 'Brouillon', 'Génération', 'À corriger', 'Prêt pour revue', 'Approuvé', 'Déployé'].map((s) => <button key={s} className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s || 'Tous'}</button>)}
      </div>
      {loading && !data ? <div className="grid g-3">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton h={180} style={{ borderRadius: '14px 14px 0 0' }} /><div className="card-pad stack"><Skeleton w="60%" /><Skeleton w="40%" /></div></div>)}</div> : list.length ? (
        <div className="grid g-3 stagger">
          {list.map((p) => (
            <Link key={p.id} href={`/creation/${p.id}`} className="card card-hover project-card">
              <div className="project-cover">
                {p.cover_media_id ? <img src={`/api/media/${p.cover_media_id}/thumb`} alt="" loading="lazy" /> : <Wand2 size={34} />}
                <span className="badge" style={{ background: 'rgba(12,26,51,.78)', color: '#fff' }}>{p.render === 'react' ? 'React + Motion' : p.render === 'nextjs' ? 'Application' : 'HTML'}</span>
              </div>
              <div className="card-pad" style={{ display: 'grid', gap: 6 }}>
                <div className="row between"><span className="strong ellipsis">{p.name}</span><StatusBadge status={p.status} live={['Planification', 'Génération', 'Construction', 'Tests'].includes(p.status)} /></div>
                <div className="tiny muted">{deliverableLabel(p.deliverable)}{p.version_number ? ` · v${p.version_number}` : ''} · {relative(p.updated_at)} <DemoBadge show={p.is_demo} /></div>
                <p className="small muted clamp-2">{p.summary || p.brief || 'Brief à compléter'}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<FolderKanban size={22} />} title={archived ? 'Aucun projet archivé' : 'Aucun projet'} action={<Link className="btn btn-gold" href="/creation/nouveau">Créer un projet</Link>}>Une idée en 2–3 phrases + vos photos suffisent pour lancer une première proposition.</Empty></div>}
    </>
  );
}
