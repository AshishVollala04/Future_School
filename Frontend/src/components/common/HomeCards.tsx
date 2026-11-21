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

/** The red notice board banner: the latest notice, linking to the full list. */
export const NoticeBoardCard: React.FC<{
  to: string;
  heading: string;
  viewAll: string;
  emptyText: string;
  latest?: { title: string; body: string; date: string } | null;
}> = ({ to, heading, viewAll, emptyText, latest }) => (
  <Link to={to} className="lift block rounded-3xl bg-gradient-to-br from-rose-600 via-red-600 to-red-700 text-white p-5 shadow-float ring-1 ring-red-700/30">
    <span className="flex items-center justify-between">
      <span className="font-bold flex items-center gap-2"><Megaphone className="w-4 h-4" />{heading}</span>
      <span className="text-sm text-red-100 flex items-center">{viewAll} <ChevronRight className="w-4 h-4" /></span>
    </span>
    {latest ? (
      <span className="block mt-2">
        <span className="block text-sm font-semibold">{latest.title}</span>
        <span className="block text-sm text-red-50 line-clamp-2 mt-0.5">{latest.body}</span>
        <span className="block text-xs text-red-200 mt-1.5">{latest.date}</span>
      </span>
    ) : (
      <span className="block mt-2 text-sm text-red-100">{emptyText}</span>
    )}
  </Link>
);
