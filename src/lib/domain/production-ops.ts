import { randomBytes, randomUUID } from 'node:crypto';
import type {
  AccountStatus,
  Apartment,
  ApartmentPhoto,
  AuditCategory,
  AuditLogRecord,
  BookingSource,
  Database,
  ID,
  Invoice,
  MaintenancePriority,
  MaintenanceRecord,
  MaintenanceStatus,
  MediaCategory,
  MediaRecord,
  Payment,
  PaymentMethod,
  Quotation,
  QuotationStatus,
  ReceiptRecord,
  Reservation,
  Role,
  SelectedServiceLine,
  StaffUser,
  UserRecord,
} from './types';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { addISO, businessToday, formatMediumDate } from './dates';
import { calculateStayPricing } from './pricing';
import { financialsFor, recomputeReservation } from './selectors';
import {
  createReservation,
  draftNotification,
  findOrCreateGuest,
  OperationError,
} from './operations';

const nowISO = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

/* ----------------------------------------------------------- Audit Logging */

export function resolveActor(
  db: Database,
  actorUid: ID,
): { uid: ID; name: string; role: Role | 'system' | 'public' } {
  if (actorUid === 'public' || actorUid === 'website') {
    return { uid: actorUid, name: 'Public Website', role: 'public' };
  }
  if (actorUid === 'system') {
    return { uid: 'system', name: 'System', role: 'system' };
  }
  const u = (db.users ?? []).find((x) => x.uid === actorUid);
  if (u) return { uid: u.uid, name: u.fullName, role: u.role };
  const s = db.staff.find((x) => x.id === actorUid);
  if (s) return { uid: s.id, name: s.name, role: s.role };
  return { uid: actorUid, name: 'Authenticated User', role: 'guest' };
}

export function appendAuditLog(
  db: Database,
  input: {
    category: AuditCategory;
    action: string;
    actorUid: ID;
    targetType: string;
    targetId: ID;
    summary: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
): AuditLogRecord {
  db.auditLogs = db.auditLogs ?? [];
  const actor = resolveActor(db, input.actorUid);
  const record: AuditLogRecord = {
    id: makeId('aud'),
    category: input.category,
    action: input.action,
    actorUid: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    createdAt: nowISO(),
  };
  db.auditLogs.unshift(record);
  return record;
}

/* ------------------------------------------- Auth, Registration & Profiles */

export function registerCustomerAccount(
  db: Database,
  input: {
    fullName: string;
    email: string;
    phoneNumber: string;
    password?: string;
    firebaseUid?: string;
  },
): { user: UserRecord; verificationToken: string } {
  db.users = db.users ?? [];
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phoneNumber = input.phoneNumber.trim();

  if (fullName.length < 2) {
    throw new OperationError('Full name must be at least 2 characters.', 422, 'validation');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OperationError('Enter a valid email address.', 422, 'validation');
  }
  if (!input.firebaseUid && (!input.password || input.password.length < 6)) {
    throw new OperationError('Password must be at least 6 characters.', 422, 'validation');
  }

  const existing = db.users.find((u) => u.email.toLowerCase() === email);
  if (existing) {
    throw new OperationError('An account with that email address already exists.', 409, 'email_taken');
  }

  const uid = input.firebaseUid?.trim() || `usr-${randomUUID().slice(0, 12)}`;
  const verificationToken = randomBytes(20).toString('hex');
  const now = nowISO();

  // SECURITY INVARIANT: Every newly registered user ALWAYS receives role === 'guest'.
  const user: UserRecord = {
    uid,
    fullName,
    email,
    phoneNumber,
    profilePhoto: '',
    role: 'guest',
    accountStatus: 'active',
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
    passwordHash: input.password ? hashPassword(input.password) : undefined,
    emailVerificationToken: verificationToken,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    sessionVersion: 1,
  };

  db.users.unshift(user);

  // Link or create Guest CRM profile and bind any matching bookings
  const guest = findOrCreateGuest(db, {
    fullName,
    phone: phoneNumber || email,
    email,
    source: 'website',
  });
  guest.userId = uid;
  for (const r of db.reservations) {
    if (r.guestId === guest.id && !r.userId) {
      r.userId = uid;
    }
  }
  for (const p of db.payments) {
    if (p.guestId === guest.id && !p.userId) {
      p.userId = uid;
    }
  }

  appendAuditLog(db, {
    category: 'auth',
    action: 'user.registered',
    actorUid: uid,
    targetType: 'user',
    targetId: uid,
    summary: `New customer registered (${email}) with default guest role.`,
    after: { uid, email, role: 'guest', accountStatus: 'active' },
  });

  return { user, verificationToken };
}

export function authenticateAccount(
  db: Database,
  input: { identifier: string; password: string },
): UserRecord {
  db.users = db.users ?? [];
  const ident = input.identifier.trim().toLowerCase();

  let user = db.users.find(
    (u) =>
      u.email.toLowerCase() === ident ||
      (u.username && u.username.toLowerCase() === ident),
  );

  // Bridge legacy staff entry if needed
  if (!user) {
    const legacy = db.staff.find(
      (s) => s.username.toLowerCase() === ident || s.email.toLowerCase() === ident,
    );
    if (legacy) {
      user = {
        uid: legacy.id,
        fullName: legacy.name,
        email: legacy.email.toLowerCase(),
        phoneNumber: legacy.phone,
        profilePhoto: '',
        role: legacy.role,
        accountStatus: legacy.active ? 'active' : 'deactivated',
        emailVerified: true,
        createdAt: `${legacy.hiredOn}T08:00:00.000Z`,
        updatedAt: nowISO(),
        lastLoginAt: legacy.lastSeenAt,
        username: legacy.username,
        jobTitle: legacy.jobTitle,
        shift: legacy.shift,
        permissions: legacy.permissions,
        passwordHash: legacy.passwordHash,
        sessionVersion: 1,
      };
      db.users.push(user);
    }
  }

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new OperationError('Invalid email/handle or password.', 401, 'bad_credentials');
  }

  if (user.accountStatus !== 'active') {
    throw new OperationError(
      `This account is ${user.accountStatus}. Contact an administrator for assistance.`,
      403,
      'account_inactive',
    );
  }

  user.lastLoginAt = nowISO();
  user.updatedAt = nowISO();
  const staffMirror = db.staff.find((s) => s.id === user!.uid);
  if (staffMirror) staffMirror.lastSeenAt = user.lastLoginAt;

  return user;
}

export function verifyUserEmailToken(db: Database, token: string): UserRecord {
  const user = (db.users ?? []).find((u) => u.emailVerificationToken === token);
  if (!user) {
    throw new OperationError('Invalid or expired email verification link.', 400, 'invalid_token');
  }
  user.emailVerified = true;
  user.emailVerificationToken = null;
  user.updatedAt = nowISO();
  return user;
}

