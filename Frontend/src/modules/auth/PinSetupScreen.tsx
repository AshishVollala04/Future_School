/**
 * Full-screen "Set your sign-in PIN", for teachers and parents. Shown right after signing in when
 * there is no PIN yet (first time, or after an Admin reset) or after "Forgot PIN". Nothing else
 * opens until it is set (the server enforces it too).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Result } from '../../types/session';
import { ErrorBox, PrimaryButton, inputClass } from './authUi';
import { pinWeakness } from '../../utils/pin';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

/** Two PIN boxes + the rule hint. onSubmit gets a PIN that passed the local rule and matches. */
export const PinForm: React.FC<{ title: string; button: string; busy?: boolean; onSubmit: (pin: string) => void; error: string | null; setError: (e: string | null) => void }> = ({
  title, button, busy, onSubmit, error, setError
}) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const weak = pinWeakness(pin);
    if (weak) return setError(weak);
    if (pin !== again) return setError(t('pin.mismatch'));
    onSubmit(pin);
    setPin('');
    setAgain('');
  };
  return (
    <form onSubmit={submit}>
      <div className="p-4 space-y-3 rounded-2xl border border-slate-200 bg-white">
        <p className="font-semibold">{title}</p>
        <ErrorBox message={error} />
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-sm font-semibold mb-1">{t('pin.new')}</span>
            <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={e => setPin(digits(e.target.value))} className={`${inputClass} tracking-[0.5em] text-center`} />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold mb-1">{t('pin.again')}</span>
            <input type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={e => setAgain(digits(e.target.value))} className={`${inputClass} tracking-[0.5em] text-center`} />
          </label>
        </div>
        <p className="text-xs text-slate-500">{t('pin.rules')}</p>
        <PrimaryButton type="submit" loading={busy} disabled={pin.length !== 4 || again.length !== 4}>{button}</PrimaryButton>
      </div>
    </form>
  );
};

export const PinSetupScreen: React.FC<{ resetting?: boolean; save: (pin: string) => Promise<Result<unknown>>; onDone: () => void }> = ({ resetting, save, onDone }) => {
  const { t } = useTranslation();
  const { currentUser, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (pin: string) => {
    setBusy(true);
    const r = await save(pin);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center"><KeyRound className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-bold">{resetting ? t('pin.setupNewTitle') : t('pin.setupTitle')}</h1>
            <p className="text-sm text-slate-600">{currentUser?.name}</p>
          </div>
        </div>
        <p className="text-sm text-slate-700">{resetting ? t('pin.resetHelp') : t('pin.setupHelp')} {t('pin.noSmsNextTime')}</p>
        <PinForm title={t('pin.choose')} button={t('pin.setContinue')} busy={busy} onSubmit={submit} error={error} setError={setError} />
        <p className="text-xs text-slate-500">{t('pin.forgotLater')}</p>
        <button onClick={logout} className="min-h-11 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold">{t('nav.logout')}</button>
      </div>
    </div>
  );
};
