import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, ShieldCheck, UserCog, UserX } from 'lucide-react';
import { useWorkspace } from '../../lib/workspace';
import { api, ApiError } from '../../lib/api';
import { ROLES, ROLE_KEYS, getRoleDefinition, type RoleKey } from '../../../shared/roles';

interface StaffAccount {
  id: number;
  username: string;
  email: string | null;
  fullName: string;
  role: RoleKey;
  active: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
}

const emptyDraft = {
  username: '',
  fullName: '',
  email: '',
  role: 'AGENT' as RoleKey,
  password: '',
};

export const StaffAccountsView: React.FC<{ currentUserId: number }> = ({ currentUserId }) => {
  const { collections } = useWorkspace();
  const candidates: { name: string; email?: string; role: RoleKey; note: string }[] =
    (collections.departments || []).flatMap(d => d.onboardingCandidates || []);
  const [assignment, setAssignment] = useState<StaffAccount | null>(null);
  const [candidateNote, setCandidateNote] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  function closeForm() {
    setShowCreate(false);
    setAssignment(null);
    setDraft(emptyDraft);
    setCandidateNote('');
    setShowPassword(false);
  }
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [resetFor, setResetFor] = useState<StaffAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetMustChange, setResetMustChange] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [issued, setIssued] = useState<{username: string; password: string} | null>(null);
  const [issuing, setIssuing] = useState(false);

  async function issueFirstPassword(account: StaffAccount) {
    if (issuing || !account.active || !account.mustChangePassword || account.id === currentUserId) return;
    setIssuing(true);
    setIssued(null);
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      const password = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      if (await patch(account, {password, mustChangePassword: true})) setIssued({username:account.username, password});
    } finally {setIssuing(false);}
  }

  const load = async () => {
    setLoading(true);
    try {
      const { rows } = await api.get<{ rows: StaffAccount[] }>('accounts');
      setAccounts(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load staff accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const values = { ...draft, username: draft.username.trim().toLowerCase(), fullName: draft.fullName.trim(), email: draft.email.trim() };
      if (values.role === 'STAFF_PENDING') throw new Error('Choose a working role before activating this account.');
      if (!values.fullName || !values.username) throw new Error('Enter a name and username.');
      if (assignment) {
        await api.patch('accounts/' + assignment.id, {fullName: values.fullName, email: values.email, role: values.role,
          password: values.password, mustChangePassword: true, active: true});
      } else {
        await api.post('accounts', values);
      }
      setNotice(`Account "${values.username}" is ready for ${values.fullName}. Give them the temporary password privately for their first sign-in.`);
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setCreating(false);
    }
  };

  const patch = async (account: StaffAccount, changes: Record<string, unknown>) => {
    setError(null);
    try {
      await api.patch(`accounts/${account.id}`, changes);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the account.');
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Staff Accounts</h2>
          <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">
            Create sign-ins for the team and set what each person can reach. A new account, or one
            whose password you reset, must choose a new password before it can be used.
          </p>
        </div>
        <button
          onClick={() => { closeForm(); setShowCreate(!showCreate || Boolean(assignment)); }}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <Plus className="h-4 w-4" /> New account
        </button>
      </div>

      <section aria-label="Launch setup" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900">Launch setup</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
          {[
            ['Staff sign-ins enabled', loading ? '…' : accounts.filter(a => a.active && a.role !== 'CEO').length],
            ['Roster candidates', candidates.length],
            ['Departments', (collections.departments || []).length],
            ['Lodging partners', (collections.hotels || []).length],
            ['Fleet assets', (collections.vehicles || []).length],
            ['Scheduled departures', (collections.schedules || []).length],
            ['Client records', (collections.ticketingClients || []).length],
            ['Sales inquiries', (collections.websiteEnquiries || []).length]
          ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-600">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>)}
        </dl>
      </section>

      {issued && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="First password">
        <h3 className="font-bold">First password for {issued.username}</h3>
        <p className="mt-2 text-sm">Give this temporary password privately to the account holder. They choose their own password at first sign-in.</p>
        <input aria-label="Issued temporary password" className="mt-2 w-full rounded border bg-white p-2 font-mono" value={issued.password} readOnly onFocus={e=>e.currentTarget.select()}/>
        <button type="button" onClick={()=>setIssued(null)} className="mt-3 rounded border bg-white px-3 py-1 text-sm">Hide password</button>
      </section>}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {showCreate && (
        <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h3 className="mb-3 font-bold">{assignment ? 'Assign and activate @' + assignment.username : 'New staff sign-in'}</h3>
          {candidates.length > 0 && <label className="mb-4 block text-sm font-semibold">Choose a roster candidate (optional)
            <select className="mt-1 block w-full rounded-lg border p-2" defaultValue="" onChange={e=>{
              const person=candidates.find(c=>c.name===e.target.value);
              if (!person) {setCandidateNote(''); return;}
              setDraft(d=>({...d, fullName:person.name, role:person.role, email:assignment?.email || person.email || '', username:assignment?.username || person.email || person.name.toLowerCase().replace(/[^a-z0-9.]/g,'')}));
              setCandidateNote(person.note);
            }}>
              <option value="">Enter a staff member manually</option>
              {candidates.map(c=><option key={c.name} value={c.name}>{c.name} · {getRoleDefinition(c.role).label}</option>)}
            </select>
          </label>}
          {candidateNote && <p className="mb-3 text-sm text-amber-800">{candidateNote}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { key: 'fullName', label: 'Full name', placeholder: 'Selam Tesfay', type: 'text' },
              { key: 'username', label: 'Username', placeholder: 'selam', type: 'text' },
              { key: 'email', label: 'Work email', placeholder: 'selam@eritreavisit.com', type: 'email' },
              { key: 'password', label: 'Temporary password', placeholder: 'At least 8 characters', type: showPassword ? 'text' : 'password' },
            ].map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {field.label}
                </span>
                <input
                  type={field.type}
                  disabled={Boolean(assignment) && field.key === 'username'}
                  autoComplete={field.key === 'password' ? 'new-password' : 'off'}
                  minLength={field.key === 'password' ? 8 : undefined}
                  required={field.key !== 'email'}
                  value={(draft as any)[field.key]}
                  placeholder={field.placeholder}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white"
                />
              </label>
            ))}
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Role</span>
              <select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as RoleKey })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white"
              >
                {ROLE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {getRoleDefinition(key).label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/>Show temporary password</label>
          <p className="mt-3 text-xs text-slate-500">{getRoleDefinition(draft.role).description}</p>
          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 flex items-center gap-2 cursor-pointer"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />} {assignment ? 'Assign and activate' : 'Create account'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Staff member</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Last sign-in</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => (
                  <tr key={account.id} className={account.active ? '' : 'opacity-55'}>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{account.fullName}</div>
                      <div className="text-xs text-slate-500">
                        @{account.username}
                        {account.email ? ` · ${account.email}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <select
                        value={account.role}
                        disabled={account.id === currentUserId}
                        onChange={(e) => patch(account, { role: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {ROLE_KEYS.map((key) => (
                          <option key={key} value={key}>
                            {getRoleDefinition(key).label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          !account.active
                            ? 'bg-slate-100 text-slate-500'
                            : account.mustChangePassword
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {!account.active ? 'Deactivated' : account.mustChangePassword ? 'Password pending' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setResetFor(account);
                            setResetMustChange(true);
                            setResetPassword('');
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Reset password
                        </button>
                        {account.active && account.mustChangePassword && account.id !== currentUserId &&
                          <button type="button" disabled={issuing} onClick={()=>issueFirstPassword(account)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold">Issue first password</button>}
                        {!account.active && account.id !== currentUserId && (
                          <button className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold" onClick={()=>{
                            setAssignment(account);
                            setCandidateNote('');
                            setShowPassword(false);
                            setDraft({...emptyDraft, username:account.username, fullName:account.fullName.includes('Awaiting assignment')?'':account.fullName, email:account.email || '', role:account.role});
                            setShowCreate(true);
                          }}>Assign and activate</button>
                        )}
                        {account.id !== currentUserId && !(!account.active && (account.role === 'STAFF_PENDING' || account.fullName.includes('Awaiting assignment'))) && (
                          <button
                            onClick={() => patch(account, { active: !account.active })}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                              account.active
                                ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {account.active ? <UserX className="h-3.5 w-3.5" /> : <UserCog className="h-3.5 w-3.5" />}
                            {account.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resetFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Reset password for {resetFor.fullName}
            </h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Enter a new password for @{resetFor.username} (minimum 8 characters).
            </p>
            <input
              autoFocus
              type="password"
              autoComplete="new-password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:bg-white"
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={resetMustChange}
                onChange={(e) => setResetMustChange(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Require user to set their own password on next login</span>
            </label>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  setResetting(true);
                  try {
                    if (!await patch(resetFor, { password: resetPassword, mustChangePassword: resetMustChange })) return;
                    setNotice(`Password updated successfully for ${resetFor.fullName}.`);
                    setResetFor(null);
                    setResetPassword('');
                  } finally {
                    setResetting(false);
                  }
                }}
                disabled={resetPassword.length < 8 || resetting}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
                {resetting ? 'Updating…' : 'Save new password'}
              </button>
              <button
                type="button"
                onClick={() => setResetFor(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