export function createPasswordResetRequest(
  db: Database,
  emailRaw: string,
): { resetToken: string | null; email: string } {
  const email = emailRaw.trim().toLowerCase();
  const user = (db.users ?? []).find((u) => u.email.toLowerCase() === email);
  if (!user || user.accountStatus !== 'active') {
    // Do not leak account existence
    return { resetToken: null, email };
  }
  const token = randomBytes(24).toString('hex');
  user.passwordResetToken = token;
  user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  user.updatedAt = nowISO();
  return { resetToken: token, email };
}

export function completePasswordReset(
  db: Database,
  input: { token: string; newPassword: string },
): UserRecord {
  if (input.newPassword.length < 6) {
    throw new OperationError('New password must be at least 6 characters.', 422, 'validation');
  }
  const user = (db.users ?? []).find((u) => u.passwordResetToken === input.token);
  if (
    !user ||
    !user.passwordResetExpiresAt ||
    user.passwordResetExpiresAt < nowISO()
  ) {
    throw new OperationError('Password reset token is invalid or has expired.', 400, 'invalid_token');
  }
  user.passwordHash = hashPassword(input.newPassword);
  user.passwordResetToken = null;
  user.passwordResetExpiresAt = null;
  user.sessionVersion = (user.sessionVersion ?? 1) + 1;
  user.updatedAt = nowISO();

  const staffMirror = db.staff.find((s) => s.id === user.uid);
  if (staffMirror) staffMirror.passwordHash = user.passwordHash;

  appendAuditLog(db, {
    category: 'auth',
    action: 'user.password_reset',
    actorUid: user.uid,
    targetType: 'user',
    targetId: user.uid,
    summary: `Password reset completed for ${user.email}.`,
  });
  return user;
}

export function updateUserProfile(
  db: Database,
  uid: ID,
  patch: {
    fullName?: string;
    phoneNumber?: string;
    profilePhoto?: string;
    currentPassword?: string;
    newPassword?: string;
  },
): UserRecord {
  const user = (db.users ?? []).find((u) => u.uid === uid);
  if (!user) throw new OperationError('Account not found.', 404, 'not_found');

  if (patch.fullName !== undefined) {
    const trimmed = patch.fullName.trim();
    if (trimmed.length < 2) throw new OperationError('Enter your full name.', 422, 'validation');
    user.fullName = trimmed;
  }
  if (patch.phoneNumber !== undefined) {
    user.phoneNumber = patch.phoneNumber.trim();
  }
  if (patch.profilePhoto !== undefined) {
    user.profilePhoto = patch.profilePhoto.trim();
  }
  if (patch.newPassword) {
    if (patch.newPassword.length < 6) {
      throw new OperationError('New password must be at least 6 characters.', 422, 'validation');
    }
    if (user.passwordHash && patch.currentPassword !== undefined) {
      if (!verifyPassword(patch.currentPassword, user.passwordHash)) {
        throw new OperationError('Current password is incorrect.', 403, 'bad_password');
      }
    }
    user.passwordHash = hashPassword(patch.newPassword);
    user.sessionVersion = (user.sessionVersion ?? 1) + 1;
  }
  user.updatedAt = nowISO();

  // Keep linked guest or staff display fields aligned
  const staffMirror = db.staff.find((s) => s.id === uid);
  if (staffMirror) {
    staffMirror.name = user.fullName;
    staffMirror.phone = user.phoneNumber;
    staffMirror.profilePhoto = user.profilePhoto;
    if (user.passwordHash) staffMirror.passwordHash = user.passwordHash;
  }
  const guest = db.guests.find((g) => g.userId === uid);
  if (guest) {
    guest.fullName = user.fullName;
    if (user.phoneNumber) guest.phone = user.phoneNumber;
  }

  return user;
}

/* ------------------------------------------- Privileged Role & Staff Ops */

function syncStaffMirrorFromUser(db: Database, user: UserRecord) {
  const isStaffRole = ['super_admin', 'admin', 'receptionist', 'cleaner'].includes(user.role);
  const existingIdx = db.staff.findIndex((s) => s.id === user.uid);

  if (!isStaffRole) {
    if (existingIdx !== -1) {
      db.staff.splice(existingIdx, 1);
    }
    return;
  }

  const defaultTitle =
    user.role === 'super_admin'
      ? 'Super Administrator'
      : user.role === 'admin'
        ? 'Administrator'
        : user.role === 'receptionist'
          ? 'Receptionist'
          : 'Housekeeping Attendant';

  const baseUsername =
    user.username ||
    user.email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '') ||
    user.uid;

  if (existingIdx !== -1) {
    const cur = db.staff[existingIdx];
    cur.name = user.fullName;
    cur.email = user.email;
    cur.phone = user.phoneNumber;
    cur.role = user.role;
    cur.active = user.accountStatus === 'active';
    cur.jobTitle = user.jobTitle || cur.jobTitle || defaultTitle;
    cur.shift = user.shift ?? cur.shift ?? null;
    cur.permissions = user.permissions ?? null;
    cur.lastSeenAt = user.lastLoginAt;
    if (user.passwordHash) cur.passwordHash = user.passwordHash;
  } else {
    const mirror: StaffUser = {
      id: user.uid,
      uid: user.uid,
      name: user.fullName,
      fullName: user.fullName,
      username: baseUsername,
      email: user.email,
      phone: user.phoneNumber,
      phoneNumber: user.phoneNumber,
      profilePhoto: user.profilePhoto,
      role: user.role,
      accountStatus: user.accountStatus,
      jobTitle: user.jobTitle || defaultTitle,
      active: user.accountStatus === 'active',
      hiredOn: user.hiredOn || (db.__today || businessToday()),
      lastSeenAt: user.lastLoginAt,
      shift: user.role === 'cleaner' ? (user.shift ?? 'morning') : (user.shift ?? null),
      permissions: user.permissions ?? null,
      passwordHash: user.passwordHash,
    };
    db.staff.push(mirror);
  }
}

