/**
 * Shared modal to admit a new student or update an existing student's profile & UDISE+ fields.
 */
import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { StudentProfileDTO, studentDirectoryService } from '../../../services/studentDirectoryService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentId?: string | null;
  classes: Array<{ id: string; grade?: number; section?: string; label?: string }>;
  onSaved: () => void;
}

const EMPTY_FORM: Partial<StudentProfileDTO> = {
  name: '',
  admissionNumber: '',
  dob: '',
  gender: 'Male',
  classId: '',
  className: 'Class 10',
  section: 'A',
  roll: '',
  fatherName: '',
  motherName: '',
  parentName: '',
  parentMobile: '',
  parentEmail: '',
  aadhaarNumber: '',
  apaarId: '',
  casteCategory: 'General',
  religion: '',
  motherTongue: 'Telugu',
  mediumOfInstruction: 'English',
  address: '',
  district: '',
  mandal: '',
  pincode: '',
  feeBalance: 0
};

export const StudentEditModal: React.FC<Props> = ({ isOpen, onClose, studentId, classes, onSaved }) => {
  const [form, setForm] = useState<Partial<StudentProfileDTO>>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (!studentId) {
      const first = classes[0];
      setForm({
        ...EMPTY_FORM,
        classId: first?.id ?? '',
        className: first?.grade ? `Class ${first.grade}` : 'Class 10',
        section: first?.section ?? 'A'
      });
      return;
    }
    setLoading(true);
    studentDirectoryService.getStudent(studentId).then(res => {
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setForm({ ...EMPTY_FORM, ...res.data });
    });
  }, [isOpen, studentId, classes]);

  const set = (k: keyof StudentProfileDTO, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

  const onClassSelect = (cid: string) => {
    const match = classes.find(c => c.id === cid);
    setForm(prev => ({
      ...prev,
      classId: cid,
      className: match?.grade ? `Class ${match.grade}` : prev.className,
      section: match?.section ?? prev.section
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      setError('Student name is required.');
      return;
    }
    if (!form.classId) {
      setError('Select a class.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = { ...form };
    if (!payload.parentName && payload.fatherName) payload.parentName = payload.fatherName;
    const res = studentId
      ? await studentDirectoryService.updateStudent(studentId, payload)
      : await studentDirectoryService.createStudent(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={() => !saving && onClose()} title={studentId ? 'Edit student & UDISE+ profile' : 'Admit new student'}>
      {loading ? (
        <p className="py-6 text-sm text-slate-500">Loading student record…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 text-sm max-h-[75vh] overflow-y-auto pr-1">
          <ErrorBox message={error} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="block">
              <span className="font-semibold block mb-1">Student name *</span>
              <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} className={inputClass} required />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Admission no</span>
              <input value={form.admissionNumber ?? ''} onChange={e => set('admissionNumber', e.target.value)} placeholder="Auto if blank" className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Class *</span>
              <select value={form.classId ?? ''} onChange={e => onClassSelect(e.target.value)} className={inputClass}>
                <option value="">Choose class</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.label ?? (c.grade ? `${c.grade}-${c.section}` : c.id)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Roll no</span>
              <input value={form.roll ?? ''} onChange={e => set('roll', e.target.value)} placeholder="01" className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Date of birth</span>
              <input type="date" value={form.dob ?? ''} onChange={e => set('dob', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Gender</span>
              <select value={form.gender ?? 'Male'} onChange={e => set('gender', e.target.value)} className={inputClass}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Aadhaar (12 digits)</span>
              <input value={form.aadhaarNumber ?? ''} onChange={e => set('aadhaarNumber', e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="123456789012" className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">APAAR ID</span>
              <input value={form.apaarId ?? ''} onChange={e => set('apaarId', e.target.value.slice(0, 32))} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Caste category</span>
              <select value={form.casteCategory ?? ''} onChange={e => set('casteCategory', e.target.value)} className={inputClass}>
                <option value="">Select</option>
                <option value="General">General</option>
                <option value="OBC">OBC</option>
                <option value="BC">BC</option>
                <option value="SC">SC</option>
                <option value="ST">ST</option>
              </select>
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Religion</span>
              <input value={form.religion ?? ''} onChange={e => set('religion', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Mother tongue</span>
              <input value={form.motherTongue ?? ''} onChange={e => set('motherTongue', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Medium of instruction</span>
              <input value={form.mediumOfInstruction ?? ''} onChange={e => set('mediumOfInstruction', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Father's name</span>
              <input value={form.fatherName ?? ''} onChange={e => set('fatherName', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Mother's name</span>
              <input value={form.motherName ?? ''} onChange={e => set('motherName', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Parent mobile (10 digits)</span>
              <input value={form.parentMobile ?? ''} onChange={e => set('parentMobile', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210" className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">District</span>
              <input value={form.district ?? ''} onChange={e => set('district', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">Mandal</span>
              <input value={form.mandal ?? ''} onChange={e => set('mandal', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold block mb-1">PIN code (6 digits)</span>
              <input value={form.pincode ?? ''} onChange={e => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className="font-semibold block mb-1">Address</span>
            <input value={form.address ?? ''} onChange={e => set('address', e.target.value)} className={inputClass} />
          </label>
          {!studentId && (
            <label className="block">
              <span className="font-semibold block mb-1">Annual school fee (₹, auto-split across Term 1–4)</span>
              <input
                inputMode="numeric"
                value={form.feeBalance ?? 0}
                onChange={e => set('feeBalance', Number(e.target.value.replace(/\D/g, '') || 0))}
                className={inputClass}
              />
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-11 px-4 rounded-xl border border-slate-300 font-semibold">
              Cancel
            </button>
            <PrimaryButton type="submit" loading={saving}>
              {studentId ? 'Save changes' : 'Admit student'}
            </PrimaryButton>
          </div>
        </form>
      )}
    </Modal>
  );
};
