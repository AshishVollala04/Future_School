/**
 * Teacher: messages from parents (reply only to threads addressed to me) and homework
 * (post for a class + subject I teach; mark each student pending / submitted / checked).
 */
import React, { useState } from 'react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { teacherCommsService } from '../../../services/teacherCommsService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { HomeworkItem, HomeworkStatus } from '../../../types/domain';
import { addDaysISO, formatDate, formatDateTime } from '../../../utils/date';

const CATEGORY: Record<string, string> = {
  ACADEMIC_PROGRESS: 'Academic progress', HOMEWORK: 'Homework', ATTENDANCE: 'Attendance', CONDUCT: 'Conduct', EXAM_MARKS: 'Exam marks', GENERAL: 'General'
};

export const TeacherMessages: React.FC = () => {
  const scope = useScope();
  const q = useQuery(() => teacherCommsService.inbox(scope), [scope.schoolId, scope.userId]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const send = async (id: string) => {
    setBusy(id);
    setError(null);
    const r = await teacherCommsService.reply(scope, id, drafts[id] ?? '');
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setDrafts(d => ({ ...d, [id]: '' }));
    q.reload();
  };

  return (
    <div className="space-y-4 max-w-3xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">Messages from parents</h1>
        <p className="text-sm text-slate-600">Only conversations addressed to you. Fees, leave and complaints have their own workflows.</p>
      </div>
      <ErrorBox message={error} />
      {q.data.length === 0 ? <EmptyState title="No messages" /> : (
        <ul className="space-y-3">
          {q.data.map(t => (
            <li key={t.id}>
              <Panel className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{t.subject}</p>
                    <p className="text-sm text-slate-500">{t.studentName ?? t.studentId}{t.classLabel ? ` (${t.classLabel})` : ''} · {CATEGORY[t.category] ?? t.category}</p>
                  </div>
                  {t.messages[t.messages.length - 1]?.from === 'PARENT' && <Pill tone="warning">Waiting for reply</Pill>}
                </div>
                <ul className="space-y-2">
                  {t.messages.map((m, i) => (
                    <li key={i} className={`p-2.5 rounded-xl text-sm ${m.from === 'TEACHER' ? 'bg-blue-50 ml-6' : 'bg-slate-50 mr-6'}`}>
                      <p className="text-xs text-slate-500">{m.from === 'TEACHER' ? 'You' : m.author || 'Parent'} · {formatDateTime(m.at)}</p>
                      <p>{m.body}</p>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col sm:flex-row gap-2">
                  <textarea aria-label="Reply" value={drafts[t.id] ?? ''} onChange={e => setDrafts(d => ({ ...d, [t.id]: e.target.value.slice(0, 1000) }))} rows={2}
                    placeholder="Write a reply" className={`${inputClass} flex-1`} />
                  <button onClick={() => send(t.id)} disabled={!(drafts[t.id] ?? '').trim() || busy === t.id}
                    className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold disabled:opacity-50">Send</button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const STATUS_TONE: Record<HomeworkStatus, 'neutral' | 'info' | 'success'> = { PENDING: 'neutral', SUBMITTED: 'info', CHECKED: 'success' };
const NEXT: Record<HomeworkStatus, HomeworkStatus> = { PENDING: 'SUBMITTED', SUBMITTED: 'CHECKED', CHECKED: 'PENDING' };

export const TeacherHomework: React.FC = () => {
  const scope = useScope();
  const a = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const q = useQuery(() => teacherCommsService.myHomework(scope), [scope.schoolId, scope.userId]);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueOn, setDueOn] = useState(addDaysISO(2));
  const [type, setType] = useState<HomeworkItem['submissionType']>('NOTEBOOK');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (a.status === 'loading') return <LoadingBlock />;
  if (a.status === 'error') return <ErrorState message={a.error} onRetry={a.reload} />;
  const teaching = a.data.teaching;

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    const pick = teaching.find(x => `${x.classSection.id}|${x.subject}` === target);
    if (!pick) return setError('Choose the class and subject.');
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await teacherCommsService.postHomework(scope, { classSectionId: pick.classSection.id, subject: pick.subject, title, instructions, dueOn, submissionType: type });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setTitle('');
    setInstructions('');
    setDone(`Posted to Class ${pick.classSection.grade}-${pick.classSection.section}. Parents see it now.`);
    q.reload();
  };

  const toggle = async (hwId: string, studentId: string, current: HomeworkStatus) => {
    setError(null);
    const r = await teacherCommsService.setStatus(scope, hwId, studentId, NEXT[current]);
    if (!r.ok) setError(r.error);
    q.reload();
  };

  return (
    <div className="space-y-6 max-w-3xl xl:max-w-6xl">
      <div>
        <p className="text-sm font-semibold text-blue-800">My Teaching</p>
        <h1 className="text-xl font-bold">Homework</h1>
      </div>
      {teaching.length === 0 ? <EmptyState title="You have no subject allocations this year" /> : (
        <form onSubmit={post}>
          <Panel className="p-4 space-y-3">
            <label className="block">
              <span className="block text-sm font-semibold mb-1">Class and subject</span>
              <select value={target} onChange={e => setTarget(e.target.value)} className={inputClass}>
                <option value="">Choose…</option>
                {teaching.map(x => (
                  <option key={x.classSection.id + x.subject} value={`${x.classSection.id}|${x.subject}`}>Class {x.classSection.grade}-{x.classSection.section} · {x.subject}</option>
                ))}
              </select>
            </label>
            <label className="block"><span className="block text-sm font-semibold mb-1">Title</span><input value={title} onChange={e => setTitle(e.target.value.slice(0, 200))} className={inputClass} /></label>
            <label className="block"><span className="block text-sm font-semibold mb-1">Instructions</span><textarea value={instructions} onChange={e => setInstructions(e.target.value.slice(0, 1000))} rows={2} className={inputClass} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="block text-sm font-semibold mb-1">Due</span><input type="date" value={dueOn} onChange={e => setDueOn(e.target.value)} className={inputClass} /></label>
              <label className="block">
                <span className="block text-sm font-semibold mb-1">Submission</span>
                <select value={type} onChange={e => setType(e.target.value as HomeworkItem['submissionType'])} className={inputClass}>
                  <option value="NOTEBOOK">Notebook</option>
                  <option value="WORKSHEET">Worksheet</option>
                  <option value="NONE">Nothing to submit</option>
                </select>
              </label>
            </div>
            <ErrorBox message={error} />
            {done && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">{done}</p>}
            <PrimaryButton type="submit" loading={busy} disabled={!target || title.trim().length < 3}>Post homework</PrimaryButton>
          </Panel>
        </form>
      )}
      <Section title="Homework I set">
        {q.status === 'loading' ? <LoadingBlock lines={2} /> : q.status === 'error' ? <ErrorState message={q.error} onRetry={q.reload} /> : q.data.length === 0 ? <EmptyState title="No homework yet" /> : (
          <ul className="space-y-3">
            {q.data.map(h => (
              <li key={h.id}>
                <Panel className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{h.title}</p>
                      <p className="text-sm text-slate-500">Class {h.classLabel} · {h.subject} · due {formatDate(h.dueOn)}</p>
                    </div>
                    <Pill tone="neutral">{h.students.filter(s => s.status !== 'PENDING').length}/{h.students.length} in</Pill>
                  </div>
                  <p className="text-xs text-slate-500">Tap a student to move pending → submitted → checked.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {h.students.map(s => (
                      <button key={s.id} onClick={() => toggle(h.id, s.id, s.status)} className="min-h-10 px-2.5 rounded-lg border border-slate-200 text-sm flex items-center gap-1.5">
                        <span>{s.rollNumber}. {s.name}</span>
                        <Pill tone={STATUS_TONE[s.status]}>{s.status.toLowerCase()}</Pill>
                      </button>
                    ))}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
