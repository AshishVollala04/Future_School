/**
 * Admin UDISE+ export screen:
 *   - Checks active student profiles against required UDISE+ fields
 *   - Shows summary counts, missing-field breakdown, and student rows with gaps
 *   - Exports an Excel-friendly UTF-8 BOM CSV (all rows or only complete rows)
 */
import React, { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Pencil, TriangleAlert } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { udiseService } from '../../../services/udiseService';
import { adminService } from '../../../services/adminService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox } from '../../auth/authUi';
import { StudentEditModal } from './StudentEditModal';

export const AdminUdiseExport: React.FC = () => {
  const scope = useScope();
  const access = useQuery(() => adminService.getAccess(scope), [scope.schoolId, scope.userId]);
  const [classId, setClassId] = useState<string>('ALL');
  const [onlyValid, setOnlyValid] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{ filename: string; rowCount: number; skippedCount: number } | null>(null);
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const canEdit = (access.data?.permissions ?? []).includes('ADMISSIONS');

  const q = useQuery(() => udiseService.validate(classId), [scope.schoolId, classId]);

  const handleDownload = async () => {
    setError(null);
    setBusy(true);
    const res = await udiseService.downloadCsv(classId, onlyValid);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const { blob, filename, rowCount, skippedCount } = res.data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setLastExport({ filename, rowCount, skippedCount });
  };

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const r = q.data;
  const fieldBreakdown = Object.entries(r.missingByField).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-700" /> UDISE+ student export
          </h1>
          <p className="text-sm text-slate-600">
            Validate Aadhaar, APAAR, social category, mother tongue, and address fields before uploading to the UDISE+ portal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="udise-class-filter" className="sr-only">Filter by class</label>
          <select
            id="udise-class-filter"
            value={classId}
            onChange={e => setClassId(e.target.value)}
            className="min-h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm font-medium"
          >
            <option value="ALL">All classes</option>
            {r.classes.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBox message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Panel className="p-4">
          <p className="text-2xl font-extrabold tabular-nums">{r.totalStudents}</p>
          <p className="text-xs text-slate-500">Active students checked</p>
        </Panel>
        <Panel className="p-4 border-emerald-200 bg-emerald-50/40">
          <p className="text-2xl font-extrabold tabular-nums text-emerald-800">{r.readyCount}</p>
          <p className="text-xs text-emerald-800">Ready for UDISE+</p>
        </Panel>
        <Panel className={`p-4 ${r.incompleteCount > 0 ? 'border-amber-200 bg-amber-50/50' : ''}`}>
          <p className={`text-2xl font-extrabold tabular-nums ${r.incompleteCount > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
            {r.incompleteCount}
          </p>
          <p className="text-xs text-amber-900">Rows with missing fields</p>
        </Panel>
      </div>

      <Section title="Export CSV">
        <Panel className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyValid}
                onChange={e => setOnlyValid(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-700"
              />
              Export only students with zero missing fields ({r.readyCount} ready)
            </label>
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy || r.totalStudents === 0 || (onlyValid && r.readyCount === 0)}
              className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {busy ? 'Preparing CSV…' : 'Download UDISE+ CSV'}
            </button>
          </div>
          {lastExport && (
            <p className="text-sm text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Downloaded <b>{lastExport.filename}</b> ({lastExport.rowCount} student rows
              {lastExport.skippedCount > 0 ? `, ${lastExport.skippedCount} incomplete skipped` : ''}).
            </p>
          )}
        </Panel>
      </Section>

      {fieldBreakdown.length > 0 && (
        <Section title="Most common missing fields">
          <Panel className="p-4 flex flex-wrap gap-2">
            {fieldBreakdown.map(([field, count]) => (
              <Pill key={field} tone="warning">{field}: {count}</Pill>
            ))}
          </Panel>
        </Section>
      )}

      <Section title={`Validation issues (${r.issues.length})`}>
        {r.issues.length === 0 ? (
          <EmptyState
            title="All student profiles are UDISE+ ready"
            hint="Every active student in this view has all required UDISE+ fields filled."
            icon={<CheckCircle2 className="w-6 h-6 text-emerald-600" />}
          />
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Admission No</th>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Class</th>
                  <th className="px-4 py-3 font-semibold">Missing UDISE+ fields</th>
                  {canEdit && <th className="px-4 py-3 font-semibold text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.issues.map(row => (
                  <tr key={row.studentId} className="align-top">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{row.admissionNumber || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">{row.name}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {row.className}{row.section ? `-${row.section}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <TriangleAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        {row.missingFields.map(f => (
                          <Pill key={f} tone="danger">{f}</Pill>
                        ))}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditStudentId(row.studentId)}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Fix fields
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </Section>
      <StudentEditModal
        isOpen={Boolean(editStudentId)}
        onClose={() => setEditStudentId(null)}
        studentId={editStudentId}
        classes={r.classes}
        onSaved={() => q.reload()}
      />
    </div>
  );
};
