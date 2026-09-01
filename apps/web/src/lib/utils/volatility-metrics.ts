import { MonthlyTrendPoint } from '@/lib/api-client';

export type TargetMetric = 'CASH_FLOW' | 'EXPENSE' | 'REVENUE';

export type TargetMetricInfo = {
  key: TargetMetric;
  label: string;
  /** Subject of the "your ___ swing(s) by" sentence. */
  noun: string;
  /** Verb agreement for that subject — "expenses swing" vs. "revenue swings". */
  verb: 'swing' | 'swings';
  /** What the average is an average *of*, e.g. "average spend" vs. "average revenue". */
  averageNoun: string;
};

export const TARGET_METRICS: TargetMetricInfo[] = [
  { key: 'CASH_FLOW', label: 'Cash Flow Volatility', noun: 'cash flow', verb: 'swings', averageNoun: 'net cash flow' },
  { key: 'EXPENSE', label: 'Expense Volatility', noun: 'expenses', verb: 'swing', averageNoun: 'spend' },
  { key: 'REVENUE', label: 'Revenue Volatility', noun: 'revenue', verb: 'swings', averageNoun: 'revenue' },
];

export function targetMetricInfo(metric: TargetMetric) {
  return TARGET_METRICS.find((m) => m.key === metric)!;
}

/** Pulls the right series out of a combined-trend response for the given target metric. */
export function seriesFor(points: MonthlyTrendPoint[], metric: TargetMetric): number[] {
  switch (metric) {
    case 'EXPENSE':
      return points.map((p) => p.expense);
    case 'REVENUE':
      return points.map((p) => p.income);
    case 'CASH_FLOW':
      return points.map((p) => p.income - p.expense);
  }
}
