/** Shared loading / empty / error states and small layout primitives for the mobile apps. */
import React from 'react';
import { AlertTriangle, Inbox, RotateCw, FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const LoadingBlock: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="space-y-3 animate-pulse" aria-busy="true" aria-live="polite">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="h-16 rounded-2xl bg-gradient-to-r from-slate-200/70 via-slate-100 to-slate-200/70" />
    ))}
  </div>
);

export const EmptyState: React.FC<{ title: string; hint?: string; icon?: React.ReactNode }> = ({ title, hint, icon }) => (
  <div className="py-10 px-6 text-center rounded-3xl border border-slate-200/80 bg-white shadow-card">
    <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-blue-600 mb-3">
      {icon ?? <Inbox className="w-6 h-6" />}
    </div>
    <p className="text-base font-bold tracking-tight text-slate-900">{title}</p>
    {hint && <p className="text-sm text-slate-500 mt-1">{hint}</p>}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => {
  const { t } = useTranslation();
  return (
    <div role="alert" className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-2 min-h-11 text-sm font-semibold text-rose-900 underline flex items-center gap-1">
            <RotateCw className="w-4 h-4" /> {t('common.retry')}
          </button>
        )}
      </div>
    </div>
  );
};

export const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <section className="space-y-2.5">
    <div className="flex items-center justify-between px-0.5">
      <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

export const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-card ${className}`}>{children}</div>
);

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
const TONES: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200'
};

export const Pill: React.FC<{ tone: Tone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${TONES[tone]}`}>{children}</span>
);

export const MockLabel: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-900 border border-dashed border-amber-300">
    <FlaskConical className="w-3 h-3" /> {children ?? 'Prototype / mock'}
  </span>
);
