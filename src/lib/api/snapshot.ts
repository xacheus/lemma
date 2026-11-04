import { ownsGuestResource } from '../domain/ownership';
import { DEFAULT_SETTINGS } from '../db/default-settings';
import { publicPaymentMethod } from '../domain/payment-details';
import type {
  Apartment,
  AuditLogRecord,
  CleaningStatus,
  DashboardSummaryDoc,
  Database,
  Guest,
  GuestSubmittedPayment,
  HousekeepingTask,
  Invoice,
  MaintenanceRecord,
  MediaRecord,
  NotificationRecord,
  Payment,
  PermissionKey,
  Quotation,
  ReceiptRecord,
  ReservationView,
  StaffUser,
  UserRecord,
} from '../domain/types';
import { can, permissionsFor } from '../domain/permissions';
import { checkAvailability } from '../domain/availability';
import { dashboard, decorateAll, guestSummary, nightsBetweenSummary, recomputeReservation } from '../domain/selectors';
import { addISO } from '../domain/dates';
import type { Session } from '../auth/session';
import type { IntegrationStatusView, PublicUserView } from '../view-types';
import { isFirebaseAdminConfigured } from '../firebase/admin';
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
  isCloudinaryConfigured,
} from '../cloudinary/server';

export interface ApartmentSummary extends Apartment {
  tonightStatus: 'occupied' | 'available' | 'cleaning' | 'maintenance' | 'out_of_service';
  cleaningStatus: CleaningStatus;
  guestInHouse: string | null;
  nextDeparture: string | null;
  nextArrival: string | null;
  nightsLast30: number;
  revenueLast30: number;
  openTasks: number;
  nextFreeFrom: string | null;
}

export interface TaskView extends HousekeepingTask {
  apartmentName: string;
  apartmentNumber: number;
  assignedToName: string | null;
  guestName: string | null;
  reference: string | null;
}

export interface Snapshot {
  user: Omit<StaffUser, 'passwordHash'>;
  account: PublicUserView | null;
  permissions: PermissionKey[];
  today: string;
  settings: Database['settings'];
  apartments: ApartmentSummary[];
  cleaningState: Database['cleaningState'];
  guests: Guest[] | null;
  staff: Pick<
    StaffUser,
    'id' | 'name' | 'role' | 'jobTitle' | 'active' | 'shift' | 'username' | 'phone' | 'email' | 'lastSeenAt' | 'permissions' | 'hiredOn'
  >[];
  users: PublicUserView[];
  reservations: ReservationView[] | null;
  payments: Payment[] | null;
  quotations: Quotation[];
  invoices: Invoice[];
  receipts: ReceiptRecord[];
  housekeeping: TaskView[];
  maintenance: MaintenanceRecord[];
  media: MediaRecord[];
  auditLogs: AuditLogRecord[];
  dashboardSummary: DashboardSummaryDoc | null;
  notifications: NotificationRecord[] | null;
  /** Guest-submitted payments: own claims for a guest, the review queue for staff. */
  paymentClaims: GuestSubmittedPayment[] | null;
  metrics: ReturnType<typeof dashboard> | null;
  guestTotals: Record<string, { stays: number; totalSpent: number; outstanding: number; nights: number }> | null;
  integrations: IntegrationStatusView;
}

export function stripUser(user: UserRecord): PublicUserView {
  const {
    passwordHash: _pw,
    emailVerificationToken: _ev,
    passwordResetToken: _pr,
    passwordResetExpiresAt: _pre,
    ...rest
  } = user;
  void _pw;
  void _ev;
  void _pr;
  void _pre;
  return rest;
}

export function getIntegrationStatus(): IntegrationStatusView {
  return {
    firebaseClientConfigured: Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    ),
    firebaseAdminConfigured: isFirebaseAdminConfigured(),
    cloudinaryCloudName: CLOUDINARY_CLOUD_NAME,
    cloudinaryUploadPreset: CLOUDINARY_UPLOAD_PRESET,
    cloudinarySignedReady: isCloudinaryConfigured(),
    whatsappProviderConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
    ),
    smsProviderConfigured: Boolean(process.env.SMS_WEBHOOK_URL),
    emailProviderConfigured: Boolean(process.env.RESEND_API_KEY),
  };
}

/**
 * Builds the role-projected payload on the server:
 * - Cleaner: assigned cleaning & maintenance tasks only; zero guest PII, reservations, or financial figures.
 * - Guest: strictly own bookings, payments, quotations, invoices, receipts, and public apartments.
 * - Receptionist: front-office reservations, guests, payments, quotations, invoices, housekeeping.
 * - Admin / Super Admin: full property, staff/users, media, audit logs, and verified summary.
 */
