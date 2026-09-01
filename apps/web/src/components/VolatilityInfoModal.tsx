'use client';

import { useEffect, useState } from 'react';
import { X, Info, ShieldCheck, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
import { VolatilityStats, StabilityRating } from '@/lib/utils/statistics';
import { TARGET_METRICS, TargetMetric, TargetMetricInfo } from '@/lib/utils/volatility-metrics';

const TIERS: { key: StabilityRating; name: string; range: string; description: string }[] = [
  { key: 'LOW', name: 'Low', range: '0% – 25%', description: 'Predictable spending. Standard 1-month cash buffer needed.' },
  { key: 'MODERATE', name: 'Moderate', range: '26% – 50%', description: 'Variable spending. Monitor seasonal vendor cycles.' },
  { key: 'HIGH', name: 'High', range: '50%+', description: 'High unpredictability. Maintain a 2x monthly cash reserve.' },
];

const TIER_STYLES: Record<StabilityRating, { bar: string; ring: string; text: string; icon: typeof ShieldCheck }> = {
  LOW: { bar: 'bg-emerald-400 dark:bg-emerald-500', ring: 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', icon: ShieldCheck },
  MODERATE: { bar: 'bg-amber-400 dark:bg-amber-500', ring: 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', icon: Info },
  HIGH: { bar: 'bg-rose-400 dark:bg-rose-500', ring: 'border-rose-400 dark:border-rose-500 bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400', icon: AlertTriangle },
};

function StepCard({ step, label, value, hint }: { step: number; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-white/10 p-3">
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-gradient text-white text-xs font-bold shrink-0">
        {step}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
        <p className="text-base font-semibold text-slate-900 dark:text-white break-words">{value}</p>
        {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * "Understanding Volatility" education drawer, opened from VolatilityCard.
 * Recomputes everything from the same `stats` the card already derived —
 * no separate data fetch, just a deeper explanation of the same numbers.
 */
export function VolatilityInfoModal({
  open,
  onClose,
  metric,
  unitLabel,
  stats,
  onChangeTargetMetric,
}: {
  open: boolean;
  onClose: () => void;
  metric: TargetMetricInfo;
  unitLabel: string;
  stats: VolatilityStats;
  onChangeTargetMetric: (metric: TargetMetric) => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timeout = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  const cv = stats.coefficientOfVariation;
  const markerPct = Math.min(100, Math.max(0, cv));
  const buffer = stats.standardDeviation * 2;
  const currentTier = TIER_STYLES[stats.rating];
  const CurrentTierIcon = currentTier.icon;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-black/70" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="volatility-modal-title"
        className={`relative w-full max-w-xl max-h-[85vh] flex flex-col bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden transition-all duration-200 ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
          <h2 id="volatility-modal-title" className="text-lg font-semibold text-slate-900 dark:text-white">
            Understanding Volatility
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors duration-200 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-6">
          {/* Plain-English analogy banner */}
          <div className="rounded-xl bg-blue-50 dark:bg-accent/5 border border-blue-100 dark:border-accent/20 px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white mb-1.5">
              <Info className="w-4 h-4 text-accent shrink-0" aria-hidden />
              What does {metric.label.replace(' Volatility', '')} volatility mean for your business?
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Think of volatility as how &ldquo;bumpy&rdquo; your {metric.noun} ride is. If your {metric.noun} {metric.verb}{' '}
              the same amount every single {unitLabel}, your volatility is 0% (predictable). The more it jumps around
              from one {unitLabel} to the next, the larger a cash buffer you need to absorb a sudden bill or slow patch
              without getting caught short.
            </p>
          </div>

          {/* The math, step by step */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">The math, step by step</h3>
            <div className="space-y-2">
              <StepCard
                step={1}
                label={`Average ${unitLabel}ly ${metric.averageNoun} (Mean)`}
                value={formatCurrency(stats.mean)}
              />
              <StepCard
                step={2}
                label={`Average ${unitLabel}ly swing (Standard Deviation, σ)`}
                value={`±${formatCurrency(stats.standardDeviation)}`}
              />
              <StepCard
                step={3}
                label="Coefficient of Variation (Volatility %)"
                value={`${cv.toFixed(1)}%`}
                hint={`(σ ÷ Mean) × 100 — (${stats.standardDeviation.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} / ${stats.mean.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}) × 100 = ${cv.toFixed(1)}%`}
              />
            </div>
          </div>

          {/* Benchmark gauge */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Where you fall</h3>
            <div className="relative pt-7 pb-1 px-1">
              <div
                className="absolute top-0 -translate-x-1/2 flex flex-col items-center transition-all duration-300"
                style={{ left: `${markerPct}%` }}
              >
                <span className="text-[10px] font-bold text-slate-700 dark:text-white whitespace-nowrap mb-0.5">
                  {cv.toFixed(1)}%
                </span>
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-slate-700 dark:border-t-white" />
              </div>
              <div className="flex h-3 rounded-full overflow-hidden">
                <div className="w-1/4 bg-emerald-400 dark:bg-emerald-500" />
                <div className="w-1/4 bg-amber-400 dark:bg-amber-500" />
                <div className="w-1/2 bg-rose-400 dark:bg-rose-500" />
              </div>
              <div className="flex text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                <span className="w-1/4">0%</span>
                <span className="w-1/4 text-center">25%</span>
                <span className="w-1/2 text-right">50%+</span>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              {TIERS.map((tier) => {
                const isCurrent = tier.key === stats.rating;
                const tierStyle = TIER_STYLES[tier.key];
                const TierIcon = tierStyle.icon;
                return (
                  <div
                    key={tier.key}
                    className={`rounded-lg border px-3 py-2.5 ${
                      isCurrent ? tierStyle.ring : 'border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <p className={`flex items-center gap-1.5 text-xs font-semibold ${isCurrent ? tierStyle.text : 'text-slate-600 dark:text-slate-300'}`}>
                      <TierIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      {tier.range} ({tier.name})
                      {isCurrent && <span className="ml-1">— YOUR LEVEL</span>}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 ml-5">
                      {tier.key === 'HIGH' ? `${tier.description} (${formatCurrency(buffer)}).` : tier.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Adjust target metric */}
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white mb-2">
              <CurrentTierIcon className={`w-4 h-4 ${currentTier.text}`} aria-hidden />
              Adjust Target Metric
            </h3>
            <div className="flex flex-wrap gap-2">
              {TARGET_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => onChangeTargetMetric(m.key)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors duration-200 ${
                    m.key === metric.key
                      ? 'bg-accent-gradient text-white border-transparent'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
