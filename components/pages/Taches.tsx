'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, CalendarCheck2, Trash2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/client/format';
import { TASK_KINDS } from '@/lib/shared/constants';
import { Empty, PageHead, SkeletonRows, useErrorToast, useLoad } from '../ui';

type Task = { id: string; title: string; kind: string; due_at: string | null; done_at: string | null; prospect_id: string | null; prospect_name: string | null };

export default function Taches() {
  const onError = useErrorToast();
  const [scope, setScope] = useState<'ouvertes' | 'toutes'>('ouvertes');
  const { data, loading, reload } = useLoad(() => api<{ tasks: Task[] }>(`/api/tasks?scope=${scope}`), [scope]);
  const now = Date.now();
  const groups: [string, Task[]][] = [
    ['En retard', (data?.tasks ?? []).filter((t) => !t.done_at && t.due_at && new Date(t.due_at).getTime() < now)],
    ['À venir', (data?.tasks ?? []).filter((t) => !t.done_at && (!t.due_at || new Date(t.due_at).getTime() >= now))],
    ['Terminées', (data?.tasks ?? []).filter((t) => t.done_at)],
  ];
  return (
    <>
      <PageHead eyebrow="Prospection" title="Tâches & relances" desc="Toutes vos relances planifiées, classées par urgence."
        actions={<div className="segmented"><button aria-pressed={scope === 'ouvertes'} onClick={() => setScope('ouvertes')}>Ouvertes</button><button aria-pressed={scope === 'toutes'} onClick={() => setScope('toutes')}>Toutes</button></div>} />
      {loading && !data ? <div className="card"><SkeletonRows /></div> : !data?.tasks.length ? <div className="card"><Empty icon={<CalendarCheck2 size={22} />} title="Aucune tâche">Planifiez des relances depuis les fiches prospects.</Empty></div> : (
        <div className="stack">
          {groups.filter(([, list]) => list.length).map(([label, list]) => (
            <section key={label} className="card">
              <div className="card-head"><div className="card-title">{label === 'En retard' ? <AlertTriangle size={16} color="var(--red)" /> : null}{label}</div><span className="badge">{list.length}</span></div>
              <div className="table-wrap"><table className="table"><tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td style={{ width: 36 }}><input type="checkbox" aria-label="Terminer" checked={!!t.done_at} onChange={async (e) => { try { await api(`/api/tasks/${t.id}`, { method: 'PATCH', json: { done: e.target.checked } }); await reload(); } catch (err) { onError(err); } }} /></td>
                    <td><div className="strong small" style={{ textDecoration: t.done_at ? 'line-through' : 'none' }}>{t.title}</div><div className="tiny muted">{TASK_KINDS[t.kind as keyof typeof TASK_KINDS] ?? t.kind}{t.prospect_id ? <> · <Link href={`/prospection/${t.prospect_id}`} style={{ color: 'var(--gold-ink)' }}>{t.prospect_name}</Link></> : null}</div></td>
                    <td className="small" style={{ color: label === 'En retard' ? 'var(--red)' : undefined }}>{t.due_at ? fmtDateTime(t.due_at) : 'Sans échéance'}</td>
                    <td style={{ width: 44 }}><button className="btn btn-ghost btn-icon btn-sm" aria-label="Supprimer" onClick={async () => { try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); await reload(); } catch (err) { onError(err); } }}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody></table></div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
