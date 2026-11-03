import { apiRoute, HttpError, readBody } from '@/lib/api/http';
import { actionSchema, cancelSchema, statusSchema } from '@/lib/api/schemas';
import { mutate } from '@/lib/db/store';
import { buildSnapshot } from '@/lib/api/snapshot';
import {
  cancelReservation,
  checkInReservation,
  checkOutReservation,
  setReservationStatus,
} from '@/lib/domain/operations';
import type { PermissionKey } from '@/lib/domain/types';

export const runtime = 'nodejs';

function require_(session: { permissions: Set<PermissionKey> }, key: PermissionKey, message: string) {
  if (!session.permissions.has(key)) throw new HttpError(message, 403, 'forbidden');
}

const STATUS_PERMISSION: Record<string, PermissionKey> = {
  inquiry: 'reservations.edit',
  reserved: 'reservations.edit',
  fully_paid: 'reservations.edit',
  checked_in: 'reservations.checkin',
  checked_out: 'reservations.checkin',
  cancelled: 'reservations.cancel',
};

/**
 * Every state transition the desk can perform on a booking, behind one endpoint.
 * Permissions are re-checked per transition rather than per route, because a
 * receptionist may amend a folio but must not authorise a refund on cancellation.
 */
export const POST = apiRoute({
  permission: 'reservations.edit',
  handler: async ({ req, session, params }) => {
    const body = (await req.json()) as { kind?: string };
    return mutate((db) => {
      switch (body?.kind) {
        case 'cancel': {
          require_(session, 'reservations.cancel', 'Your role cannot cancel bookings — an administrator must do it.');
          const input = cancelSchema.parse(body);
          return {
            result: cancelReservation(db, session.user.id, params.id, input.reason, {
              refund: input.refund,
              refundMethod: input.refundMethod,
            }),
            snapshot: buildSnapshot(db, session),
          };
        }
        case 'status': {
          const input = statusSchema.parse(body);
          require_(
            session,
            STATUS_PERMISSION[input.status] ?? 'reservations.edit',
            `Moving a booking to “${input.status.replace(/_/g, ' ')}” needs extra authority.`,
          );
          return {
            result: setReservationStatus(db, session.user.id, params.id, input.status, input.note),
            snapshot: buildSnapshot(db, session),
          };
        }
        case 'action': {
          const input = actionSchema.parse(body);
          require_(session, 'reservations.checkin', 'Only reception or an administrator can move guests through arrivals and departures.');
          if (input.action === 'check_in') {
            return { result: checkInReservation(db, session.user.id, params.id, input.arrivalTime), snapshot: buildSnapshot(db, session) };
          }
          if (input.action === 'check_out') {
            return { result: checkOutReservation(db, session.user.id, params.id), snapshot: buildSnapshot(db, session) };
          }
          return {
            result: setReservationStatus(db, session.user.id, params.id, 'checked_in', 'Folio re-opened by reception'),
            snapshot: buildSnapshot(db, session),
          };
        }
        default:
          throw new HttpError(`Unknown booking action "${String(body?.kind)}".`, 400, 'bad_request');
      }
    });
  },
});
