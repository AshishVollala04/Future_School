/**
 * Class Teacher responsibility: release hall tickets for MY class.
 * Release is allowed only for fee-CLEARED students. Payment alone never releases.
 */
import React, { useState } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import { useScope } from '../../hooks/useScope';
import { useQuery } from '../../hooks/useQuery';
import { academicsService } from '../../services/academicsService';
import { hallTicketService } from '../../services/hallTicketService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../components/common/States';
import { formatDate } from '../../utils/date';

export const TeacherHallTicketRelease: React.FC = () => {
  const scope = useScope();
  const assignments = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const cs = assignments.data?.classTeacherOf ?? null;
  const list = useQuery(
    () => (cs ? hallTicketService.listForClass(scope, cs.id) : Promise.resolve({ ok: true as const, data: [] })),
    [scope.schoolId, cs?.id]
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  if (assignments.status === 'loading') return <LoadingBlock />;
  if (assignments.status === 'error') return <ErrorState message={assignments.error} onRetry={assignments.reload} />;
  if (!cs) return <EmptyState title="You are not a Class Teacher this year" hint="Hall ticket release is a Class Teacher responsibility." />;

  const release = async (examId: string, studentId: string, name: string) => {
    setBusy(studentId);
    setMessage(null);
    const r = await hallTicketService.release(scope, examId, studentId);
    setBusy(null);
    setMessage(r.ok ? { tone: 'ok', text: `Hall ticket released for ${name}.` } : { tone: 'err', text: r.error });
    list.reload();
  };

  const rows = list.data ?? [];
  const cleared = rows.filter(r => r.feeClearance === 'CLEARED').length;
  const released = rows.filter(r => r.release).length;

  return (
    <div className="space-y-4 max-w-3xl xl:max-w-6xl">
      <div>
        <p className="text-sm font-semibold text-blue-800">My Class Teacher responsibility</p>
        <h1 className="text-xl font-bold">
          Hall tickets · Class {cs.grade}-{cs.section}
          {rows[0] && <span className="text-slate-500 font-normal"> · {rows[0].exam.name} from {formatDate(rows[0].exam.startsOn)}</span>}
        </h1>
        <p className="text-sm text-slate-600">Fee clearance is calculated from the Admin's clearance rule. Release only after it shows Cleared.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Pill tone="neutral">{rows.length} students</Pill>
        <Pill tone="success">{cleared} fee cleared</Pill>
        <Pill tone="info">{released} released</Pill>
      </div>
      {message && (
        <div role="status" className={`p-3 rounded-xl text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`}>
          {message.text}
        </div>
      )}
      {list.status === 'loading' ? (
        <LoadingBlock />
      ) : list.status === 'error' ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No upcoming exam for this class" />
      ) : (
        <Panel className="divide-y divide-slate-100">
          {rows.map(h => (
            <div key={h.student.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">
                  {h.student.rollNumber}. {h.student.name}
                </p>
                {h.pendingReasons.length > 0 && <p className="text-sm text-amber-900">{h.pendingReasons.join(' · ')}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={h.feeClearance === 'CLEARED' ? 'success' : 'warning'}>{h.feeClearance === 'CLEARED' ? 'Cleared' : 'Pending'}</Pill>
                {h.release ? (
                  <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> {h.release.principalOverride ? 'Released (override)' : 'Released'}
                  </span>
                ) : h.feeClearance === 'CLEARED' ? (
                  <button
                    onClick={() => release(h.exam.id, h.student.id, h.student.name)}
                    disabled={busy === h.student.id}
                    className="min-h-11 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    Release
                  </button>
                ) : (
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    <Lock className="w-4 h-4" /> Blocked
                  </span>
                )}
              </div>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
};
