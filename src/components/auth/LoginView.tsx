import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  User as UserIcon,
} from 'lucide-react';
import { BRAND } from '../../../shared/brand';
import { api, ApiError, setAuthToken } from '../../lib/api';
import type { WorkspaceUser } from '../../lib/workspace';
import { BrandLockup, BrandLogoImage } from '../brand/BrandLogo';

interface LoginViewProps {
  onSignedIn: (user: WorkspaceUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSignedIn }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dbProblem, setDbProblem] = useState<string | null>(null);

  const performLogin = async (userToSubmit: string, passToSubmit: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ user?: WorkspaceUser; token?: string }>('auth/login', {
        username: userToSubmit.trim(),
        password: passToSubmit,
      });
      if (res?.token) {
        setAuthToken(res.token);
      }
      if (res?.user) {
        onSignedIn(res.user);
      } else {
        setError('Sign-in failed. No user details returned.');
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please check credentials and try again.');
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ database: { connected: boolean; message: string } }>('health')
      .then((health) => {
        if (!cancelled && !health.database.connected) {
          setDbProblem(health.database.message);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await performLogin(username, password);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="relative lg:w-1/2 px-8 py-14 lg:px-16 lg:py-20 flex flex-col justify-between overflow-hidden brand-ink-panel">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, #ffffff 0 1px, transparent 1px 22px)',
          }}
        />
        <div className="relative">
          <BrandLockup size="lg" inverted />

          <h1 className="mt-14 font-display text-4xl lg:text-5xl font-extrabold leading-tight max-w-lg">
            One operating system for{' '}
            <span className="text-brand-400">the whole agency</span>.
          </h1>
          <p className="mt-5 max-w-md text-slate-300 leading-relaxed">
            Tours and itineraries, hotel and fleet logistics, airline ticketing, visa letters,
            staff records and the finance ledger — in a single shared workspace for the team in
            {' '}{BRAND.city}, wired to the catalogue published on {BRAND.website}.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 max-w-md text-sm">
            {[
              'Tour packages & departures',
              'Hotel & fleet logistics',
              'Airline ticket control',
              'Visa on arrival & permits',
              'Staff, payroll & onboarding',
              'Finance, receipts & audit',
            ].map((item, index) => (
              <div key={item} className="flex items-center gap-2 text-slate-300">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${
                    index % 2 === 0 ? 'bg-brand-400' : 'bg-lagoon-400'
                  }`}
                />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-12 text-xs text-slate-400">
          {BRAND.legalName} · {BRAND.address} · {BRAND.website}
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="lg:w-1/2 bg-white text-slate-900 px-8 py-10 lg:px-16 lg:py-16 flex items-center overflow-y-auto">
        <div className="w-full max-w-md mx-auto py-6">
          <BrandLogoImage className="h-12 -ml-1 mb-6 lg:hidden" />
          <div className="h-1 w-16 rounded-full brand-hairline" />
          <h2 className="mt-4 font-display text-2xl lg:text-3xl font-extrabold text-slate-900">Staff sign-in</h2>
          <p className="mt-1.5 text-slate-500 text-sm">
            Use your work username or email address. Your role decides which modules open.
          </p>

          {dbProblem && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <div className="font-semibold">Sign-in will not work yet — the database is not connected.</div>
                <p className="mt-1 leading-relaxed text-xs">{dbProblem}</p>
              </div>
            </div>
          )}

          {successNotice && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{successNotice}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Username or email
              </span>
              <div className="mt-1.5 relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Enter staff username"
                  autoComplete="username"
                  required
                />
              </div>
            </label>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Password</span>
              <div className="mt-1.5 relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-11 cursor-pointer rounded-xl brand-gradient py-3 text-sm font-semibold text-white shadow-brand transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? 'Signing in…' : 'Sign in to Workspace'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
