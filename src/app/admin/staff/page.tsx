'use client';

import { Fragment, useMemo, useState } from 'react';
import { KeyRound, LogIn, Pencil, Plus, ShieldCheck, Upload, UserPlus } from 'lucide-react';
import { useApp } from '@/components/providers/app';
import { PageHeader } from '@/components/admin/shell';
import { Alert, Avatar, DataTable, EmptyState, Panel, Skeleton, StatusChip, Toggle } from '@/components/ui';
import { CheckboxRow, SelectInput, TextInput } from '@/components/ui/forms';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';
import { StaffImport } from '@/components/admin/staff-import';
import { ROLE_META } from '@/lib/domain/status';
import { PERMISSION_GROUPS, ROLE_PERMISSIONS } from '@/lib/domain/permissions';
import { formatMediumDate } from '@/lib/domain/dates';
import type { PermissionKey, Role } from '@/lib/domain/types';
import type { StaffView } from '@/lib/view-types';

interface Draft {
  id?: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: Role;
  jobTitle: string;
  shift: string;
  active: boolean;
  password: string;
  permissions: PermissionKey[];
}

const BLANK: Draft = {
  name: '',
  username: '',
  email: '',
  phone: '',
  role: 'receptionist',
  jobTitle: '',
  shift: '',
  active: true,
  password: '',
  permissions: [],
};

