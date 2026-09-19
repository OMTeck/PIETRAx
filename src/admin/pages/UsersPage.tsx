import { useState } from 'react';
import { UserPlus, KeyRound, Trash2, LogOut, ShieldAlert } from 'lucide-react';
import { usersApi } from '@/admin/server';
import { usePaged } from '@/admin/lib';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { can, PERM, ROLES, ROLE_LABELS, ROLE_RANK } from '@/admin/permissions';
import { Button, Input, Select, Field, PageHeader, Card, Loading, EmptyState, Paginator, Modal, Badge, statusTone, useToast, fmtDate } from '@/admin/ui';
import type { AdminUser, Role, UserStatus } from '@/admin/types';

const STATUS: UserStatus[] = ['ACTIVE', 'DISABLED', 'PENDING'];

export function UsersPage() {
  const { toast } = useToast();
  const { user: me } = useAdminAuth();
  const [showInvite, setShowInvite] = useState(false);
  const [tokens, setTokens] = useState<{ name: string; email: string; token: string } | null>(null);

  const { data, loading, error, page, setPage, reload } = usePaged<AdminUser>(
    (p, ps) => usersApi.list({ page: p, pageSize: ps }),
    { pageSize: 20 },
  );

  if (!me) return null;
  const currentUser = me;
  if (!currentUser) return null;
  const canManage = can(currentUser.role, PERM.usersManage);
  const canDelete = can(currentUser.role, PERM.systemDelete);

  async function action(id: string, fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast(ok, 'success');
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Operation failed.', 'error');
    }
  }

  function isBelow(target: AdminUser): boolean {
    return target.id !== currentUser.id && ROLE_RANK[target.role] > ROLE_RANK[currentUser.role];
  }

  return (
    <div>
      <PageHeader title="Team" subtitle="Admins, editors, sales and viewers">
        {canManage && <Button onClick={() => setShowInvite(true)}><UserPlus className="h-4 w-4" /> Invite user</Button>}
      </PageHeader>

      <Card className="overflow-hidden">
        {loading && <Loading />}
        {error && <p className="px-5 py-6 text-sm text-red-700">{error}</p>}
        {!loading && !error && data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState title="No users" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-3 py-3 font-medium">Role</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">MFA</th>
                    <th className="px-3 py-3 font-medium">Last login</th>
                    <th className="px-3 py-3 font-medium">Sessions</th>
                    <th className="px-3 py-3 font-medium">Joined</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-5 py-3">
                        <div className="font-medium text-stone-900">{u.name}</div>
                        <div className="text-xs text-stone-500">{u.email}</div>
                      </td>
                      <td className="px-3 py-3">
                        {canManage && u.id !== currentUser.id ? (
                          <Select
                            value={u.role}
                            disabled={!isBelow(u)}
                            title={!isBelow(u) ? 'You can only manage lower-ranked roles' : undefined}
                            onChange={async (e) => {
                              await action(u.id, () => usersApi.update(u.id, { role: e.target.value as Role }), 'Role updated.');
                            }}
                            className="w-40"
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </Select>
                        ) : (
                          <Badge tone="gray">{ROLE_LABELS[u.role]}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isBelow(u) ? (
                          <Select
                            value={u.status}
                            onChange={async (e) => {
                              await action(u.id, () => usersApi.update(u.id, { status: e.target.value as UserStatus }), 'Status updated.');
                            }}
                            className="w-32"
                          >
                            {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select>
                        ) : (
                          <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">{u.mfaEnabled ? <Badge tone="green">On</Badge> : <Badge tone="gray">Off</Badge>}</td>
                      <td className="px-3 py-3 text-xs text-stone-500">{fmtDate(u.lastLoginAt)}</td>
                      <td className="px-3 py-3 text-stone-600">{u._count?.sessions ?? 0}</td>
                      <td className="px-3 py-3 text-xs text-stone-500">{fmtDate(u.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          {isBelow(u) && canManage && (
                            <>
                              <button title="Force password reset" onClick={() => action(u.id, async () => {
                                const token = await usersApi.resetPassword(u.id);
                                setTokens({ name: u.name, email: u.email, token });
                              }, 'Reset token issued.')} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                                <KeyRound className="h-4 w-4" />
                              </button>
                              <button title="Revoke sessions" onClick={() => action(u.id, () => usersApi.revokeSessions(u.id), 'Sessions revoked.')} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                                <LogOut className="h-4 w-4" />
                              </button>
                              {!u.mfaEnabled && (
                                <button title="Require MFA" onClick={async () => {
                                  try {
                                    await usersApi.requireMfa(u.id);
                                    toast('MFA required for this user.', 'success');
                                    reload();
                                  } catch (err) {
                                    toast(err instanceof Error ? err.message : 'Failed.', 'error');
                                  }
                                }} className="rounded p-1.5 text-stone-500 hover:bg-amber-50 hover:text-amber-700">
                                  <ShieldAlert className="h-4 w-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button title="Delete user" className="rounded p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => {
                                    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
                                    void action(u.id, () => usersApi.remove(u.id), 'User deleted.');
                                  }}>
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Paginator page={page} pages={data.pagination.pages} total={data.pagination.total} onPage={setPage} />
          </>
        )}
      </Card>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onIssued={(name, email, token) => { setShowInvite(false); setTokens({ name, email, token }); }}
        />
      )}

      {tokens && (
        <TokenModal
          name={tokens.name}
          email={tokens.email}
          token={tokens.token}
          onClose={() => setTokens(null)}
        />
      )}
    </div>
  );
}

function InviteModal({ onClose, onIssued }: { onClose: () => void; onIssued: (name: string, email: string, token: string) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('CONTENT_EDITOR');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const { activationToken } = await usersApi.invite({ name, email, role });
      onIssued(name, email, activationToken);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Invite failed.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Invite team member"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={saving}><UserPlus className="h-4 w-4" /> Create invite</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]} — {r}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-stone-500">The invitee receives a one-time activation link. Copy it now — it is only shown once and expires in 30 minutes.</p>
      </div>
    </Modal>
  );
}

function TokenModal({ name, email, token, onClose }: { name: string; email: string; token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/#/activate?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

  return (
    <Modal
      open
      onClose={onClose}
      title="One-time activation link"
      footer={
        <Button variant="outline" onClick={onClose}>Close</Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-stone-600">
          Share this link with <span className="font-medium text-stone-900">{name}</span> ({email}). It expires in 30 minutes and the token will not be shown again.
        </p>
        <div className="rounded border border-stone-200 bg-stone-50 p-2">
          <p className="break-all font-mono text-xs text-stone-800">{url}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>
    </Modal>
  );
}