export function changeUserRole(
  db: Database,
  actorUid: ID,
  targetUid: ID,
  input: {
    role: Role;
    jobTitle?: string;
    shift?: 'morning' | 'afternoon' | 'evening' | null;
  },
): UserRecord {
  db.users = db.users ?? [];
  const actor = db.users.find((u) => u.uid === actorUid);
  if (!actor || actor.accountStatus !== 'active' || !['super_admin', 'admin'].includes(actor.role)) {
    throw new OperationError(
      'Only an active Administrator or Super Administrator can change user roles.',
      403,
      'forbidden',
    );
  }

  const target = db.users.find((u) => u.uid === targetUid);
  if (!target) {
    throw new OperationError('Target user account was not found.', 404, 'not_found');
  }

  // SECURITY RULE: Only a super_admin can appoint or modify a super_admin
  if (
    (target.role === 'super_admin' || input.role === 'super_admin') &&
    actor.role !== 'super_admin'
  ) {
    throw new OperationError(
      'Only an authorized Super Administrator can appoint or modify a Super Administrator.',
      403,
      'super_admin_required',
    );
  }

  // Prevent removing the last active super_admin
  if (target.role === 'super_admin' && input.role !== 'super_admin') {
    const activeSupers = db.users.filter(
      (u) => u.role === 'super_admin' && u.accountStatus === 'active',
    );
    if (activeSupers.length <= 1) {
      throw new OperationError(
        'Cannot demote the last active Super Administrator.',
        409,
        'last_super_admin',
      );
    }
  }

  const beforeRole = target.role;
  target.role = input.role;
  if (input.jobTitle !== undefined) target.jobTitle = input.jobTitle;
  if (input.shift !== undefined) target.shift = input.shift;
  target.updatedAt = nowISO();

  syncStaffMirrorFromUser(db, target);

  appendAuditLog(db, {
    category: 'role',
    action: 'user.role_changed',
    actorUid,
    targetType: 'user',
    targetId: target.uid,
    summary: `Changed role for ${target.fullName} (${target.email}) from ${beforeRole} to ${input.role}.`,
    before: { role: beforeRole },
    after: { role: input.role },
  });

  return target;
}

export function changeUserAccountStatus(
  db: Database,
  actorUid: ID,
  targetUid: ID,
  accountStatus: AccountStatus,
  reason?: string,
): UserRecord {
  db.users = db.users ?? [];
  const actor = db.users.find((u) => u.uid === actorUid);
  if (!actor || actor.accountStatus !== 'active' || !['super_admin', 'admin'].includes(actor.role)) {
    throw new OperationError('Only an authorized administrator can change account status.', 403, 'forbidden');
  }

  const target = db.users.find((u) => u.uid === targetUid);
  if (!target) throw new OperationError('User account not found.', 404, 'not_found');

  if (target.uid === actor.uid && accountStatus !== 'active') {
    throw new OperationError('You cannot deactivate your own active administrator account.', 409, 'self_lockout');
  }

  if (target.role === 'super_admin' && actor.role !== 'super_admin') {
    throw new OperationError(
      'Only a Super Administrator can modify another Super Administrator account.',
      403,
      'super_admin_required',
    );
  }

  const beforeStatus = target.accountStatus;
  target.accountStatus = accountStatus;
  target.updatedAt = nowISO();
  if (accountStatus !== 'active') {
    // Bump sessionVersion to immediately invalidate any active session cookies
    target.sessionVersion = (target.sessionVersion ?? 1) + 1;
  }

  syncStaffMirrorFromUser(db, target);

  appendAuditLog(db, {
    category: 'staff',
    action: accountStatus === 'active' ? 'user.reactivated' : 'user.deactivated',
    actorUid,
    targetType: 'user',
    targetId: target.uid,
    summary: `Updated account status for ${target.fullName} (${target.email}): ${beforeStatus} -> ${accountStatus}${reason ? ` (${reason})` : ''}.`,
    before: { accountStatus: beforeStatus },
    after: { accountStatus },
  });

  return target;
}

export function bootstrapFirstSuperAdmin(
  db: Database,
  input: {
    setupToken: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    password: string;
  },
): UserRecord {
  const configuredToken = process.env.FIRST_ADMIN_SETUP_TOKEN;
  if (!configuredToken || input.setupToken !== configuredToken) {
    throw new OperationError(
      'Invalid or unconfigured FIRST_ADMIN_SETUP_TOKEN. Set FIRST_ADMIN_SETUP_TOKEN on the server to run initial bootstrap.',
      403,
      'invalid_bootstrap_token',
    );
  }

  const existingSuper = (db.users ?? []).find(
    (u) => u.role === 'super_admin' && u.accountStatus === 'active',
  );
  if (existingSuper) {
    throw new OperationError(
      'Initial Super Administrator bootstrap is locked because an active Super Administrator already exists.',
      409,
      'already_bootstrapped',
    );
  }

  const { user } = registerCustomerAccount(db, {
    fullName: input.fullName,
    email: input.email,
    phoneNumber: input.phoneNumber,
    password: input.password,
  });
  user.role = 'super_admin';
  user.emailVerified = true;
  user.emailVerificationToken = null;
  user.jobTitle = 'Owner / Super Administrator';
  syncStaffMirrorFromUser(db, user);

  appendAuditLog(db, {
    category: 'role',
    action: 'system.bootstrap_super_admin',
    actorUid: user.uid,
    targetType: 'user',
    targetId: user.uid,
    summary: `Bootstrapped initial Super Administrator (${user.email}).`,
  });

  return user;
}

/* ------------------------------------------- Guest Cancellation Request */

export function requestBookingCancellation(
  db: Database,
  actorUid: ID,
  reservationId: ID,
  reason: string,
): Reservation {
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) throw new OperationError('Booking not found.', 404, 'not_found');

  const user = (db.users ?? []).find((u) => u.uid === actorUid);
  const ownsBooking =
    r.userId === actorUid ||
    (user &&
      db.guests.some(
        (g) =>
          g.id === r.guestId &&
          (g.userId === actorUid || (g.email && g.email.toLowerCase() === user.email.toLowerCase())),
      ));

  if (!ownsBooking && !['super_admin', 'admin', 'receptionist'].includes(user?.role ?? 'guest')) {
    throw new OperationError('You can only request cancellation for your own bookings.', 403, 'forbidden');
  }

  if (!['inquiry', 'pending_confirmation', 'reserved', 'fully_paid'].includes(r.status)) {
    throw new OperationError(
      `Cannot submit a cancellation request for a booking in "${r.status.replace(/_/g, ' ')}" status.`,
      409,
      'bad_transition',
    );
  }

  r.status = 'cancellation_requested';
  r.cancellationRequestedAt = nowISO();
  r.cancellationRequestReason = reason.trim();
  r.updatedAt = nowISO();
  r.history.unshift({
    at: nowISO(),
    by: user?.fullName ?? 'Guest',
    label: 'Cancellation requested by guest',
    detail: reason.trim(),
  });

  draftNotification(db, {
    event: 'booking_cancellation',
    channel: 'in_app',
    title: `Cancellation requested · ${r.reference}`,
    body: `${user?.fullName ?? 'Customer'} requested cancellation for ${r.reference} (${formatMediumDate(r.checkIn)} – ${formatMediumDate(r.checkOut)}): "${reason.trim()}"`,
    recipientName: 'Front Office',
    recipientContact: 'in-app',
    guestId: r.guestId,
    reservationId: r.id,
    apartmentId: r.apartmentId,
  });

  appendAuditLog(db, {
    category: 'booking',
    action: 'booking.cancellation_requested',
    actorUid,
    targetType: 'booking',
    targetId: r.id,
    summary: `Cancellation requested on ${r.reference}: ${reason.trim()}`,
  });

  return r;
}

/* ------------------------------------------- Refunds & Official Receipts */

