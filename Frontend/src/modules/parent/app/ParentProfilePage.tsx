/**
 * Student profile (opened from the avatar in the parent header).
 * Shows the child's details, class teacher and subject teachers, and lets the parent set a photo.
 * The photo is stored on this device only (no server upload exists yet).
 */
import React, { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { ErrorState, LoadingBlock, Panel, Section } from '../../../components/common/States';
import { readStudentPhoto, shrinkPhoto, writeStudentPhoto } from '../../../utils/studentPhoto';

// The picked file can be a full-size phone photo; it is shrunk before saving (see shrinkPhoto).
const MAX_BYTES = 10 * 1024 * 1024;

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between gap-3 p-3.5 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="font-semibold text-right min-w-0 break-words">{value}</span>
  </div>
);

export const ParentProfilePage: React.FC = () => {
  const scope = useScope();
  const { currentUser } = useAuth();
  const child = currentUser?.activeChild;
  const studentId = scope.studentId ?? child?.id ?? '';
  const q = useQuery(() => academicsService.getOverview(scope), [scope.schoolId, scope.studentId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(() => readStudentPhoto(studentId));
  const [photoError, setPhotoError] = useState<string | null>(null);

  const onPick = (file: File | undefined) => {
    setPhotoError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file (JPG or PNG).');
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhotoError('This image is larger than 10 MB. Please choose a smaller one.');
      return;
    }
    shrinkPhoto(file)
      .then(dataUrl => {
        if (!writeStudentPhoto(studentId, dataUrl)) {
          setPhotoError('Could not save the photo on this device. Try a smaller image.');
          return;
        }
        setPhoto(dataUrl);
      })
      .catch(() => setPhotoError('This photo format is not supported here. Please choose a JPG or PNG.'));
  };

  const removePhoto = () => {
    writeStudentPhoto(studentId, null);
    setPhoto(null);
    setPhotoError(null);
  };

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  if (q.status !== 'ready') return null;

  const { student, classSection } = q.data;

  return (
    <div className="space-y-6 pt-2">
      <h1 className="text-xl font-extrabold tracking-tight">Student profile</h1>

      <Panel className="p-4 flex items-center gap-4">
        <img
          src={photo ?? child?.avatar}
          alt={student.name}
          className="w-24 h-24 shrink-0 rounded-2xl object-cover bg-blue-50 ring-1 ring-slate-200"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="font-bold text-lg truncate">{student.name}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="min-h-11 px-3.5 rounded-xl bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> {photo ? 'Change photo' : 'Upload photo'}
            </button>
            {photo && (
              <button
                type="button"
                onClick={removePhoto}
                className="min-h-11 px-3.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              onPick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {photoError && <p role="alert" className="text-sm text-rose-700">{photoError}</p>}
          <p className="text-xs text-slate-500">JPG or PNG, up to 10 MB. Saved on this device.</p>
        </div>
      </Panel>

      <Section title="Student details">
        <Panel className="divide-y divide-slate-100">
          <Row label="Admission no." value={student.admissionNo} />
          <Row label="Class" value={`${classSection.grade}-${classSection.section}`} />
          <Row label="Roll number" value={student.rollNumber} />
          <Row label="School" value={child?.schoolName ?? '—'} />
          <Row label="Status" value={student.status} />
        </Panel>
      </Section>

      <Section title="Class teacher">
        <Panel className="p-4">
          <p className="font-semibold">{classSection.classTeacherName}</p>
          <p className="text-sm text-slate-500">Class teacher, {classSection.grade}-{classSection.section}</p>
        </Panel>
      </Section>

      {classSection.subjectTeachers.length > 0 && (
        <Section title="Subject teachers">
          <Panel className="divide-y divide-slate-100">
            {classSection.subjectTeachers.map(s => (
              <Row key={`${s.subject}-${s.staffId}`} label={s.subject} value={s.name} />
            ))}
          </Panel>
        </Section>
      )}
    </div>
  );
};
