'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { extractedDataApi, getAuthToken, ExtractedData } from '@/lib/api-client';
import { AppHeader } from '@/components/AppHeader';

const PAGE_SIZE = 10;

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null) return '—';
  return `${currency ?? ''} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  // Parse the y/m/d parts directly rather than `new Date(date)`, which
  // treats a date-only string as UTC midnight and can shift a day off
  // when displayed in a timezone behind UTC.
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

function lineItemCount(lineItemsJson: string | null): number {
  if (!lineItemsJson) return 0;
  try {
    const parsed = JSON.parse(lineItemsJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const style =
    confidence >= 0.7
      ? 'bg-primary-50 dark:bg-slate-700 text-primary-700 dark:text-primary-300'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {pct}%
    </span>
  );
}

export default function ExtractedDataPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [rows, setRows] = useState<ExtractedData[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  const load = useCallback(async (pageToLoad: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await extractedDataApi.list(pageToLoad, PAGE_SIZE);
      setRows(result.content);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);
      setPage(result.number);
    } catch {
      setError('Could not load extracted data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth) {
      load(0);
    }
  }, [checkedAuth, load]);

  if (!checkedAuth) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Extracted Data</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Structured fields the OCR pipeline pulled from your uploaded receipts and invoices —
            this is what powers the AI CFO features.
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border border-primary-100 dark:border-slate-700">
          {loading && <p className="text-slate-500 dark:text-slate-400 text-center py-12">Loading…</p>}

          {!loading && error && (
            <div className="text-center py-12">
              <p className="text-red-800 dark:text-red-300 mb-3">{error}</p>
              <button
                onClick={() => load(page)}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-md"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="text-slate-500 dark:text-slate-400 text-center py-12">
              No extracted data yet. Upload a receipt from the Dashboard to get started.
            </p>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              {/* overflow-x-auto keeps the table usable on narrow screens
                  instead of squashing columns or breaking the page layout */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-primary-100 dark:divide-slate-700">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Document</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Merchant</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Items</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary-50 dark:divide-slate-800">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-white font-medium whitespace-nowrap max-w-[200px] truncate">
                          {row.filename}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {row.merchantName ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatDate(row.transactionDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 dark:text-white text-right whitespace-nowrap">
                          {formatAmount(row.totalAmount, row.currency)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 text-right whitespace-nowrap">
                          {lineItemCount(row.lineItemsJson)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <ConfidenceBadge confidence={row.confidence} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-primary-100 dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Page {page + 1} of {totalPages} &middot; {totalElements} total
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => load(page - 1)}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-primary-200 dark:border-slate-600 text-primary-700 dark:text-primary-300 disabled:text-slate-400 disabled:border-slate-200 dark:disabled:border-slate-700 disabled:cursor-not-allowed hover:bg-primary-50 dark:hover:bg-slate-700 disabled:hover:bg-transparent"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => load(page + 1)}
                    disabled={page + 1 >= totalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-primary-200 dark:border-slate-600 text-primary-700 dark:text-primary-300 disabled:text-slate-400 disabled:border-slate-200 dark:disabled:border-slate-700 disabled:cursor-not-allowed hover:bg-primary-50 dark:hover:bg-slate-700 disabled:hover:bg-transparent"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
