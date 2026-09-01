import { ArrowRight, AlertTriangle, Info, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
import { VolatilityStats, StabilityRating } from '@/lib/utils/statistics';
import { TargetMetricInfo } from '@/lib/utils/volatility-metrics';

const RATING_STYLES: Record<StabilityRating, { pill: string; caption: string; icon: typeof ShieldCheck; label: string }> = {
  LOW: {
    pill: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    caption: 'text-emerald-600 dark:text-emerald-400',
    icon: ShieldCheck,
    label: 'Low Volatility',
  },
  MODERATE: {
    pill: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
    caption: 'text-amber-600 dark:text-amber-400',
    icon: Info,
    label: 'Moderate Volatility',
  },
  HIGH: {
    pill: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400',
    caption: 'text-rose-600 dark:text-rose-400',
    icon: AlertTriangle,
    label: 'High Volatility',
  },
};

export function VolatilityCard({
  metric,
  unitLabel,
  stats,
  onOpenModal,
}: {
  metric: TargetMetricInfo;
  unitLabel: string;
  stats: VolatilityStats;
  onOpenModal: () => void;
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
  const Icon = style.icon;
  const buffer = stats.standardDeviation * 2;

  return (
    <button
      type="button"
      onClick={onOpenModal}
      className="w-full text-left group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface"
    >
      {/* Primary visual headline: percentage risk badge */}
      <span
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xl sm:text-2xl font-bold transition-transform duration-200 group-hover:scale-[1.02] ${style.pill}`}
      >
        <Icon className="w-5 h-5 shrink-0" aria-hidden />
        {stats.coefficientOfVariation.toFixed(1)}% {metric.label}
      </span>
      <p className={`text-xs font-semibold mt-2 ${style.caption}`}>{style.label}</p>

      {/* Secondary dollar context */}
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-4">
        Your {unitLabel}ly {metric.noun} {metric.verb} by{' '}
        <span className="font-semibold text-slate-900 dark:text-white">±{formatCurrency(stats.standardDeviation)}</span>{' '}
        relative to your{' '}
        <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(stats.mean)}</span> average {metric.averageNoun}.
      </p>

      {/* Actionable buffer rule-of-thumb */}
      <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 mt-3">
        <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden />
        <span>
          Recommended Reserve Cushion:{' '}
          <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(buffer)}</span> (2x Standard Deviation)
        </span>
      </div>

      {/* Interactive trigger */}
      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent mt-4 group-hover:opacity-75 transition-opacity duration-200">
        How is this calculated?
        <ArrowRight className="w-3.5 h-3.5" aria-hidden />
      </span>
    </button>
  );
}
