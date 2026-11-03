import type {
  Apartment,
  CleaningStatus,
  Database,
  Guest,
  HousekeepingTask,
  NotificationRecord,
  Payment,
  PermissionKey,
  ReservationView,
  StaffUser,
} from '../domain/types';
import { can } from '../domain/permissions';
import { checkAvailability, snapshotForNight } from '../domain/availability';
import { dashboard, decorateAll, guestSummary, nightsBetweenSummary } from '../domain/selectors';
import { addISO } from '../domain/dates';
import type { Session } from '../auth/session';

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
  permissions: PermissionKey[];
  today: string;
  settings: Database['settings'];
  apartments: ApartmentSummary[];
  cleaningState: Database['cleaningState'];
  guests: Guest[] | null;
  staff: Pick<StaffUser, 'id' | 'name' | 'role' | 'jobTitle' | 'active' | 'shift' | 'username' | 'phone' | 'email' | 'lastSeenAt' | 'permissions' | 'hiredOn'>[];
  reservations: ReservationView[] | null;
  payments: Payment[] | null;
  housekeeping: TaskView[];
  notifications: NotificationRecord[] | null;
  metrics: ReturnType<typeof dashboard> | null;
  guestTotals: Record<string, { stays: number; totalSpent: number; outstanding: number; nights: number }> | null;
}

/**
 * Builds the payload the admin client renders. Role-based projection happens here,
 * once, on the server: a cleaner's snapshot physically contains no guest records,
 * no payment rows and no reservation ledger — not "hidden in the UI".
 */
export function buildSnapshot(db: Database, session: Session): Snapshot {
  const { user, permissions } = session;
  const today = db.__today;
  const isCleaner = user.role === 'cleaner';
  const seePii = permissions.has('guests.viewPii');
  const seeLedger = permissions.has('payments.view') || permissions.has('reservations.view');

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
        (r) => r.apartmentId === apartment.id && r.status === 'checked_in' && r.checkIn <= today && today < r.checkOut,
      );
      const cleaning = db.cleaningState[apartment.id]?.status ?? 'clean';
      const nextArrival = db.reservations
        .filter((r) => r.apartmentId === apartment.id && r.checkIn > today && ['reserved', 'fully_paid'].includes(r.status))
        .sort((x, y) => (x.checkIn < y.checkIn ? -1 : 1))[0];
      const nextDeparture = db.reservations
        .filter((r) => r.apartmentId === apartment.id && r.checkOut >= today && r.status === 'checked_in')
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
      const revenue30 = inWindow.reduce(
        (sum, r) =>
          sum +
          db.payments
            .filter((p) => p.reservationId === r.id && p.verificationStatus === 'verified' && p.kind !== 'refund')
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
        tonightStatus: !apartment.active || apartment.outOfService
          ? 'out_of_service'
          : staying
            ? 'occupied'
            : cleaning === 'maintenance'
              ? 'maintenance'
              : cleaning === 'needs_cleaning' || cleaning === 'in_progress'
                ? 'cleaning'
                : 'available',
        cleaningStatus: cleaning,
        guestInHouse: staying ? (seePii || seeLedger ? (guestLookup.get(staying.guestId)?.fullName ?? null) : 'Guest in residence') : null,
        nextDeparture: nextDeparture?.checkOut ?? null,
        nextArrival: nextArrival?.checkIn ?? null,
        nightsLast30: nightsBetweenSummary(inWindow),
        revenueLast30: revenue30,
        openTasks: db.housekeeping.filter((t) => t.apartmentId === apartment.id && t.status !== 'clean').length,
        nextFreeFrom,
      };
    });

  const housekeepingAll = db.housekeeping
    .filter((t) => (isCleaner ? t.assignedTo === user.id : true))
    .filter((t) => {
      if (!isCleaner) return true;
      // A cleaner's list is work, not history: today, tomorrow and anything they own that is open.
      return t.date >= today || t.status === 'in_progress';
    })
    .map<TaskView>((task) => {
      const apartment = apartmentLookup.get(task.apartmentId);
      const reservation = task.reservationId ? db.reservations.find((r) => r.id === task.reservationId) : null;
      return {
        ...task,
        apartmentName: apartment?.name ?? 'Unknown unit',
        apartmentNumber: apartment?.number ?? 0,
        assignedToName: task.assignedTo ? db.staff.find((s) => s.id === task.assignedTo)?.name ?? null : null,
        guestName:
          !isCleaner && reservation && (seePii || seeLedger)
            ? guestLookup.get(reservation.guestId)?.fullName ?? null
            : null,
        reference: isCleaner ? null : (reservation?.reference ?? null),
      };
    })
    .sort((a, b) => (a.date === b.date ? a.dueTime.localeCompare(b.dueTime) : a.date < b.date ? -1 : 1));

  const notifications = permissions.has('notifications.view') ? db.notifications : null;

  const guestTotals: Snapshot['guestTotals'] = guestsRaw
    ? Object.fromEntries(
        db.guests.map((g) => {
          const s = guestSummary(db, g);
          return [g.id, { stays: s.stays, totalSpent: s.totalSpent, outstanding: s.outstanding, nights: s.nights }];
        }),
      )
    : null;

  const { passwordHash: _redacted, ...safeUser } = user;
  void _redacted;

  return {
    user: safeUser,
    permissions: [...permissions],
    today,
    settings: db.settings,
    apartments,
    cleaningState: db.cleaningState,
    guests,
    staff: db.staff.map((s) => ({
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
    reservations,
    payments: can(user, 'payments.view') || can(user, 'payments.record') ? db.payments : null,
    housekeeping: housekeepingAll,
    notifications,
    metrics: isCleaner ? null : dashboard(db),
    guestTotals,
  };
}