export function issueOfficialReceipt(
  db: Database,
  payment: Payment,
  verifiedByName: string,
): ReceiptRecord {
  db.receipts = db.receipts ?? [];
  const existing = db.receipts.find((rc) => rc.paymentId === payment.id);
  if (existing) return existing;

  const r = db.reservations.find((x) => x.id === payment.reservationId);
  if (!r) throw new OperationError('Associated booking not found.', 404, 'not_found');

  const guest = db.guests.find((g) => g.id === r.guestId);
  const apt = db.apartments.find((a) => a.id === r.apartmentId);
  const f = financialsFor(db, r);
  const year = (db.__today || businessToday()).slice(0, 4);
  const prefix = db.settings.documents?.receiptPrefix || db.settings.payments.receiptPrefix || 'RCP';
  const seq = db.sequences.receipt++;
  const receiptNumber = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;

  const receipt: ReceiptRecord = {
    id: makeId('rcp'),
    receiptNumber,
    paymentId: payment.id,
    reservationId: r.id,
    invoiceId: r.invoiceId ?? null,
    userId: r.userId ?? guest?.userId ?? null,
    guestId: r.guestId,
    customerName: guest?.fullName ?? 'Guest',
    customerEmail: guest?.email ?? '',
    customerPhone: guest?.phone ?? '',
    apartmentName: apt?.name ?? 'Apartment',
    apartmentNumber: apt?.number ?? 0,
    bookingReference: r.reference,
    amount: payment.amount,
    method: payment.method,
    transactionReference: payment.reference,
    paidAt: payment.paidAt,
    verifiedBy: verifiedByName,
    verifiedAt: payment.verifiedAt || nowISO(),
    totalBookingAmount: r.totalAmount,
    totalVerifiedPaid: f.verifiedPaid,
    remainingBalance: f.balanceDue,
    createdAt: nowISO(),
  };

  db.receipts.unshift(receipt);
  payment.receiptId = receipt.id;
  payment.receiptNumber = receipt.receiptNumber;
  return receipt;
}

export function issuePaymentRefund(
  db: Database,
  actorUid: ID,
  input: {
    reservationId: ID;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    note?: string;
  },
): Payment {
  const r = db.reservations.find((x) => x.id === input.reservationId);
  if (!r) throw new OperationError('Booking not found.', 404, 'not_found');

  const f = financialsFor(db, r);
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) throw new OperationError('Refund amount must be greater than zero.', 422, 'validation');
  if (amount > f.verifiedPaid + 0.01) {
    throw new OperationError(
      `Cannot refund K${amount.toLocaleString('en-US')} — only K${f.verifiedPaid.toLocaleString('en-US')} in verified funds is held.`,
      422,
      'exceeds_verified_paid',
    );
  }

  const actor = resolveActor(db, actorUid);
  const refundPayment: Payment = {
    id: makeId('pay'),
    reservationId: r.id,
    bookingId: r.id,
    guestId: r.guestId,
    userId: r.userId ?? null,
    amount,
    method: input.method,
    kind: 'refund',
    reference: input.reference?.trim() || `RF-${randomUUID().slice(0, 8).toUpperCase()}`,
    paidAt: db.__today || businessToday(),
    recordedBy: actor.uid,
    recordedByName: actor.name,
    verificationStatus: 'verified',
    verifiedBy: actor.name,
    verifiedAt: nowISO(),
    verificationNote: input.note || 'Authorised refund.',
    proof: null,
    note: input.note || `Refund against ${r.reference}`,
    auditTrail: [
      {
        at: nowISO(),
        by: actor.name,
        action: 'refund.issued',
        status: 'refunded',
        note: input.note,
      },
    ],
    createdAt: nowISO(),
  };

  db.payments.unshift(refundPayment);
  r.history.unshift({
    at: nowISO(),
    by: actor.name,
    label: 'Refund issued',
    detail: `K${amount.toLocaleString('en-US')} via ${input.method.replace(/_/g, ' ')} (${refundPayment.reference})`,
  });

  recomputeReservation(db, r.id);

  appendAuditLog(db, {
    category: 'refund',
    action: 'payment.refunded',
    actorUid,
    targetType: 'booking',
    targetId: r.id,
    summary: `Issued refund of K${amount.toLocaleString('en-US')} on ${r.reference}.`,
    after: { amount, method: input.method, reference: refundPayment.reference },
  });

  return refundPayment;
}

/* ------------------------------------------- Quotations & Tax Invoices */

function buildPaymentInstructionsText(db: Database): string {
  return db.settings.payments.methods
    .filter((m) => m.enabled)
    .map((m) => `${m.label}: ${m.accountLabel} ${m.accountNumber} — ${m.instructions}`)
    .join('\n');
}

