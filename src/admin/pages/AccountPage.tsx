import { useState } from 'react';
import { KeyRound, ShieldCheck, ShieldOff, RotateCcw, LogOut, Copy, Check } from 'lucide-react';
import { accountApi } from '@/admin/server';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { can, PERM, ROLE_LABELS } from '@/admin/permissions';
import { Button, Input, Field, PageHeader, Card, Loading, Modal, Badge, statusTone, useToast, fmtDateTime } from '@/admin/ui';
import type { SessionRow } from '@/admin/types';

export function AccountPage() {
  const { toast } = useToast();
  const { user, refresh } = useAdminAuth();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showMfa, setShowMfa] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  if (!user) return <Loading />;

  async function loadSessions() {
    setLoadingSessions(true);
    try {
      setSessions((await accountApi.sessions()).filter((s) => !s.current));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load sessions.', 'error');
    } finally {
      setLoadingSessions(false);
    }
  }

  return (
    <div>
      <PageHeader title="My Account" subtitle={`${user.name} — ${ROLE_LABELS[user.role]}`}>
        <Badge tone={user.status === 'ACTIVE' ? 'green' : 'amber'}>{user.status}</Badge>
      </PageHeader>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Profile">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs uppercase tracking-wider text-stone-500">Name</dt><dd className="mt-0.5 text-stone-900">{user.name}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-stone-500">Email</dt><dd className="mt-0.5 text-stone-900">{user.email}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-stone-500">Role</dt><dd className="mt-0.5 text-stone-900">{ROLE_LABELS[user.role]}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-stone-500">Member since</dt><dd className="mt-0.5 text-stone-900">{fmtDateTime(user.createdAt)}</dd></div>
          </dl>
        </Card>

        <ChangePasswordCard />
      </div>

      <div className="mt-5">
        <Card
          title="Two-factor authentication"
          actions={!user.mfaEnabled && can(user.role, PERM.settingsSecurity) ? (
            <Button size="sm" onClick={() => setShowMfa(true)}><ShieldCheck className="h-3.5 w-3.5" /> Enable</Button>
          ) : undefined}
        >
          {user.mfaEnabled ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="green">Enabled</Badge>
              <span className="text-sm text-stone-600">Every login requires a 6-digit code from your authenticator app.</span>
              <Button variant="outline" size="sm" onClick={() => setShowRecovery(true)}><KeyRound className="h-3.5 w-3.5" /> View recovery codes</Button>
            </div>
          ) : (
            <p className="text-sm text-stone-600">Two-factor authentication is off. Your administrator may require it for your role.</p>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card
          title="Active sessions"
          actions={<Button variant="outline" size="sm" onClick={() => void loadSessions()}>{loadingSessions ? 'Loading…' : 'Refresh'}</Button>}
        >
          {sessions === null ? (
            <p className="text-sm text-stone-400">Load your sessions to review login locations. This session is not listed.</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-stone-500">No other active sessions.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                  <th className="px-3 py-2.5 font-medium">IP</th>
                  <th className="px-3 py-2.5 font-medium">Device</th>
                  <th className="px-3 py-2.5 font-medium">Last active</th>
                  <th className="px-3 py-2.5 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sid} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2.5 font-mono text-xs text-stone-600">{s.ipAddress ?? '—'}</td>
                    <td className="max-w-52 truncate px-3 py-2.5 text-xs text-stone-600">{s.userAgent ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-stone-500">{fmtDateTime(s.lastActiveAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button size="sm" variant="ghost" onClick={async () => {
                        try {
                          await accountApi.revokeSession(s.sid);
                          toast('Session revoked.', 'success');
                          setSessions((prev) => (prev ?? []).filter((x) => x.sid !== s.sid));
                        } catch (err) {
                          toast(err instanceof Error ? err.message : 'Failed to revoke.', 'error');
                        }
                      }}>
                        <LogOut className="h-3.5 w-3.5" /> Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {showMfa && <MfaSetupModal onClose={() => setShowMfa(false)} onEnabled={() => { setShowMfa(false); void refresh(); }} />}
      {showRecovery && <RecoveryModal onClose={() => setShowRecovery(false)} />}
    </div>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmVal, setConfirmVal] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (next !== confirmVal) {
      toast('New passwords do not match.', 'error');
      return;
    }
    setSaving(true);
    try {
      await accountApi.changePassword(current, next);
      toast('Password changed.', 'success');
      setCurrent('');
      setNext('');
      setConfirmVal('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to change password.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Change password">
      <div className="space-y-3">
        <Field label="Current password"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="New password"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Confirm new password"><Input type="password" value={confirmVal} onChange={(e) => setConfirmVal(e.target.value)} /></Field>
        <Button onClick={() => void submit()} loading={saving} disabled={!current || !next || !confirmVal}>
          <RotateCcw className="h-4 w-4" /> Change password
        </Button>
      </div>
    </Card>
  );
}

function MfaSetupModal({ onClose, onEnabled }: { onClose: () => void; onEnabled: () => void }) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title="Set up two-factor authentication"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {null}
        </>
      }
    >
      {codes ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">Scan or re-generate. Below are your one-time recovery codes — store them somewhere safe.</p>
          <div className="grid grid-cols-2 gap-2">
            {codes.map((c) => <code key={c} className="rounded bg-stone-100 px-2 py-1 text-center font-mono text-sm">{c}</code>)}
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join('\n'));
              toast('Copied.', 'success');
            } catch {
              toast('Copy not supported.', 'error');
            }
          }}><Copy className="h-3.5 w-3.5" /> Copy codes</Button>
        </div>
      ) : qr ? (
        <div className="space-y-4">
          <img src={qr} alt="TOTP QR code" className="mx-auto h-48 w-48 rounded border border-stone-200 object-contain" />
          <Field label="6-digit code from your authenticator">
            <div className="flex gap-2">
              <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456" inputMode="numeric" />
              <Button
                onClick={async () => {
                  try {
                    const res = await accountApi.mfaConfirm(token);
                    setCodes(res.recoveryCodes);
                    onEnabled();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Invalid code.', 'error');
                  }
                }}
              >
                <Check className="h-4 w-4" /> Confirm
              </Button>
            </div>
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">Enter your current password to generate a setup QR code, then scan it with Google Authenticator or similar.</p>
          <Field label="Current password">
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <Button
            onClick={async () => {
              try {
                const res = await accountApi.mfaStart(currentPassword);
                setQr(res.qrCode);
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Failed to start setup.', 'error');
              }
            }}
          >
            Generate QR code
          </Button>
        </div>
      )}
    </Modal>
  );
}

function RecoveryModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [pw, setPw] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title="Recovery codes"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      {codes ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-600">These one-time codes can be used if you lose your authenticator. Keep them private.</p>
          <div className="grid grid-cols-2 gap-2">
            {codes.map((c) => <code key={c} className="rounded bg-stone-100 px-2 py-1 text-center font-mono text-sm">{c}</code>)}
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join('\n'));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              /* ignore */
            }
          }}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy codes'}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">Confirm your current password to generate fresh recovery codes (previous codes are invalidated).</p>
          <Field label="Current password">
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          <Button onClick={async () => {
            try {
              const res = await accountApi.mfaRecoveryCodes(pw);
              setCodes(res.recoveryCodes);
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Failed.', 'error');
            }
          }}>
            Generate codes
          </Button>
        </div>
      )}
    </Modal>
  );
}