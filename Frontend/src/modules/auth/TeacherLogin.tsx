/**
 * Teacher sign-in. SMS costs money, so the SMS code is used only when needed:
 *   QUICK   on a trusted device: PIN only ("Welcome back"). No SMS.
 *   MOBILE / OTP   first time on this device, a new device, or "Forgot PIN".
 *   PIN     after the SMS code when a PIN exists (with "Forgot PIN?" on the same code: no second SMS).
 * After an SMS sign-in, the teacher portal asks the server to trust this device (TeacherLayout).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../../services/authService';
import { AuthSession, MembershipOption, OtpChallenge, StaffVerification } from '../../types/session';
import { ErrorBox, LinkButton, MembershipPicker, MobileField, OtpField, PrimaryButton, inputClass } from './authUi';

type Step = 'QUICK' | 'MOBILE' | 'OTP' | 'PICK' | 'PIN';

const PinInput: React.FC<{ value: string; onChange: (v: string) => void; label: string }> = ({ value, onChange, label }) => (
  <input
    type="password"
    inputMode="numeric"
    autoFocus
    maxLength={4}
    value={value}
    onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
    placeholder="••••"
    aria-label={label}
    className={`${inputClass} text-center text-xl font-mono tracking-[0.5em]`}
  />
);

export const TeacherLogin: React.FC<{ onSession: (s: AuthSession) => void }> = ({ onSession }) => {
  const { t } = useTranslation();
  const [device, setDevice] = useState(() => authService.getTrustedDevice('TEACHER'));
  const [step, setStep] = useState<Step>(() => (authService.getTrustedDevice('TEACHER') ? 'QUICK' : 'MOBILE'));
  const [forgot, setForgot] = useState(false);
  const [mobile, setMobile] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<StaffVerification | null>(null);
  const [chosen, setChosen] = useState<MembershipOption | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  /** "Forgot PIN?" from the quick screen: SMS code, then a new PIN. */
  const forgotFromQuick = () => {
    setError(null);
    setForgot(true);
    reset();
  };

  const notMe = async () => {
    await authService.forgetTrustedDevice('TEACHER');
    setDevice(null);
    setForgot(false);
    setError(null);
    reset();
  };

  const quickSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await authService.pinSignIn(pin);
    setBusy(false);
    if (r.ok) return onSession(r.data);
    setPin('');
    setError(r.error);
    if (r.code === 'PIN_LOCKED') setLocked(true);
    if (r.code === 'DEVICE_UNKNOWN' || r.code === 'PIN_NOT_SET' || r.code === 'NOT_LINKED') {
      setDevice(null);
      reset();
    }
  };

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await authService.requestMobileOtp(mobile, 'TEACHER_LOGIN');
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

  const start = async (option: MembershipOption, ticket: string, pinValue?: string, forgotPin?: boolean) => {
    setError(null);
    setBusyId(option.membershipId);
    const r = await authService.startTeacherSession(ticket, option.membershipId, pinValue, forgotPin);
    setBusyId(null);
    if (r.ok) return onSession(r.data);
    if (r.code === 'PIN_REQUIRED') {
      setChosen(option);
      setPin('');
      setStep('PIN');
      return;
    }
    setError(r.error);
    if (r.code === 'TICKET_EXPIRED') reset();
    if (r.code === 'PIN_INVALID' || r.code === 'PIN_LOCKED') setPin('');
    if (r.code === 'PIN_LOCKED') setLocked(true);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setBusy(true);
    const r = await authService.verifyTeacherOtp(challenge.challengeId, code);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.code !== 'INVALID') reset();
      return;
    }
    setVerified(r.data);
    if (r.data.memberships.length === 1) {
      await start(r.data.memberships[0], r.data.ticket, undefined, forgot);
    } else {
      setStep('PICK');
    }
  };

  if (step === 'QUICK' && device) {
    return (
      <form className="space-y-4" onSubmit={quickSignIn}>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('login.welcomeBack', { name: device.name })}</h2>
          <p className="text-sm text-slate-600">{device.schoolName} · {device.mobile}</p>
          <p className="text-sm text-slate-600 mt-1">{t('login.pinOnlyHelp')}</p>
        </div>
        {!locked && <PinInput value={pin} onChange={setPin} label={t('login.enterPin')} />}
        <ErrorBox message={error} />
        {locked ? (
          <PrimaryButton type="button" onClick={forgotFromQuick}>{t('login.resetPinWithSms')}</PrimaryButton>
        ) : (
          <PrimaryButton type="submit" loading={busy} disabled={pin.length !== 4}>{t('login.continue')}</PrimaryButton>
        )}
        <div className="flex flex-col items-start gap-1">
          {!locked && <LinkButton onClick={forgotFromQuick}>{t('login.forgotPin')}</LinkButton>}
          <LinkButton onClick={notMe}>{t('login.notYou')}</LinkButton>
        </div>
      </form>
    );
  }

  if (step === 'PICK' && verified) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('login.chooseSchoolRole')}</h2>
          <p className="text-sm text-slate-600">{t('login.chooseSchoolRoleHelp')}</p>
        </div>
        <ErrorBox message={error} />
        <MembershipPicker options={verified.memberships} onPick={o => start(o, verified.ticket, undefined, forgot)} busyId={busyId} />
        <LinkButton onClick={reset}>{t('login.useAnotherNumber')}</LinkButton>
      </div>
    );
  }

  if (step === 'PIN' && verified && chosen) {
    return (
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          start(chosen, verified.ticket, pin);
        }}
      >
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('login.enterPin')}</h2>
          <p className="text-sm text-slate-600">{chosen.schoolName} · {chosen.title}</p>
        </div>
        {!locked && <PinInput value={pin} onChange={setPin} label={t('login.enterPin')} />}
        <ErrorBox message={error} />
        {locked ? (
          // The SMS code was just verified: set a new PIN with it, no second SMS.
          <PrimaryButton type="button" loading={Boolean(busyId)} onClick={() => start(chosen, verified.ticket, undefined, true)}>{t('login.resetPinWithSms')}</PrimaryButton>
        ) : (
          <PrimaryButton type="submit" loading={Boolean(busyId)} disabled={pin.length !== 4}>{t('login.continue')}</PrimaryButton>
        )}
        <div className="flex flex-col items-start gap-1">
          {!locked && <LinkButton onClick={() => start(chosen, verified.ticket, undefined, true)}>{t('login.forgotPin')}</LinkButton>}
          <LinkButton onClick={reset}>{t('login.cancel')}</LinkButton>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={step === 'OTP' ? verify : sendOtp} className="space-y-4" noValidate>
      {forgot && <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">{t('login.forgotPinHelp')}</p>}
      <MobileField label={t('login.teacherMobile')} value={mobile} onChange={setMobile} disabled={step === 'OTP'} />
      {step === 'OTP' && challenge && (
        <>
          <OtpField challenge={challenge} value={code} onChange={setCode} onResend={resend} />
          <LinkButton onClick={reset}>{t('login.changeNumber')}</LinkButton>
        </>
      )}
      <ErrorBox message={error} />
      <PrimaryButton type="submit" loading={busy || Boolean(busyId)} disabled={step === 'OTP' ? code.length !== 6 : mobile.length !== 10}>
        {step === 'OTP' ? t('login.verify') : t('login.sendCode')}
      </PrimaryButton>
      {device && step === 'MOBILE' && <LinkButton onClick={() => { setForgot(false); setError(null); setStep('QUICK'); }}>{t('login.cancel')}</LinkButton>}
    </form>
  );
};