export function createQuotation(
  db: Database,
  actorUid: ID,
  input: {
    idempotencyKey?: string;
    guestId?: ID;
    customerName: string;
    customerEmail?: string;
    customerPhone: string;
    customerCompany?: string;
    customerAddress?: string;
    apartmentId: ID;
    checkIn: string;
    checkOut: string;
    guestCount: number;
    overrideNightlyRate?: number | null;
    discount?: number;
    selectedServiceIds?: string[];
    customServices?: SelectedServiceLine[];
    notes?: string;
    validityDays?: number;
    reservationId?: ID | null;
  },
): Quotation {
  db.quotations = db.quotations ?? [];

  if (input.idempotencyKey) {
    const existing = db.quotations.find((q) => q.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
  }

  const apartment = db.apartments.find((a) => a.id === input.apartmentId);
  if (!apartment) throw new OperationError('Select a valid apartment.', 422, 'validation');

  const pricing = calculateStayPricing({
    apartment,
    settings: db.settings,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestCount: input.guestCount,
    overrideNightlyRate: input.overrideNightlyRate,
    manualDiscount: input.discount ?? 0,
    selectedServiceIds: input.selectedServiceIds,
    customServices: input.customServices,
  });

  if (pricing.nights <= 0) {
    throw new OperationError('Check-out date must be after check-in date.', 422, 'validation');
  }
  if (input.guestCount > apartment.maxGuests) {
    throw new OperationError(
      `${apartment.name} accommodates a maximum of ${apartment.maxGuests} guests.`,
      422,
      'guest_capacity',
    );
  }

  const guest = findOrCreateGuest(db, {
    guestId: input.guestId,
    fullName: input.customerName,
    phone: input.customerPhone,
    email: input.customerEmail,
    company: input.customerCompany,
    source: 'corporate',
  });

  const today = db.__today || businessToday();
  const year = today.slice(0, 4);
  const prefix = db.settings.documents?.quotationPrefix || 'QUO';
  const seq = (db.sequences.quotation = (db.sequences.quotation ?? 1) + 1) - 1;
  const quotationNumber = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  const validityDays = input.validityDays ?? db.settings.documents?.quotationValidityDays ?? 7;
  const actor = resolveActor(db, actorUid);

  const matchedUser =
    guest.userId ||
    (guest.email
      ? (db.users ?? []).find((u) => u.email.toLowerCase() === guest.email.toLowerCase())?.uid ?? null
      : null);

  const quotation: Quotation = {
    id: makeId('quo'),
    quotationNumber,
    idempotencyKey: input.idempotencyKey ?? null,
    shareToken: randomBytes(12).toString('hex'),
    status: 'sent',
    issueDate: today,
    expiryDate: addISO(today, validityDays),
    userId: matchedUser,
    guestId: guest.id,
    customerName: input.customerName.trim(),
    customerEmail: (input.customerEmail ?? guest.email ?? '').trim(),
    customerPhone: input.customerPhone.trim(),
    customerCompany: (input.customerCompany ?? guest.company ?? '').trim(),
    customerAddress: (input.customerAddress ?? guest.city ?? '').trim(),
    apartmentId: apartment.id,
    apartmentNumber: apartment.number,
    apartmentName: apartment.name,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: pricing.nights,
    guestCount: input.guestCount,
    nightlyRate: pricing.effectiveAverageRate,
    lineItems: pricing.lineItems,
    additionalServices: pricing.selectedServices,
    subtotal: pricing.roomSubtotal + pricing.extraGuestTotal + pricing.servicesTotal,
    discount: pricing.totalDiscount,
    taxName: pricing.taxName,
    taxRatePercent: pricing.taxRatePercent,
    taxInclusive: pricing.taxInclusive,
    taxAmount: pricing.taxAmount,
    totalAmount: pricing.totalAmount,
    depositPercent: pricing.depositPercent,
    depositRequired: pricing.depositRequired,
    outstandingBalance: pricing.totalAmount,
    notes: input.notes ?? '',
    termsAndConditions:
      db.settings.documents?.termsAndConditions || db.settings.booking.cancellationText,
    paymentInstructions: buildPaymentInstructionsText(db),
    reservationId: input.reservationId ?? null,
    invoiceId: null,
    emailedAt: null,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  db.quotations.unshift(quotation);

  appendAuditLog(db, {
    category: 'document',
    action: 'quotation.created',
    actorUid,
    targetType: 'quotation',
    targetId: quotation.id,
    summary: `Generated quotation ${quotation.quotationNumber} for ${quotation.customerName} (K${quotation.totalAmount.toLocaleString('en-US')}).`,
  });

  return quotation;
}

export function updateQuotationStatus(
  db: Database,
  actorUid: ID,
  quotationId: ID,
  status: QuotationStatus,
): Quotation {
  const q = (db.quotations ?? []).find((x) => x.id === quotationId);
  if (!q) throw new OperationError('Quotation not found.', 404, 'not_found');
  q.status = status;
  q.updatedAt = nowISO();
  void actorUid;
  return q;
}

export function convertQuotationToReservation(
  db: Database,
  actorUid: ID,
  quotationId: ID,
  source: BookingSource = 'corporate',
): { quotation: Quotation; reservation: Reservation } {
  const q = (db.quotations ?? []).find((x) => x.id === quotationId);
  if (!q) throw new OperationError('Quotation not found.', 404, 'not_found');

  if (q.reservationId) {
    const existing = db.reservations.find((r) => r.id === q.reservationId);
    if (existing && existing.status !== 'cancelled') {
      return { quotation: q, reservation: existing };
    }
  }

  const reservation = createReservation(db, actorUid, {
    guestId: q.guestId ?? undefined,
    guest: q.guestId
      ? undefined
      : {
          fullName: q.customerName,
          phone: q.customerPhone,
          email: q.customerEmail,
          company: q.customerCompany,
        },
    apartmentId: q.apartmentId,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    guestCount: q.guestCount,
    nightlyRate: q.nightlyRate,
    discount: q.discount,
    status: 'reserved',
    source,
    notes: q.notes ? `From ${q.quotationNumber}: ${q.notes}` : `Converted from Quotation ${q.quotationNumber}`,
  });

  // Preserve exact quotation total & tax lines if services/taxes were included
  reservation.totalAmount = q.totalAmount;
  reservation.taxRatePercent = q.taxRatePercent;
  reservation.taxAmount = q.taxAmount;
  reservation.selectedServices = q.additionalServices;
  reservation.servicesTotal = q.additionalServices.reduce((s, x) => s + x.total, 0);
  reservation.quotationId = q.id;
  reservation.userId = q.userId;
  recomputeReservation(db, reservation.id);

  q.reservationId = reservation.id;
  q.status = 'converted';
  q.updatedAt = nowISO();

  appendAuditLog(db, {
    category: 'document',
    action: 'quotation.converted_to_booking',
    actorUid,
    targetType: 'quotation',
    targetId: q.id,
    summary: `Converted quotation ${q.quotationNumber} into confirmed booking ${reservation.reference}.`,
  });

  return { quotation: q, reservation };
}

export function convertQuotationToInvoice(
  db: Database,
  actorUid: ID,
  quotationId: ID,
  customerTpin = '',
): Invoice {
  db.invoices = db.invoices ?? [];
  const q = (db.quotations ?? []).find((x) => x.id === quotationId);
  if (!q) throw new OperationError('Quotation not found.', 404, 'not_found');

  if (q.invoiceId) {
    const existing = db.invoices.find((i) => i.id === q.invoiceId);
    if (existing && existing.status !== 'void') return existing;
  }

  const today = db.__today || businessToday();
  const year = today.slice(0, 4);
  const prefix = db.settings.documents?.invoicePrefix || 'INV';
  const seq = (db.sequences.invoice = (db.sequences.invoice ?? 1) + 1) - 1;
  const invoiceNumber = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  const actor = resolveActor(db, actorUid);

  const linkedBooking = q.reservationId
    ? db.reservations.find((r) => r.id === q.reservationId)
    : null;
  const verifiedPaid = linkedBooking ? financialsFor(db, linkedBooking).verifiedPaid : 0;
  const balanceDue = Math.max(0, q.totalAmount - verifiedPaid);

  const invoice: Invoice = {
    id: makeId('inv'),
    invoiceNumber,
    idempotencyKey: `from-quo-${q.id}`,
    status: balanceDue <= 0 ? 'paid' : verifiedPaid > 0 ? 'partially_paid' : 'unpaid',
    issueDate: today,
    dueDate: q.checkIn >= today ? q.checkIn : addISO(today, 7),
    quotationId: q.id,
    reservationId: q.reservationId,
    userId: q.userId,
    guestId: q.guestId,
    customerName: q.customerName,
    customerEmail: q.customerEmail,
    customerPhone: q.customerPhone,
    customerCompany: q.customerCompany,
    customerTpin: customerTpin.trim(),
    apartmentId: q.apartmentId,
    apartmentNumber: q.apartmentNumber,
    apartmentName: q.apartmentName,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    nights: q.nights,
    guestCount: q.guestCount,
    lineItems: q.lineItems,
    subtotal: q.subtotal,
    discount: q.discount,
    taxName: q.taxName,
    taxRatePercent: q.taxRatePercent,
    taxInclusive: q.taxInclusive,
    taxAmount: q.taxAmount,
    totalAmount: q.totalAmount,
    verifiedPaid,
    balanceDue,
    notes: q.notes,
    paymentInstructions: q.paymentInstructions,
    termsAndConditions: q.termsAndConditions,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  db.invoices.unshift(invoice);
  q.invoiceId = invoice.id;
  if (q.status === 'sent' || q.status === 'accepted') q.status = 'converted';
  q.updatedAt = nowISO();
  if (linkedBooking) linkedBooking.invoiceId = invoice.id;

  appendAuditLog(db, {
    category: 'document',
    action: 'invoice.created_from_quotation',
    actorUid,
    targetType: 'invoice',
    targetId: invoice.id,
    summary: `Generated invoice ${invoice.invoiceNumber} from quotation ${q.quotationNumber} (K${invoice.totalAmount.toLocaleString('en-US')}).`,
  });

  return invoice;
}

export function createInvoiceFromReservation(
  db: Database,
  actorUid: ID,
  reservationId: ID,
  opts: { customerCompany?: string; customerTpin?: string; notes?: string } = {},
): Invoice {
  db.invoices = db.invoices ?? [];
  const r = db.reservations.find((x) => x.id === reservationId);
  if (!r) throw new OperationError('Booking not found.', 404, 'not_found');

  // Prevent accidental duplicate invoice generation for the same reservation
  const existing = db.invoices.find(
    (inv) => inv.reservationId === r.id && inv.status !== 'void',
  );
  if (existing) return existing;

  const guest = db.guests.find((g) => g.id === r.guestId);
  const apt = db.apartments.find((a) => a.id === r.apartmentId);
  const f = financialsFor(db, r);
  const today = db.__today || businessToday();
  const year = today.slice(0, 4);
  const prefix = db.settings.documents?.invoicePrefix || 'INV';
  const seq = (db.sequences.invoice = (db.sequences.invoice ?? 1) + 1) - 1;
  const invoiceNumber = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  const actor = resolveActor(db, actorUid);

  const taxCfg = db.settings.tax ?? {
    enabled: false,
    name: 'VAT',
    ratePercent: 0,
    inclusive: true,
    registrationNumber: db.settings.property.taxPayerId,
  };

  const lineItems = [
    {
      description: `Accommodation — Apt ${apt?.number ?? ''} (${apt?.name ?? 'Suite'})`,
      quantity: r.nights,
      unitLabel: r.nights === 1 ? 'night' : 'nights',
      unitPrice: r.nightlyRate,
      amount: r.nights * r.nightlyRate,
    },
    ...(r.selectedServices ?? []).map((s) => ({
      description: s.name,
      quantity: s.quantity,
      unitLabel: s.quantity === 1 ? 'service' : 'units',
      unitPrice: s.unitPrice,
      amount: s.total,
    })),
  ];

  const subtotal = lineItems.reduce((s, l) => s + l.amount, 0);
  const taxRatePercent = r.taxRatePercent ?? (taxCfg.enabled ? taxCfg.ratePercent : 0);
  const taxAmount = r.taxAmount ?? 0;

  const invoice: Invoice = {
    id: makeId('inv'),
    invoiceNumber,
    idempotencyKey: `from-booking-${r.id}`,
    status: f.balanceDue <= 0 ? 'paid' : f.verifiedPaid > 0 ? 'partially_paid' : 'unpaid',
    issueDate: today,
    dueDate: r.checkIn >= today ? r.checkIn : today,
    quotationId: r.quotationId ?? null,
    reservationId: r.id,
    userId: r.userId ?? guest?.userId ?? null,
    guestId: r.guestId,
    customerName: guest?.fullName ?? 'Guest',
    customerEmail: guest?.email ?? '',
    customerPhone: guest?.phone ?? '',
    customerCompany: (opts.customerCompany ?? guest?.company ?? '').trim(),
    customerTpin: (opts.customerTpin ?? '').trim(),
    apartmentId: r.apartmentId,
    apartmentNumber: apt?.number ?? null,
    apartmentName: apt?.name ?? 'Apartment',
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    nights: r.nights,
    guestCount: r.guestCount,
    lineItems,
    subtotal,
    discount: r.discount,
    taxName: taxCfg.name,
    taxRatePercent,
    taxInclusive: taxCfg.inclusive,
    taxAmount,
    totalAmount: r.totalAmount,
    verifiedPaid: f.verifiedPaid,
    balanceDue: f.balanceDue,
    notes: opts.notes ?? r.notes ?? '',
    paymentInstructions: buildPaymentInstructionsText(db),
    termsAndConditions:
      db.settings.documents?.termsAndConditions || db.settings.booking.cancellationText,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  db.invoices.unshift(invoice);
  r.invoiceId = invoice.id;

  appendAuditLog(db, {
    category: 'document',
    action: 'invoice.created',
    actorUid,
    targetType: 'invoice',
    targetId: invoice.id,
    summary: `Generated invoice ${invoice.invoiceNumber} for booking ${r.reference} (K${invoice.totalAmount.toLocaleString('en-US')}).`,
  });

  return invoice;
}

/* ------------------------------------------- Maintenance Module */

export function createMaintenanceTicket(
  db: Database,
  actorUid: ID,
  input: {
    apartmentId: ID;
    faultDescription: string;
    priority: MaintenancePriority;
    assignedTo?: ID | null;
    blocksReadiness?: boolean;
    photos?: { id?: string; url: string; publicId: string; caption?: string }[];
  },
): MaintenanceRecord {
  db.maintenance = db.maintenance ?? [];
  const apt = db.apartments.find((a) => a.id === input.apartmentId);
  if (!apt) throw new OperationError('Select an apartment.', 422, 'validation');

  const actor = resolveActor(db, actorUid);
  const assignee = input.assignedTo
    ? (db.users ?? []).find((u) => u.uid === input.assignedTo)?.fullName ??
      db.staff.find((s) => s.id === input.assignedTo)?.name ??
      null
    : null;

  const blocks =
    input.blocksReadiness !== undefined
      ? input.blocksReadiness
      : input.priority === 'high' || input.priority === 'urgent';

  const record: MaintenanceRecord = {
    id: makeId('mnt'),
    apartmentId: apt.id,
    apartmentNumber: apt.number,
    apartmentName: apt.name,
    faultDescription: input.faultDescription.trim(),
    priority: input.priority,
    assignedTo: input.assignedTo ?? null,
    assignedToName: assignee,
    status: input.assignedTo ? 'assigned' : 'reported',
    blocksReadiness: blocks,
    photos: (input.photos ?? []).map((p) => ({
      id: p.id || makeId('mph'),
      url: p.url,
      publicId: p.publicId,
      caption: p.caption,
      uploadedAt: nowISO(),
    })),
    resolutionNotes: '',
    reportedBy: actor.uid,
    reportedByName: actor.name,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    resolvedAt: null,
    resolvedBy: null,
  };

  db.maintenance.unshift(record);
  if (blocks) {
    db.cleaningState[apt.id] = {
      status: 'maintenance',
      updatedAt: nowISO(),
      note: `Maintenance hold: ${record.faultDescription}`,
    };
  }

  draftNotification(db, {
    event: 'maintenance_report',
    channel: 'in_app',
    title: `Maintenance reported · Apt ${apt.number} (${input.priority.toUpperCase()})`,
    body: `${actor.name} reported fault in Apt ${apt.number} (${apt.name}): ${record.faultDescription}`,
    recipientName: 'Facilities & Administration',
    recipientContact: 'in-app',
    apartmentId: apt.id,
  });

  appendAuditLog(db, {
    category: 'maintenance',
    action: 'maintenance.reported',
    actorUid,
    targetType: 'maintenance',
    targetId: record.id,
    summary: `Maintenance ticket raised on Apt ${apt.number}: ${record.faultDescription}`,
  });

  return record;
}

export function updateMaintenanceTicket(
  db: Database,
  actorUid: ID,
  ticketId: ID,
  patch: {
    status?: MaintenanceStatus;
    priority?: MaintenancePriority;
    assignedTo?: ID | null;
    blocksReadiness?: boolean;
    resolutionNotes?: string;
    addPhotos?: { url: string; publicId: string; caption?: string }[];
  },
): MaintenanceRecord {
  const ticket = (db.maintenance ?? []).find((m) => m.id === ticketId);
  if (!ticket) throw new OperationError('Maintenance ticket not found.', 404, 'not_found');

  const actor = resolveActor(db, actorUid);
  if (patch.priority) ticket.priority = patch.priority;
  if (patch.assignedTo !== undefined) {
    ticket.assignedTo = patch.assignedTo;
    ticket.assignedToName = patch.assignedTo
      ? (db.users ?? []).find((u) => u.uid === patch.assignedTo)?.fullName ??
        db.staff.find((s) => s.id === patch.assignedTo)?.name ??
        null
      : null;
  }
  if (patch.blocksReadiness !== undefined) ticket.blocksReadiness = patch.blocksReadiness;
  if (patch.resolutionNotes !== undefined) ticket.resolutionNotes = patch.resolutionNotes;
  if (patch.addPhotos?.length) {
    for (const p of patch.addPhotos) {
      ticket.photos.push({
        id: makeId('mph'),
        url: p.url,
        publicId: p.publicId,
        caption: p.caption,
        uploadedAt: nowISO(),
      });
    }
  }

  if (patch.status) {
    ticket.status = patch.status;
    if (patch.status === 'resolved') {
      ticket.resolvedAt = nowISO();
      ticket.resolvedBy = actor.name;
      // Release maintenance hold if no other unresolved blocking tickets remain on this unit
      const stillBlocked = (db.maintenance ?? []).some(
        (m) => m.id !== ticket.id && m.apartmentId === ticket.apartmentId && m.status !== 'resolved' && m.blocksReadiness,
      );
      if (!stillBlocked && db.cleaningState[ticket.apartmentId]?.status === 'maintenance') {
        const hasOpenCleaning = db.housekeeping.some(
          (t) =>
            t.apartmentId === ticket.apartmentId &&
            ['needs_cleaning', 'assigned', 'in_progress', 'inspection_required'].includes(t.status),
        );
        db.cleaningState[ticket.apartmentId] = {
          status: hasOpenCleaning ? 'needs_cleaning' : 'clean',
          updatedAt: nowISO(),
          note: `Maintenance resolved by ${actor.name}.`,
        };
      }
    }
  }
  ticket.updatedAt = nowISO();

  appendAuditLog(db, {
    category: 'maintenance',
    action: 'maintenance.updated',
    actorUid,
    targetType: 'maintenance',
    targetId: ticket.id,
    summary: `Updated maintenance ticket on Apt ${ticket.apartmentNumber} -> ${ticket.status}.`,
  });

  return ticket;
}

/* ------------------------------------------- Central Media & Galleries */

export function syncApartmentPhotosFromGallery(apt: Apartment) {
  const sorted = [...(apt.gallery ?? [])]
    .filter((g) => g.mediaType !== 'document')
    .sort((a, b) => (a.isCover === b.isCover ? a.order - b.order : a.isCover ? -1 : 1));
  sorted.forEach((g, idx) => {
    g.order = idx;
    g.isCover = idx === 0;
  });
  apt.gallery = [
    ...sorted,
    ...(apt.gallery ?? []).filter((g) => g.mediaType === 'document'),
  ];
  apt.photos = sorted.map((s) => s.url);
  apt.coverPhoto = sorted[0]?.url ?? '';
}

export function registerMediaRecord(
  db: Database,
  actorUid: ID,
  input: {
    url: string;
    thumbnailUrl: string;
    detailUrl: string;
    publicId: string;
    storageProvider: 'cloudinary' | 'local';
    mediaType: 'image' | 'document';
    category: MediaCategory;
    title: string;
    description?: string;
    apartmentId?: ID | null;
    isCover?: boolean;
    mimeType: string;
    sizeBytes: number;
    width?: number | null;
    height?: number | null;
    visibility?: 'public' | 'private';
    replaceMediaId?: ID | null;
  },
): MediaRecord {
  db.media = db.media ?? [];
  const actor = resolveActor(db, actorUid);
  const apt = input.apartmentId ? db.apartments.find((a) => a.id === input.apartmentId) : null;

  const existingForApt = apt ? (apt.gallery ?? []).length : 0;
  const record: MediaRecord = {
    id: makeId('med'),
    url: input.url,
    thumbnailUrl: input.thumbnailUrl,
    detailUrl: input.detailUrl,
    publicId: input.publicId,
    storageProvider: input.storageProvider,
    mediaType: input.mediaType,
    category: input.category,
    title: input.title.trim() || (apt ? `${apt.name} Photograph` : 'Uploaded Media'),
    description: (input.description ?? '').trim(),
    apartmentId: apt?.id ?? null,
    apartmentName: apt ? `Apt ${apt.number} · ${apt.name}` : null,
    order: existingForApt,
    isCover: Boolean(input.isCover || (apt && existingForApt === 0)),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width ?? null,
    height: input.height ?? null,
    visibility: input.visibility ?? (input.category === 'payment_proof' ? 'private' : 'public'),
    uploadedBy: actor.uid,
    uploadedByName: actor.name,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  db.media.unshift(record);

  if (apt) {
    apt.gallery = apt.gallery ?? [];
    if (input.replaceMediaId) {
      apt.gallery = apt.gallery.filter((g) => g.id !== input.replaceMediaId);
    }
    if (record.isCover) {
      for (const g of apt.gallery) g.isCover = false;
    }
    apt.gallery.push({
      id: record.id,
      url: record.url,
      publicId: record.publicId,
      title: record.title,
      description: record.description,
      order: record.isCover ? -1 : apt.gallery.length,
      isCover: record.isCover,
      mediaType: record.mediaType,
      uploadedAt: record.createdAt,
    });
    syncApartmentPhotosFromGallery(apt);
    apt.updatedAt = nowISO();
  }

  return record;
}

export function updateMediaRecord(
  db: Database,
  actorUid: ID,
  mediaId: ID,
  patch: {
    title?: string;
    description?: string;
    apartmentId?: ID | null;
    isCover?: boolean;
    order?: number;
  },
): MediaRecord {
  db.media = db.media ?? [];
  let media = db.media.find((m) => m.id === mediaId);

  // If editing a gallery item that wasn't yet in db.media, materialize it
  if (!media) {
    for (const apt of db.apartments) {
      const g = (apt.gallery ?? []).find((x) => x.id === mediaId);
      if (g) {
        media = {
          id: g.id,
          url: g.url,
          thumbnailUrl: g.url,
          detailUrl: g.url,
          publicId: g.publicId,
          storageProvider: 'local',
          mediaType: g.mediaType ?? 'image',
          category: 'apartment',
          title: g.title,
          description: g.description,
          apartmentId: apt.id,
          apartmentName: `Apt ${apt.number} · ${apt.name}`,
          order: g.order,
          isCover: g.isCover,
          mimeType: 'image/jpeg',
          sizeBytes: 0,
          visibility: 'public',
          uploadedBy: actorUid,
          uploadedByName: resolveActor(db, actorUid).name,
          createdAt: g.uploadedAt ?? nowISO(),
          updatedAt: nowISO(),
        };
        db.media.unshift(media);
        break;
      }
    }
  }

  if (!media) throw new OperationError('Media record not found.', 404, 'not_found');

  if (patch.title !== undefined) media.title = patch.title.trim();
  if (patch.description !== undefined) media.description = patch.description.trim();
  if (patch.order !== undefined) media.order = patch.order;
  if (patch.isCover !== undefined) media.isCover = patch.isCover;
  media.updatedAt = nowISO();

  if (media.apartmentId) {
    const apt = db.apartments.find((a) => a.id === media!.apartmentId);
    if (apt && apt.gallery) {
      if (patch.isCover) {
        for (const item of apt.gallery) item.isCover = item.id === media.id;
        for (const m of db.media) {
          if (m.apartmentId === apt.id) m.isCover = m.id === media.id;
        }
      }
      const gItem = apt.gallery.find((x) => x.id === media!.id || x.url === media!.url);
      if (gItem) {
        gItem.title = media.title;
        gItem.description = media.description;
        if (patch.order !== undefined) gItem.order = patch.order;
        if (patch.isCover !== undefined) gItem.isCover = patch.isCover;
      }
      syncApartmentPhotosFromGallery(apt);
    }
  }

  return media;
}

export function reorderApartmentGallery(
  db: Database,
  actorUid: ID,
  apartmentId: ID,
  orderedIds: ID[],
): Apartment {
  const apt = db.apartments.find((a) => a.id === apartmentId);
  if (!apt) throw new OperationError('Apartment not found.', 404, 'not_found');
  const current = apt.gallery ?? [];
  const byId = new Map<string, ApartmentPhoto>(current.map((g) => [g.id, g]));
  const reordered: ApartmentPhoto[] = [];
  for (const id of orderedIds) {
    const hit = byId.get(id);
    if (hit) {
      reordered.push(hit);
      byId.delete(id);
    }
  }
  for (const leftover of byId.values()) reordered.push(leftover);

  reordered.forEach((item, idx) => {
    item.order = idx;
    item.isCover = idx === 0;
  });
  apt.gallery = reordered;
  syncApartmentPhotosFromGallery(apt);
  apt.updatedAt = nowISO();

  for (const item of apt.gallery) {
    const m = (db.media ?? []).find((x) => x.id === item.id);
    if (m) {
      m.order = item.order;
      m.isCover = item.isCover;
    }
  }

  void actorUid;
  return apt;
}

export function detachAndRemoveMediaRecord(
  db: Database,
  actorUid: ID,
  mediaId: ID,
): MediaRecord {
  db.media = db.media ?? [];
  let target = db.media.find((m) => m.id === mediaId);

  for (const apt of db.apartments) {
    const match = (apt.gallery ?? []).find((g) => g.id === mediaId);
    if (match && !target) {
      target = {
        id: match.id,
        url: match.url,
        thumbnailUrl: match.url,
        detailUrl: match.url,
        publicId: match.publicId,
        storageProvider: 'local',
        mediaType: match.mediaType ?? 'image',
        category: 'apartment',
        title: match.title,
        description: match.description,
        apartmentId: apt.id,
        apartmentName: apt.name,
        order: match.order,
        isCover: match.isCover,
        mimeType: 'image/jpeg',
        sizeBytes: 0,
        visibility: 'public',
        uploadedBy: actorUid,
        uploadedByName: resolveActor(db, actorUid).name,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
    }
    if (apt.gallery?.some((g) => g.id === mediaId || (target && g.url === target.url))) {
      apt.gallery = apt.gallery.filter((g) => g.id !== mediaId && (!target || g.url !== target.url));
      syncApartmentPhotosFromGallery(apt);
      apt.updatedAt = nowISO();
    }
  }

  if (!target) throw new OperationError('Media item not found.', 404, 'not_found');
  db.media = db.media.filter((m) => m.id !== mediaId);

  appendAuditLog(db, {
    category: 'media',
    action: 'media.deleted',
    actorUid,
    targetType: 'media',
    targetId: mediaId,
    summary: `Deleted media "${target.title}" (${target.publicId}).`,
  });

  return target;
}

export function deleteApartmentFromInventory(
  db: Database,
  actorUid: ID,
  apartmentId: ID,
): Apartment {
  const idx = db.apartments.findIndex((a) => a.id === apartmentId);
  if (idx === -1) throw new OperationError('Apartment not found.', 404, 'not_found');
  const apt = db.apartments[idx];

  const today = db.__today || businessToday();
  const blockingBooking = db.reservations.find(
    (r) =>
      r.apartmentId === apartmentId &&
      !['cancelled', 'checked_out'].includes(r.status) &&
      r.checkOut >= today,
  );
  if (blockingBooking) {
    throw new OperationError(
      `Cannot delete ${apt.name} because active booking ${blockingBooking.reference} holds dates through ${blockingBooking.checkOut}. Unpublish the apartment or move/cancel the reservation first.`,
      409,
      'has_active_bookings',
    );
  }

  db.apartments.splice(idx, 1);
  delete db.cleaningState[apartmentId];

  appendAuditLog(db, {
    category: 'apartment',
    action: 'apartment.deleted',
    actorUid,
    targetType: 'apartment',
    targetId: apartmentId,
    summary: `Deleted Apartment ${apt.number} (${apt.name}) from inventory.`,
  });

  return apt;
}
