/**
 * My Teaching -> Marks entry. Only sheets for my assigned class + subject appear.
 * Grid: type a number or "AB" (or just "a") for absent. Enter moves down. 0 means attended and scored zero.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileEdit } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { marksService, SheetView } from '../../../services/marksService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { ErrorBox, PrimaryButton } from '../../auth/authUi';
import { MarkValue, MarksSheet, SheetStatus } from '../../../types/domain';

export const STATUS_TONE: Record<SheetStatus, 'neutral' | 'warning' | 'info' | 'danger' | 'success'> = {
  NOT_STARTED: 'neutral',
  DRAFT: 'warning',
  SUBMITTED: 'info',
  RETURNED: 'danger',
  ACCEPTED: 'success'
};
export const STATUS_LABEL: Record<SheetStatus, string> = {
  NOT_STARTED: 'Not started',
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  RETURNED: 'Returned',
  ACCEPTED: 'Accepted'
};

export const TeacherMarks: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const sheetId = params.get('sheet');
  return sheetId ? <SheetEditor sheetId={sheetId} onBack={() => setParams({})} /> : <SheetList onOpen={id => setParams({ sheet: id })} />;
};

/** Shortcut to Result corrections: on a phone it is not in the menu, so it lives on the marks pages. */
export const CorrectionsLink: React.FC = () => (
  <Link
    to="/teacher/corrections"
    className="min-h-10 px-3.5 rounded-xl border border-blue-200 bg-white text-blue-800 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-blue-50 shrink-0"
  >
    <FileEdit className="w-4 h-4" /> Result corrections
  </Link>
);

