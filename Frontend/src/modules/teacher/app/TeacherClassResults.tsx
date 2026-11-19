/**
 * My Class Teacher Responsibility -> Marks review & report cards.
 *  1. Accept or return each subject sheet.
 *  2. Generate report cards (all subjects accepted).
 *  3. Add remarks -> send to Principal.
 *  4. Publish once the Principal has approved EVERY card.
 */
import React, { useState } from 'react';
import { ChevronLeft, Send, Upload } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { academicsService } from '../../../services/academicsService';
import { marksService } from '../../../services/marksService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { CorrectionsLink, SheetGrid, STATUS_LABEL, STATUS_TONE } from './TeacherMarks';
import { ReportCardStatus } from '../../../types/domain';

const CARD_TONE: Record<ReportCardStatus, 'neutral' | 'warning' | 'info' | 'danger' | 'success'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  APPROVED: 'success',
  RETURNED: 'danger',
  PUBLISHED: 'success'
};
const CARD_LABEL: Record<ReportCardStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'With Principal',
  APPROVED: 'Approved',
  RETURNED: 'Returned',
  PUBLISHED: 'Published'
};

export const TeacherClassResults: React.FC = () => {
  const scope = useScope();
  const a = useQuery(() => academicsService.getTeacherAssignments(scope), [scope.schoolId, scope.userId]);
  const ct = a.data?.classTeacherOf ?? null;
  const assessments = useQuery(() => (ct ? marksService.openAssessments(scope, ct.grade) : Promise.resolve({ ok: true as const, data: [] })), [scope.schoolId, ct?.id]);
  const assessment = assessments.data?.[0];
  const key = [scope.schoolId, ct?.id, assessment?.id];
  const sheets = useQuery(() => (ct && assessment ? marksService.listClassSheets(scope, assessment.id, ct.id) : Promise.resolve({ ok: true as const, data: [] })), key);
  const cards = useQuery(() => (ct && assessment ? marksService.listReportCards(scope, assessment.id, ct.id) : Promise.resolve({ ok: true as const, data: [] })), key);
  const [openSheet, setOpenSheet] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (a.status === 'loading' || assessments.status === 'loading') return <LoadingBlock />;
  if (!ct) return <EmptyState title="This is a Class Teacher responsibility" />;
  if (!assessment) return <EmptyState title="No open assessment for your class" />;
  if (openSheet) return <ReviewSheet sheetId={openSheet} onBack={() => { setOpenSheet(null); sheets.reload(); }} />;

  const run = async (label: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(label);
    setError(null);
    setDone(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setError(r.error ?? 'Something went wrong.');
    else setDone(success);
    sheets.reload();
    cards.reload();
  };

  const s = sheets.data ?? [];
  const c = cards.data ?? [];
  const allAccepted = s.length > 0 && s.every(x => x.sheet.status === 'ACCEPTED');
  const editable = c.filter(x => x.status === 'DRAFT' || x.status === 'RETURNED');
  const approved = c.filter(x => x.status === 'APPROVED').length;
  const published = c.length > 0 && c.every(x => x.status === 'PUBLISHED');

  const saveRemarksThenSubmit = () =>
    run(
      'submit',
      async () => {
        for (const card of editable) {
          const text = remarks[card.id] ?? card.classTeacherRemark;
          if (text !== card.classTeacherRemark) {
            const r = await marksService.updateRemark(scope, card.id, text);
            if (!r.ok) return r;
          }
        }
        return marksService.submitToPrincipal(scope, assessment.id, ct.id);
      },
      'Report cards sent to the Principal.'
    );

  return (
    <div className="space-y-6 max-w-4xl xl:max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-800">My Class Teacher responsibility</p>
          <h1 className="text-xl font-bold">{assessment.name} results · Class {ct.grade}-{ct.section}</h1>
          <p className="text-sm text-slate-600">Accept every subject, generate report cards, send them to the Principal, then publish once all are approved.</p>
        </div>
        <CorrectionsLink />
      </div>
      <ErrorBox message={error} />
      {done && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">{done}</p>}

      <Section title="1. Subject marks">
        {sheets.status === 'loading' ? (
          <LoadingBlock />
        ) : sheets.status === 'error' ? (
          <ErrorState message={sheets.error} onRetry={sheets.reload} />
        ) : (
          <Panel className="divide-y divide-slate-100">
            {s.map(x => (
              <button key={x.sheet.id} onClick={() => setOpenSheet(x.sheet.id)} className="w-full p-3.5 flex items-center gap-3 text-left hover:bg-slate-50">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold">{x.sheet.subject}</span>
                  <span className="block text-sm text-slate-500">{x.teacherName} · {x.entered}/{x.total} entered</span>
                </span>
                <Pill tone={STATUS_TONE[x.sheet.status]}>{STATUS_LABEL[x.sheet.status]}</Pill>
              </button>
            ))}
          </Panel>
        )}
      </Section>

      <Section title="2. Report cards">
        {c.length === 0 ? (
          <Panel className="p-4 space-y-2">
            <p className="text-sm text-slate-600">{allAccepted ? 'All subjects accepted. Generate report cards.' : 'Accept every subject first.'}</p>
            <PrimaryButton disabled={!allAccepted} loading={busy === 'gen'} onClick={() => run('gen', () => marksService.generateReportCards(scope, assessment.id, ct.id), 'Report cards generated. Add remarks next.')}>
              Generate report cards
            </PrimaryButton>
          </Panel>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 text-sm">
              <Pill tone="neutral">{c.length} cards</Pill>
              <Pill tone="success">{approved} approved</Pill>
              {c.some(x => x.status === 'RETURNED') && <Pill tone="danger">{c.filter(x => x.status === 'RETURNED').length} returned</Pill>}
              {c.some(x => x.status === 'SUBMITTED') && <Pill tone="info">{c.filter(x => x.status === 'SUBMITTED').length} with Principal</Pill>}
            </div>
            <Panel className="divide-y divide-slate-100">
              {c.map(card => {
                const canEdit = card.status === 'DRAFT' || card.status === 'RETURNED';
                const total = card.subjects.reduce((acc, x) => acc + (x.internal === 'AB' ? 0 : x.internal) + (x.external === 'AB' ? 0 : x.external), 0);
                const max = card.subjects.reduce((acc, x) => acc + x.maxInternal + x.maxExternal, 0);
                return (
                  <div key={card.id} className="p-3.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-semibold">{card.rollNumber}. {card.studentName}</span>
                      <span className="text-sm font-mono text-slate-500">{total}/{max}</span>
                      <Pill tone={CARD_TONE[card.status]}>{CARD_LABEL[card.status]}</Pill>
                    </div>
                    <p className="text-xs text-slate-500">
                      {card.subjects.map(x => `${x.subject} ${x.internal}`).join(' · ')}
                    </p>
                    {card.status === 'RETURNED' && card.principalNote && <p className="text-sm text-rose-800">Principal: {card.principalNote}</p>}
                    {canEdit ? (
                      <input
                        value={remarks[card.id] ?? card.classTeacherRemark}
                        onChange={e => setRemarks(r => ({ ...r, [card.id]: e.target.value.slice(0, 300) }))}
                        placeholder="Class teacher remark"
                        className={`${inputClass} py-2`}
                      />
                    ) : (
                      <p className="text-sm text-slate-700">“{card.classTeacherRemark}”</p>
                    )}
                  </div>
                );
              })}
            </Panel>
            {editable.length > 0 && (
              <PrimaryButton loading={busy === 'submit'} onClick={saveRemarksThenSubmit}>
                <Send className="w-4 h-4" /> Send {editable.length} card(s) to Principal
              </PrimaryButton>
            )}
          </>
        )}
      </Section>

      {c.length > 0 && (
        <Section title="3. Publish">
          <Panel className="p-4 space-y-2">
            {published ? (
              <p className="text-sm text-emerald-800 font-semibold">Published. Parents can now see these results.</p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  {approved === c.length ? 'All cards approved by the Principal. Publishing makes results visible to parents.' : `Publication waits until all cards are approved (${approved}/${c.length}).`}
                </p>
                <PrimaryButton disabled={approved !== c.length} loading={busy === 'pub'} onClick={() => run('pub', () => marksService.publish(scope, assessment.id, ct.id), 'Results published to parents.')}>
                  <Upload className="w-4 h-4" /> Publish results
                </PrimaryButton>
              </>
            )}
          </Panel>
        </Section>
      )}
    </div>
  );
};

const ReviewSheet: React.FC<{ sheetId: string; onBack: () => void }> = ({ sheetId, onBack }) => {
  const scope = useScope();
  const q = useQuery(() => marksService.getSheet(scope, sheetId), [scope.schoolId, sheetId]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} />;
  const v = q.data;
  const act = async (action: 'ACCEPT' | 'RETURN') => {
    setBusy(true);
    setError(null);
    const r = await marksService.reviewSheet(scope, sheetId, action, reason);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onBack();
  };
  return (
    <div className="space-y-4 max-w-3xl xl:max-w-6xl">
      <button onClick={onBack} className="min-h-11 flex items-center gap-1 text-sm font-semibold text-blue-800">
        <ChevronLeft className="w-4 h-4" /> Back to class results
      </button>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{v.sheet.subject} · Class {v.classSection.grade}-{v.classSection.section}</h1>
        <Pill tone={STATUS_TONE[v.sheet.status]}>{STATUS_LABEL[v.sheet.status]}</Pill>
      </div>
      <SheetGrid view={v} />
      {v.canReview ? (
        <Panel className="p-3.5 space-y-2">
          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1">Reason (needed to return)</span>
            <input value={reason} onChange={e => setReason(e.target.value.slice(0, 200))} className={inputClass} placeholder="e.g. Roll 05 marks look wrong" />
          </label>
          <ErrorBox message={error} />
          <div className="grid sm:grid-cols-2 gap-2">
            <button onClick={() => act('RETURN')} disabled={busy} className="min-h-12 rounded-xl border border-rose-300 text-rose-800 font-semibold bg-white disabled:opacity-50">
              Return to subject teacher
            </button>
            <PrimaryButton onClick={() => act('ACCEPT')} loading={busy}>Accept</PrimaryButton>
          </div>
        </Panel>
      ) : (
        <p className="text-sm text-slate-600">{v.sheet.status === 'ACCEPTED' ? 'Accepted.' : 'Waiting for the subject teacher to submit.'}</p>
      )}
    </div>
  );
};
