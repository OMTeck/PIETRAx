import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { authApi, type AuthUser } from '@/admin/server';
import { isApiError } from '@/lib/api';

type AuthStatus =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'mfa-step'; remember: boolean }
  | { kind: 'authenticated'; user: AuthUser };

interface AdminAuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  mfaVerify: (token: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then((user) => {
        if (!cancelled) setStatus({ kind: 'authenticated', user });
      })
      .catch((err) => {
        if (cancelled) return;
        if (isApiError(err) && (err.status === 401 || err.status === 403)) {
          setStatus({ kind: 'anonymous' });
        } else {
          // Server unreachable — stay anonymous so the login screen can retry.
          setStatus({ kind: 'anonymous' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, remember = false) => {
    const res = await authApi.login(email, password, remember);
    if (res.mfaRequired) {
      setStatus({ kind: 'mfa-step', remember });
      return;
    }
    if (res.user) setStatus({ kind: 'authenticated', user: res.user });
  }, []);

  const mfaVerify = useCallback(async (token: string, remember = false) => {
    const user = await authApi.mfaVerify(token, remember);
    setStatus({ kind: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Best-effort: clear the client state regardless.
    }
    setStatus({ kind: 'anonymous' });
  }, []);

  const refresh = useCallback(async () => {
    const user = await authApi.me();
    setStatus({ kind: 'authenticated', user });
  }, []);

  const user = status.kind === 'authenticated' ? status.user : null;

  return (
    <AdminAuthContext.Provider value={{ status, user, login, mfaVerify, logout, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}