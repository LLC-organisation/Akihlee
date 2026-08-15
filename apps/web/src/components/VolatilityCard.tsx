import { formatCurrency } from '@/lib/utils/currency';
import { VolatilityStats } from '@/lib/utils/statistics';

const RATING_STYLES = {
  LOW: {
    pill: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    label: 'Low Volatility',
  },
  MODERATE: {
    pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    label: 'Moderate Volatility',
  },
  HIGH: {
    pill: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
    label: 'High Volatility',
  },
} as const;

function insightCopy(targetLabel: string, stats: VolatilityStats, unitLabel: string): string {
  const sd = formatCurrency(stats.standardDeviation);
  const buffer = formatCurrency(stats.standardDeviation * 2);
  return `${targetLabel} fluctuates by an average of ±${sd} per ${unitLabel}. Recommended cash reserve buffer: 2x SD (${buffer}).`;
}

export function VolatilityCard({
  targetLabel,
  unitLabel,
  stats,
}: {
  targetLabel: string;
  unitLabel: string;
  stats: VolatilityStats;
}) {
  if (stats.sampleSize < 2) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Not enough approved history in this range yet to measure volatility.
        </p>
      </div>
    );
  }

  const style = RATING_STYLES[stats.rating];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Standard deviation</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            &plusmn;{formatCurrency(stats.standardDeviation)}
            <span className="text-base font-medium text-slate-400 dark:text-slate-500"> / {unitLabel}</span>
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${style.pill}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label} &middot; CV {stats.coefficientOfVariation.toFixed(1)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Average / {unitLabel}</p>
          <p className="font-semibold text-slate-900 dark:text-white">{formatCurrency(stats.mean)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Sample size</p>
          <p className="font-semibold text-slate-900 dark:text-white">{stats.sampleSize} periods</p>
        </div>
      </div>

      <div className="rounded-xl bg-blue-50 dark:bg-accent/5 border border-blue-100 dark:border-accent/20 px-4 py-3">
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {insightCopy(targetLabel, stats, unitLabel)}
        </p>
      </div>
    </div>
  );
}
