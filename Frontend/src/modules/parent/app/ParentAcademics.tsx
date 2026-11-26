/**
 * Child View (read-only): timetable, homework, attendance, exams (hall ticket + published results).
 * Parents cannot submit homework, edit marks or attendance, or see unpublished marks.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, Lock } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { useTenant } from '../../../context/TenantContext';
import { examOrder, gradeForPercentage } from '../../../services/boardProfileService';
import { academicsService } from '../../../services/academicsService';
import { hallTicketService } from '../../../services/hallTicketService';
import { PdfService } from '../../../services/pdfService';
import { EmptyState, ErrorState, LoadingBlock, Panel, Pill, Section } from '../../../components/common/States';
import { formatDate, isoWeekday } from '../../../utils/date';
import { MarkValue, PublishedResult, TimetableSlot } from '../../../types/domain';
import { AttendanceCalendar } from './ParentAttendance';

const TABS = ['timetable', 'homework', 'attendance', 'exams'] as const;
type Tab = (typeof TABS)[number];

export const ParentAcademics: React.FC = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'timetable') as Tab;

  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-200/70">
        {TABS.map(x => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            onClick={() => setParams({ tab: x }, { replace: true })}
            className={`min-h-11 rounded-xl text-sm font-semibold ${tab === x ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600'}`}
          >
            {t(`parent.academics.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'timetable' && <TimetableTab />}
      {tab === 'homework' && <HomeworkTab />}
      {tab === 'attendance' && <AttendanceCalendar />}
      {tab === 'exams' && <ExamsTab />}
    </div>
  );
};

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const TimetableTab: React.FC = () => {
  const { t } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => academicsService.getTimetable(scope), [scope.schoolId, scope.studentId], { refreshOnDataChange: true, refreshIntervalMs: 60_000 });
  const [day, setDay] = React.useState<number>(Math.min(isoWeekday(), 6));
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const slots = q.data.filter((s: TimetableSlot) => s.day === day);
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DAY_KEYS.map((d, i) => (
          <button
            key={d}
            onClick={() => setDay(i + 1)}
            className={`min-h-11 min-w-12 px-3 rounded-xl text-sm font-semibold border ${day === i + 1 ? 'bg-blue-700 text-white border-blue-700' : 'bg-white border-slate-200 text-slate-700'}`}
          >
            {t(`parent.days.${d}`)}
          </button>
        ))}
      </div>
      {slots.length === 0 ? (
        <EmptyState title={t('parent.home.noClassesToday')} />
      ) : (
        <Panel className="divide-y divide-slate-100">
          {slots.map(s => (
            <div key={s.period} className="flex items-center gap-3 px-3.5 py-3">
              <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-800 text-sm font-bold flex items-center justify-center">{s.period}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-base font-semibold truncate">{s.subject}</span>
                <span className="block text-sm text-slate-500 truncate">{s.teacherName}</span>
              </span>
              <span className="text-sm font-mono text-slate-500">{s.start}</span>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
};

const HomeworkTab: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const q = useQuery(() => academicsService.getHomework(scope), [scope.schoolId, scope.studentId], { refreshOnDataChange: true, refreshIntervalMs: 45_000 });
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  if (q.data.length === 0) return <EmptyState title={t('parent.academics.noHomework')} />;
  return (
    <ul className="space-y-2.5">
      {q.data.map(h => (
        <li key={h.id}>
          <Panel className={`p-3.5 ${h.overdue ? 'border-amber-300' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-800">{h.subject} · {h.teacherName}</p>
                <p className="text-base font-semibold">{h.title}</p>
              </div>
              {h.overdue ? (
                <Pill tone="warning">{t('parent.academics.overdue')}</Pill>
              ) : h.status === 'PENDING' ? (
                <Pill tone="neutral">{t('parent.academics.pending')}</Pill>
              ) : (
                <Pill tone="success">{t(`parent.academics.hw_${h.status}`)}</Pill>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-1">{h.instructions}</p>
            <p className="text-xs text-slate-500 mt-2">
              {t('parent.academics.due', { date: formatDate(h.dueOn, i18n.language) })} · {t(`parent.academics.sub_${h.submissionType}`)}
            </p>
          </Panel>
        </li>
      ))}
    </ul>
  );
};

const fmtMark = (v: MarkValue) => (v === 'AB' ? 'AB' : String(v));

const normExam = (name: string) => name.trim().toUpperCase().replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, '-');
/** Position of an exam in the school year for this board; unknown names go last. */
const examRank = (order: string[], name: string) => {
  const idx = order.map(normExam).indexOf(normExam(name));
  return idx === -1 ? 99 : idx;
};

