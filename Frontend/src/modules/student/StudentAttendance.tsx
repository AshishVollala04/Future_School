import React, { useEffect, useMemo, useState } from 'react';
import {
  AttendanceRecordDTO,
  AttendanceSummaryDTO,
  StudentApiService
} from '../../services/studentApiService';
import { USE_BACKEND } from '../../app/backendConfig';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, StatCard } from '../../components/common/PageHeader';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState, LoadingBlock, MockLabel } from '../../components/common/States';
import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Info,
  Sparkles,
  XCircle
} from 'lucide-react';
import { AttendanceDayLog, STUDENT_ATTENDANCE_OCTOBER } from '../../mock/academicData';

function toDayLog(r: AttendanceRecordDTO): AttendanceDayLog {
  const day = Number((r.date || '').split('-')[2] || '0');
  const mapped: AttendanceDayLog['status'] =
    r.status === 'PRESENT'
      ? 'PRESENT'
      : r.status === 'LATE'
      ? 'LATE'
      : r.status === 'ABSENT'
      ? 'ABSENT'
      : 'HOLIDAY';
  return {
    day,
    date: r.date,
    status: mapped,
    remarks: r.remarks
  };
}

function shortCode(status: AttendanceDayLog['status']): string {
  if (status === 'ABSENT') return 'AB';
  if (status === 'PRESENT') return 'P';
  if (status === 'LATE') return 'LATE';
  if (status === 'HOLIDAY') return 'HOL';
  return 'OFF';
}

