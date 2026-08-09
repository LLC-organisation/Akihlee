'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { analyticsApi, getAuthToken, CategoryAmount, TrendPoint } from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-6 transition-all duration-200';
const inputClasses =
  'rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-accent transition-colors duration-200';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';

const PALETTE = ['#4169E1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];
const MAX_PIE_SLICES = 7; // beyond this, remaining categories collapse into "Other"

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatAmount(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPeriodLabel(period: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = period.split('-');
  if (parts.length === 3) {
    const [, m, d] = parts;
    return `${months[Number(m) - 1]} ${Number(d)}`;
  }
  const [y, m] = parts;
  return `${months[Number(m) - 1]} ${y}`;
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">{message}</p>;
}

function DonutChart({ data }: { data: CategoryAmount[] }) {
  if (data.length === 0) return <EmptyState message="No categorized spending in this range yet." />;

  const top = data.slice(0, MAX_PIE_SLICES);
  const restTotal = data.slice(MAX_PIE_SLICES).reduce((sum, d) => sum + d.total, 0);
  const slices = restTotal > 0 ? [...top, { category: 'Other', total: restTotal }] : top;
  const total = slices.reduce((sum, s) => sum + s.total, 0);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 160 160" className="w-40 h-40 shrink-0 -rotate-90">
        <circle
          cx="80" cy="80" r={radius} fill="none"
          className="stroke-slate-100 dark:stroke-white/5" strokeWidth="20"
        />
        {total > 0 && slices.map((slice, i) => {
          const fraction = slice.total / total;
          const dash = fraction * circumference;
          const offset = -cumulative * circumference;
          cumulative += fraction;
          return (
            <circle
              key={slice.category}
              cx="80" cy="80" r={radius} fill="none"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="20"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      <div className="flex-1 min-w-0 space-y-1.5 w-full">
        {slices.map((slice, i) => (
          <div key={slice.category} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="truncate text-slate-600 dark:text-slate-300">{slice.category}</span>
            </span>
            <span className="font-medium text-slate-900 dark:text-white whitespace-nowrap">
              {formatAmount(slice.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendBarChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) return <EmptyState message="No approved spending in this range yet." />;

  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2 h-48 min-w-max px-1">
        {data.map((point) => (
          <div key={point.period} className="flex flex-col items-center justify-end h-full gap-1.5 w-10 shrink-0">
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
              {point.total > 0 ? point.total.toLocaleString(undefined, { maximumFractionDigits: 0 }) : ''}
            </span>
            <div
              className="w-full rounded-t-md bg-accent-gradient transition-all duration-300"
              style={{ height: `${Math.max(2, (point.total / max) * 100)}%` }}
            />
            <span className="text-[9px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {formatPeriodLabel(point.period)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return toIsoDate(d);
  });
  const [to, setTo] = useState(() => toIsoDate(new Date()));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lineItemCategories, setLineItemCategories] = useState<CategoryAmount[]>([]);
  const [lineItemTrend, setLineItemTrend] = useState<TrendPoint[]>([]);
  const [bankCategories, setBankCategories] = useState<CategoryAmount[]>([]);
  const [bankTrend, setBankTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  const load = useCallback(async (range: { from: string; to: string }) => {
    setLoading(true);
    setError(null);
    try {
      const [liCategories, liTrend, bCategories, bTrend] = await Promise.all([
        analyticsApi.lineItemCategories(range),
        analyticsApi.lineItemTrend(range),
        analyticsApi.bankTransactionCategories(range),
        analyticsApi.bankTransactionTrend(range),
      ]);
      setLineItemCategories(liCategories);
      setLineItemTrend(liTrend);
      setBankCategories(bCategories);
      setBankTrend(bTrend);
    } catch {
      setError('Could not load analytics. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth) load({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAuth, load]);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    load({ from, to });
  };

  if (!checkedAuth) return null;

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 lg:pl-20">
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Spending by category and over time, built from your approved documents only. Amounts
              across different currencies aren&apos;t converted, so mixed-currency totals may not add
              up cleanly.
            </p>
          </div>

          <form onSubmit={handleApply} className={`${cardClasses} mb-6 flex flex-wrap items-end gap-3`}>
            <div>
              <label htmlFor="from" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                From
              </label>
              <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClasses} />
            </div>
            <div>
              <label htmlFor="to" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                To
              </label>
              <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClasses} />
            </div>
            <button type="submit" disabled={loading} className={primaryButtonClasses}>
              {loading ? 'Loading…' : 'Apply'}
            </button>
          </form>

          {error && (
            <div className={`${cardClasses} text-center`}>
              <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
              <button onClick={() => load({ from, to })} className={primaryButtonClasses}>
                Retry
              </button>
            </div>
          )}

          {!error && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={cardClasses}>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  Receipts &amp; Invoices by Category
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">From approved line items</p>
                {loading ? <EmptyState message="Loading…" /> : <DonutChart data={lineItemCategories} />}
              </div>

              <div className={cardClasses}>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  Receipt &amp; Invoice Spending Over Time
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Sum of approved document totals</p>
                {loading ? <EmptyState message="Loading…" /> : <TrendBarChart data={lineItemTrend} />}
              </div>

              <div className={cardClasses}>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  Bank Spending by Category
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Expense transactions from approved statements</p>
                {loading ? <EmptyState message="Loading…" /> : <DonutChart data={bankCategories} />}
              </div>

              <div className={cardClasses}>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  Bank Spending Over Time
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Expense transactions from approved statements</p>
                {loading ? <EmptyState message="Loading…" /> : <TrendBarChart data={bankTrend} />}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
