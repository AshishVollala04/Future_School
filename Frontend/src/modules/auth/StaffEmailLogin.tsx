import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { authService, IdentityProvider } from '../../services/authService';
import { AuthSession, InvitationView, OtpChallenge, StaffVerification } from '../../types/session';
import { ErrorBox, LinkButton, MembershipPicker, OtpField, PrimaryButton, inputClass } from './authUi';
import { IDP_HANDOFF_KEY } from './IdpCallback';

/** Back from Microsoft/Google: the email-code step (or an error) left by IdpCallback. Read once. */
function takeIdpHandoff(): { ticket?: string; secondFactor?: OtpChallenge; error?: string } | null {
  try {
    const raw = window.sessionStorage.getItem(IDP_HANDOFF_KEY);
    window.sessionStorage.removeItem(IDP_HANDOFF_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

type Step = 'EMAIL' | 'PASSWORD' | 'SECOND_FACTOR' | 'PICK';

const MicrosoftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 23 23" aria-hidden="true">
    <path fill="#f35325" d="M1 1h10v10H1z" />
    <path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" />
    <path fill="#ffba08" d="M12 12h10v10H12z" />
  </svg>
);

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

const idpButton =
  'w-full min-h-12 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-base flex items-center justify-center gap-3 disabled:opacity-50';

export const StaffEmailLogin: React.FC<{
  onSession: (s: AuthSession) => void;
  invitation?: InvitationView | null;
}> = ({ onSession, invitation }) => {
  const { t } = useTranslation();
  const [handoff] = useState(takeIdpHandoff);
  const [step, setStep] = useState<Step>(handoff?.ticket && handoff.secondFactor ? 'SECOND_FACTOR' : 'EMAIL');
  const [providers, setProviders] = useState<IdentityProvider[]>([]);
  useEffect(() => {
    let live = true;
    authService.getIdpProviders().then(p => live && setProviders(p));
    return () => {
      live = false;
    };
  }, []);
  const [email, setEmail] = useState(invitation?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ticket, setTicket] = useState<string | null>(handoff?.ticket ?? null);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(handoff?.secondFactor ?? null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<StaffVerification | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(handoff?.error ?? null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const inviteToken = invitation?.token;

  const reset = () => {
    setStep('EMAIL');
    setTicket(null);
    setChallenge(null);
    setVerified(null);
    setCode('');
    setPassword('');
  };

  const afterFirstFactor = (r: Awaited<ReturnType<typeof authService.beginPasswordSignIn>>) => {
    if (!r.ok) {
      if (r.code === 'REDIRECTING') return setBusy('REDIRECTING'); // the browser is leaving for Microsoft/Google
      setError(r.error);
      return;
    }
    setTicket(r.data.ticket);
    setChallenge(r.data.secondFactor);
    setCode('');
    setStep('SECOND_FACTOR');
  };

  const sso = async (provider: IdentityProvider) => {
    setError(null);
    if (!emailValid) return setError(t('login.enterSchoolEmailFirst'));
    setBusy(provider);
    const r = await authService.beginIdpSignIn(provider, email, inviteToken);
    setBusy(null);
    afterFirstFactor(r);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('PASSWORD');
    const r = await authService.beginPasswordSignIn(email, password, inviteToken);
    setBusy(null);
    setPassword('');
    afterFirstFactor(r);
  };

  const resend = async () => {
    if (!challenge) return;
    setError(null);
    const r = await authService.resendOtp(challenge.challengeId);
    if (!r.ok) return setError(r.error);
    setChallenge(r.data);
    setCode('');
  };

  const start = async (membershipId: string, vTicket: string) => {
    setBusy(membershipId);
    const r = await authService.startStaffSession(vTicket, membershipId);
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      reset();
      return;
    }
    onSession(r.data);
  };

  const submitSecondFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !challenge) return;
    setError(null);
    setBusy('OTP');
    const r = await authService.completeStaffSecondFactor(ticket, challenge.challengeId, code);
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      if (r.code !== 'INVALID') reset();
      return;
    }
    setVerified(r.data);
    if (r.data.memberships.length === 1) await start(r.data.memberships[0].membershipId, r.data.ticket);
    else setStep('PICK');
  };

  const inviteBanner = invitation && (
    <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-900 flex items-start gap-2">
      <MailCheck className="w-4 h-4 mt-0.5 shrink-0" />
      <span>
        {t('login.invitationFor', {
          role: invitation.role === 'PRINCIPAL' ? 'Principal' : 'Admin',
          school: invitation.schoolName
        })}
      </span>
    </div>
  );

  if (step === 'PICK' && verified) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">{t('login.chooseSchoolRole')}</h2>
        <ErrorBox message={error} />
        <MembershipPicker options={verified.memberships} onPick={o => start(o.membershipId, verified.ticket)} busyId={busy} />
        <LinkButton onClick={reset}>{t('login.cancel')}</LinkButton>
      </div>
    );
  }

  if (step === 'SECOND_FACTOR' && challenge) {
    return (
      <form onSubmit={submitSecondFactor} className="space-y-4" noValidate>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('login.secondStep')}</h2>
          <p className="text-sm text-slate-600">{t('login.secondStepHelp')}</p>
        </div>
        <OtpField challenge={challenge} value={code} onChange={setCode} onResend={resend} />
        <ErrorBox message={error} />
        <PrimaryButton type="submit" loading={busy === 'OTP' || Boolean(busy?.startsWith('MEM'))} disabled={code.length !== 6}>
          {t('login.verify')}
        </PrimaryButton>
        <LinkButton onClick={reset}>{t('login.cancel')}</LinkButton>
      </form>
    );
  }

  if (step === 'PASSWORD') {
    return (
      <form onSubmit={submitPassword} className="space-y-4" noValidate>
        {inviteBanner}
        <p className="text-sm text-slate-600 break-all">{email}</p>
        <label className="block">
          <span className="block text-sm font-semibold text-slate-700 mb-1.5">
            {invitation ? t('login.createPassword') : t('login.password')}
          </span>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={invitation ? 'new-password' : 'current-password'}
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-slate-500"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {invitation && <span className="block text-xs text-slate-500 mt-1">{t('login.passwordRule')}</span>}
        </label>
        <ErrorBox message={error} />
        <PrimaryButton type="submit" loading={busy === 'PASSWORD'} disabled={!password}>
          {t('login.continue')}
        </PrimaryButton>
        <LinkButton onClick={reset}>{t('login.back')}</LinkButton>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {inviteBanner}
      <label className="block">
        <span className="block text-sm font-semibold text-slate-700 mb-1.5">{t('login.schoolEmail')}</span>
        <input
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          readOnly={Boolean(invitation)}
          onChange={e => setEmail(e.target.value)}
          placeholder="principal@yourschool.edu.in"
          className={inputClass}
        />
        <span className="block text-xs text-slate-500 mt-1">{t('login.schoolEmailHelp')}</span>
      </label>
      <ErrorBox message={error} />
      {/* Only providers the school has set up (live server: none until the keys are configured). */}
      {providers.includes('MICROSOFT') && (
        <button type="button" className={idpButton} disabled={Boolean(busy)} onClick={() => sso('MICROSOFT')}>
          <MicrosoftIcon /> {t('login.withMicrosoft')}
        </button>
      )}
      {providers.includes('GOOGLE') && (
        <button type="button" className={idpButton} disabled={Boolean(busy)} onClick={() => sso('GOOGLE')}>
          <GoogleIcon /> {t('login.withGoogle')}
        </button>
      )}
      {providers.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-slate-400 uppercase tracking-wide">
          <span className="flex-1 border-t border-slate-200" /> {t('login.or')} <span className="flex-1 border-t border-slate-200" />
        </div>
      )}
      <PrimaryButton
        type="button"
        disabled={!emailValid || Boolean(busy)}
        onClick={() => {
          setError(null);
          setStep('PASSWORD');
        }}
      >
        {invitation ? t('login.setPasswordInstead') : t('login.usePassword')}
      </PrimaryButton>
      <p className="text-xs text-slate-500">{t('login.alwaysTwoFactors')}</p>
    </div>
  );
};