export default function StaffPage() {
  const { snapshot, request, toast, can } = useApp();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<{ staff: StaffView; activate: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staff = snapshot?.staff ?? [];

  const workload = useMemo(() => {
    if (!snapshot) return {} as Record<string, { open: number; done: number }>;
    const map: Record<string, { open: number; done: number }> = {};
    for (const s of staff) map[s.id] = { open: 0, done: 0 };
    for (const t of snapshot.housekeeping) {
      if (!t.assignedTo || !map[t.assignedTo]) continue;
      if (t.status === 'clean') map[t.assignedTo].done += 1;
      else map[t.assignedTo].open += 1;
    }
    return map;
  }, [snapshot, staff]);

  if (!snapshot) return <Skeleton className="h-96" />;

  if (!can('staff.manage'))
    return (
      <div className="space-y-4">
        <PageHeader title="Staff & permissions" description="Who can sign in, and what each role is allowed to touch." />
        <Panel title="Your access" bodyClass="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar name={snapshot.user.name} size={40} />
            <div>
              <p className="text-[0.92rem] font-semibold text-navy-800">{snapshot.user.name}</p>
              <p className="text-[0.78rem] text-navy-500">
                {snapshot.user.jobTitle} · {ROLE_META[snapshot.user.role].label}
              </p>
            </div>
          </div>
          <p className="text-[0.8rem] text-navy-500">
            You hold {snapshot.permissions.length} permission{snapshot.permissions.length === 1 ? '' : 's'}. Only an administrator can add accounts or change roles — ask an admin if you need
            something.
          </p>
          <PermissionMatrix />
        </Panel>
      </div>
    );

  async function toggleActive() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/api/staff/${confirm.staff.id}`, { method: 'PATCH', data: { active: confirm.activate } });
      toast({
        tone: 'success',
        title: confirm.activate ? 'Account reactivated' : 'Account suspended',
        body: confirm.activate
          ? `${confirm.staff.name} can sign in again.`
          : `${confirm.staff.name} is signed out and cannot sign back in. Their historic entries on folios and receipts stay intact.`,
      });
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The account could not be updated.');
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const byRole = (role: Role) => staff.filter((s) => s.role === role);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff & permissions"
        description="Accounts, roles and the exact rights each role carries. Everything the interface hides is also refused by the API — permissions are enforced on the server."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary h-9 px-3 text-[0.82rem]"
              onClick={() => setImporting(true)}
            >
              <Upload size={14} /> Import list
            </button>
            <button type="button" className="btn-gold h-9 px-3.5 text-[0.82rem]" onClick={() => setCreating(true)}>
              <UserPlus size={15} /> Add account
            </button>
          </div>
        }
      />

      {error ? (
        <Alert tone="error" title="Change refused">
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Accounts"
          subtitle={`${staff.filter((s) => s.active).length} active of ${staff.length} · each person signs in with the password set for their own account`}
          bodyClass="divide-y divide-sand-100"
        >
          {(['super_admin', 'admin', 'receptionist', 'cleaner'] as Role[]).map((role) => {
            const rows = byRole(role);
            if (!rows.length) return null;
            return (
              <div key={role}>
                <p className="flex items-center gap-2 bg-sand-50/70 px-4 py-2 text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-navy-400">
                  {ROLE_META[role].label}
                  <span className="chip normal-case tracking-normal">{rows.length}</span>
                </p>
                <DataTable head={['Person', 'Handle', 'Rights', 'Cleaning load', 'Last seen', '']}>
                  {rows.map((s) => (
                    <tr key={s.id} className={`row-hover border-b border-sand-100 last:border-b-0 ${s.active ? '' : 'opacity-60'}`}>
                      <td className="td">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={s.name} size={30} tone={s.active ? 'navy' : 'teal'} />
                          <span className="min-w-0">
                            <span className="block truncate text-[0.85rem] font-semibold text-navy-800">{s.name}</span>
                            <span className="block truncate text-[0.72rem] text-navy-400">
                              {s.jobTitle || '—'}
                              {s.shift ? ` · ${s.shift} shift` : ''}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="td">
                        <span className="block font-mono text-[0.78rem] text-navy-600">{s.username}</span>
                        <span className="block truncate text-[0.7rem] text-navy-400">{s.email || s.phone || '—'}</span>
                      </td>
                      <td className="td">
                        {s.permissions?.length ? (
                          <span className="chip bg-gold-50 text-gold-700" title={s.permissions.join(', ')}>
                            <KeyRound size={11} /> {s.permissions.length} overrides
                          </span>
                        ) : (
                          <span className="text-[0.78rem] text-navy-400">{ROLE_PERMISSIONS[s.role].length} from role</span>
                        )}
                      </td>
                      <td className="td text-[0.78rem] text-navy-600 tnum">
                        {s.role === 'cleaner' ? `${workload[s.id]?.open ?? 0} open · ${workload[s.id]?.done ?? 0} done` : '—'}
                      </td>
                      <td className="td text-[0.76rem] text-navy-400">
                        {s.lastSeenAt ? formatMediumDate(s.lastSeenAt.slice(0, 10)) : 'never'}
                        <span className={`ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${s.active ? 'bg-st-available' : 'bg-sand-400'}`} />
                      </td>
                      <td className="td">
                        <span className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={() =>
                              setEditing({
                                id: s.id,
                                name: s.name,
                                username: s.username,
                                email: s.email ?? '',
                                phone: s.phone ?? '',
                                role: s.role,
                                jobTitle: s.jobTitle ?? '',
                                shift: s.shift ?? '',
                                active: s.active,
                                password: '',
                                permissions: s.permissions ?? [],
                              })
                            }
                          >
                            <Pencil size={12} /> Edit
                          </button>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirm({ staff: s, activate: !s.active })}>
                            {s.active ? 'Suspend' : 'Restore'}
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            );
          })}
        </Panel>

        <div className="space-y-4">
          <RegisteredUsersRolePanel />
          <PermissionMatrix />

          <Panel title="What a cleaner can never see" bodyClass="p-4 space-y-2 text-[0.82rem] leading-relaxed text-navy-600">
            <p>
              The role projection happens before the browser gets any data: a cleaner&apos;s snapshot contains only the jobs assigned to them. Guest phone numbers, ID documents, folios, receipts
              and balances are absent from the payload, not merely hidden by CSS.
            </p>
            <ul className="mt-2 space-y-1">
              {[
                'Payments and balances — never present in their payload',
                'Guest contact details — stripped for every role without guests.viewPii',
                'Booking amendments and cancellations — refused by the API with 403',
                'Other cleaners’ workloads — they see their own list only',
              ].map((line) => (
                <li key={line} className="flex items-start gap-1.5">
                  <ShieldCheck size={13} className="mt-0.5 shrink-0 text-st-available" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Sign-in as this person" subtitle="Prefill the handle, then type that person’s own password" bodyClass="p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {staff
                .filter((s) => s.active)
                .slice(0, 6)
                .map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg border border-sand-200 px-2.5 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8rem] font-semibold text-navy-800">{s.name}</span>
                      <span className="block truncate text-[0.7rem] text-navy-400">{ROLE_META[s.role].label}</span>
                    </span>
                    <a href={`/login?username=${encodeURIComponent(s.username)}`} className="btn-secondary btn-sm">
                      <LogIn size={12} /> Prefill
                    </a>
                  </div>
                ))}
            </div>
            <p className="mt-2 text-[0.74rem] text-navy-400">
              Signing in as somebody else always requires their password — there is no one-click impersonation, so an audit trail can never be attributed to the wrong person.
            </p>
          </Panel>
        </div>
      </div>

      <Modal
        open={importing}
        onClose={() => setImporting(false)}
        size="lg"
        title="Import a staff list"
        subtitle="Create several receptionist or cleaner accounts at once, each with its own password."
      >
        <StaffImport onClose={() => setImporting(false)} />
      </Modal>

      <StaffEditor
        open={creating || !!editing}
        draft={editing ?? BLANK}
        onChange={setEditing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={toggleActive}
        title={confirm?.activate ? `Restore ${confirm?.staff.name}?` : `Suspend ${confirm?.staff.name}?`}
        confirmLabel={confirm?.activate ? 'Restore access' : 'Suspend account'}
        tone={confirm?.activate ? 'gold' : 'danger'}
        body={
          confirm?.activate ? (
            <p>They can sign in again with their existing password and resume at their role&apos;s permission level.</p>
          ) : (
            <p>
Sessions in progress are refused at the next request, and the account disappears from the cleaner rosters.{' '}
              {confirm?.staff.role === 'admin' ? 'This is an administrator account — the last active admin can never be suspended.' : ''}
            </p>
          )
        }
      />
    </div>
  );
}

function PermissionMatrix() {
  return (
    <Panel title="Role matrix" subtitle="What each role carries by default; per-account overrides replace the row entirely" bodyClass="overflow-x-auto">
      <table className="w-full min-w-[38rem] border-collapse text-[0.8rem]">
        <thead>
          <tr className="border-b border-sand-200 bg-sand-50/70">
            <th className="th w-[15rem] text-left">Capability</th>
            {(['admin', 'receptionist', 'cleaner'] as Role[]).map((r) => (
              <th key={r} className="th text-center">
                {ROLE_META[r].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {PERMISSION_GROUPS.map((group) => (
            <Fragment key={group.title}>
              <tr className="bg-sand-50/40">
                <th colSpan={4} className="px-4 py-1.5 text-left text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-navy-400">
                  {group.title}
                  <span className="ml-2 font-normal normal-case tracking-normal text-navy-400/80">{group.note}</span>
                </th>
              </tr>
              {group.keys.map((key) => (
                <tr key={key}>
                  <td className="td font-mono text-[0.76rem] text-navy-600">{key}</td>
                  {(['admin', 'receptionist', 'cleaner'] as Role[]).map((r) => {
                    const allowed = ROLE_PERMISSIONS[r].includes(key);
                    return (
                      <td key={r} className="td text-center">
                        <StatusChip className={allowed ? 'bg-st-availableBg text-st-available' : 'bg-sand-100 text-navy-400'}>{allowed ? 'yes' : '—'}</StatusChip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function StaffEditor({
  open,
  draft,
  onChange,
  onClose,
}: {
  open: boolean;
  draft: Draft;
  onChange: (d: Draft) => void;
  onClose: () => void;
}) {
  const { request, toast, snapshot } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const isOverride = draft.permissions.length > 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const data: Record<string, unknown> = {
        name: draft.name.trim(),
        username: draft.username.trim().toLowerCase(),
        role: draft.role,
        jobTitle: draft.jobTitle.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        shift: draft.role === 'cleaner' ? draft.shift || null : null,
        active: draft.active,
      };
      if (draft.password.trim()) data.password = draft.password.trim();
      if (draft.id) data.permissions = isOverride ? draft.permissions : null;
      if (draft.id) await request(`/api/staff/${draft.id}`, { method: 'PATCH', data });
      else await request('/api/staff', { method: 'POST', data });
      toast({
        tone: 'success',
        title: draft.id ? 'Account updated' : 'Account created',
        body: draft.id
          ? `${draft.name}'s access is saved. Any override applies from their next request.`
          : `${draft.name} can now sign in with the password you set for them.`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The account could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={draft.id ? `Edit ${draft.name || 'account'}` : 'New staff account'}
      subtitle="Roles set the permission set. Overrides are for genuine exceptions and are visible to every administrator here."
      footer={
        <>
          <button type="button" className="btn-ghost h-10 px-3.5" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary h-10 px-4" onClick={save} disabled={busy || draft.name.trim().length < 2 || draft.username.trim().length < 2}>
            {busy ? 'Saving…' : draft.id ? 'Save account' : 'Create account'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="error" title="Not saved">{error}</Alert> : null}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextInput label="Full name" required value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mary Gondwe" />
          <TextInput
            label="Login handle"
            required
            value={draft.username}
            onChange={(e) => set({ username: e.target.value })}
            placeholder="mary"
            error={
              snapshot?.staff.some((s) => s.username.toLowerCase() === draft.username.trim().toLowerCase() && s.id !== draft.id)
                ? 'That handle is already taken.'
                : null
            }
          />
          <TextInput label="Job title" value={draft.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} placeholder="Senior receptionist" />
          <SelectInput
            label="Role"
            value={draft.role}
            onChange={(e) => set({ role: e.target.value as Role, permissions: [] })}
            options={(Object.keys(ROLE_META) as Role[]).map((r) => ({ value: r, label: ROLE_META[r].label, note: `${ROLE_PERMISSIONS[r].length} permissions` }))}
          />
          <TextInput label="Email" type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} placeholder="mary@example.com" />
          <TextInput label="Phone" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+260 966 555 0184" />
          {draft.role === 'cleaner' ? (
            <SelectInput
              label="Shift"
              value={draft.shift}
              onChange={(e) => set({ shift: e.target.value })}
              options={[
                { value: '', label: 'No fixed shift' },
                { value: 'morning', label: 'Morning (06:00 – 14:00)' },
                { value: 'afternoon', label: 'Afternoon (12:00 – 18:00)' },
                { value: 'evening', label: 'Evening (14:00 – 20:00)' },
              ]}
            />
          ) : null}
          <TextInput
            label={draft.id ? 'Reset password (optional)' : 'Password'}
            type="password"
            value={draft.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder={draft.id ? 'Leave blank to keep the current password' : 'Set a password for this person'}
            hint={draft.id ? 'Passwords are stored hashed with a per-user salt; nobody can read the current one back.' : 'Required — the person needs it to sign in. At least six characters.'}
            required={!draft.id}
            error={draft.password && draft.password.trim().length < 6 ? 'Use at least six characters.' : null}
          />
        </div>

        <Toggle
          label="Account is active"
          hint="A suspended account keeps its historic entries but cannot sign in or be assigned work."
          checked={draft.active}
          onChange={(on) => set({ active: on })}
        />

        <div className="rounded-xl border border-sand-200 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.85rem] font-semibold text-navy-800">Permission overrides</p>
            <div className="flex items-center gap-1.5">
              <button type="button" className="btn-ghost btn-sm" onClick={() => set({ permissions: [...ROLE_PERMISSIONS[draft.role]] })}>
                Copy the role default
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => set({ permissions: [] })} disabled={!isOverride}>
                Use role default
              </button>
            </div>
          </div>
          <p className="mt-1 text-[0.76rem] leading-relaxed text-navy-400">
            {isOverride
              ? 'This account runs on an explicit list, so a change to the role default will not touch it. Write the reason in the handover notes.'
              : `No override — the account follows ${ROLE_META[draft.role].label} exactly (${ROLE_PERMISSIONS[draft.role].length} permissions). Tick a box to start an exception.`}
          </p>
          <div className="mt-3 space-y-3">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="label mb-1">{group.title}</p>
                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {group.keys.map((key) => (
                    <CheckboxRow
                      key={key}
                      label={<span className="font-mono text-[0.78rem]">{key}</span>}
                      checked={draft.permissions.includes(key)}
                      onChange={(on) => set({ permissions: on ? [...draft.permissions, key] : draft.permissions.filter((p) => p !== key) })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {!draft.id ? (
          <p className="flex items-start gap-1.5 text-[0.76rem] leading-relaxed text-navy-400">
            <ShieldCheck size={13} className="mt-px shrink-0" />
            New accounts get no per-user overrides: they inherit the role, and you can add exceptions after saving. {snapshot?.staff.length ?? 0} accounts exist today.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function RegisteredUsersRolePanel() {
  const { snapshot, request, toast } = useApp();
  const [search, setSearch] = useState('');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  if (!snapshot) return null;
  const isSuper = snapshot.user.role === 'super_admin';

  const users = (snapshot.users ?? []).filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  async function updateRole(uid: string, role: Role) {
    setUpdatingUid(uid);
    try {
      await request(`/api/users/${uid}/role`, { method: 'PATCH', data: { role } });
      toast({
        tone: 'success',
        title: 'Role updated',
        body: `Account role changed to ${role.replace(/_/g, ' ')} and synchronised.`,
      });
    } finally {
      setUpdatingUid(null);
    }
  }

  async function toggleUserStatus(uid: string, nextStatus: 'active' | 'deactivated') {
    setUpdatingUid(uid);
    try {
      await request(`/api/users/${uid}/status`, {
        method: 'PATCH',
        data: { accountStatus: nextStatus },
      });
      toast({
        tone: 'success',
        title: nextStatus === 'active' ? 'Account reactivated' : 'Account deactivated',
        body:
          nextStatus === 'deactivated'
            ? 'Active session tokens were immediately revoked.'
            : 'Account restored.',
      });
    } finally {
      setUpdatingUid(null);
    }
  }

  return (
    <Panel
      title="Registered Users & Role Promotion"
      subtitle="Promote registered guests to staff roles or revoke access"
      bodyClass="p-4 space-y-3"
    >
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search registered users by name, email, or role..."
        className="field text-[0.8rem]"
      />
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {users.slice(0, 20).map((u) => {
          const lockedSuper = u.role === 'super_admin' && !isSuper;
          return (
            <div
              key={u.uid}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sand-200 p-2.5 text-[0.78rem]"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy-900">{u.fullName}</p>
                <p className="truncate text-[0.72rem] text-navy-500">
                  {u.email} · <span className="uppercase">{u.accountStatus}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  disabled={lockedSuper || updatingUid === u.uid}
                  value={u.role}
                  onChange={(e) => void updateRole(u.uid, e.target.value as Role)}
                  className="field h-8 w-auto py-1 text-[0.75rem]"
                >
                  {isSuper || u.role === 'super_admin' ? (
                    <option value="super_admin">Super Admin</option>
                  ) : null}
                  <option value="admin">Admin</option>
                  <option value="receptionist">Receptionist</option>
                  <option value="cleaner">Cleaner</option>
                  <option value="guest">Guest</option>
                </select>
                {u.uid !== snapshot.user.id && !lockedSuper ? (
                  <button
                    type="button"
                    disabled={updatingUid === u.uid}
                    onClick={() =>
                      void toggleUserStatus(
                        u.uid,
                        u.accountStatus === 'active' ? 'deactivated' : 'active',
                      )
                    }
                    className="btn-secondary h-8 px-2 text-[0.72rem]"
                  >
                    {u.accountStatus === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

