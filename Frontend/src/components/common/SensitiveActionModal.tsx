/**
 * Step-up re-verification before a sensitive action. Hands the caller a single-use step-up token
 * that the service layer re-checks.
 *
 * - Parents paying a fee or authorising a pickup confirm with their PIN: no SMS is sent (SMS costs
 *   money). "Use an SMS code instead" is always there; a locked or missing PIN switches to it.
 * - Everything else (staff actions, changing the PIN) sends a fresh OTP to the session's own
 *   mobile (parent/teacher) or school email (principal/admin).
 */
import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { OtpChallenge } from '../../types/session';
import { Modal } from '../ui/Modal';
import { ErrorBox, OtpField, PrimaryButton, LinkButton, inputClass } from '../../modules/auth/authUi';

export const SensitiveActionModal: React.FC = () => {
  const { session, sensitiveActionState, cancelSensitiveActionAuth, completeSensitiveActionAuth } = useAuth();
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [usePin, setUsePin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = Boolean(sensitiveActionState?.isOpen && session);
  const pinAllowed = Boolean(
    session?.role === 'PARENT' && (sensitiveActionState?.purpose === 'PAYMENT' || sensitiveActionState?.purpose === 'PICKUP_AUTHORIZATION')
  );

  const sendSms = () => {
    if (!session || !sensitiveActionState) return () => undefined;
    let live = true;
    setChallenge(null);
    setCode('');
    authService.requestStepUp(session.sessionId, sensitiveActionState.purpose).then(r => {
      if (!live) return;
      if (r.ok) setChallenge(r.data);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  };

  useEffect(() => {
    if (!open || !session || !sensitiveActionState) return;
    setError(null);
    setPin('');
    setUsePin(pinAllowed);
    // A parent confirming with the PIN gets no SMS unless they ask for one.
    if (pinAllowed) return;
    return sendSms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session, sensitiveActionState, pinAllowed]);

  if (!open || !sensitiveActionState || !session) return null;

  const switchToSms = (reason?: string) => {
    setUsePin(false);
    setError(reason ?? null);
    sendSms();
  };

  const resend = async () => {
    if (!challenge) return;
    const r = await authService.resendOtp(challenge.challengeId);
    if (r.ok) {
      setChallenge(r.data);
      setCode('');
    } else setError(r.error);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (usePin) {
      const r = await authService.verifyStepUpWithPin(session.sessionId, sensitiveActionState.purpose, pin);
      setBusy(false);
      if (r.ok) return completeSensitiveActionAuth(r.data.stepUpToken);
      setPin('');
      if (r.code === 'PIN_LOCKED' || r.code === 'PIN_SETUP_REQUIRED' || r.code === 'OTP_REQUIRED') return switchToSms(`${r.error} We sent you an SMS code instead.`);
      return setError(r.error);
    }
    if (!challenge) return setBusy(false);
    const r = await authService.verifyStepUp(session.sessionId, challenge.challengeId, code);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      if (r.code !== 'INVALID') setChallenge(null);
      return;
    }
    completeSensitiveActionAuth(r.data.stepUpToken);
  };

  return (
    <Modal isOpen onClose={cancelSensitiveActionAuth} title="Confirm it's you">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-900 flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong className="block">{sensitiveActionState.actionTitle}</strong>
            {usePin ? 'Enter your 4-digit PIN to continue.' : 'Enter the code we just sent to continue.'}
          </span>
        </div>
        {usePin ? (
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            aria-label="Your 4-digit PIN"
            className={`${inputClass} text-center text-xl font-mono tracking-[0.5em]`}
          />
        ) : (
          challenge && <OtpField challenge={challenge} value={code} onChange={setCode} onResend={resend} />
        )}
        <ErrorBox message={error} />
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <LinkButton onClick={cancelSensitiveActionAuth} className="sm:flex-1">
            Cancel
          </LinkButton>
          <PrimaryButton type="submit" loading={busy} disabled={usePin ? pin.length !== 4 : !challenge || code.length !== 6} className="sm:flex-1">
            Confirm
          </PrimaryButton>
        </div>
        {usePin && <LinkButton onClick={() => switchToSms()}>Use an SMS code instead</LinkButton>}
      </form>
    </Modal>
  );
};
