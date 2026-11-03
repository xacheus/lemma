import type {
  Apartment,
  AuditLogRecord,
  CleaningStatus,
  DashboardSummaryDoc,
  Guest,
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
  Settings,
  StaffUser,
  UserRecord,
} from './domain/types';
import type { DashboardMetrics } from './domain/selectors';

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

export type PublicUserView = Omit<
  UserRecord,
  'passwordHash' | 'emailVerificationToken' | 'passwordResetToken' | 'passwordResetExpiresAt'
>;

export interface IntegrationStatusView {
  firebaseClientConfigured: boolean;
  firebaseAdminConfigured: boolean;
  cloudinaryCloudName: string;
  cloudinaryUploadPreset: string;
  cloudinarySignedReady: boolean;
  whatsappProviderConfigured: boolean;
  smsProviderConfigured: boolean;
  emailProviderConfigured: boolean;
}

export interface SnapshotView {
  user: Omit<StaffUser, 'passwordHash'>;
  account: PublicUserView | null;
  permissions: PermissionKey[];
  today: string;
  settings: Settings;
  apartments: ApartmentView[];
  cleaningState: Record<string, { status: CleaningStatus; updatedAt: string; note: string }>;
  guests: Guest[] | null;
  staff: StaffView[];
  users: PublicUserView[];
  reservations: ReservationView[] | null;
  payments: Payment[] | null;
  quotations: Quotation[];
  invoices: Invoice[];
  receipts: ReceiptRecord[];
  housekeeping: HousekeepingTaskView[];
  maintenance: MaintenanceRecord[];
  media: MediaRecord[];
  auditLogs: AuditLogRecord[];
  dashboardSummary: DashboardSummaryDoc | null;
  notifications: NotificationRecord[] | null;
  metrics: DashboardMetrics | null;
  guestTotals: Record<string, GuestTotals> | null;
  integrations: IntegrationStatusView;
}

export interface LoginResult {
  id: string;
  name: string;
  role: StaffUser['role'];
  jobTitle: string;
}

export type PublicSearchUnit = {
  apartment: Apartment;
  available: boolean;
  nights: number;
  total: number;
  deposit: number;
};

export type GuestLookupHit = Pick<Guest, 'id' | 'fullName' | 'phone' | 'email' | 'nationality' | 'idType' | 'nationalId'>;
