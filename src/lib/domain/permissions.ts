import type { PermissionKey, Role, StaffUser } from './types';

/**
 * Capability matrix enforced in three layers:
 *   1. Server API route handlers & Firestore Security Rules (authoritative)
 *   2. Server layout & role redirect guards
 *   3. Client UI navigation & affordances
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
  'media.view',
  'media.manage',
  'guests.view',
  'guests.viewPii',
  'guests.manage',
  'payments.view',
  'payments.record',
  'payments.verify',
  'payments.refund',
  'quotations.view',
  'quotations.manage',
  'invoices.view',
  'invoices.manage',
  'housekeeping.view',
  'housekeeping.assign',
  'housekeeping.complete',
  'housekeeping.maintenance',
  'reports.view',
  'notifications.view',
  'notifications.manage',
  'notifications.send',
  'staff.manage',
  'staff.super_admin',
  'settings.manage',
  'audit.view',
];

export const ADMIN_PERMISSIONS: PermissionKey[] = ALL_PERMISSIONS.filter(
  (p) => p !== 'staff.super_admin',
);

export const PERMISSION_GROUPS: { title: string; note: string; keys: PermissionKey[] }[] = [
  {
    title: 'Reservations & Calendar',
    note: 'Booking creation, amendments, availability calendar and check-in/out.',
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
    title: 'Apartments & Media',
    note: 'Apartment inventory, ZMW pricing rules and Cloudinary media library.',
    keys: ['apartments.view', 'apartments.manage', 'media.view', 'media.manage'],
  },
  {
    title: 'Guests',
    note: 'Guest register and identification documents (NRC / Passport).',
    keys: ['guests.view', 'guests.viewPii', 'guests.manage'],
  },
  {
    title: 'Payments, Quotations & Invoices',
    note: 'Payment ledger, verification, refunds, quotations and tax invoices.',
    keys: [
      'payments.view',
      'payments.record',
      'payments.verify',
      'payments.refund',
      'quotations.view',
      'quotations.manage',
      'invoices.view',
      'invoices.manage',
    ],
  },
  {
    title: 'Housekeeping & Maintenance',
    note: 'Turnover cleaning tasks, readiness inspection and fault tickets.',
    keys: [
      'housekeeping.view',
      'housekeeping.assign',
      'housekeeping.complete',
      'housekeeping.maintenance',
    ],
  },
  {
    title: 'Reports & Notifications',
    note: 'Occupancy/revenue analytics and guest/staff notifications.',
    keys: ['reports.view', 'notifications.view', 'notifications.manage', 'notifications.send'],
  },
  {
    title: 'Administration & Security',
    note: 'Staff role assignment, audit trail, business settings and super-admin control.',
    keys: ['staff.manage', 'staff.super_admin', 'settings.manage', 'audit.view'],
  },
];

export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
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
    'quotations.view',
    'quotations.manage',
    'invoices.view',
    'housekeeping.view',
    'housekeeping.assign',
    'notifications.view',
    'notifications.send',
  ],
  cleaner: [
    'housekeeping.view',
    'housekeeping.complete',
    'housekeeping.maintenance',
  ],
  // A registered guest gets exactly one capability: reading and acknowledging the
  // notifications that belong to their own bookings. Nothing else is granted here,
  // and the snapshot projection limits those to their own records.
  guest: ['notifications.view'],
};

export function permissionsFor(user: Pick<StaffUser, 'role' | 'permissions'>): Set<PermissionKey> {
  const base = ROLE_PERMISSIONS[user.role] ?? [];
  if (user.permissions && user.permissions.length && user.role !== 'guest' && user.role !== 'cleaner') {
    return new Set<PermissionKey>([
      ...base,
      ...user.permissions.filter((p) => p !== 'staff.super_admin'),
    ]);
  }
  return new Set(base);
}

export function can(user: StaffUser | null, key: PermissionKey): boolean {
  if (!user || !user.active) return false;
  if (user.accountStatus && user.accountStatus !== 'active') return false;
  return permissionsFor(user).has(key);
}

export function describeMissing(key: PermissionKey): string {
  const role = roleForPermission(key);
  return `Your account role is not authorised for this action (${key}). Required role: ${role}.`;
}

export function roleForPermission(key: PermissionKey): string {
  const roles = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) =>
    ROLE_PERMISSIONS[r].includes(key),
  );
  return roles.length ? roles.map((r) => r.toUpperCase()).join(' / ') : 'SUPER_ADMIN';
}

export function defaultDashboardForRole(role: Role): string {
  if (role === 'cleaner') return '/portal/cleaning';
  if (role === 'guest') return '/account';
  return '/admin';
}

export const NAV_SECTIONS: {
  href: string;
  label: string;
  permission: PermissionKey;
  group: 'operations' | 'commercial' | 'property' | 'system';
}[] = [
  { href: '/admin', label: 'Dashboard', permission: 'reservations.view', group: 'operations' },
  { href: '/admin/reservations', label: 'Bookings', permission: 'reservations.view', group: 'operations' },
  { href: '/admin/calendar', label: 'Booking Calendar', permission: 'calendar.view', group: 'operations' },
  { href: '/admin/housekeeping', label: 'Housekeeping & Maintenance', permission: 'housekeeping.view', group: 'operations' },
  { href: '/admin/apartments', label: 'Apartments', permission: 'apartments.view', group: 'property' },
  { href: '/admin/media', label: 'Media Library', permission: 'media.view', group: 'property' },
  { href: '/admin/guests', label: 'Guests', permission: 'guests.view', group: 'property' },
  { href: '/admin/payments', label: 'Payments', permission: 'payments.view', group: 'commercial' },
  { href: '/admin/quotations', label: 'Quotations', permission: 'quotations.view', group: 'commercial' },
  { href: '/admin/invoices', label: 'Invoices', permission: 'invoices.view', group: 'commercial' },
  { href: '/admin/reports', label: 'Reports', permission: 'reports.view', group: 'commercial' },
  { href: '/admin/staff', label: 'Staff & Users', permission: 'staff.manage', group: 'system' },
  { href: '/admin/notifications', label: 'Notifications', permission: 'notifications.view', group: 'system' },
  { href: '/admin/audit-logs', label: 'Audit Logs', permission: 'audit.view', group: 'system' },
  { href: '/admin/settings', label: 'Settings & GBP', permission: 'settings.manage', group: 'system' },
];
