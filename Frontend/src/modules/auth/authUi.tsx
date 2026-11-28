/**
 * Shared building blocks for the sign-in flows.
 * Pure presentation: no credential logic, no storage.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronRight, FlaskConical, RotateCw, School } from 'lucide-react';
import { ChildInfo } from '../../types/roles';
import { MembershipOption, OtpChallenge } from '../../types/session';

export const inputClass =
  'w-full px-4 py-3.5 text-base bg-slate-50/70 text-slate-900 placeholder-slate-400 border border-slate-200 rounded-2xl transition focus:outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 disabled:bg-slate-100';

export const ErrorBox: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  ) : null;

/** Visible when the backend (app.otp.dev-reveal=true) or prototype mock supplies an OTP hint. */
export const MockHint: React.FC<{ hint?: string; code?: string; onFill?: (code: string) => void }> = ({ hint, code, onFill }) => {
  const extracted = code ?? hint?.match(/\b(\d{6})\b/)?.[1];
  if (!hint && !extracted) return null;
  return (
    <div className="p-2.5 rounded-xl bg-amber-50 border border-dashed border-amber-300 text-xs text-amber-900 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical className="w-3.5 h-3.5 shrink-0" />
        <span className="font-mono font-semibold truncate">{hint ?? `OTP: ${extracted}`}</span>
      </div>
      {extracted && onFill && (
        <button
          type="button"
          onClick={() => onFill(extracted)}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 font-semibold transition"
        >
          Fill {extracted}
        </button>
      )}
    </div>
  );
};

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }> = ({
  loading,
  children,
  className = '',
  disabled,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={`btn-press w-full min-h-13 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base tracking-tight flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed ${className}`}
  >
    {loading && <RotateCw className="w-4 h-4 animate-spin" />}
    {children}
  </button>
);

export const LinkButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`min-h-11 px-2 text-sm font-semibold text-blue-700 hover:text-blue-800 underline-offset-4 hover:underline disabled:text-slate-400 disabled:no-underline ${className}`}
  />
);

export const MobileField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</span>
    <div className="flex rounded-xl overflow-hidden border border-slate-300 focus-within:ring-2 focus-within:ring-blue-600/25 focus-within:border-blue-700">
      <span className="inline-flex items-center px-3.5 text-base font-semibold bg-slate-100 text-slate-600 border-r border-slate-300">+91</span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder="98765 43210"
        className="flex-1 min-w-0 px-3.5 py-3 text-base bg-white text-slate-900 placeholder-slate-400 focus:outline-none disabled:bg-slate-50"
      />
    </div>
  </label>
);

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 6-digit OTP entry with expiry countdown, resend cooldown and mock hint. */
export const OtpField: React.FC<{
  challenge: OtpChallenge;
  value: string;
  onChange: (v: string) => void;
  onResend: () => void;
  resending?: boolean;
}> = ({ challenge, value, onChange, onResend, resending }) => {
  const { t } = useTranslation();
  const now = useNow(true);
  const expired = now > challenge.expiresAt;
  const resendIn = challenge.resendAvailableAt - now;
  const canResend = Number.isFinite(challenge.resendAvailableAt) && resendIn <= 0;

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        {t('login.codeSentTo', { destination: challenge.maskedDestination })}
      </p>
      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('login.enterCode')}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={value}
          onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          className={`${inputClass} text-center text-xl font-mono tracking-[0.5em]`}
        />
      </label>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span className={expired ? 'text-rose-700 font-semibold' : ''}>
          {expired ? t('login.codeExpired') : t('login.expiresIn', { time: fmt(challenge.expiresAt - now) })}
        </span>
        <LinkButton onClick={onResend} disabled={!canResend || resending}>
          {!Number.isFinite(challenge.resendAvailableAt)
            ? t('login.resendLimit')
            : canResend
              ? t('login.resend')
              : t('login.resendIn', { time: fmt(resendIn) })}
        </LinkButton>
      </div>
      <MockHint hint={challenge.mockHint} code={challenge.devCode} onFill={onChange} />
    </div>
  );
};

/** Parent child picker, grouped by school. */
export const ChildPicker: React.FC<{
  childrenList: ChildInfo[];
  onPick: (child: ChildInfo) => void;
  busyId?: string | null;
}> = ({ childrenList, onPick, busyId }) => {
  const { t } = useTranslation();
  const groups = childrenList.reduce<Record<string, ChildInfo[]>>((acc, c) => {
    (acc[c.schoolName] ||= []).push(c);
    return acc;
  }, {});
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([schoolName, kids]) => (
        <section key={schoolName} className="rounded-2xl border border-slate-200 overflow-hidden">
          <h3 className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700 flex items-center gap-2">
            <School className="w-4 h-4 text-blue-700" /> {schoolName}
          </h3>
          <ul className="divide-y divide-slate-100">
            {kids.map(child => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => onPick(child)}
                  disabled={Boolean(busyId)}
                  className="w-full min-h-16 px-3.5 py-3 flex items-center gap-3 text-left hover:bg-blue-50 disabled:opacity-60"
                >
                  <img src={child.avatar} alt="" className="w-10 h-10 rounded-full bg-slate-100" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-slate-900 truncate">{child.name}</span>
                    <span className="block text-sm text-slate-500">
                      {t('login.classSection', { grade: child.grade, section: child.section })}
                    </span>
                  </span>
                  {busyId === child.id ? <RotateCw className="w-4 h-4 animate-spin text-blue-700" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

const ROLE_LABEL: Record<MembershipOption['role'], string> = {
  PARENT: 'Parent',
  TEACHER: 'Teacher',
  PRINCIPAL: 'Principal',
  ADMIN: 'Admin'
};

/** Role + school picker when one identity has several memberships. */
export const MembershipPicker: React.FC<{
  options: MembershipOption[];
  onPick: (o: MembershipOption) => void;
  busyId?: string | null;
}> = ({ options, onPick, busyId }) => (
  <ul className="space-y-2">
    {options.map(o => (
      <li key={o.membershipId}>
        <button
          type="button"
          onClick={() => onPick(o)}
          disabled={Boolean(busyId)}
          className="w-full min-h-16 px-3.5 py-3 rounded-2xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50 flex items-center gap-3 text-left disabled:opacity-60"
        >
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold text-slate-900 truncate">{o.schoolName}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">{ROLE_LABEL[o.role]}</span>
            </span>
            <span className="block text-sm text-slate-500 truncate">{o.title}</span>
          </span>
          {busyId === o.membershipId ? <RotateCw className="w-4 h-4 animate-spin text-blue-700" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
        </button>
      </li>
    ))}
  </ul>
);
