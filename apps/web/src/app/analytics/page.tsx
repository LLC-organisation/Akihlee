'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  analyticsApi,
  getAuthToken,
  CategoryAmount,
  FinancialOverview,
  Granularity,
  MonthlyTrendPoint,
  TrendPoint,
} from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { CategoryDrilldownPanel } from '@/components/CategoryDrilldownPanel';
import { AiCfoChatWidget } from '@/components/AiCfoChatWidget';
import { CurrencyCode, CURRENCIES, formatCurrency } from '@/lib/utils/currency';
import { useScrollReveal } from '@/lib/hooks/useScrollReveal';
import {
  formatPeriodLabel,
  granularityForSpan,
  previousPeriod,
  quickRanges,
  QuickRangeKey,
  toIsoDate,
} from '@/lib/utils/date-ranges';

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-6 transition-all duration-200';
const inputClasses =
  'rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-accent transition-colors duration-200';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';

const PALETTE = ['#4169E1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];
const MAX_PIE_SLICES = 7; // beyond this, remaining categories collapse into "Other"

type ViewMode = 'COMBINED' | 'SPLIT';

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">{message}</p>;
}

function DonutChart({
  data,
  currency,
  onSelectCategory,
}: {
  data: CategoryAmount[];
  currency: CurrencyCode;
  onSelectCategory: (category: string) => void;
}) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  if (data.length === 0) return <EmptyState message="No categorized spending in this range yet." />;

  const top = data.slice(0, MAX_PIE_SLICES);
  const restTotal = data.slice(MAX_PIE_SLICES).reduce((sum, d) => sum + d.total, 0);
  const slices = restTotal !== 0 ? [...top, { category: 'Other', total: restTotal }] : top;

  // A pie/donut can only represent non-negative shares of a whole. A
  // negative category total (e.g. a mis-signed bank transaction inflating
  // one category into negative territory) has no sensible slice size — if
  // it were included in the fraction math below, it can make the shared
  // denominator tiny or negative and blow up every other slice's fraction,
  // rendering one category as the entire pie and hiding the rest. Such a
  // slice is excluded from the arc geometry entirely; it still appears in
  // the list below with its real (negative) value so nothing goes missing.
  const positiveTotal = slices.reduce((sum, s) => sum + Math.max(0, s.total), 0);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div ref={ref} className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 160 160" className="w-40 h-40 shrink-0 -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" className="stroke-slate-100 dark:stroke-white/5" strokeWidth="20" />
        {positiveTotal > 0 &&
          slices.map((slice, i) => {
            if (slice.total <= 0) return null;
            const fraction = slice.total / positiveTotal;
            const dash = fraction * circumference;
            const offset = -cumulative * circumference;
            cumulative += fraction;
            return (
              <circle
                key={slice.category}
                cx="80" cy="80" r={radius} fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth="20"
                strokeDasharray={revealed ? `${dash} ${circumference - dash}` : `0 ${circumference}`}
                strokeDashoffset={offset}
                style={{ transition: 'stroke-dasharray 900ms ease-out', transitionDelay: `${i * 100}ms` }}
              />
            );
          })}
      </svg>
      <div className="flex-1 min-w-0 space-y-1.5 w-full">
        {slices.map((slice, i) => {
          const clickable = slice.category !== 'Other';
          return (
            <button
              key={slice.category}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelectCategory(slice.category)}
              className="flex items-center justify-between gap-2 text-sm w-full text-left disabled:cursor-default enabled:hover:opacity-70 transition-opacity duration-200"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                <span className="truncate text-slate-600 dark:text-slate-300">{slice.category}</span>
              </span>
              <span className="font-medium text-slate-900 dark:text-white whitespace-nowrap">
                {formatCurrency(slice.total, currency)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TrendBarChart({ data, granularity, currency }: { data: TrendPoint[]; granularity: Granularity; currency: CurrencyCode }) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  if (data.length === 0) return <EmptyState message="No approved spending in this range yet." />;

  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div ref={ref} className="overflow-x-auto">
      <div className="flex items-end gap-2 h-48 min-w-max px-1">
        {data.map((point, i) => (
          <div key={point.period} className="flex flex-col items-center justify-end h-full gap-1.5 w-12 shrink-0">
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
              {point.total > 0 ? formatCurrency(point.total, currency) : ''}
            </span>
            <div
              className="w-full rounded-t-md bg-accent-gradient transition-all duration-700 ease-out"
              style={{
                height: revealed ? `${Math.max(2, (point.total / max) * 100)}%` : '0%',
                transitionDelay: `${i * 40}ms`,
              }}
            />
            <span className="text-[9px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {formatPeriodLabel(point.period, granularity)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CombinedTrendChart({
  data,
  granularity,
  currency,
}: {
  data: MonthlyTrendPoint[];
  granularity: Granularity;
  currency: CurrencyCode;
}) {
  const { ref, revealed } = useScrollReveal<HTMLDivElement>();

  if (data.length === 0) return <EmptyState message="No approved transactions in this range yet." />;

  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  return (
    <div ref={ref}>
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Expenses
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-4 h-48 min-w-max px-1">
          {data.map((point, i) => (
            <div key={point.month} className="flex flex-col items-center justify-end h-full gap-1.5 shrink-0">
              <div className="flex items-end gap-1 h-full">
                <div
                  className="w-4 rounded-t-md bg-emerald-500 transition-all duration-700 ease-out"
                  style={{
                    height: revealed ? `${Math.max(2, (point.income / max) * 100)}%` : '0%',
                    transitionDelay: `${i * 50}ms`,
                  }}
                  title={`Income: ${formatCurrency(point.income, currency)}`}
                />
                <div
                  className="w-4 rounded-t-md bg-rose-500 transition-all duration-700 ease-out"
                  style={{
                    height: revealed ? `${Math.max(2, (point.expense / max) * 100)}%` : '0%',
                    transitionDelay: `${i * 50 + 25}ms`,
                  }}
                  title={`Expenses: ${formatCurrency(point.expense, currency)}`}
                />
              </div>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {formatPeriodLabel(point.month, granularity)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint, hintClass }: { label: string; value: string; hint?: string; hintClass?: string }) {
  return (
    <div className={cardClasses}>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{value}</p>
      {hint && <p className={`text-xs mt-1 ${hintClass ?? 'text-slate-400 dark:text-slate-500'}`}>{hint}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);

  const ranges = quickRanges();
  const defaultRange = ranges.find((r) => r.key === '1Y')!;

  const [activeQuickKey, setActiveQuickKey] = useState<QuickRangeKey | null>('1Y');
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [granularity, setGranularity] = useState<Granularity>(defaultRange.granularity);

  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [viewMode, setViewMode] = useState<ViewMode>('COMBINED');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [previousOverview, setPreviousOverview] = useState<FinancialOverview | null>(null);
  const [combinedTrend, setCombinedTrend] = useState<MonthlyTrendPoint[]>([]);

  const [lineItemCategories, setLineItemCategories] = useState<CategoryAmount[]>([]);
  const [lineItemTrend, setLineItemTrend] = useState<TrendPoint[]>([]);
  const [bankCategories, setBankCategories] = useState<CategoryAmount[]>([]);
  const [bankTrend, setBankTrend] = useState<TrendPoint[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  const load = useCallback(async (rangeFrom: string, rangeTo: string, gran: Granularity, mode: ViewMode) => {
    setLoading(true);
    setError(null);
    try {
      const prev = previousPeriod(rangeFrom, rangeTo);
      const [ov, prevOv] = await Promise.all([
        analyticsApi.overview({ from: rangeFrom, to: rangeTo }),
        analyticsApi.overview({ from: prev.from, to: prev.to }),
      ]);
      setOverview(ov);
      setPreviousOverview(prevOv);

      if (mode === 'COMBINED') {
        const trend = await analyticsApi.combinedTrend({ from: rangeFrom, to: rangeTo, granularity: gran });
        setCombinedTrend(trend);
      } else {
        const [liCategories, liTrend, bCategories, bTrend] = await Promise.all([
          analyticsApi.lineItemCategories({ from: rangeFrom, to: rangeTo }),
          analyticsApi.lineItemTrend({ from: rangeFrom, to: rangeTo, granularity: gran }),
          analyticsApi.bankTransactionCategories({ from: rangeFrom, to: rangeTo }),
          analyticsApi.bankTransactionTrend({ from: rangeFrom, to: rangeTo, granularity: gran }),
        ]);
        setLineItemCategories(liCategories);
        setLineItemTrend(liTrend);
        setBankCategories(bCategories);
        setBankTrend(bTrend);
      }
    } catch {
      setError('Could not load analytics. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth) load(from, to, granularity, viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAuth]);

  const handleQuickRange = (key: QuickRangeKey) => {
    const range = ranges.find((r) => r.key === key)!;
    setActiveQuickKey(key);
    setFrom(range.from);
    setTo(range.to);
    setGranularity(range.granularity);
    load(range.from, range.to, range.granularity, viewMode);
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const gran = granularityForSpan(from, to);
    setActiveQuickKey(null);
    setGranularity(gran);
    load(from, to, gran, viewMode);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    load(from, to, granularity, mode);
  };

  if (!checkedAuth) return null;

  const topCategory = overview?.categoryBreakdown[0] ?? null;
  const uncategorized = overview?.categoryBreakdown.find((c) => c.category === 'Uncategorized');

  let periodChangeHint = 'vs. previous period';
  let periodChangeValue = '—';
  let periodChangeClass = 'text-slate-400 dark:text-slate-500';
  if (overview && previousOverview) {
    if (previousOverview.totalExpenses === 0) {
      periodChangeValue = overview.totalExpenses > 0 ? 'New spending' : 'No change';
    } else {
      const pct = ((overview.totalExpenses - previousOverview.totalExpenses) / previousOverview.totalExpenses) * 100;
      const sign = pct > 0 ? '+' : '';
      periodChangeValue = `${sign}${pct.toFixed(1)}%`;
      periodChangeClass = pct > 0 ? 'text-rose-500 dark:text-rose-400' : pct < 0 ? 'text-emerald-500 dark:text-emerald-400' : periodChangeClass;
    }
  }

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <AiCfoChatWidget />
      <div className="relative z-10 lg:pl-20">
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                Spending by category and over time, built from your approved documents only. Currency conversion below
                uses fixed approximate rates for display only — source amounts aren&apos;t normalized before
                aggregation, so mixed-currency totals may not add up cleanly.
              </p>
            </div>
            <div>
              <label htmlFor="currency" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Display Currency
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className={inputClasses}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick range pills + custom date range */}
          <div className={`${cardClasses} mb-6`}>
            <div className="flex flex-wrap gap-2 mb-4">
              {ranges.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => handleQuickRange(r.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 ${
                    activeQuickKey === r.key
                      ? 'bg-accent-gradient text-white'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="from" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  From
                </label>
                <input
                  id="from" type="date" value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  max={to}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="to" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  To
                </label>
                <input
                  id="to" type="date" value={to}
                  onChange={(e) => setTo(e.target.value)}
                  max={toIsoDate(new Date())}
                  className={inputClasses}
                />
              </div>
              <button type="submit" disabled={loading} className={primaryButtonClasses}>
                {loading ? 'Loading…' : 'Apply'}
              </button>
            </form>
          </div>

          {error && (
            <div className={`${cardClasses} text-center mb-6`}>
              <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
              <button onClick={() => load(from, to, granularity, viewMode)} className={primaryButtonClasses}>
                Retry
              </button>
            </div>
          )}

          {!error && (
            <>
              {/* Top KPI summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <KpiCard
                  label="Total Spending"
                  value={loading ? '—' : formatCurrency(overview?.totalExpenses ?? 0, currency)}
                  hint="Receipts, invoices & bank debits"
                />
                <KpiCard
                  label="Top Expense Category"
                  value={loading ? '—' : topCategory?.category ?? 'None yet'}
                  hint={topCategory ? formatCurrency(topCategory.total, currency) : undefined}
                />
                <KpiCard
                  label="Period-over-Period Change"
                  value={loading ? '—' : periodChangeValue}
                  hint={periodChangeHint}
                  hintClass={periodChangeClass}
                />
              </div>

              {uncategorized && uncategorized.total > 0 && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 mb-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">{formatCurrency(uncategorized.total, currency)}</span> of spending in
                    this range is uncategorized — assign categories to sharpen these insights.
                  </p>
                  <Link
                    href="/extracted-data"
                    className="text-sm font-medium text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:opacity-80 transition-opacity duration-200 whitespace-nowrap"
                  >
                    Review &amp; categorize
                  </Link>
                </div>
              )}

              {/* Combined vs. split toggle */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">View:</span>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 p-0.5 bg-slate-50 dark:bg-white/5">
                  {(['COMBINED', 'SPLIT'] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleViewModeChange(mode)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
                        viewMode === mode
                          ? 'bg-white dark:bg-surface text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    >
                      {mode === 'COMBINED' ? 'Combined Spending' : 'Split by Source'}
                    </button>
                  ))}
                </div>
              </div>

              {viewMode === 'COMBINED' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className={cardClasses}>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Expenses by Category</h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                      Combined across receipts, invoices &amp; bank debits
                    </p>
                    {loading ? (
                      <EmptyState message="Loading…" />
                    ) : (
                      <DonutChart data={overview?.categoryBreakdown ?? []} currency={currency} onSelectCategory={setSelectedCategory} />
                    )}
                  </div>
                  <div className={cardClasses}>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Income vs. Expenses</h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Combined trend over time</p>
                    {loading ? <EmptyState message="Loading…" /> : <CombinedTrendChart data={combinedTrend} granularity={granularity} currency={currency} />}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className={cardClasses}>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                      Receipts &amp; Invoices by Category
                    </h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">From approved line items</p>
                    {loading ? (
                      <EmptyState message="Loading…" />
                    ) : (
                      <DonutChart data={lineItemCategories} currency={currency} onSelectCategory={setSelectedCategory} />
                    )}
                  </div>

                  <div className={cardClasses}>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                      Receipt &amp; Invoice Spending Over Time
                    </h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Sum of approved document totals</p>
                    {loading ? <EmptyState message="Loading…" /> : <TrendBarChart data={lineItemTrend} granularity={granularity} currency={currency} />}
                  </div>

                  <div className={cardClasses}>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                      Bank Spending by Category
                    </h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Expense transactions from approved statements</p>
                    {loading ? (
                      <EmptyState message="Loading…" />
                    ) : (
                      <DonutChart data={bankCategories} currency={currency} onSelectCategory={setSelectedCategory} />
                    )}
                  </div>

                  <div className={cardClasses}>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Bank Spending Over Time</h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Expense transactions from approved statements</p>
                    {loading ? <EmptyState message="Loading…" /> : <TrendBarChart data={bankTrend} granularity={granularity} currency={currency} />}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {selectedCategory && (
        <CategoryDrilldownPanel
          category={selectedCategory}
          from={from}
          to={to}
          onClose={() => setSelectedCategory(null)}
          onChanged={() => load(from, to, granularity, viewMode)}
        />
      )}
    </div>
  );
}
