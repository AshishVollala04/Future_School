/**
 * Staff access (SECURITY): Principal/Admin accounts, invitations, suspend/reactivate.
 * Nothing is deleted. At least two Admins must stay active. Suspending needs an OTP.
 * Audit log (REPORTS): read-only, append-only.
 */
import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useScope } from '../../../hooks/useScope';
import { useQuery } from '../../../hooks/useQuery';
import { authService, StaffAccountView, TeacherPinRow } from '../../../services/authService';
import { adminService } from '../../../services/adminService';
import { PERMISSION_LABEL } from '../../../services/mock/permissions';
import { EmptyState, ErrorState, LoadingBlock, MockLabel, Panel, Pill, Section } from '../../../components/common/States';
import { ErrorBox, PrimaryButton, inputClass } from '../../auth/authUi';
import { AdminPermission } from '../../../types/domain';
import { formatDateTime } from '../../../utils/date';
import { USE_BACKEND } from '../../../app/backendConfig';

const ALL_PERMS = Object.keys(PERMISSION_LABEL) as AdminPermission[];

/** Teachers' optional sign-in PIN: status only (never the PIN). Reset = remove; reason + OTP; audited. */
const TeacherPins: React.FC = () => {
  const scope = useScope();
  const { promptSensitiveActionAuth } = useAuth();
  const q = useQuery(() => authService.listTeacherPins(scope), [scope.schoolId]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const reset = (t: TeacherPinRow) => {
    setError(null);
    if ((reason[t.membershipId] ?? '').trim().length < 10) return setError('Give a reason (10+ characters).');
    promptSensitiveActionAuth(`Reset ${t.name}'s PIN`, async token => {
      const r = await authService.resetTeacherPin(scope, t.membershipId, reason[t.membershipId] ?? '', token);
      if (!r.ok) setError(r.error);
      else setReason(x => ({ ...x, [t.membershipId]: '' }));
      q.reload();
    }, 'SENSITIVE_STAFF_ACTION');
  };

  return (
    <Section title="Teacher sign-in PIN">
      <p className="text-sm text-slate-600 mb-2">
        Teachers sign in with a 4-digit PIN on their own device (an SMS code only on a new device). 5 wrong tries lock it, and
        the teacher can unlock it with "Forgot PIN" and an SMS code. Reset here only if the phone is lost: it clears the PIN
        and signs out all the teacher's devices. Check who is asking before you reset.
      </p>
      <ErrorBox message={error} />
      {q.status === 'loading' && <LoadingBlock />}
      {q.status === 'error' && <ErrorState message={q.error} onRetry={q.reload} />}
      {q.status === 'ready' && q.data.length === 0 && <EmptyState title="No teachers in this school yet." />}
      {q.status === 'ready' && q.data.length > 0 && (
        <ul className="space-y-2">
          {q.data.map(t => (
            <li key={t.membershipId}>
              <Panel className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-slate-500">{t.title} · {t.mobile}</p>
                    {t.updatedAt && <p className="text-xs text-slate-500">PIN last changed {formatDateTime(new Date(t.updatedAt).toISOString())}</p>}
                  </div>
                  <Pill tone={t.locked ? 'danger' : t.pinSet ? 'success' : 'info'}>{t.locked ? 'PIN locked' : t.pinSet ? 'PIN on' : 'PIN not set yet'}</Pill>
                </div>
                {t.pinSet && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={reason[t.membershipId] ?? ''} onChange={e => setReason(r => ({ ...r, [t.membershipId]: e.target.value.slice(0, 200) }))} placeholder="Reason (required)" className={`${inputClass} py-2 flex-1`} />
                    <button onClick={() => reset(t)} className="min-h-11 px-4 rounded-xl border border-rose-300 text-rose-800 font-semibold">Reset PIN</button>
                  </div>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

export const AdminStaffAccess: React.FC = () => {
  const scope = useScope();
  const { promptSensitiveActionAuth } = useAuth();
  const q = useQuery(() => authService.listSchoolAccounts(scope), [scope.schoolId]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('Administrator');
  const [perms, setPerms] = useState<AdminPermission[]>(['REPORTS']);
  const [invite, setInvite] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;

  const activeAdmins = q.data.filter(a => a.role === 'ADMIN' && a.status === 'ACTIVE').length;

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await authService.inviteAdmin(scope, { name, email, title, permissions: perms });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setInvite(r.data.token);
    setName('');
    setEmail('');
    q.reload();
  };

  const setStatus = (a: StaffAccountView, status: 'ACTIVE' | 'DISABLED') => {
    setError(null);
    // Say it before asking for an OTP; the service enforces it again.
    if (status === 'DISABLED' && activeAdmins - 1 < 2) {
      return setError('Blocked: the school must keep at least two active Admins. Invite and activate another Admin first.');
    }
    if ((reason[a.accountId] ?? '').trim().length < 10) return setError('Give a reason (10+ characters).');
    promptSensitiveActionAuth(`${status === 'DISABLED' ? 'Suspend' : 'Reactivate'} ${a.name}`, async token => {
      const r = await authService.setAdminStatus(scope, a.accountId, status, reason[a.accountId] ?? '', token);
      if (!r.ok) setError(r.error);
      q.reload();
    }, 'SENSITIVE_STAFF_ACTION');
  };

  return (
    <div className="space-y-6 max-w-3xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">Staff access</h1>
        <p className="text-sm text-slate-600">Principal and Admin sign in with the school's own email. Accounts are suspended, never deleted.</p>
      </div>
      <p className={`p-3 rounded-xl text-sm border ${activeAdmins >= 2 ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
        {activeAdmins} active Admin(s). The school must keep at least two, so suspending is blocked when it would leave fewer.
      </p>
      <ErrorBox message={error} />
      <Section title="Accounts">
        <ul className="space-y-2">
          {q.data.map(a => (
            <li key={a.accountId}>
              <Panel className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.name}{a.accountId === scope.userId ? ' (you)' : ''}</p>
                    <p className="text-sm text-slate-500 break-all">{a.email} · {a.title}</p>
                    <p className="text-xs text-slate-500">Sign-in: {a.signIn.join(', ') || 'not set up yet'}{a.permissions.length ? ` · ${a.permissions.map(p => PERMISSION_LABEL[p]).join(', ')}` : ''}</p>
                  </div>
                  <Pill tone={a.status === 'ACTIVE' ? 'success' : a.status === 'INVITED' ? 'info' : 'danger'}>{a.status === 'DISABLED' ? 'suspended' : a.status.toLowerCase()}</Pill>
                </div>
                {a.pendingInvite && <p className="text-xs text-slate-600">Invitation: <span className="font-mono break-all">/login?invite={a.pendingInvite.token}</span> · expires {formatDateTime(new Date(a.pendingInvite.expiresAt).toISOString())}</p>}
                {a.role === 'ADMIN' && a.accountId !== scope.userId && (a.status === 'ACTIVE' || a.status === 'DISABLED') && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={reason[a.accountId] ?? ''} onChange={e => setReason(r => ({ ...r, [a.accountId]: e.target.value.slice(0, 200) }))} placeholder="Reason (required)" className={`${inputClass} py-2 flex-1`} />
                    {a.status === 'ACTIVE' ? (
                      <button onClick={() => setStatus(a, 'DISABLED')} className="min-h-11 px-4 rounded-xl border border-rose-300 text-rose-800 font-semibold">Suspend</button>
                    ) : (
                      <button onClick={() => setStatus(a, 'ACTIVE')} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white font-semibold">Reactivate</button>
                    )}
                  </div>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Invite an Admin">
        <form onSubmit={sendInvite}>
          <Panel className="p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="block"><span className="block text-sm font-semibold mb-1">Full name</span><input value={name} onChange={e => setName(e.target.value.slice(0, 80))} className={inputClass} /></label>
              <label className="block"><span className="block text-sm font-semibold mb-1">School email</span><input type="email" value={email} onChange={e => setEmail(e.target.value.slice(0, 120))} className={inputClass} /></label>
            </div>
            <label className="block"><span className="block text-sm font-semibold mb-1">Title</span><input value={title} onChange={e => setTitle(e.target.value.slice(0, 80))} className={inputClass} /></label>
            <fieldset>
              <legend className="text-sm font-semibold mb-1">Permissions</legend>
              <div className="grid sm:grid-cols-2 gap-1">
                {ALL_PERMS.map(p => (
                  <label key={p} className="flex items-center gap-2 min-h-10 text-sm">
                    <input type="checkbox" checked={perms.includes(p)} onChange={e => setPerms(x => (e.target.checked ? [...x, p] : x.filter(y => y !== p)))} className="w-5 h-5" />
                    {PERMISSION_LABEL[p]}
                  </label>
                ))}
              </div>
            </fieldset>
            <PrimaryButton type="submit" loading={busy} disabled={!name.trim() || !email.trim()}>Create invitation</PrimaryButton>
            {invite && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm space-y-1">
                {!USE_BACKEND && <MockLabel>Prototype / mock: no email is sent</MockLabel>}
                <p>Send this link to the new Admin: <span className="font-mono font-semibold break-all">{window.location.origin}/login?invite={invite}</span></p>
                <p>Valid 48 hours, single use. They set a password (or link Microsoft/Google) and confirm an email OTP.</p>
              </div>
            )}
          </Panel>
        </form>
      </Section>

      <TeacherPins />
    </div>
  );
};

export const AdminAudit: React.FC = () => {
  const scope = useScope();
  const q = useQuery(() => adminService.listAudit(scope), [scope.schoolId]);
  const [filter, setFilter] = useState('');
  if (q.status === 'loading') return <LoadingBlock />;
  if (q.status === 'error') return <ErrorState message={q.error} onRetry={q.reload} />;
  const f = filter.trim().toLowerCase();
  const rows = q.data.filter(e => !f || `${e.action} ${e.details} ${e.actorRole} ${e.targetId}`.toLowerCase().includes(f));
  return (
    <div className="space-y-4 max-w-4xl xl:max-w-6xl">
      <div>
        <h1 className="text-xl font-bold">Audit log</h1>
        <p className="text-sm text-slate-600">Append-only. Nobody can edit or delete entries.</p>
      </div>
      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter, e.g. GOVERNANCE or FEE" className={inputClass} aria-label="Filter audit log" />
      {rows.length === 0 ? <EmptyState title="No entries" /> : (
        <Panel className="divide-y divide-slate-100 text-sm">
          {rows.slice(0, 200).map(e => (
            <div key={e.id} className="p-3">
              <p className="font-semibold">{e.action.replace(/_/g, ' ').toLowerCase()}</p>
              <p className="text-slate-600 break-words">{e.details}{e.reason ? ` · Reason: ${e.reason}` : ''}</p>
              <p className="text-xs text-slate-500">{formatDateTime(e.at)} · {e.actorRole.toLowerCase()} {e.actorId}</p>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
};
