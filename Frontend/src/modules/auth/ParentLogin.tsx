/**
 * Parent sign-in. SMS costs money, so the SMS code is used only when needed:
 *   QUICK   on a trusted phone: "Welcome back", PIN only. No SMS. Then pick the child.
 *   MOBILE / OTP   first time on this phone, a new phone, or "Forgot PIN".
 *   CHILD   which child (when more than one).
 *   PIN     after the SMS code when a PIN exists ("Forgot PIN?" uses the same code: no second SMS).
 * After an SMS sign-in, the parent app asks the server to trust this phone (ParentShell).
 */
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { authService } from '../../services/authService';
import { AuthSession, OtpChallenge, ParentVerification } from '../../types/session';
import { ChildInfo } from '../../types/roles';
import { ChildPicker, ErrorBox, LinkButton, MobileField, OtpField, PrimaryButton } from './authUi';

type Step = 'QUICK' | 'MOBILE' | 'OTP' | 'CHILD' | 'PIN';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** HDFC-style 4-box MPIN input with Eye toggle, keyboard navigation, paste, and auto-submit on 4th digit. */
const HdfcPinBoxes: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onComplete?: (pin: string) => void;
  label: string;
  disabled?: boolean;
}> = ({ value, onChange, onComplete, label, disabled }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = [0, 1, 2, 3].map(i => value[i] ?? '');

  const updateAt = (idx: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      const next = digits.map((d, i) => (i === idx ? '' : d)).join('');
      onChange(next);
      return;
    }
    if (clean.length > 1) {
      const next = clean.slice(0, 4);
      onChange(next);
      refs.current[Math.min(3, next.length - 1)]?.focus();
      if (next.length === 4) onComplete?.(next);
      return;
    }
    const nextArr = [...digits];
    nextArr[idx] = clean;
    const next = nextArr.join('').slice(0, 4);
    onChange(next);
    if (idx < 3) refs.current[idx + 1]?.focus();
    if (next.length === 4) onComplete?.(next);
  };

  const onKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      e.preventDefault();
      const nextArr = [...digits];
      nextArr[idx - 1] = '';
      onChange(nextArr.join(''));
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 3) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
          aria-label={show ? t('login.hidePin') : t('login.showPin')}
        >
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {show ? t('login.hidePin') : t('login.showPin')}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2.5" role="group" aria-label={label}>
        {[0, 1, 2, 3].map(idx => (
          <input
            key={idx}
            ref={el => { refs.current[idx] = el; }}
            type={show ? 'text' : 'password'}
            inputMode="numeric"
            autoComplete={idx === 0 ? 'one-time-code' : 'off'}
            autoFocus={idx === 0}
            maxLength={4}
            disabled={disabled}
            value={digits[idx]}
            onChange={e => updateAt(idx, e.target.value)}
            onKeyDown={e => onKeyDown(idx, e)}
            onFocus={e => e.currentTarget.select()}
            aria-label={`${label} ${idx + 1}`}
            placeholder="•"
            className="min-h-13 w-full rounded-xl border border-slate-300 bg-white text-center text-xl font-mono font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:bg-slate-100"
          />
        ))}
      </div>
    </div>
  );
};

