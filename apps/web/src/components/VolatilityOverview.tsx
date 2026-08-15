'use client';

import { useCallback, useEffect, useState } from 'react';
import { analyticsApi, Granularity, MonthlyTrendPoint } from '@/lib/api-client';
import { GRANULARITY_UNIT_LABEL, VolatilityRangeKey, volatilityRanges } from '@/lib/utils/date-ranges';
import { volatilityStats } from '@/lib/utils/statistics';
import { VolatilityCard } from './VolatilityCard';

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-6 transition-all duration-200';
const selectClasses =
  'rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-accent transition-colors duration-200';

type TargetMetric = 'CASH_FLOW' | 'EXPENSE' | 'REVENUE';

const TARGET_METRICS: { key: TargetMetric; label: string }[] = [
  { key: 'CASH_FLOW', label: 'Cash Flow Volatility' },
  { key: 'EXPENSE', label: 'Expense Volatility' },
  { key: 'REVENUE', label: 'Revenue Volatility' },
];

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'WEEK', label: 'Weekly' },
  { key: 'MONTH', label: 'Monthly' },
  { key: 'QUARTER', label: 'Quarterly' },
];

// The range picker's natural granularity pairing — selecting a range
// nudges granularity to match, though the two controls stay independent.
const DEFAULT_GRANULARITY_FOR_RANGE: Record<VolatilityRangeKey, Granularity> = {
  '8W': 'WEEK',
  '12M': 'MONTH',
  '4Q': 'QUARTER',
};

function seriesFor(points: MonthlyTrendPoint[], metric: TargetMetric): number[] {
  switch (metric) {
    case 'EXPENSE':
      return points.map((p) => p.expense);
    case 'REVENUE':
      return points.map((p) => p.income);
    case 'CASH_FLOW':
      return points.map((p) => p.income - p.expense);
  }
}

/**
 * Dashboard risk widget: derives volatility purely from the existing
 * combined-trend analytics endpoint (no separate table) — picks a range,
 * fetches income/expense at the matching granularity, and runs sample
 * standard deviation / coefficient of variation over whichever series the
 * selected target metric implies.
 */
export function VolatilityOverview() {
  const ranges = volatilityRanges();

  const [rangeKey, setRangeKey] = useState<VolatilityRangeKey>('12M');
  const [granularity, setGranularity] = useState<Granularity>('MONTH');
  const [targetMetric, setTargetMetric] = useState<TargetMetric>('CASH_FLOW');

  const [points, setPoints] = useState<MonthlyTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: VolatilityRangeKey, gran: Granularity) => {
    setLoading(true);
    setError(null);
    try {
      const active = volatilityRanges().find((r) => r.key === range)!;
      const data = await analyticsApi.combinedTrend({ from: active.from, to: active.to, granularity: gran });
      setPoints(data);
    } catch {
      setError('Could not load volatility data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(rangeKey, granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRangeChange = (key: VolatilityRangeKey) => {
    const nextGranularity = DEFAULT_GRANULARITY_FOR_RANGE[key];
    setRangeKey(key);
    setGranularity(nextGranularity);
    load(key, nextGranularity);
  };

  const handleGranularityChange = (gran: Granularity) => {
    setGranularity(gran);
    load(rangeKey, gran);
  };

  const targetLabel = TARGET_METRICS.find((m) => m.key === targetMetric)!.label;
  const unitLabel = GRANULARITY_UNIT_LABEL[granularity];
  const stats = volatilityStats(seriesFor(points, targetMetric));

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Visualizations &amp; Volatility Overview</h2>

      <div className={cardClasses}>
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div>
            <label htmlFor="vol-metric" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Target Metric
            </label>
            <select
              id="vol-metric"
              value={targetMetric}
              onChange={(e) => setTargetMetric(e.target.value as TargetMetric)}
              className={selectClasses}
            >
              {TARGET_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vol-granularity" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Time Granularity
            </label>
            <select
              id="vol-granularity"
              value={granularity}
              onChange={(e) => handleGranularityChange(e.target.value as Granularity)}
              className={selectClasses}
            >
              {GRANULARITIES.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vol-range" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Range
            </label>
            <select
              id="vol-range"
              value={rangeKey}
              onChange={(e) => handleRangeChange(e.target.value as VolatilityRangeKey)}
              className={selectClasses}
            >
              {ranges.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <p className="text-slate-500 dark:text-slate-400 text-center py-10">Loading…</p>}

        {!loading && error && (
          <div className="text-center py-6">
            <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
            <button
              onClick={() => load(rangeKey, granularity)}
              className="inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 transition-all duration-200"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && <VolatilityCard targetLabel={targetLabel} unitLabel={unitLabel} stats={stats} />}
      </div>
    </div>
  );
}
