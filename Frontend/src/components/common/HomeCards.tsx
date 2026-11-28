/**
 * Home-screen building blocks shared by the Parent home and the Teacher "Today" screen, so both
 * stay visually identical: swipeable quick-action cards and the red notice board banner.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Megaphone } from 'lucide-react';

/**
 * One quick card. `alert` shows the orange dot and colours the status line.
 * Default: fixed width for a swipeable row on phones. `fill`: fills its grid cell (fixed grids, e.g. 2×2).
 */
export const QuickCard: React.FC<{ to: string; icon: React.ReactNode; tint: string; title: string; status: string; alert?: boolean; fill?: boolean }> = ({
  to,
  icon,
  tint,
  title,
  status,
  alert,
  fill
}) => (
  <Link to={to} className={`lift rounded-3xl bg-white shadow-card border border-slate-100 p-4 relative min-w-0 ${fill ? 'block w-full h-full' : 'snap-start shrink-0 w-40 md:w-auto'}`}>
    {alert && <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-orange-500" aria-hidden="true" />}
    <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${tint}`}>{icon}</span>
    <span className="block mt-3 text-sm font-bold text-slate-900">{title}</span>
    <span className={`block text-xs mt-0.5 ${alert ? 'text-orange-600 font-semibold' : 'text-slate-500'}`}>{status}</span>
  </Link>
);

/** Calm notice board card: elevated white card with soft blue accent and subtle Urgent badge only on EMERGENCY notices. */
export const NoticeBoardCard: React.FC<{
  to: string;
  heading: string;
  viewAll: string;
  emptyText: string;
  latest?: { title: string; body: string; date: string; priority?: 'NORMAL' | 'IMPORTANT' | 'EMERGENCY' } | null;
  className?: string;
}> = ({ to, heading, viewAll, emptyText, latest, className }) => {
  const isEmergency = latest?.priority === 'EMERGENCY';
  return (
    <Link
      to={to}
      className={`lift block rounded-3xl bg-white text-slate-900 p-5 shadow-card border border-slate-200/80 ring-1 ring-slate-900/5 ${
        isEmergency ? 'border-l-4 border-l-rose-500' : ''
      } ${className ?? ''}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-bold flex items-center gap-2 text-slate-900">
          <span className={`w-7 h-7 rounded-xl grid place-items-center ${isEmergency ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>
            <Megaphone className="w-4 h-4" />
          </span>
          {heading}
          {isEmergency && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              Urgent
            </span>
          )}
        </span>
        <span className="text-sm font-medium text-blue-700 flex items-center shrink-0">{viewAll} <ChevronRight className="w-4 h-4" /></span>
      </span>
      {latest ? (
        <span className="block mt-2.5">
          <span className="block text-sm font-semibold text-slate-900">{latest.title}</span>
          <span className="block text-sm text-slate-600 line-clamp-2 mt-0.5">{latest.body}</span>
          <span className="block text-xs text-slate-500 mt-1.5">{latest.date}</span>
        </span>
      ) : (
        <span className="block mt-2 text-sm text-slate-500">{emptyText}</span>
      )}
    </Link>
  );
};