/**
 * Brings the stored statuses up to date with the ledger before anything is read.
 *
 * A folio's status is derived from verified money, so it has to be re-derived even on
 * a read: a receipt verified in an earlier request (or in an earlier deploy with the
 * old rule) must show the booking as Reserved, not Inquiry. This is idempotent, writes
 * nothing unless a value actually changes, and never touches a status a person set
 * (`checked_in`, `checked_out`, `cancelled`).
 */
function refreshDerivedStatuses(db: Database): void {
  for (const r of db.reservations) {
    const before = `${r.status}|${r.nights}|${r.totalAmount}`;
    recomputeReservation(db, r.id);
    const after = `${r.status}|${r.nights}|${r.totalAmount}`;
    if (before !== after) r.updatedAt = new Date().toISOString();
  }
}

export function buildSnapshot(db: Database, sessionOrUser: Session | StaffUser): Snapshot {
  refreshDerivedStatuses(db);
  const user: StaffUser = 'user' in sessionOrUser ? sessionOrUser.user : sessionOrUser;
  const permissions: Set<PermissionKey> =
    'permissions' in sessionOrUser && sessionOrUser.permissions instanceof Set
      ? sessionOrUser.permissions
      : permissionsFor(user);

  const today = db.__today;
  const isCleaner = user.role === 'cleaner';
  const isGuest = user.role === 'guest';
  const isAdmin = user.role === 'super_admin' || user.role === 'admin';
  const seePii = permissions.has('guests.viewPii');
  const seeLedger = permissions.has('payments.view') || permissions.has('reservations.view');

  const userRec = (db.users ?? []).find((u) => u.uid === user.id) ?? null;
  const account = userRec ? stripUser(userRec) : null;
  const integrations = getIntegrationStatus();
  const { passwordHash: _redacted, ...safeUser } = user;
  void _redacted;

  // Guest Account Portal Projection — strictly own bookings & documents
  if (isGuest) {
    const emailLower = userRec?.emailVerified ? user.email.toLowerCase() : '';
    // Verified email may claim unowned visitor records, never a profile or
    // booking already associated with another account.
    const myGuests = db.guests.filter((g) => g.userId === user.id ||
      (!g.userId && Boolean(emailLower) && g.email?.toLowerCase() === emailLower));
    const myGuestIds = new Set(myGuests.map((g) => g.id));
    const ownBookings = db.reservations.filter((r) =>
      r.userId === user.id || (!r.userId && myGuestIds.has(r.guestId)));
    const myReservationIds = new Set(ownBookings.map((r) => r.id));
    const myReservations = decorateAll(db, ownBookings.sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)))
      .map((r) => ({ ...r, guest: r.guest && (!r.guest.userId || r.guest.userId === user.id) ? { ...r.guest, internalNotes: '' } : null }));

    const myPayments = db.payments.filter(
      (p) => p.userId === user.id || (!p.userId && myReservationIds.has(p.reservationId)),
    );
    const myQuotations = (db.quotations ?? []).filter((q) => ownsGuestResource(db, user.id, emailLower, {
      userId: q.userId, reservationId: q.reservationId, guestId: q.guestId, docEmail: q.customerEmail,
    }));
    const myInvoices = (db.invoices ?? []).filter(
      (inv) =>
        inv.userId === user.id ||
        (!inv.userId && (inv.reservationId ? myReservationIds.has(inv.reservationId) :
          (inv.guestId && myGuestIds.has(inv.guestId)))),
    );
    const myReceipts = (db.receipts ?? []).filter(
      (rc) =>
        rc.userId === user.id ||
        (!rc.userId && myReservationIds.has(rc.reservationId)),
    );
    const myNotifications = db.notifications.filter((n) => {
      if (n.recipientUid) return n.recipientUid === user.id;
      // Legacy records did not store a UID. Only expose records addressed to the
      // guest, not reception's internal messages about that same booking.
      const ownsBooking = Boolean(n.reservationId && myReservationIds.has(n.reservationId));
      const guest = db.guests.find((g) => g.id === n.guestId);
      return Boolean(guest && n.recipientName === guest.fullName &&
        (ownsBooking || (!n.reservationId && myGuestIds.has(guest.id))));
    });

    const publicApts: ApartmentSummary[] = db.apartments
      .filter((a) => a.active && a.publicationStatus !== 'draft')
      .map((a) => ({
        ...a,
        tonightStatus: 'available',
        cleaningStatus: 'clean',
        guestInHouse: null,
        nextDeparture: null,
        nextArrival: null,
        nightsLast30: 0,
        revenueLast30: 0,
        openTasks: 0,
        nextFreeFrom: today,
      }));

    return {
      user: safeUser,
      account,
      permissions: [...permissions],
      today,
      // The guest portal needs a contact number and public payment information,
      // never the property's disabled destinations or internal policies.
      settings: {
        ...structuredClone(DEFAULT_SETTINGS),
        property: { ...structuredClone(DEFAULT_SETTINGS.property), whatsapp: db.settings.property.whatsapp },
        payments: { ...structuredClone(DEFAULT_SETTINGS.payments), methods: db.settings.payments.methods.filter((m) => m.enabled).map((m) => ({ ...publicPaymentMethod(m), enabled: true })) },
      },
      apartments: publicApts,
      cleaningState: {},
      guests: myGuests.map((g) => ({ ...g, internalNotes: '' })),
      staff: [],
      users: [],
      reservations: myReservations,
      payments: myPayments,
      quotations: myQuotations,
      invoices: myInvoices,
      receipts: myReceipts,
      housekeeping: [],
      maintenance: [],
      media: [],
      auditLogs: [],
      dashboardSummary: null,
      notifications: myNotifications,
      paymentClaims: (db.paymentClaims ?? []).filter(
        (c) => c.userId === user.id || (!c.userId && myReservationIds.has(c.reservationId)),
      ),
      metrics: null,
      guestTotals: null,
      integrations,
    };
  }

  const guestsRaw = permissions.has('guests.view') ? db.guests : null;
  const guests: Guest[] | null = guestsRaw
    ? guestsRaw.map((g) => (seePii ? g : { ...g, nationalId: '' }))
    : null;

  const reservations = isCleaner
    ? null
    : decorateAll(db).map((r) => ({
        ...r,
        guest: r.guest
          ? seePii
            ? r.guest
            : { ...r.guest, nationalId: '' }
          : null,
      }));

  const guestLookup = new Map(db.guests.map((g) => [g.id, g]));
  const apartmentLookup = new Map(db.apartments.map((a) => [a.id, a]));

  const apartments: ApartmentSummary[] = db.apartments
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((apartment) => {
      const staying = db.reservations.find(
        (r) =>
          r.apartmentId === apartment.id &&
          r.status === 'checked_in' &&
          r.checkIn <= today &&
          today < r.checkOut,
      );
      const cleaning = db.cleaningState[apartment.id]?.status ?? 'clean';
      const nextArrival = db.reservations
        .filter(
          (r) =>
            r.apartmentId === apartment.id &&
            r.checkIn > today &&
            ['reserved', 'fully_paid'].includes(r.status),
        )
        .sort((x, y) => (x.checkIn < y.checkIn ? -1 : 1))[0];
      const nextDeparture = db.reservations
        .filter(
          (r) =>
            r.apartmentId === apartment.id &&
            r.checkOut >= today &&
            r.status === 'checked_in',
        )
        .sort((x, y) => (x.checkOut < y.checkOut ? -1 : 1))[0];

      const window30 = [addISO(today, -29), today];
      const inWindow = db.reservations.filter(
        (r) =>
          r.apartmentId === apartment.id &&
          r.status !== 'cancelled' &&
          r.status !== 'inquiry' &&
          r.checkOut >= window30[0] &&
          r.checkIn <= window30[1],
      );
      const revenue30 = isCleaner
        ? 0
        : inWindow.reduce(
            (sum, r) =>
              sum +
              db.payments
                .filter(
                  (p) =>
                    p.reservationId === r.id &&
                    p.verificationStatus === 'verified' &&
                    p.kind !== 'refund',
                )
                .reduce((s, p) => s + p.amount, 0),
            0,
          );

      let nextFreeFrom: string | null = null;
      for (let i = 0; i < 30; i += 1) {
        const from = addISO(today, i);
        const probe = checkAvailability(db, {
          apartmentId: apartment.id,
          checkIn: from,
          checkOut: addISO(from, 2),
          today,
        });
        if (probe.available) {
          nextFreeFrom = from;
          break;
        }
      }

      return {
        ...apartment,
        nightlyRate: isCleaner ? 0 : apartment.nightlyRate,
        tonightStatus:
          !apartment.active || apartment.outOfService
            ? 'out_of_service'
            : staying
              ? 'occupied'
              : cleaning === 'maintenance'
                ? 'maintenance'
                : ['needs_cleaning', 'assigned', 'in_progress', 'inspection_required'].includes(cleaning)
                  ? 'cleaning'
                  : 'available',
        cleaningStatus: cleaning,
        guestInHouse: staying
          ? seePii || seeLedger
            ? (guestLookup.get(staying.guestId)?.fullName ?? null)
            : 'Guest in residence'
          : null,
        nextDeparture: nextDeparture?.checkOut ?? null,
        nextArrival: nextArrival?.checkIn ?? null,
        nightsLast30: nightsBetweenSummary(inWindow),
        revenueLast30: revenue30,
        openTasks: db.housekeeping.filter(
          (t) => t.apartmentId === apartment.id && t.status !== 'clean' && t.status !== 'completed',
        ).length,
        nextFreeFrom,
      };
    });

  const housekeepingAll = db.housekeeping
    .filter((t) => (isCleaner ? t.assignedTo === user.id : true))
    .filter((t) => {
      if (!isCleaner) return true;
      return t.date >= today || t.status === 'in_progress' || t.status === 'needs_cleaning' || t.status === 'assigned';
    })
    .map<TaskView>((task) => {
      const apartment = apartmentLookup.get(task.apartmentId);
      const reservation = task.reservationId
        ? db.reservations.find((r) => r.id === task.reservationId)
        : null;
      const assigneeName = task.assignedTo
        ? (db.users ?? []).find((u) => u.uid === task.assignedTo)?.fullName ??
          db.staff.find((s) => s.id === task.assignedTo)?.name ??
          null
        : null;
      return {
        ...task,
        apartmentName: apartment?.name ?? 'Unknown unit',
        apartmentNumber: apartment?.number ?? 0,
        assignedToName: assigneeName,
        guestName:
          !isCleaner && reservation && (seePii || seeLedger)
            ? guestLookup.get(reservation.guestId)?.fullName ?? null
            : null,
        reference: isCleaner ? null : (reservation?.reference ?? null),
      };
    })
    .sort((a, b) =>
      a.date === b.date ? a.dueTime.localeCompare(b.dueTime) : a.date < b.date ? -1 : 1,
    );

  const notifications = permissions.has('notifications.view') ? db.notifications : null;

  const guestTotals: Snapshot['guestTotals'] = guestsRaw
    ? Object.fromEntries(
        db.guests.map((g) => {
          const s = guestSummary(db, g);
          return [
            g.id,
            { stays: s.stays, totalSpent: s.totalSpent, outstanding: s.outstanding, nights: s.nights },
          ];
        }),
      )
    : null;

  const maintenanceList = isCleaner
    ? (db.maintenance ?? []).filter((m) => m.assignedTo === user.id || m.reportedBy === user.id)
    : permissions.has('housekeeping.view')
      ? (db.maintenance ?? [])
      : [];

  return {
    user: safeUser,
    account,
    permissions: [...permissions],
    today,
    settings: isCleaner
      ? { ...db.settings, payments: { ...db.settings.payments, methods: [] } }
      : db.settings,
    apartments,
    cleaningState: db.cleaningState,
    guests,
    staff: isCleaner
      ? [
          {
            id: safeUser.id,
            name: safeUser.name,
            role: safeUser.role,
            jobTitle: safeUser.jobTitle,
            active: safeUser.active,
            shift: safeUser.shift,
            username: safeUser.username,
            phone: safeUser.phone,
            email: safeUser.email,
            lastSeenAt: safeUser.lastSeenAt,
            permissions: safeUser.permissions,
            hiredOn: safeUser.hiredOn,
          },
        ]
      : db.staff.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          jobTitle: s.jobTitle,
          active: s.active,
          shift: s.shift,
          username: s.username,
          phone: s.phone,
          email: s.email,
          lastSeenAt: s.lastSeenAt,
          permissions: s.permissions,
          hiredOn: s.hiredOn,
        })),
    users: isAdmin ? (db.users ?? []).map(stripUser) : [],
    reservations,
    payments: can(user, 'payments.view') || can(user, 'payments.record') ? db.payments : null,
    quotations: permissions.has('quotations.view') ? (db.quotations ?? []) : [],
    invoices: permissions.has('invoices.view') ? (db.invoices ?? []) : [],
    receipts: permissions.has('payments.view') ? (db.receipts ?? []) : [],
    housekeeping: housekeepingAll,
    maintenance: maintenanceList,
    media: permissions.has('media.view') || permissions.has('media.manage') ? (db.media ?? []) : [],
    auditLogs: permissions.has('audit.view') ? (db.auditLogs ?? []).slice(0, 200) : [],
    dashboardSummary: isCleaner ? null : (db.dashboardSummary ?? null),
    notifications,
    /**
     * Guests see their own claims. Staff who can record payments see the queue;
     * cleaners never see financial records at all.
     */
    paymentClaims:
      can(user, 'payments.record') || can(user, 'payments.view') || can(user, 'payments.verify')
        ? (db.paymentClaims ?? [])
        : null,
    metrics: isCleaner ? null : dashboard(db),
    guestTotals,
    integrations,
  };
}