const SheetList: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const scope = useScope();
  const q = useQuery(() => marksService.listMySheets(scope), [scope.schoolId, scope.userId]);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  return (
    <div className="space-y-4 max-w-3xl xl:max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-800">My Teaching</p>
          <h1 className="text-xl font-bold">Marks entry</h1>
          <p className="text-sm text-slate-600">Only your assigned class and subject for open assessments.</p>
        </div>
        <CorrectionsLink />
      </div>
      {q.data.length === 0 ? (
        <EmptyState title="No open assessments for your subjects" />
      ) : (
        <ul className="space-y-2">
          {q.data.map(s => (
            <li key={s.sheet.id}>
              <button onClick={() => onOpen(s.sheet.id)} className="w-full text-left">
                <Panel className={`p-3.5 flex items-center gap-3 ${s.sheet.status === 'RETURNED' ? 'border-rose-300' : ''}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold">
                      {s.assessment.name} · {s.sheet.subject} · Class {s.classSection.grade}-{s.classSection.section}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {s.entered}/{s.total} entered
                      {s.sheet.status === 'RETURNED' && s.sheet.returnReason ? ` · Returned: ${s.sheet.returnReason}` : ''}
                    </span>
                  </span>
                  <Pill tone={STATUS_TONE[s.sheet.status]}>{STATUS_LABEL[s.sheet.status]}</Pill>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Panel>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const toText = (v: MarkValue | null) => (v === null ? '' : String(v));
function parse(text: string): MarkValue | null | 'INVALID' {
  const t = text.trim().toUpperCase();
  if (t === '') return null;
  if (t === 'A' || t === 'AB') return 'AB';
  if (/^\d{1,3}$/.test(t)) return Number(t);
  return 'INVALID';
}

/** Read-only or editable grid, shared with the Class Teacher review screen. */
export const SheetGrid: React.FC<{ view: SheetView; values?: Record<string, { internal: string; external: string }>; onChange?: (id: string, col: 'internal' | 'external', v: string) => void }> = ({ view, values, onChange }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const { assessment: a } = view;
  const cols: ('internal' | 'external')[] = a.maxExternal > 0 ? ['internal', 'external'] : ['internal'];
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500 border-b border-slate-200">
          <tr>
            <th className="p-2.5 font-medium w-14">Roll</th>
            <th className="p-2.5 font-medium">Student</th>
            {cols.map(c => (
              <th key={c} className="p-2.5 font-medium text-right w-28">
                {c === 'internal' ? 'Internal' : 'External'} /{c === 'internal' ? a.maxInternal : a.maxExternal}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {view.students.map((s, ri) => (
            <tr key={s.id}>
              <td className="p-2.5 font-mono text-slate-500">{s.rollNumber}</td>
              <td className="p-2.5">{s.name}</td>
              {cols.map((c, ci) => {
                const raw = values ? values[s.id]?.[c] ?? '' : toText(view.sheet.rows[s.id]?.[c] ?? null);
                const p = parse(raw);
                const max = c === 'internal' ? a.maxInternal : a.maxExternal;
                const bad = p === 'INVALID' || (typeof p === 'number' && p > max);
                return (
                  <td key={c} className="p-1.5 text-right">
                    {onChange ? (
                      <input
                        ref={el => {
                          refs.current[ri * cols.length + ci] = el;
                        }}
                        value={raw}
                        inputMode="text"
                        aria-label={`${s.name} ${c}`}
                        onChange={e => onChange(s.id, c, e.target.value.slice(0, 3))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            refs.current[(ri + 1) * cols.length + ci]?.focus();
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            refs.current[(ri - 1) * cols.length + ci]?.focus();
                          }
                        }}
                        className={`w-20 min-h-11 px-2 text-right font-mono text-base rounded-lg border ${bad ? 'border-rose-500 bg-rose-50' : p === 'AB' ? 'border-amber-400 bg-amber-50' : 'border-slate-300'} focus:outline-none focus:ring-2 focus:ring-blue-600/30`}
                      />
                    ) : (
                      <span className={`font-mono ${raw === 'AB' ? 'text-amber-700 font-semibold' : ''}`}>{raw || '—'}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};

const SheetEditor: React.FC<{ sheetId: string; onBack: () => void }> = ({ sheetId, onBack }) => {
  const scope = useScope();
  const q = useQuery(() => marksService.getSheet(scope, sheetId), [scope.schoolId, sheetId], { autoRefresh: false });
  const [values, setValues] = useState<Record<string, { internal: string; external: string }>>({});
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const v: typeof values = {};
    q.data.students.forEach(s => (v[s.id] = { internal: toText(q.data!.sheet.rows[s.id]?.internal ?? null), external: toText(q.data!.sheet.rows[s.id]?.external ?? null) }));
    setValues(v);
  }, [q.data]);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} />;
  const view = q.data;

  const save = async (submit: boolean) => {
    setError(null);
    setDone(null);
    const rows: MarksSheet['rows'] = {};
    for (const s of view.students) {
      const i = parse(values[s.id]?.internal ?? '');
      const x = parse(values[s.id]?.external ?? '');
      if (i === 'INVALID' || x === 'INVALID') return setError(`Roll ${s.rollNumber}: enter a number or AB.`);
      rows[s.id] = { internal: i, external: x };
    }
    setBusy(submit ? 'submit' : 'save');
    const r = await marksService.saveSheet(scope, sheetId, rows, submit);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setDone(submit ? 'Submitted to the Class Teacher.' : 'Draft saved.');
    q.reload();
  };

  const filled = view.students.filter(s => (values[s.id]?.internal ?? '') !== '').length;
  return (
    <div className="space-y-4 max-w-3xl xl:max-w-6xl">
      <button onClick={onBack} className="min-h-11 flex items-center gap-1 text-sm font-semibold text-blue-800">
        <ChevronLeft className="w-4 h-4" /> My sheets
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">
            {view.assessment.name} · {view.sheet.subject} · Class {view.classSection.grade}-{view.classSection.section}
          </h1>
          <p className="text-sm text-slate-600">Type a number, or AB for absent. 0 means the student wrote the exam and scored zero.</p>
        </div>
        <Pill tone={STATUS_TONE[view.sheet.status]}>{STATUS_LABEL[view.sheet.status]}</Pill>
      </div>
      {view.sheet.status === 'RETURNED' && view.sheet.returnReason && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-900">Returned by the Class Teacher: {view.sheet.returnReason}</div>
      )}
      <SheetGrid view={view} values={view.canEdit ? values : undefined} onChange={view.canEdit ? (id, c, v) => setValues(p => ({ ...p, [id]: { ...p[id], [c]: v } })) : undefined} />
      {view.canEdit ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{filled}/{view.students.length} entered</p>
          <ErrorBox message={error} />
          {done && <p role="status" className="text-sm text-emerald-800">{done}</p>}
          <div className="grid sm:grid-cols-2 gap-2">
            <button onClick={() => save(false)} disabled={Boolean(busy)} className="min-h-12 rounded-xl border border-slate-300 bg-white font-semibold disabled:opacity-50">
              Save draft
            </button>
            <PrimaryButton onClick={() => save(true)} loading={busy === 'submit'}>
              Submit to Class Teacher
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {view.sheet.status === 'SUBMITTED' ? 'Waiting for the Class Teacher to review.' : view.sheet.status === 'ACCEPTED' ? 'Accepted by the Class Teacher. Changes now go through a correction.' : 'Read only.'}
        </p>
      )}
    </div>
  );
};