const ResultCard: React.FC<{ r: PublishedResult }> = ({ r }) => {
  const { t, i18n } = useTranslation();
  const { boardProfile } = useTenant();
  const showExternal = r.subjects.some(s => s.maxExternal > 0);
  const hasSplitScience = useMemo(
    () => r.subjects.some(s => /^physical science$/i.test(s.subject)) && r.subjects.some(s => /^biolog/i.test(s.subject)),
    [r.subjects]
  );

  const summary = useMemo(() => {
    let scored = 0;
    let maxTotal = 0;
    let hasFail = false;
    for (const s of r.subjects) {
      const subMax = s.maxInternal + (showExternal ? s.maxExternal : 0);
      maxTotal += subMax;
      const extVal = showExternal ? s.external : 0;
      if (s.internal === 'AB' || extVal === 'AB') {
        hasFail = true;
        if (s.internal !== 'AB') scored += s.internal;
        if (showExternal && extVal !== 'AB') scored += extVal;
        continue;
      }
      const subScore = s.internal + extVal;
      scored += subScore;
      if (subScore < s.passMark) hasFail = true;
    }
    const pct = maxTotal > 0 ? Math.round((scored / maxTotal) * 1000) / 10 : 0;
    return { scored, maxTotal, pct, grade: gradeForPercentage(boardProfile, pct), hasFail };
  }, [r.subjects, showExternal, boardProfile]);

  return (
    <Panel className={`p-3.5 ${r.status === 'SUPERSEDED' ? 'opacity-75' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-base font-bold text-slate-900">{r.examName}</p>
        <span className="flex items-center gap-1.5">
          <Pill tone={r.status === 'CURRENT' ? 'success' : 'neutral'}>v{r.version} · {t(`parent.academics.${r.status}`)}</Pill>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-center">
        <div>
          <p className="text-[11px] font-medium text-slate-500">{t('parent.academics.total')}</p>
          <p className="text-sm font-bold font-mono text-slate-900">{summary.scored}/{summary.maxTotal}</p>
        </div>
        <div className="border-x border-slate-200">
          <p className="text-[11px] font-medium text-slate-500">{t('parent.academics.percentage')}</p>
          <p className="text-sm font-bold font-mono text-blue-800">{summary.pct}%</p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500">{t('parent.academics.grade')}</p>
          <p className={`text-sm font-bold ${summary.hasFail ? 'text-amber-700' : 'text-emerald-700'}`}>
            {summary.grade} · {summary.hasFail ? t('parent.academics.needsAttention') : t('parent.academics.passed')}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px] sm:text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-2 font-medium">{t('parent.academics.subject')}</th>
              <th className="py-2 px-2 font-medium text-right whitespace-nowrap">{t('parent.academics.internal')}</th>
              {showExternal && <th className="py-2 px-2 font-medium text-right whitespace-nowrap">{t('parent.academics.external')}</th>}
              {showExternal && <th className="py-2 pl-2 font-medium text-right whitespace-nowrap">{t('parent.academics.total')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {r.subjects.map(s => {
              const absent = s.internal === 'AB' || (showExternal && s.external === 'AB');
              const subTotal = absent ? 'AB' : (s.internal as number) + (showExternal ? (s.external as number) : 0);
              const subMax = s.maxInternal + (showExternal ? s.maxExternal : 0);
              const failed = !absent && (subTotal as number) < s.passMark;
              return (
                <tr key={s.subject}>
                  <td className="py-2 pr-2 font-medium text-slate-800">{s.subject}</td>
                  <td className={`py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap ${s.internal === 'AB' ? 'text-amber-700 font-semibold' : (!showExternal && failed) ? 'text-rose-700 font-semibold' : ''}`}>
                    {fmtMark(s.internal)}/{s.maxInternal}
                  </td>
                  {showExternal && (
                    <td className={`py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap ${s.external === 'AB' ? 'text-amber-700 font-semibold' : ''}`}>
                      {fmtMark(s.external)}/{s.maxExternal}
                    </td>
                  )}
                  {showExternal && (
                    <td className={`py-2 pl-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold ${absent ? 'text-amber-700' : failed ? 'text-rose-700' : 'text-slate-900'}`}>
                      {subTotal === 'AB' ? 'AB' : `${subTotal}/${subMax}`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showExternal && hasSplitScience && (
        <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 mt-2">
          {t('parent.academics.scienceFormulaNote')}
        </p>
      )}
      {r.classTeacherRemark && <p className="text-sm text-slate-600 mt-2.5">“{r.classTeacherRemark}”</p>}
      <p className="text-xs text-slate-500 mt-2">
        {t('parent.academics.publishedOn', { date: formatDate(r.publishedOn, i18n.language) })} · {t('parent.academics.abNote')}
      </p>
    </Panel>
  );
};

interface ExamGroup {
  examName: string;
  current: PublishedResult;
  superseded: PublishedResult[];
}

const ExamResultsCarousel: React.FC<{ data: PublishedResult[]; showHistory: boolean }> = ({ data, showHistory }) => {
  const { t } = useTranslation();
  const { boardProfile } = useTenant();
  const order = useMemo(() => examOrder(boardProfile), [boardProfile]);
  const examGroups = useMemo<ExamGroup[]>(() => {
    const byExam = new Map<string, PublishedResult[]>();
    for (const r of data) {
      const list = byExam.get(r.examName) ?? [];
      list.push(r);
      byExam.set(r.examName, list);
    }
    const groups: ExamGroup[] = [];
    for (const [examName, list] of byExam.entries()) {
      const sorted = [...list].sort((a, b) =>
        a.status !== b.status ? (a.status === 'CURRENT' ? -1 : 1) : b.version - a.version
      );
      groups.push({ examName, current: sorted[0], superseded: sorted.slice(1) });
    }
    groups.sort((a, b) => {
      const rankDiff = examRank(order, a.examName) - examRank(order, b.examName);
      if (rankDiff !== 0) return rankDiff;
      return a.current.publishedOn.localeCompare(b.current.publishedOn);
    });
    return groups;
  }, [data, order]);

  const [activeIdx, setActiveIdx] = useState(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setActiveIdx(i => (examGroups.length === 0 ? 0 : Math.min(i, examGroups.length - 1)));
  }, [examGroups.length]);

  const goPrev = () => setActiveIdx(i => Math.max(0, i - 1));
  const goNext = () => setActiveIdx(i => Math.min(examGroups.length - 1, i + 1));

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    pointerStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!pointerStart.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - pointerStart.current.x;
    const dy = touch.clientY - pointerStart.current.y;
    pointerStart.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    pointerStart.current = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  if (examGroups.length === 0) return null;
  const active = examGroups[activeIdx] ?? examGroups[0];

  return (
    <div
      className="space-y-3 select-none"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') goNext();
        else if (e.key === 'ArrowLeft') goPrev();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {examGroups.length > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={activeIdx === 0}
            aria-label={t('parent.academics.prevExam')}
            className="min-h-10 min-w-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-35"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div role="tablist" aria-label={t('parent.academics.results')} className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {examGroups.map((g, idx) => (
              <button
                key={g.examName}
                type="button"
                role="tab"
                aria-selected={idx === activeIdx}
                onClick={() => setActiveIdx(idx)}
                className={`min-h-9 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  idx === activeIdx
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {g.examName}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={goNext}
            disabled={activeIdx === examGroups.length - 1}
            aria-label={t('parent.academics.nextExam')}
            className="min-h-10 min-w-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-35"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="space-y-2.5">
        <ResultCard key={active.current.id} r={active.current} />
        {showHistory && active.superseded.map(old => <ResultCard key={old.id} r={old} />)}
      </div>

      {examGroups.length > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>{t('parent.academics.swipeHint')}</span>
          <div className="flex items-center gap-1.5">
            {examGroups.map((g, idx) => (
              <button
                key={g.examName}
                type="button"
                aria-label={g.examName}
                onClick={() => setActiveIdx(idx)}
                className={`h-2 rounded-full transition-all ${idx === activeIdx ? 'w-5 bg-blue-700' : 'w-2 bg-slate-300'}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ExamsTab: React.FC = () => {
  const { t, i18n } = useTranslation();
  const scope = useScope();
  const { school } = useTenant();
  const live = { refreshOnDataChange: true, refreshIntervalMs: 45_000 };
  const tickets = useQuery(() => hallTicketService.getForStudent(scope), [scope.schoolId, scope.studentId], live);
  const results = useQuery(() => academicsService.getPublishedResults(scope), [scope.schoolId, scope.studentId], live);
  const [showHistory, setShowHistory] = React.useState(false);

  return (
    <div className="space-y-6">
      <Section title={t('parent.academics.hallTicket')}>
        {tickets.status === 'loading' ? (
          <LoadingBlock lines={1} />
        ) : tickets.status === 'error' ? (
          <ErrorState message={tickets.error} onRetry={tickets.reload} />
        ) : tickets.data.length === 0 ? (
          <EmptyState title={t('parent.academics.noExams')} />
        ) : (
          tickets.data.map(h => (
            <Panel key={h.exam.id} className="p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-bold">{h.exam.name}</p>
                <p className="text-sm text-slate-500">{t('parent.academics.starts', { date: formatDate(h.exam.startsOn, i18n.language) })}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Pill tone={h.feeClearance === 'CLEARED' ? 'success' : 'warning'}>
                  {t('parent.academics.fee')}: {t(`parent.academics.${h.feeClearance}`)}
                </Pill>
                <Pill tone={h.release ? 'success' : 'neutral'}>
                  {h.release ? t('parent.academics.released') : t('parent.academics.notReleased')}
                </Pill>
              </div>
              {h.pendingReasons.length > 0 && (
                <ul className="text-sm text-amber-900 list-disc pl-5">
                  {h.pendingReasons.map(r => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              {h.available ? (
                <button
                  type="button"
                  onClick={() =>
                    PdfService.printHallTicket({
                      studentName: h.student.name,
                      studentId: h.student.id,
                      className: String(h.student.grade),
                      section: h.student.section,
                      schoolName: school?.name ?? '',
                      schoolCode: school?.id ?? '',
                      examName: h.exam.name,
                      academicYear: school?.academicYear.label ?? '',
                      subjects: h.subjects ?? [],
                      hallTicketNo: h.hallTicketNo ?? ''
                    })
                  }
                  className="w-full min-h-12 rounded-xl bg-blue-700 text-white font-semibold flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> {t('parent.academics.downloadTicket', { no: h.hallTicketNo })}
                </button>
              ) : (
                <p className="text-sm text-slate-600 flex items-start gap-2">
                  <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                  {h.feeClearance === 'PENDING' ? t('parent.academics.ticketNeedsFee') : t('parent.academics.ticketNeedsRelease')}
                </p>
              )}
            </Panel>
          ))
        )}
      </Section>

      <Section
        title={t('parent.academics.results')}
        action={
          results.status === 'ready' && results.data.some(r => r.status === 'SUPERSEDED') ? (
            <button className="min-h-11 text-sm font-semibold text-blue-800" onClick={() => setShowHistory(v => !v)}>
              {showHistory ? t('parent.academics.hideHistory') : t('parent.academics.showHistory')}
            </button>
          ) : undefined
        }
      >
        {results.status === 'loading' ? (
          <LoadingBlock lines={1} />
        ) : results.status === 'error' ? (
          <ErrorState message={results.error} onRetry={results.reload} />
        ) : results.data.length === 0 ? (
          <EmptyState title={t('parent.academics.notPublished')} hint={t('parent.academics.notPublishedHint')} />
        ) : (
          <ExamResultsCarousel data={results.data} showHistory={showHistory} />
        )}
      </Section>
    </div>
  );
};
