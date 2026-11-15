/** School gate: check an early-pickup pass code. A valid code is accepted once and then marked used. */
import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useScope } from '../../../hooks/useScope';
import { pickupService, PickupPassView } from '../../../services/pickupService';
import { Panel } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';

export const AdminGateCheck: React.FC = () => {
  const scope = useScope();
  const [code, setCode] = useState('');
  const [ok, setOk] = useState<PickupPassView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const r = await pickupService.verifyAtGate(scope, code);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setOk(r.data);
    setCode('');
  };

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h1 className="text-xl font-bold">Pickup gate check</h1>
        <p className="text-sm text-slate-600">Enter the code shown by the person collecting a child. Each code works once.</p>
      </div>
      <form onSubmit={check} className="space-y-3">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 8))} placeholder="8-character code" aria-label="Pass code"
          className={`${inputClass} font-mono text-xl tracking-widest`} />
        <PrimaryButton type="submit" loading={busy} disabled={code.length < 8}>Check pass</PrimaryButton>
      </form>
      <ErrorBox message={error} />
      {ok && (
        <Panel className="p-4 space-y-1 border-emerald-400">
          <p className="font-semibold flex items-center gap-2 text-emerald-800"><ShieldCheck className="w-5 h-5" /> Valid. Pass now marked used.</p>
          <p>Child: <b>{ok.studentName}</b>{ok.classLabel ? ` (${ok.classLabel})` : ''}</p>
          <p>Collected by: <b>{ok.personName}</b> · {ok.relation}</p>
          {ok.mobile && <p className="text-sm">Call to confirm: <span className="font-mono">{ok.mobile}</span></p>}
          <p className="text-sm text-slate-600">Check their photo ID before releasing the child.</p>
        </Panel>
      )}
    </div>
  );
};
