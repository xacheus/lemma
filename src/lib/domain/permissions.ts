import type { PermissionKey, Role, StaffUser } from './types';

/**
 * Capability model. The matrix is enforced in three places on purpose:
 *   1. API route handlers (authoritative — see src/lib/api/guard.ts)
 *   2. Server components rendering the shell/navigation
 *   3. Client components hiding disabled affordances (UX only, never trust)
 */
export const ALL_PERMISSIONS: PermissionKey[] = [
  'reservations.view',
  'reservations.create',
  'reservations.edit',
  'reservations.cancel',
  'reservations.checkin',
  'calendar.view',
  'apartments.view',
  'apartments.manage',
  'guests.view',
  'guests.viewPii',
  'guests.manage',
  'payments.view',
  'payments.record',
  'payments.verify',
  'payments.refund',
  'housekeeping.view',
  'housekeeping.assign',
  'housekeeping.complete',
  'housekeeping.maintenance',
  'reports.view',
  'notifications.view',
  'notifications.manage',
  'notifications.send',
  'staff.manage',
  'settings.manage',
  'data.reset',
];

export const PERMISSION_GROUPS: { title: string; note: string; keys: PermissionKey[] }[] = [
  {
    title: 'Reservations',
    note: 'Booking creation, amendments and the arrivals/departures workflow.',
    keys: [
      'reservations.view',
      'reservations.create',
      'reservations.edit',
      'reservations.cancel',
      'reservations.checkin',
      'calendar.view',
    ],
  },
  {
    title: 'Inventory',
    note: 'Apartment catalogue, pricing and out-of-service control.',
    keys: ['apartments.view', 'apartments.manage'],
  },
  {
    title: 'Guests',
    note: 'Guest register. PII covers NRC/passport numbers and contact details.',
    keys: ['guests.view', 'guests.viewPii', 'guests.manage'],
  },
  {
    title: 'Payments',
    note: 'Verification is separated from capture so reception cannot self-approve receipts.',
    keys: ['payments.view', 'payments.record', 'payments.verify', 'payments.refund'],
  },
  {
    title: 'Housekeeping',
    note: 'Cleaners complete their own tasks and raise maintenance; supervisors allocate.',
    keys: [
      'housekeeping.view',
      'housekeeping.assign',
      'housekeeping.complete',
      'housekeeping.maintenance',
    ],
  },
  {
    title: 'Insight & comms',
    note: 'Reporting, notification templates and manual messaging workflow.',
    keys: ['reports.view', 'notifications.view', 'notifications.manage', 'notifications.send'],
  },
  {
    title: 'Administration',
    note: 'Accounts, roles and system configuration.',
    keys: ['staff.manage', 'settings.manage', 'data.reset'],
  },
];

export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  admin: ALL_PERMISSIONS,
  receptionist: [
    'reservations.view',
    'reservations.create',
    'reservations.edit',
    'reservations.cancel',
    'reservations.checkin',
    'calendar.view',
    'apartments.view',
    'guests.view',
    'guests.viewPii',
    'guests.manage',
    'payments.view',
    'payments.record',
    'housekeeping.view',
    'notifications.view',
    'notifications.send',
  ],
  /**
   * Cleaners see housekeeping only. Deliberately absent: payments.*, guests.*,
   * reports.*, reservations.edit — a cleaner must never reach financial data or
   * guest identity records.
   */
  cleaner: ['housekeeping.view', 'housekeeping.complete', 'housekeeping.maintenance'],
};

export function permissionsFor(user: Pick<StaffUser, 'role' | 'permissions'>): Set<PermissionKey> {
  const base = ROLE_PERMISSIONS[user.role] ?? [];
  if (user.permissions && user.permissions.length) {
    return new Set<PermissionKey>([...base, ...user.permissions]);
  }
  return new Set(base);
}

export function can(user: StaffUser | null, key: PermissionKey): boolean {
  if (!user || !user.active) return false;
  return permissionsFor(user).has(key);
}

export function describeMissing(key: PermissionKey): string {
  const role = roleForPermission(key);
  return `Your role is not authorised for this action (${key}). Ask an administrator — ${role} is the role that carries it.`;
}

export function roleForPermission(key: PermissionKey): string {
  const roles = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) =>
    ROLE_PERMISSIONS[r].includes(key),
  );
  return roles.length ? roles.map((r) => r.toUpperCase()).join('/') : 'admin only';
}

/** Sections of the admin area, used to build and filter the sidebar. */
export const NAV_SECTIONS: {
  href: string;
  label: string;
  permission: PermissionKey;
  group: 'operations' | 'commercial' | 'property' | 'system';
}[] = [
  { href: '/admin', label: 'Dashboard', permission: 'reservations.view', group: 'operations' },
  { href: '/admin/reservations', label: 'Reservations', permission: 'reservations.view', group: 'operations' },
  { href: '/admin/calendar', label: 'Booking Calendar', permission: 'calendar.view', group: 'operations' },
  { href: '/admin/housekeeping', label: 'Housekeeping', permission: 'housekeeping.view', group: 'operations' },
  { href: '/admin/apartments', label: 'Apartments', permission: 'apartments.view', group: 'property' },
  { href: '/admin/guests', label: 'Guests', permission: 'guests.view', group: 'property' },
  { href: '/admin/payments', label: 'Payments', permission: 'payments.view', group: 'commercial' },
  { href: '/admin/reports', label: 'Reports & Analytics', permission: 'reports.view', group: 'commercial' },
  { href: '/admin/notifications', label: 'Notifications', permission: 'notifications.view', group: 'system' },
  { href: '/admin/staff', label: 'Staff & Permissions', permission: 'staff.manage', group: 'system' },
  { href: '/admin/settings', label: 'Settings', permission: 'settings.manage', group: 'system' },
];
