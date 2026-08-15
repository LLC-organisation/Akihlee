import { Granularity } from '@/lib/api-client';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type QuickRangeKey = '7D' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL';

export type QuickRange = {
  key: QuickRangeKey;
  label: string;
  granularity: Granularity;
  from: string;
  to: string;
};

// Chart granularity scales with range width so a 7-day view isn't one bar
// and a 5-year view isn't thousands of them — daily for the shortest
// window, weekly for the middle distance, monthly once the range spans
// multiple quarters.
export function quickRanges(today: Date = new Date()): QuickRange[] {
  const to = toIsoDate(today);
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return toIsoDate(d);
  };
  const startOfYear = toIsoDate(new Date(today.getFullYear(), 0, 1));

  return [
    { key: '7D', label: '7D', granularity: 'DAY', from: daysAgo(7), to },
    { key: '1M', label: '1M', granularity: 'WEEK', from: daysAgo(30), to },
    { key: '3M', label: '3M', granularity: 'WEEK', from: daysAgo(90), to },
    { key: '6M', label: '6M', granularity: 'MONTH', from: daysAgo(182), to },
    { key: '1Y', label: '1Y', granularity: 'MONTH', from: daysAgo(365), to },
    { key: 'YTD', label: 'YTD', granularity: 'MONTH', from: startOfYear, to },
    // No real "beginning of history" concept in this app, so All Time is
    // just a date far enough back to include anything a tenant could have.
    { key: 'ALL', label: 'All Time', granularity: 'MONTH', from: '2000-01-01', to },
  ];
}

/** Same day-span thresholds the quick ranges use above — for granularity on a manually-entered custom range. */
export function granularityForSpan(from: string, to: string): Granularity {
  const days = Math.round(
    (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000
  );
  if (days <= 14) return 'DAY';
  if (days <= 100) return 'WEEK';
  return 'MONTH';
}

/** Same-length window immediately preceding [from, to] — for period-over-period comparisons. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from + 'T00:00:00Z');
  const toDate = new Date(to + 'T00:00:00Z');
  const spanDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);

  const prevTo = new Date(fromDate);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (spanDays - 1));

  return { from: toIsoDate(prevFrom), to: toIsoDate(prevTo) };
}

export type VolatilityRangeKey = '8W' | '12M' | '4Q';

export type VolatilityRange = {
  key: VolatilityRangeKey;
  label: string;
  from: string;
  to: string;
};

export function volatilityRanges(today: Date = new Date()): VolatilityRange[] {
  const to = toIsoDate(today);
  const weeksAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n * 7);
    return toIsoDate(d);
  };
  const monthsAgo = (n: number) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - n);
    return toIsoDate(d);
  };

  return [
    { key: '8W', label: 'Last 8 Weeks', from: weeksAgo(8), to },
    { key: '12M', label: 'Last 12 Months', from: monthsAgo(12), to },
    { key: '4Q', label: 'Last 4 Quarters', from: monthsAgo(12), to },
  ];
}

/**
 * Renders a backend period key for display. DAY and WEEK both arrive as
 * "yyyy-MM-dd" (week keyed on its Monday) so granularity disambiguates
 * which label to use; MONTH is "yyyy-MM"; QUARTER is "yyyy-Qn".
 */
export function formatPeriodLabel(period: string, granularity: Granularity): string {
  if (granularity === 'QUARTER') {
    const [y, q] = period.split('-');
    return `${q} ${y}`;
  }
  if (granularity === 'MONTH') {
    const [y, m] = period.split('-');
    return `${MONTHS[Number(m) - 1]} ${y}`;
  }
  const [, m, d] = period.split('-');
  const label = `${MONTHS[Number(m) - 1]} ${Number(d)}`;
  return granularity === 'WEEK' ? `Wk of ${label}` : label;
}

export const GRANULARITY_UNIT_LABEL: Record<Granularity, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  QUARTER: 'quarter',
};
