/**
 * Admin Students, CSV Onboarding & Class/Subject Teacher Setup (/admin/students).
 */
import React, { useState } from 'react';
import { BookOpen, FileSpreadsheet, Plus, Search, Upload, Users } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { adminService } from '../../../services/adminService';
import { CsvImportResult, studentDirectoryService } from '../../../services/studentDirectoryService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { StudentEditModal } from './StudentEditModal';

export const AdminStudents: React.FC = () => {
  const scope = useScope();
  const access = useQuery(() => adminService.getAccess(scope), [scope.schoolId, scope.userId]);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [tab, setTab] = useState<'directory' | 'import' | 'classes'>('directory');

  const studentsQ = useQuery(() => studentDirectoryService.listStudents(applied), [scope.schoolId, applied]);
  const setupQ = useQuery(() => studentDirectoryService.getAcademicsSetup(), [scope.schoolId]);
  const teachersQ = useQuery(() => studentDirectoryService.listTeachers(), [scope.schoolId]);

  const [editId, setEditId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Add teacher form state
  const [tName, setTName] = useState('');
  const [tPhone, setTPhone] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tSubject, setTSubject] = useState('Mathematics');
  const [tDesignation, setTDesignation] = useState('Subject Teacher');
  const [tQual, setTQual] = useState('');
  const [tSaving, setTSaving] = useState(false);

  // CSV import state
  const [csvText, setCsvText] = useState('');
  const [annualFee, setAnnualFee] = useState('40000');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  // Class & subject teacher setup state
  const [newGrade, setNewGrade] = useState('10');
  const [newSection, setNewSection] = useState('C');
  const [allocClass, setAllocClass] = useState('');
  const [allocSubject, setAllocSubject] = useState('Mathematics');
  const [allocTeacher, setAllocTeacher] = useState('');
  const [setupMsg, setSetupMsg] = useState<string | null>(null);
  const [setupErr, setSetupErr] = useState<string | null>(null);

  const canAdmissions = (access.data?.permissions ?? []).includes('ADMISSIONS');
  const canAcademics = (access.data?.permissions ?? []).includes('ACADEMIC_OPS');

  const classOptions = React.useMemo(
    () =>
      (setupQ.data?.classes ?? []).map(c => ({
        id: c.id,
        grade: c.grade,
        section: c.section,
        label: `Class ${c.grade}-${c.section}`
      })),
    [setupQ.data?.classes]
  );

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupErr(null);
    setSetupMsg(null);
    if (!tName.trim() || tPhone.replace(/\D/g, '').length < 10 || !tSubject.trim()) {
      setSetupErr('Enter teacher name, 10-digit mobile number, and primary subject.');
      return;
    }
    setTSaving(true);
    const res = await studentDirectoryService.createTeacher({
      name: tName.trim(),
      phone: tPhone.replace(/\D/g, '').slice(-10),
      email: tEmail.trim() || undefined,
      primarySubject: tSubject.trim(),
      designation: tDesignation.trim() || 'Teacher',
      qualification: tQual.trim() || undefined
    });
    setTSaving(false);
    if (!res.ok) {
      setSetupErr(res.error);
      return;
    }
    setSetupMsg(`Teacher ${res.data.name} (${res.data.teacherId}) added and ready for OTP sign-in.`);
    setTName('');
    setTPhone('');
    setTEmail('');
    setTQual('');
    teachersQ.reload();
    setupQ.reload();
  };

  const downloadTemplate = async () => {
    const res = await studentDirectoryService.getImportTemplate();
    if (!res.ok) {
      setImportError(res.error);
      return;
    }
    const blob = new Blob(['\uFEFF' + res.data.sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'futureschool-students-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    setImportError(null);
    setImportResult(null);
    setImporting(true);
    const res = await studentDirectoryService.importCsv(csvText, Number(annualFee) || 0);
    setImporting(false);
    if (!res.ok) {
      setImportError(res.error);
      return;
    }
    setImportResult(res.data);
    studentsQ.reload();
    setupQ.reload();
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupErr(null);
    setSetupMsg(null);
    const res = await studentDirectoryService.createClass({ gradeNumber: Number(newGrade), section: newSection.trim().toUpperCase() });
    if (!res.ok) {
      setSetupErr(res.error);
      return;
    }
    setSetupMsg(`Class ${newGrade}-${newSection.trim().toUpperCase()} saved.`);
    setupQ.reload();
  };

  const handleAssignSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupErr(null);
    setSetupMsg(null);
    if (!allocClass || !allocTeacher || !allocSubject.trim()) {
      setSetupErr('Choose a class, subject, and teacher.');
      return;
    }
    const res = await studentDirectoryService.assignSubjectTeacher({ classId: allocClass, subject: allocSubject.trim(), staffId: allocTeacher });
    if (!res.ok) {
      setSetupErr(res.error);
      return;
    }
    setSetupMsg(`Assigned ${allocSubject.trim()} in ${allocClass}.`);
    setupQ.reload();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-700" /> Students &amp; class onboarding
          </h1>
          <p className="text-sm text-slate-600">Admit students individually, onboard classes in bulk via CSV, and assign teachers to subjects.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('directory')}
            className={`min-h-10 px-3.5 rounded-xl text-sm font-semibold ${tab === 'directory' ? 'bg-blue-700 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}
          >
            Student directory
          </button>
          {canAdmissions && (
            <button
              type="button"
              onClick={() => setTab('import')}
              className={`min-h-10 px-3.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 ${tab === 'import' ? 'bg-blue-700 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}
            >
              <Upload className="w-4 h-4" /> Bulk CSV onboarding
            </button>
          )}
          {canAcademics && (
            <button
              type="button"
              onClick={() => setTab('classes')}
              className={`min-h-10 px-3.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 ${tab === 'classes' ? 'bg-blue-700 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}
            >
              <BookOpen className="w-4 h-4" /> Classes &amp; teachers
            </button>
          )}
        </div>
      </div>

      {tab === 'directory' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <form
              onSubmit={e => {
                e.preventDefault();
                setApplied(search);
              }}
              className="flex gap-2 flex-1"
            >
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by student name or admission no"
                className={inputClass + ' flex-1'}
                aria-label="Search students"
              />
              <button type="submit" className="min-h-11 px-4 rounded-xl border border-slate-300 font-semibold inline-flex items-center gap-1.5 bg-white">
                <Search className="w-4 h-4" /> Find
              </button>
            </form>
            {canAdmissions && (
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setModalOpen(true);
                }}
                className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Admit student
              </button>
            )}
          </div>

          {studentsQ.status === 'loading' ? (
            <LoadingBlock />
          ) : studentsQ.status === 'error' ? (
            <ErrorState message={studentsQ.error} onRetry={studentsQ.reload} />
          ) : studentsQ.data.length === 0 ? (
            <EmptyState title="No students found" hint="Add a student or import your roster from CSV." />
          ) : (
            <Panel className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Admission No</th>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Class</th>
                    <th className="px-4 py-3 font-semibold">Parent Mobile</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    {canAdmissions && <th className="px-4 py-3 font-semibold text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentsQ.data.map(s => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{s.admissionNumber}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{s.className}-{s.section}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.parentMobile || '—'}</td>
                      <td className="px-4 py-3"><Pill tone={s.status === 'Active' ? 'success' : 'neutral'}>{s.status}</Pill></td>
                      {canAdmissions && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditId(s.id);
                              setModalOpen(true);
                            }}
                            className="text-sm font-semibold text-blue-700 hover:underline"
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      )}

      {tab === 'import' && canAdmissions && (
        <Panel className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="font-bold text-base flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-blue-700" /> Bulk CSV student import</h2>
              <p className="text-sm text-slate-600">Creates students, auto-creates classes &amp; parent accounts (linked by mobile), and schedules Term 1–4 fees.</p>
            </div>
            <button type="button" onClick={downloadTemplate} className="min-h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white">
              Download sample CSV
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-semibold block mb-1">Upload CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (file) setCsvText(await file.text());
                }}
                className="block w-full text-sm text-slate-600"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold block mb-1">Default annual fee per student (₹, if column omitted)</span>
              <input inputMode="numeric" value={annualFee} onChange={e => setAnnualFee(e.target.value.replace(/\D/g, ''))} className={inputClass} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-semibold block mb-1">Or paste CSV rows</span>
            <textarea
              rows={6}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder="Student Name,Class,Section,Parent Name,Parent Mobile,Aadhaar No,APAAR ID"
              className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs"
            />
          </label>
          <ErrorBox message={importError} />
          <PrimaryButton onClick={handleImport} loading={importing} disabled={!csvText.trim()}>
            Import students now
          </PrimaryButton>
          {importResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm space-y-1">
              <p className="font-semibold text-emerald-900">
                Imported {importResult.createdCount} student(s) · {importResult.classesCreated} new class(es) · {importResult.parentsLinked} parent link(s)
              </p>
              {importResult.errors.length > 0 && (
                <ul className="list-disc pl-5 text-amber-900 text-xs">
                  {importResult.errors.map(er => <li key={er.row}>Row {er.row}: {er.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </Panel>
      )}

      {tab === 'classes' && canAcademics && (
        <div className="space-y-4">
          {setupMsg && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">{setupMsg}</p>}
          <ErrorBox message={setupErr} />
          <div className="grid md:grid-cols-2 gap-4">
            <Panel className="p-4 space-y-3">
              <h2 className="font-bold">Create a class / section</h2>
              <form onSubmit={handleCreateClass} className="flex gap-2 items-end">
                <label className="block flex-1 text-sm">
                  <span className="font-semibold block mb-1">Grade (1–12)</span>
                  <input inputMode="numeric" value={newGrade} onChange={e => setNewGrade(e.target.value.replace(/\D/g, ''))} className={inputClass} />
                </label>
                <label className="block w-24 text-sm">
                  <span className="font-semibold block mb-1">Section</span>
                  <input value={newSection} onChange={e => setNewSection(e.target.value.slice(0, 4))} className={inputClass} />
                </label>
                <PrimaryButton type="submit">Add class</PrimaryButton>
              </form>
            </Panel>

            <Panel className="p-4 space-y-3">
              <h2 className="font-bold">Assign subject teacher</h2>
              <form onSubmit={handleAssignSubject} className="space-y-2.5 text-sm">
                <div className="grid sm:grid-cols-3 gap-2">
                  <select value={allocClass} onChange={e => setAllocClass(e.target.value)} className={inputClass}>
                    <option value="">Class</option>
                    {classOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <input value={allocSubject} onChange={e => setAllocSubject(e.target.value)} placeholder="Subject" className={inputClass} />
                  <select value={allocTeacher} onChange={e => setAllocTeacher(e.target.value)} className={inputClass}>
                    <option value="">Teacher</option>
                    {(setupQ.data?.teachers ?? []).map(t => <option key={t.staffId} value={t.staffId}>{t.name}</option>)}
                  </select>
                </div>
                <PrimaryButton type="submit">Save allocation</PrimaryButton>
              </form>
            </Panel>
          </div>

          <Panel className="p-4 space-y-3">
            <h2 className="font-bold">Add a teacher</h2>
            <form onSubmit={handleAddTeacher} className="space-y-2.5 text-sm">
              <div className="grid sm:grid-cols-3 gap-2">
                <input value={tName} onChange={e => setTName(e.target.value)} placeholder="Full name" className={inputClass} required />
                <input value={tPhone} onChange={e => setTPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" inputMode="numeric" className={inputClass} required />
                <input value={tSubject} onChange={e => setTSubject(e.target.value)} list="fs-subjects" placeholder="Primary subject" className={inputClass} required />
              </div>
              <datalist id="fs-subjects">
                <option value="Telugu" />
                <option value="Hindi" />
                <option value="English" />
                <option value="Mathematics" />
                <option value="Physical Science" />
                <option value="Biological Science" />
                <option value="Social Studies" />
              </datalist>
              <div className="grid sm:grid-cols-3 gap-2">
                <input value={tEmail} onChange={e => setTEmail(e.target.value)} type="email" placeholder="School email (optional)" className={inputClass} />
                <input value={tDesignation} onChange={e => setTDesignation(e.target.value)} placeholder="Role (e.g. Class Teacher 8-A)" className={inputClass} />
                <input value={tQual} onChange={e => setTQual(e.target.value)} placeholder="Qualification (optional)" className={inputClass} />
              </div>
              <PrimaryButton type="submit" loading={tSaving}>Add teacher</PrimaryButton>
            </form>
          </Panel>

          {teachersQ.status === 'ready' && teachersQ.data.length > 0 && (
            <Section title={`Faculty (${teachersQ.data.length})`}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {teachersQ.data.map(t => (
                  <Panel key={t.id} className="p-3.5 space-y-1 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold">{t.name}</p>
                      <Pill tone={t.active ? 'success' : 'neutral'}>{t.primarySubject || 'Faculty'}</Pill>
                    </div>
                    <p className="text-xs text-slate-600">{t.designation || 'Teacher'}{t.qualification ? ` · ${t.qualification}` : ''}</p>
                    <p className="text-xs text-slate-500 font-mono">{t.teacherId}{t.phone ? ` · +91 ${t.phone}` : ''}</p>
                  </Panel>
                ))}
              </div>
            </Section>
          )}

          <Section title="Current classes & subject teachers">
            {setupQ.status === 'loading' ? <LoadingBlock /> : setupQ.status === 'error' ? <ErrorState message={setupQ.error} onRetry={setupQ.reload} /> : (
              <div className="grid sm:grid-cols-2 gap-3">
                {setupQ.data.classes.map(c => (
                  <Panel key={c.id} className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <p className="font-bold">Class {c.grade}-{c.section}</p>
                      <span className="text-xs text-slate-500">CT: {c.classTeacherName || 'Unassigned'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.subjectTeachers.length === 0 ? <span className="text-xs text-slate-400">No subject teachers assigned yet</span> : c.subjectTeachers.map(st => (
                        <Pill key={st.subject + st.staffId} tone="neutral">{st.subject}: {st.name}</Pill>
                      ))}
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      <StudentEditModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        studentId={editId}
        classes={classOptions}
        onSaved={() => studentsQ.reload()}
      />
    </div>
  );
};
