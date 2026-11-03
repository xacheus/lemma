import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isValid,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
} from 'date-fns';

/* date-fns is re-exported from here so the app imports all date handling from one place. */
export {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';

export const BUSINESS_TIMEZONE = 'Africa/Lusaka';

export type ISODate = string; // YYYY-MM-DD

export function toISO(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd');
}

/**
 * The property trades on Zambian time. "Today" for reception is whatever date it
 * is in Lusaka, not the server's local clock, so check-in/check-out lists stay
 * correct when the demo is opened from another timezone.
 */
export function businessToday(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function safeParse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === 'string' ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

export function dayDiff(a: ISODate, b: ISODate): number {
  const da = safeParse(a);
  const db = safeParse(b);
  if (!da || !db) return 0;
  return differenceInCalendarDays(db, da);
}

export function addISO(date: ISODate, days: number): ISODate {
  const d = safeParse(date);
  if (!d) return date;
  return toISO(addDays(d, days));
}

export function eachISO(from: ISODate, to: ISODate): ISODate[] {
  const a = safeParse(from);
  const b = safeParse(to);
  if (!a || !b || b < a) return [];
  return eachDayOfInterval({ start: a, end: b }).map((d) => toISO(d));
}

export function monthRange(monthAnchor: ISODate) {
  const anchor = safeParse(monthAnchor) ?? new Date();
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  return {
    start: toISO(start),
    end: toISO(end),
    gridStart: toISO(startOfWeek(start, { weekStartsOn: 1 })),
    gridEnd: toISO(endOfWeek(end, { weekStartsOn: 1 })),
    label: format(anchor, 'MMMM yyyy'),
    shortLabel: format(anchor, 'MMM yyyy'),
    month: format(anchor, 'MM'),
    year: format(anchor, 'yyyy'),
  };
}

export function weekRange(anyDate: ISODate) {
  const anchor = safeParse(anyDate) ?? new Date();
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return {
    start: toISO(start),
    end: toISO(addDays(start, 6)),
    days: Array.from({ length: 7 }, (_, i) => toISO(addDays(start, i))),
    label: `${format(start, 'd MMM')} – ${format(addDays(start, 6), 'd MMM yyyy')}`,
  };
}

export function monthDates(monthAnchor: ISODate): ISODate[] {
  const r = monthRange(monthAnchor);
  return eachISO(r.gridStart, r.gridEnd);
}

export function shiftMonth(anchor: ISODate, months: number): ISODate {
  const d = safeParse(anchor) ?? new Date();
  const moved = subMonths(d, -months);
  return toISO(moved.getDate() === d.getDate() ? moved : new Date(moved.getFullYear(), moved.getMonth(), 1));
}

export function formatLongDate(value: ISODate | null | undefined): string {
  const d = safeParse(value ?? null);
  return d ? format(d, 'EEEE d MMMM yyyy') : '—';
}

export function formatMediumDate(value: ISODate | null | undefined): string {
  const d = safeParse(value ?? null);
  return d ? format(d, 'd MMM yyyy') : '—';
}

export function formatShortDate(value: ISODate | null | undefined): string {
  const d = safeParse(value ?? null);
  return d ? format(d, 'd MMM') : '—';
}

export function formatDateWithWeekday(value: ISODate | null | undefined): string {
  const d = safeParse(value ?? null);
  return d ? format(d, 'EEE, d MMM yyyy') : '—';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = safeParse(iso);
  return d ? format(d, 'd MMM yyyy, HH:mm') : '—';
}

export function relativeDayLabel(value: ISODate, today: ISODate): string {
  const diff = dayDiff(today, value);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 13) return `In ${diff} days`;
  if (diff < -1 && diff >= -13) return `${Math.abs(diff)} days ago`;
  return formatMediumDate(value);
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !!safeParse(value);
}

export function isWithin(value: ISODate, from: ISODate, to: ISODate): boolean {
  return value >= from && value <= to;
}

export function timeNow(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

export function timestampNow(): string {
  return new Date().toISOString();
}
