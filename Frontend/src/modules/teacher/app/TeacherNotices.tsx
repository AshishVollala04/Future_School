/**
 * Teacher notices: read every school and class notice (priority + audience badges), and post a
 * Normal or Important notice to the classes you are assigned to. Parents of those classes see it
 * immediately on their notice board. Emergency notices and whole-school notices stay with the
 * Principal / Admin. The service re-checks all of this and writes an audit event.
 */
import React, { useMemo, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { communicationService } from '../../../services/communicationService';
import { notifyStaffDataChanged } from '../../../app/staffEvents';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { ClassSection, Notice } from '../../../types/domain';
import { formatDateTime } from '../../../utils/date';

const PRIORITY: Record<Notice['priority'], { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  EMERGENCY: { label: 'Emergency', tone: 'danger' },
  IMPORTANT: { label: 'Important', tone: 'warning' },
  NORMAL: { label: 'Normal', tone: 'neutral' }
};

const classLabel = (c: Pick<ClassSection, 'grade' | 'section'>) => `${c.grade}-${c.section}`;

export const TeacherNotices: React.FC = () => {
  const scope = useScope();
  const mine = [scope.schoolId, scope.userId];
  const notices = useQuery(() => communicationService.getNotices(scope), mine);
  const assignments = useQuery(() => academicsService.getTeacherAssignments(scope), mine);
  const classes = useQuery(() => academicsService.listClasses(scope), [scope.schoolId]);

  // Classes this teacher may post to: Class Teacher class + every class they teach a subject in.
  const assigned = useMemo(() => {
    const map = new Map<string, ClassSection>();
    const d = assignments.data;
    if (d?.classTeacherOf) map.set(d.classTeacherOf.id, d.classTeacherOf);
    for (const t of d?.teaching ?? []) map.set(t.classSection.id, t.classSection);
    return [...map.values()].sort((x, y) => x.grade - y.grade || x.section.localeCompare(y.section));
  }, [assignments.data]);

  const labelFor = (id: string) => {
    const c = (classes.data ?? []).find(x => x.id === id) ?? assigned.find(x => x.id === id);
    return c ? `Class ${classLabel(c)}` : id;
  };

  const [audience, setAudience] = useState<string[]>([]);
  const [priority, setPriority] = useState<'NORMAL' | 'IMPORTANT'>('NORMAL');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const toggleClass = (id: string) => setAudience(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  const canPost = audience.length > 0 && title.trim().length >= 3 && body.trim().length >= 5 && !busy;

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await communicationService.postNotice(scope, { audience, title, body, priority });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(`Posted to ${audience.map(labelFor).join(', ')}. Parents can see it now.`);
    setTitle('');
    setBody('');
    setPriority('NORMAL');
    setAudience([]);
    notices.reload();
    notifyStaffDataChanged();
  };

  const list = [...(notices.data ?? [])].sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt));

  return (
    <div className="space-y-6 max-w-3xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">Notices</h1>
        <p className="text-sm text-slate-600">School and class notices. Post a notice to your classes; their parents see it immediately.</p>
      </div>

      <Section title="Post a notice">
        {assignments.status === 'loading' ? (
          <LoadingBlock lines={1} />
        ) : assigned.length === 0 ? (
          <EmptyState title="You have no assigned classes to post to" />
        ) : (
          <form onSubmit={post}>
            <Panel className="p-4 space-y-3">
              <fieldset>
                <legend className="block text-sm font-semibold mb-1.5">Send to</legend>
                <div className="flex flex-wrap gap-2">
                  {assigned.map(c => {
                    const on = audience.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleClass(c.id)}
                        className={`min-h-10 px-3.5 rounded-xl border text-sm font-semibold transition ${on ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                      >
                        Class {classLabel(c)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="block text-sm font-semibold mb-1.5">Priority</legend>
                <div className="inline-grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/70">
                  {(['NORMAL', 'IMPORTANT'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={priority === p}
                      onClick={() => setPriority(p)}
                      className={`min-h-10 px-4 rounded-lg text-sm font-semibold ${priority === p ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}
                    >
                      {PRIORITY[p].label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="block text-sm font-semibold mb-1">Title</span>
                <input value={title} onChange={e => setTitle(e.target.value.slice(0, 200))} placeholder="e.g. Science fair on Friday" className={inputClass} />
              </label>
              <label className="block">
                <span className="block text-sm font-semibold mb-1">Notice</span>
                <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 2000))} rows={4} className={inputClass} />
              </label>
              <p className="text-xs text-slate-500">Emergency and whole-school notices are sent by the Principal or Admin.</p>
              <ErrorBox message={error} />
              {done && <div role="status" className="p-3 rounded-xl text-sm bg-emerald-50 text-emerald-900 border border-emerald-200">{done}</div>}
              <PrimaryButton type="submit" loading={busy} disabled={!canPost}>
                <Send className="w-4 h-4" /> Post notice
              </PrimaryButton>
            </Panel>
          </form>
        )}
      </Section>

      <Section title="All notices">
        {notices.status === 'loading' ? (
          <LoadingBlock />
        ) : notices.status === 'error' ? (
          <ErrorState message={notices.error} onRetry={notices.reload} />
        ) : list.length === 0 ? (
          <EmptyState title="No notices yet" />
        ) : (
          <ul className="space-y-2.5">
            {list.map(n => (
              <li key={n.id}>
                <Panel className={`p-4 space-y-1.5 ${n.priority === 'EMERGENCY' ? 'border-rose-300' : n.priority === 'IMPORTANT' ? 'border-amber-300' : ''}`}>
                  <div className="flex items-start gap-2">
                    <Megaphone className="w-4 h-4 mt-1 shrink-0 text-rose-600" />
                    <p className="flex-1 font-semibold">{n.title}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Pill tone={PRIORITY[n.priority].tone}>{PRIORITY[n.priority].label}</Pill>
                    {n.audience === 'ALL' ? (
                      <Pill tone="info">Whole school</Pill>
                    ) : (
                      n.audience.map(id => <Pill key={id} tone="info">{labelFor(id)}</Pill>)
                    )}
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{n.body}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(n.publishedAt)}</p>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
