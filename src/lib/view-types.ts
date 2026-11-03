import type {
  Apartment,
  CleaningStatus,
  Guest,
  HousekeepingTask,
  NotificationRecord,
  Payment,
  PermissionKey,
  ReservationView,
  Settings,
  StaffUser,
} from './domain/types';
import type { DashboardMetrics } from './domain/selectors';

/**
 * Shapes the browser is allowed to see. Kept in its own module (rather than reusing
 * the server snapshot file) because the server module imports `next/headers`, which
 * must not be pulled into a client bundle.
 */

export interface ApartmentView extends Apartment {
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

export interface HousekeepingTaskView extends HousekeepingTask {
  apartmentName: string;
  apartmentNumber: number;
  assignedToName: string | null;
  guestName: string | null;
  reference: string | null;
}

export interface GuestTotals {
  stays: number;
  totalSpent: number;
  outstanding: number;
  nights: number;
}

export type StaffView = Pick<
  StaffUser,
  'id' | 'name' | 'role' | 'jobTitle' | 'active' | 'shift' | 'username' | 'phone' | 'email' | 'lastSeenAt' | 'permissions' | 'hiredOn'
>;

export interface SnapshotView {
  user: Omit<StaffUser, 'passwordHash'>;
  permissions: PermissionKey[];
  today: string;
  settings: Settings;
  apartments: ApartmentView[];
  cleaningState: Record<string, { status: CleaningStatus; updatedAt: string; note: string }>;
  /** Null when the role has no right to the guest register. */
  guests: Guest[] | null;
  staff: StaffView[];
  reservations: ReservationView[] | null;
  payments: Payment[] | null;
  housekeeping: HousekeepingTaskView[];
  notifications: NotificationRecord[] | null;
  metrics: DashboardMetrics | null;
  guestTotals: Record<string, GuestTotals> | null;
}

export interface LoginResult {
  id: string;
  name: string;
  role: StaffUser['role'];
  jobTitle: string;
}