export const ParentLogin: React.FC<{ onSession: (s: AuthSession) => void }> = ({ onSession }) => {
  const { t } = useTranslation();
  const [device, setDevice] = useState(() => authService.getTrustedDevice('PARENT'));
  const [step, setStep] = useState<Step>(() => (authService.getTrustedDevice('PARENT') ? 'QUICK' : 'MOBILE'));
  const [forgot, setForgot] = useState(false);
  const [mobile, setMobile] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<ParentVerification | null>(null);
  const [chosen, setChosen] = useState<ChildInfo | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyChild, setBusyChild] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const reset = () => {
    setStep('MOBILE');
    setChallenge(null);
    setVerified(null);
    setChosen(null);
    setCode('');
    setPin('');
    setLocked(false);
  };

  const forgotFromQuick = () => {
    setError(null);
    setForgot(true);
    reset();
  };

  const notMe = async () => {
    await authService.forgetTrustedDevice('PARENT');
    setDevice(null);
    setForgot(false);
    setError(null);
    reset();
  };

  /** After the SMS code or the PIN-only sign-in: one child goes straight in, several show the picker. */
  const afterVerified = async (v: ParentVerification) => {
    setVerified(v);
    if (v.children.length === 1) await pick(v.children[0], v.ticket);
    else setStep('CHILD');
  };

  const submitQuickPin = async (pinValue: string) => {
    if (busy || busyChild || pinValue.length !== 4) return;
    setError(null);
    setBusy(true);
    const r = await authService.parentPinSignIn(pinValue);
    setBusy(false);
    setPin('');
    if (r.ok) return afterVerified(r.data);
    setError(r.error);
    if (r.code === 'PIN_LOCKED') setLocked(true);
    if (r.code === 'DEVICE_UNKNOWN' || r.code === 'PIN_NOT_SET' || r.code === 'NO_LINKS') {
      setDevice(null);
      reset();
    }
  };

  const quickSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitQuickPin(pin);
  };

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await authService.requestMobileOtp(mobile, 'PARENT_LOGIN');
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setChallenge(r.data);
    setCode('');
    setStep('OTP');
  };

  const resend = async () => {
    if (!challenge) return;
    setError(null);
    const r = await authService.resendOtp(challenge.challengeId);
    if (!r.ok) return setError(r.error);
    setChallenge(r.data);
    setCode('');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setBusy(true);
    const r = await authService.verifyParentOtp(challenge.challengeId, code);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.code === 'LOCKED' || r.code === 'EXPIRED' || r.code === 'NOT_FOUND' || r.code === 'NO_LINKS') {
        setChallenge(null);
        setStep('MOBILE');
      } else {
        setChallenge({ ...challenge, attemptsRemaining: r.attemptsRemaining ?? challenge.attemptsRemaining });
      }
      return;
    }
    await afterVerified(r.data);
  };

  const pick = async (child: ChildInfo, ticket = verified?.ticket, pinValue?: string, forgotPin = forgot) => {
    if (!ticket) return;
    setError(null);
    setBusyChild(child.id);
    const r = await authService.startParentSession(ticket, child.id, pinValue, forgotPin);
    setBusyChild(null);
    if (r.ok) return onSession(r.data);
    if (r.code === 'PIN_REQUIRED') {
      setChosen(child);
      setPin('');
      setStep('PIN');
      return;
    }
    setError(r.error);
    if (r.code === 'TICKET_EXPIRED') reset();
    if (r.code === 'PIN_INVALID' || r.code === 'PIN_LOCKED') setPin('');
    if (r.code === 'PIN_LOCKED') setLocked(true);
  };

  if (step === 'QUICK' && device) {
    return (
      <form className="space-y-4" onSubmit={quickSignIn}>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-700 text-white font-bold text-sm flex items-center justify-center shrink-0">
            {initials(device.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900 truncate">{t('login.welcomeBack', { name: device.name })}</h2>
            <p className="text-xs text-slate-600 font-medium">{device.mobile}</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              {t('login.trustedDeviceBadge')}
            </span>
          </div>
        </div>
        {!locked && (
          <HdfcPinBoxes
            value={pin}
            onChange={setPin}
            onComplete={submitQuickPin}
            label={t('login.enterPin')}
            disabled={busy || Boolean(busyChild)}
          />
        )}
        <ErrorBox message={error} />
        {locked ? (
          <PrimaryButton type="button" onClick={forgotFromQuick}>{t('login.resetPinWithSms')}</PrimaryButton>
        ) : (
          <PrimaryButton type="submit" loading={busy || Boolean(busyChild)} disabled={pin.length !== 4}>{t('login.loginWithPin')}</PrimaryButton>
        )}
        <div className="pt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-slate-100">
          {!locked && (
            <LinkButton onClick={() => { setError(null); setForgot(false); reset(); }}>
              {t('login.loginWithOtpInstead')}
            </LinkButton>
          )}
          {!locked && <LinkButton onClick={forgotFromQuick}>{t('login.forgotPin')}</LinkButton>}
          <LinkButton onClick={notMe}>{t('login.notYou')}</LinkButton>
        </div>
      </form>
    );
  }

  if (step === 'CHILD' && verified) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('login.whichChild')}</h2>
          <p className="text-sm text-slate-600">{t('login.whichChildHelp')}</p>
        </div>
        <ErrorBox message={error} />
        <ChildPicker childrenList={verified.children} onPick={c => pick(c)} busyId={busyChild} />
        <LinkButton onClick={device ? () => { setError(null); setStep('QUICK'); } : reset}>
          {device ? t('login.useQuickPinInstead') : t('login.useAnotherNumber')}
        </LinkButton>
      </div>
    );
  }

  if (step === 'PIN' && verified && chosen) {
    return (
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          pick(chosen, verified.ticket, pin, false);
        }}
      >
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('login.enterPin')}</h2>
          <p className="text-sm text-slate-600">{verified.guardianName}</p>
        </div>
        {!locked && (
          <HdfcPinBoxes
            value={pin}
            onChange={setPin}
            onComplete={p => pick(chosen, verified.ticket, p, false)}
            label={t('login.enterPin')}
            disabled={Boolean(busyChild)}
          />
        )}
        <ErrorBox message={error} />
        {locked ? (
          // The SMS code was just verified: set a new PIN with it, no second SMS.
          <PrimaryButton type="button" loading={Boolean(busyChild)} onClick={() => pick(chosen, verified.ticket, undefined, true)}>{t('login.resetPinWithSms')}</PrimaryButton>
        ) : (
          <PrimaryButton type="submit" loading={Boolean(busyChild)} disabled={pin.length !== 4}>{t('login.continue')}</PrimaryButton>
        )}
        <div className="flex flex-col items-start gap-1">
          {!locked && <LinkButton onClick={() => pick(chosen, verified.ticket, undefined, true)}>{t('login.forgotPin')}</LinkButton>}
          <LinkButton onClick={reset}>{t('login.cancel')}</LinkButton>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={step === 'OTP' ? verify : sendOtp} className="space-y-4" noValidate>
      {forgot && <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">{t('login.forgotPinHelp')}</p>}
      <MobileField label={t('login.parentMobile')} value={mobile} onChange={setMobile} disabled={step === 'OTP'} />
      {step === 'OTP' && challenge && (
        <>
          <OtpField challenge={challenge} value={code} onChange={setCode} onResend={resend} />
          <LinkButton onClick={reset}>{t('login.changeNumber')}</LinkButton>
        </>
      )}
      <ErrorBox message={error} />
      <PrimaryButton type="submit" loading={busy || Boolean(busyChild)} disabled={step === 'OTP' ? code.length !== 6 : mobile.length !== 10}>
        {step === 'OTP' ? t('login.verify') : t('login.sendCode')}
      </PrimaryButton>
      {step === 'MOBILE' && !forgot && (
        <p className="text-xs text-slate-500">{t('login.firstTimeTrustNote')}</p>
      )}
      {device && step === 'MOBILE' && (
        <LinkButton onClick={() => { setForgot(false); setError(null); setStep('QUICK'); }}>
          {t('login.useQuickPinInstead')}
        </LinkButton>
      )}
    </form>
  );
};
