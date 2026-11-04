import type { StaffUser, UserRecord } from './types';

export function userRecordToStaffView(u: UserRecord): StaffUser {
  const active = u.accountStatus === 'active';
  return {
    id: u.uid,
    uid: u.uid,
    name: u.fullName,
    fullName: u.fullName,
    username: u.username || u.email.split('@')[0] || u.uid,
    email: u.email,
    phone: u.phoneNumber,
    phoneNumber: u.phoneNumber,
    profilePhoto: u.profilePhoto,
    role: u.role,
    accountStatus: u.accountStatus,
    emailVerified: u.emailVerified,
    jobTitle:
      u.jobTitle ||
      (u.role === 'super_admin'
        ? 'Super Administrator'
        : u.role === 'admin'
          ? 'Administrator'
          : u.role === 'receptionist'
            ? 'Receptionist'
            : u.role === 'cleaner'
              ? 'Housekeeping Attendant'
              : 'Registered Guest'),
    active,
    hiredOn: u.hiredOn || u.createdAt.slice(0, 10),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastSeenAt: u.lastLoginAt,
    lastLoginAt: u.lastLoginAt,
    shift: u.shift ?? null,
    permissions: u.permissions ?? null,
  };
}
