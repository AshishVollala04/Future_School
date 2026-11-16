/**
 * Class Teacher attendance register: fast path is "Mark all present", then tap exceptions.
 * Tap cycles Present -> Absent -> Leave -> Late. Approved leave is shown as a hint only.
 * Saving a register again with changes is a correction and requires a reason (kept in history).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, History } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { attendanceService } from '../../../services/attendanceService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { AttendanceMark, AttendanceSession } from '../../../types/domain';
import { addDaysISO, formatDate, formatDateTime, todayISO } from '../../../utils/date';

const CYCLE: AttendanceMark[] = ['P', 'A', 'L', 'LATE'];
const STYLE: Record<AttendanceMark, string> = {
  P: 'bg-emerald-600 text-white border-emerald-600',
  A: 'bg-rose-600 text-white border-rose-600',
  L: 'bg-sky-600 text-white border-sky-600',
  LATE: 'bg-amber-500 text-white border-amber-500'
};
const LABEL: Record<AttendanceMark, string> = { P: 'Present', A: 'Absent', L: 'Leave', LATE: 'Late' };

const lastWorkingDay = () => (new Date().getDay() === 0 ? addDaysISO(-1) : todayISO());

export const TeacherAttendanceRegister: React.FC = () => {
  const scope = useScope();
  const a = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const ct = a.data?.classTeacherOf ?? null;
  const [date, setDate] = useState(lastWorkingDay());
  const [session, setSession] = useState<AttendanceSession>(new Date().getHours() >= 12 ? 'AFTERNOON' : 'MORNING');
  const reg = useQuery(
    () => (ct ? attendanceService.getRegister(scope, ct.id, date, session) : Promise.resolve({ ok: true as const, data: null })),
    [scope.schoolId, ct?.id, date, session]
  );
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const m: Record<string, AttendanceMark> = {};
    reg.data?.rows.forEach(r => {
      if (r.mark) {
        m[r.studentId] = r.mark;
      } else if (r.leave) {
        // Auto-update to 'L' (Leave) if teacher approved leave for this student
        m[r.studentId] = 'L';
      }
    });
    setMarks(m);
    setReason('');
    setError(null);
  }, [reg.data]);

  const rows = reg.data?.rows ?? [];
  const counts = useMemo(() => {
    const c = { P: 0, A: 0, L: 0, LATE: 0, unmarked: 0 };
    rows.forEach(r => (marks[r.studentId] ? c[marks[r.studentId]]++ : c.unmarked++));
    return c;
  }, [rows, marks]);
  const saved = reg.data?.saved ?? null;
  const changed = saved ? rows.filter(r => r.mark !== marks[r.studentId]).length : 0;

  if (a.status === 'loading') return <LoadingBlock />;
  if (!ct) return <EmptyState title="Attendance is recorded by the Class Teacher" />;

  const cycle = (r: typeof rows[0]) => {
    setMarks(prev => {
      const cur = prev[r.studentId];
      if (r.leave) {
        // Approved leave: default is 'L'. Cycle: L -> P -> A -> L
        if (!cur || cur === 'L') return { ...prev, [r.studentId]: 'P' };
        if (cur === 'P') return { ...prev, [r.studentId]: 'A' };
        return { ...prev, [r.studentId]: 'L' };
      } else {
        // No approved leave: first tap is Present ('P'), next tap is Absent ('A')
        if (!cur || cur === 'A') return { ...prev, [r.studentId]: 'P' };
        return { ...prev, [r.studentId]: 'A' };
      }
    });
  };

  const allPresent = () =>
    setMarks(m =>
      Object.fromEntries(
        rows.map(r => [
          r.studentId,
          r.leave && (!m[r.studentId] || m[r.studentId] === 'L') ? 'L' : 'P'
        ])
      )
    );

  const save = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await attendanceService.saveRegister(scope, { classSectionId: ct.id, date, session, marks, correctionReason: saved ? reason : undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(saved ? 'Correction saved and recorded in history.' : 'Register saved.');
    reg.reload();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <p className="text-sm font-semibold text-blue-800">My Class Teacher responsibility</p>
        <h1 className="text-xl font-bold">Attendance · Class {ct.grade}-{ct.section}</h1>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-1">Date</span>
          <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} className={`${inputClass} py-2`} />
        </label>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/70">
          {(['MORNING', 'AFTERNOON'] as const).map(s => (
            <button key={s} onClick={() => setSession(s)} className={`min-h-10 px-4 rounded-lg text-sm font-semibold ${session === s ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}>
              {s === 'MORNING' ? 'Morning' : 'Afternoon'}
            </button>
          ))}
        </div>
      </div>

      {reg.status === 'loading' ? (
        <LoadingBlock />
      ) : reg.status === 'error' ? (
        <ErrorState message={reg.error} onRetry={reg.reload} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={allPresent} className="min-h-11 px-4 rounded-xl border border-blue-700 text-blue-800 font-semibold flex items-center gap-2 hover:bg-blue-50">
              <CheckCheck className="w-4 h-4" /> Mark all present
            </button>
            <span className="text-sm text-slate-500">Then tap a student to change.</span>
          </div>
          <Panel className="divide-y divide-slate-100">
            {rows.map(r => {
              const m = marks[r.studentId];
              return (
                <button key={r.studentId} onClick={() => cycle(r)} className="w-full min-h-14 px-3.5 py-2 flex items-center gap-3 text-left hover:bg-slate-50">
                  <span className="w-8 text-sm font-mono text-slate-500">{r.rollNumber}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{r.name}</span>
                    {r.leave ? (
                      <span className="block text-xs font-semibold text-sky-800 dark:text-sky-300">
                        ✓ Approved leave ({r.leave.fromDate} to {r.leave.toDate}) · Auto-applied
                      </span>
                    ) : (
                      <span className="block text-xs text-slate-400">
                        No approved leave applied
                      </span>
                    )}
                  </span>
                  <span className={`min-w-20 text-center px-2 py-1.5 rounded-lg border text-sm font-semibold ${m ? STYLE[m] : 'border-dashed border-slate-300 text-slate-400'}`}>
                    {m ? LABEL[m] : 'Tap'}
                  </span>
                </button>
              );
            })}
          </Panel>

          <Panel className="p-3.5 space-y-3">
            <div className="flex flex-wrap gap-1.5 text-sm">
              <Pill tone="success">Present {counts.P}</Pill>
              <Pill tone="danger">Absent {counts.A}</Pill>
              <Pill tone="info">Leave {counts.L}</Pill>
              <Pill tone="warning">Late {counts.LATE}</Pill>
              {counts.unmarked > 0 && <Pill tone="neutral">Not marked {counts.unmarked}</Pill>}
            </div>
            <p className="text-sm text-slate-600">
              Confirm: {rows.length} students · {formatDate(date)} · {session === 'MORNING' ? 'Morning' : 'Afternoon'}
            </p>
            {saved && (
              <>
                <p className="text-xs text-slate-500">Saved {formatDateTime(saved.savedAt)}. {changed ? `${changed} change(s) since then.` : 'No changes.'}</p>
                {changed > 0 && (
                  <label className="block">
                    <span className="block text-sm font-semibold text-slate-700 mb-1">Reason for correction (required)</span>
                    <input value={reason} onChange={e => setReason(e.target.value.slice(0, 200))} className={inputClass} placeholder="e.g. Student arrived late, not absent" />
                  </label>
                )}
              </>
            )}
            <ErrorBox message={error} />
            {done && <p role="status" className="text-sm text-emerald-800">{done}</p>}
            <PrimaryButton onClick={save} loading={busy} disabled={counts.unmarked > 0 || (Boolean(saved) && changed === 0)}>
              {saved ? 'Save correction' : 'Save register'}
            </PrimaryButton>
          </Panel>

          {saved && saved.history.length > 0 && (
            <Panel className="p-3.5">
              <p className="font-semibold flex items-center gap-2 mb-2"><History className="w-4 h-4" /> Correction history</p>
              <ul className="space-y-1.5 text-sm">
                {saved.history.map((h, i) => (
                  <li key={i}>
                    {formatDateTime(h.at)} · {h.reason} ·{' '}
                    {h.changes.map(c => `${rows.find(r => r.studentId === c.studentId)?.rollNumber}: ${LABEL[c.from]}→${LABEL[c.to]}`).join(', ')}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
};
