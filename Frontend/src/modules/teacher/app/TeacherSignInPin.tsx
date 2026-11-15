/**
 * Teacher sign-in PIN (required). It is asked after every SMS OTP, so a lost or borrowed phone
 * alone cannot open the teacher's account. The server keeps only a hash; the PIN is never shown
 * again. 5 wrong PINs lock it until the school Admin resets it.
 *
 *   TeacherPinSetup   full screen right after sign-in when the teacher has no PIN yet (first
 *                     sign-in, or after an Admin reset) or used "Forgot PIN". Nothing else
 *                     opens until it is set.
 *   TeacherSignInPin  the "Sign-in PIN" page: change it (needs a fresh OTP).
 */
import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { authService } from '../../../services/authService';
import { ErrorState, LoadingBlock, Panel, Pill } from '../../../components/common/States';
import { PinForm, PinSetupScreen } from '../../auth/PinSetupScreen';
import { formatDateTime } from '../../../utils/date';

/** Shown instead of the teacher portal until a PIN is set (first sign-in, Admin reset, or "Forgot PIN"). */
export const TeacherPinSetup: React.FC<{ onDone: () => void; resetting?: boolean }> = ({ onDone, resetting }) => {
  const scope = useScope();
  return <PinSetupScreen resetting={resetting} save={pin => authService.setMyPin(scope, pin)} onDone={onDone} />;
};

export const TeacherSignInPin: React.FC = () => {
  const scope = useScope();
  const { promptSensitiveActionAuth } = useAuth();
  const q = useQuery(() => authService.getMyPin(scope), [scope.schoolId, scope.userId]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const s = q.data;

  const change = (pin: string) => {
    setDone(null);
    promptSensitiveActionAuth('Change sign-in PIN', async token => {
      const r = await authService.setMyPin(scope, pin, token);
      if (!r.ok) return setError(r.error);
      setDone('PIN changed. Use it next time you sign in.');
      q.reload();
    }, 'SENSITIVE_STAFF_ACTION');
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold">Sign-in PIN</h1>
        <p className="text-sm text-slate-600">On this device you sign in with your 4-digit PIN only. An SMS code is needed only on a new device or if you forget the PIN.</p>
      </div>

      <Panel className="p-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">PIN is on</p>
          <p className="text-sm text-slate-500">{s.updatedAt ? `Last changed ${formatDateTime(new Date(s.updatedAt).toISOString())}.` : 'Asked every time you sign in.'}</p>
        </div>
        <Pill tone={s.locked ? 'danger' : 'success'}>{s.locked ? 'locked' : 'on'}</Pill>
      </Panel>

      {done && <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">{done}</p>}
      <PinForm title="Change PIN" button="Change PIN" onSubmit={change} error={error} setError={setError} />
      <p className="text-xs text-slate-500">We confirm a change with a new SMS code. Forgot your PIN, or locked after 5 wrong tries? Tap "Forgot PIN?" on the sign-in screen.</p>
    </div>
  );
};
