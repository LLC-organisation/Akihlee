'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { analyticsApi, CategoryAmount, FinancialOverview, MonthlyTrendPoint } from '@/lib/api-client';
import { CategoryDrilldownPanel } from './CategoryDrilldownPanel';

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-6 transition-all duration-200';

const PALETTE = ['#4169E1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];
const MAX_PIE_SLICES = 6; // beyond this, remaining categories collapse into "Other"
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatCurrency(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">{message}</p>;
}

function SummaryTile({
  label,
  value,
  hint,
  accentClass,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  accentClass: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`${cardClasses} flex flex-col justify-between`}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`flex items-center justify-center w-9 h-9 rounded-lg ${accentClass}`}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold mt-3 text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{hint}</p>
      </div>
    </div>
  );
}

function CategoryDonutChart({ data, onSelectCategory }: { data: CategoryAmount[]; onSelectCategory: (category: string) => void }) {
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
        <circle cx="80" cy="80" r={radius} fill="none" className="stroke-slate-100 dark:stroke-white/5" strokeWidth="20" />
        {total > 0 &&
          slices.map((slice, i) => {
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
              <span className="font-medium text-slate-900 dark:text-white whitespace-nowrap">{formatCurrency(slice.total)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IncomeExpenseTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  if (data.length === 0) return <EmptyState message="No approved transactions in this range yet." />;

  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  return (
    <div>
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
          {data.map((point) => (
            <div key={point.month} className="flex flex-col items-center justify-end h-full gap-1.5 shrink-0">
              <div className="flex items-end gap-1 h-full">
                <div
                  className="w-4 rounded-t-md bg-emerald-500 transition-all duration-300"
                  style={{ height: `${Math.max(2, (point.income / max) * 100)}%` }}
                  title={`Income: ${formatCurrency(point.income)}`}
                />
                <div
                  className="w-4 rounded-t-md bg-rose-500 transition-all duration-300"
                  style={{ height: `${Math.max(2, (point.expense / max) * 100)}%` }}
                  title={`Expenses: ${formatCurrency(point.expense)}`}
                />
              </div>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {formatMonthLabel(point.month)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard summary widget built on the existing analytics pipeline — no
 * separate transactions table or ETL step, just a combined read over
 * ExtractedData (receipts/invoices) and BankTransaction (bank statements)
 * via GET /analytics/overview. Defaults to the trailing 12 months, scoped
 * to APPROVED documents only (same policy as the Analytics page).
 */
export function FinancialAnalyticsOverview() {
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await analyticsApi.overview({}));
    } catch {
      setError('Could not load financial analytics. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <div className={`${cardClasses} text-center mb-6`}>
        <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
        <button
          onClick={load}
          className="inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 transition-all duration-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const netPositive = (overview?.netCashFlow ?? 0) >= 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Financial Overview</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Trailing 12 months, built from your approved documents.
          </p>
        </div>
        <Link
          href="/analytics"
          className="text-sm font-medium text-accent hover:opacity-80 transition-opacity duration-200 whitespace-nowrap"
        >
          View full analytics &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryTile
          label="Total Income"
          value={loading ? '—' : formatCurrency(overview?.totalIncome ?? 0)}
          hint="Bank statement income"
          accentClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-6 6m6-6l6 6" />
            </svg>
          }
        />
        <SummaryTile
          label="Total Expenses"
          value={loading ? '—' : formatCurrency(overview?.totalExpenses ?? 0)}
          hint="Receipts, invoices & bank debits"
          accentClass="bg-rose-500/15 text-rose-600 dark:text-rose-400"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m0 0l-6-6m6 6l6-6" />
            </svg>
          }
        />
        <SummaryTile
          label="Net Cash Flow"
          value={loading ? '—' : formatCurrency(overview?.netCashFlow ?? 0)}
          hint={loading ? 'Income minus expenses' : netPositive ? 'Positive' : 'Negative'}
          accentClass={
            netPositive
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
          }
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h4l3 8 4-16 3 8h4" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClasses}>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Expenses by Category</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Top spending categories</p>
          {loading ? (
            <EmptyState message="Loading…" />
          ) : (
            <CategoryDonutChart data={overview?.categoryBreakdown ?? []} onSelectCategory={setSelectedCategory} />
          )}
        </div>
        <div className={cardClasses}>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Income vs. Expenses</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Monthly comparison</p>
          {loading ? <EmptyState message="Loading…" /> : <IncomeExpenseTrendChart data={overview?.monthlyTrend ?? []} />}
        </div>
      </div>

      {selectedCategory && (
        <CategoryDrilldownPanel
          category={selectedCategory}
          onClose={() => setSelectedCategory(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
