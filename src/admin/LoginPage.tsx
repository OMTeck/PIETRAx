import { useState, type FormEvent } from 'react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { isApiError } from '@/lib/api';
import { Button, Input, Field, Spinner } from '@/admin/ui';

function ErrorNote({ message }: { message: string }) {
  return <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{message}</div>;
}

export function LoginPage() {
  const { status, login, mfaVerify } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const step = status.kind === 'mfa-step' ? 'mfa' : 'credentials';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (step === 'mfa') {
        await mfaVerify(token.trim(), remember);
      } else {
        await login(email.trim(), password, remember);
      }
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Unable to reach the server.');
      setToken('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">PIETRA Admin</h1>
          <p className="mt-1 text-sm text-stone-500">Sign in to manage the showroom</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          {step === 'mfa' ? (
            <>
              <p className="mb-4 text-sm text-stone-600">
                Two-factor authentication is enabled for this account. Enter the 6-digit code from your authenticator app, or one of your
                recovery codes.
              </p>
              <Field label="Verification code">
                <Input
                  autoFocus
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="123456 or XXXX-XXXX-XXXX"
                  autoComplete="one-time-code"
                  inputMode="text"
                />
              </Field>
              {error && <div className="mt-3"><ErrorNote message={error} /></div>}
              <Button type="submit" className="mt-5 w-full" loading={busy}>
                Verify
              </Button>
            </>
          ) : (
            <>
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@pietra.dev"
                />
              </Field>
              <div className="mt-4">
                <Field label="Password">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                  />
                </Field>
              </div>
              {error && <div className="mt-3"><ErrorNote message={error} /></div>}
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-stone-300"
                />
                Keep me signed in on this device
              </label>
              <Button type="submit" className="mt-5 w-full" loading={busy}>
                Sign in
              </Button>
            </>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-stone-400">
          <a href="#/" className="hover:text-stone-600">← Back to the showroom</a>
        </p>
      </div>
    </div>
  );
}

export function LoginSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100">
      <div className="flex items-center gap-3 text-stone-500">
        <Spinner className="h-5 w-5" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}