export const StudentAttendance: React.FC = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState<boolean>(USE_BACKEND);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveRecords, setLiveRecords] = useState<AttendanceRecordDTO[] | null>(null);
  const [dbSummary, setDbSummary] = useState<AttendanceSummaryDTO | null>(null);
  const [selectedDayLog, setSelectedDayLog] = useState<AttendanceDayLog | null>(
    USE_BACKEND ? null : STUDENT_ATTENDANCE_OCTOBER[19]
  );

  useEffect(() => {
    if (!USE_BACKEND) return;
    let active = true;
    async function loadLive() {
      setLoading(true);
      setLiveError(null);
      try {
        const studentId = currentUser?.studentId || currentUser?.id;
        if (!studentId) {
          if (active) {
            setLiveRecords([]);
            setDbSummary(null);
          }
          return;
        }
        const [hist, sum] = await Promise.all([
          StudentApiService.getAttendanceHistory(studentId),
          StudentApiService.getAttendanceSummary(studentId)
        ]);
        if (!active) return;
        const rows = Array.isArray(hist) ? hist : [];
        setLiveRecords(rows);
        setDbSummary(sum ?? null);
        if (rows.length > 0) setSelectedDayLog(toDayLog(rows[0]));
      } catch (e) {
        if (active) setLiveError(e instanceof Error ? e.message : 'Unable to load attendance.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadLive();
    return () => {
      active = false;
    };
  }, [currentUser]);

  const isDemo = !USE_BACKEND;
  const daysInMonth: AttendanceDayLog[] = useMemo(() => {
    if (isDemo) return STUDENT_ATTENDANCE_OCTOBER;
    return (liveRecords ?? []).map(toDayLog);
  }, [isDemo, liveRecords]);

  const presentDays = dbSummary ? dbSummary.presentDays : daysInMonth.filter(d => d.status === 'PRESENT').length;
  const lateDays = dbSummary ? dbSummary.lateDays : daysInMonth.filter(d => d.status === 'LATE').length;
  const absentDays = dbSummary ? dbSummary.absentDays : daysInMonth.filter(d => d.status === 'ABSENT').length;
  const workingDays = dbSummary ? dbSummary.totalDays : presentDays + lateDays + absentDays;
  const percentage = dbSummary
    ? dbSummary.percentage.toFixed(1)
    : workingDays > 0
    ? (((presentDays + lateDays) / workingDays) * 100).toFixed(1)
    : '0.0';

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Register & Calendar"
        subtitle={isDemo ? 'Sample October register (demo preview)' : 'Attendance record and state board threshold'}
        badge={isDemo ? <MockLabel>Demo sample data</MockLabel> : <StatusBadge status="ACTIVE" />}
      />

      {liveError && (
        <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">
          {liveError}
        </div>
      )}

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Cumulative Rate"
          value={`${percentage}%`}
          subtext={workingDays > 0 ? `${presentDays + lateDays} of ${workingDays} sessions` : 'No sessions recorded yet'}
          icon={<CalendarCheck className="w-5 h-5" />}
          accentColor="teal"
        />
        <StatCard
          label="Present Sessions"
          value={`${presentDays}`}
          subtext="On-time check-ins"
          icon={<CheckCircle2 className="w-5 h-5" />}
          accentColor="emerald"
        />
        <StatCard
          label="Late Arrivals"
          value={`${lateDays}`}
          subtext="Marked late"
          icon={<AlertTriangle className="w-5 h-5" />}
          accentColor="orange"
        />
        <StatCard
          label="Absences (AB)"
          value={`${absentDays}`}
          subtext="Total AB marks"
          icon={<XCircle className="w-5 h-5" />}
          accentColor="rose"
        />
      </div>

      {/* Main Attendance Content: Calendar View + Day Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isDemo ? 'Sample Attendance Calendar (October 2026 — Demo)' : 'Recorded Attendance Register'}
                </h3>
              </div>
              {isDemo && <MockLabel>Sample only</MockLabel>}
            </div>

            {daysInMonth.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  title="No attendance records yet"
                  hint="Attendance entries saved by your Class Teacher appear here."
                />
              </div>
            ) : (
              <>
                {isDemo && (
                  <div className="grid grid-cols-7 gap-1 text-center py-2 text-[11px] font-bold text-slate-400 uppercase">
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                    <span>Sun</span>
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                  </div>
                )}

                <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mt-2">
                  {daysInMonth.map(item => {
                    const isSelected = selectedDayLog?.date === item.date;
                    let bgStyle = 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-400';
                    let indicator = null;

                    if (item.status === 'PRESENT') {
                      bgStyle = 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 font-bold';
                      indicator = <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mx-auto mt-1" />;
                    } else if (item.status === 'LATE') {
                      bgStyle = 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 font-bold';
                      indicator = <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mx-auto mt-1" />;
                    } else if (item.status === 'ABSENT') {
                      bgStyle = 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/60 text-rose-900 dark:text-rose-200 font-bold';
                      indicator = <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mx-auto mt-1" />;
                    } else if (item.status === 'HOLIDAY') {
                      bgStyle = 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300';
                    }

                    return (
                      <button
                        key={item.date}
                        type="button"
                        onClick={() => setSelectedDayLog(item)}
                        className={`h-14 sm:h-16 p-1.5 rounded-xl border flex flex-col justify-between transition-all text-left ${bgStyle} ${
                          isSelected ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 shadow-md' : 'hover:scale-[1.02]'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-mono">{item.day || item.date.slice(5)}</span>
                          <span className="text-[9px] uppercase tracking-tighter hidden sm:inline">
                            {shortCode(item.status)}
                          </span>
                        </div>
                        {indicator}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>P — Present</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>LATE — Late Arrival</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>AB — Absent</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                <span>HOL — Holiday</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span>OFF — Weekend</span>
              </span>
            </div>
          </Card>
        </div>

        {/* Right Col: Selected Date Inspect Card & Policy Overview */}
        <div className="space-y-4">
          {selectedDayLog && (
            <Card className="p-5 border-blue-200 dark:border-blue-900 bg-gradient-to-b from-blue-50/40 via-white to-white dark:from-blue-950/20 dark:via-slate-900 dark:to-slate-900">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
                  Day Inspector
                </span>
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                  {selectedDayLog.date}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Record Status:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    selectedDayLog.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                    selectedDayLog.status === 'LATE' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                    selectedDayLog.status === 'HOLIDAY' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' :
                    'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  }`}>
                    {selectedDayLog.status === 'ABSENT' ? 'AB (Absent)' : selectedDayLog.status}
                  </span>
                </div>

                {selectedDayLog.remarks && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200">
                    <span className="font-bold block mb-0.5">Note:</span>
                    {selectedDayLog.remarks}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Board Criteria Information */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                State Board Examination Threshold Policy
              </h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              As per State Board Examination By-laws (Rule 13), a student must have a minimum aggregate attendance of <strong>75%</strong> to be eligible to sit for the Secondary School Examination.
            </p>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {workingDays === 0
                  ? 'No recorded attendance sessions yet'
                  : Number(percentage) >= 75
                  ? 'Meets 75% attendance requirement'
                  : 'Below 75% attendance threshold'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
