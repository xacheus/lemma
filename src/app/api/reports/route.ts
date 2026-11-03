import { apiRoute, HttpError } from '@/lib/api/http';
import { getDb } from '@/lib/db/store';
import { buildReport, periodBounds, type Period } from '@/lib/domain/selectors';
import { isValidISODate } from '@/lib/domain/dates';

export const runtime = 'nodejs';

const PERIODS: Period[] = ['day', 'week', 'month', 'year', 'custom'];

export const GET = apiRoute({
  permission: 'reports.view',
  handler: ({ search, session }) => {
    const db = getDb();
    const requested = (search.get('period') ?? 'month') as Period;
    const period = PERIODS.includes(requested) ? requested : 'month';
    const bounds = periodBounds(db.__today, period);
    const from = search.get('from');
    const to = search.get('to');
    if (from && to) {
      if (!isValidISODate(from) || !isValidISODate(to)) {
        throw new HttpError('Date filters must be in YYYY-MM-DD form.', 422, 'validation');
      }
      if (to < from) throw new HttpError('The end of the reporting period must be after its start.', 422, 'validation');
    }
    return {
      report: buildReport(db, { from: from ?? bounds.from, to: to ?? bounds.to, period }),
      today: db.__today,
      generatedBy: session.user.name,
    };
  },
});
