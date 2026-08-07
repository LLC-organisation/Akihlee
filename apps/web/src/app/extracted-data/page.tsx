'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { extractedDataApi, getAuthToken, ExtractedData, UpdateExtractedDataRequest } from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';

const PAGE_SIZE = 10;

const cardClasses = 'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none transition-all duration-200';
const primaryButtonClasses = 'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';
const editInputClasses = 'w-full rounded-md border border-blue-400 dark:border-blue-500 bg-white dark:bg-canvas px-2 py-1 text-sm text-slate-900 dark:text-white focus:outline-none';

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
      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${style}`}>
      {pct}%
    </span>
  );
}

type EditingCell = { rowId: string; field: 'merchant' | 'date' | 'amount' } | null;

export default function ExtractedDataPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [rows, setRows] = useState<ExtractedData[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditingCell>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftCurrency, setDraftCurrency] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const startEdit = (row: ExtractedData, field: NonNullable<EditingCell>['field']) => {
    setSaveError(null);
    setEditing({ rowId: row.id, field });
    if (field === 'merchant') setDraftValue(row.merchantName ?? '');
    if (field === 'date') setDraftValue(row.transactionDate ?? '');
    if (field === 'amount') {
      setDraftValue(row.totalAmount !== null ? String(row.totalAmount) : '');
      setDraftCurrency(row.currency ?? '');
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setSaveError(null);
  };

  const commitEdit = async (row: ExtractedData) => {
    if (!editing) return;

    if (editing.field === 'amount' && draftValue.trim() && Number.isNaN(Number(draftValue))) {
      setSaveError('Enter a valid number');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload: UpdateExtractedDataRequest = {
        merchantName: editing.field === 'merchant' ? draftValue.trim() || null : row.merchantName,
        transactionDate: editing.field === 'date' ? draftValue || null : row.transactionDate,
        totalAmount: editing.field === 'amount' ? (draftValue.trim() ? Number(draftValue) : null) : row.totalAmount,
        currency: editing.field === 'amount' ? draftCurrency.trim() || null : row.currency,
        taxAmount: row.taxAmount,
      };
      const updated = await extractedDataApi.update(row.id, payload);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setEditing(null);
    } catch {
      setSaveError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, row: ExtractedData) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(row);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  if (!checkedAuth) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 lg:pl-64">
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Extracted Data</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Structured fields the OCR pipeline pulled from your uploaded receipts and invoices —
              this is what powers the AI CFO features. Click merchant, date, or amount to fix
              anything OCR got wrong.
            </p>
          </div>

          <div className={cardClasses}>
            {loading && <p className="text-slate-500 dark:text-slate-400 text-center py-12">Loading…</p>}

            {!loading && error && (
              <div className="text-center py-12">
                <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
                <button onClick={() => load(page)} className={primaryButtonClasses}>
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
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Document</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Merchant</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Amount</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Items</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {rows.map((row) => {
                        const isEditingMerchant = editing?.rowId === row.id && editing.field === 'merchant';
                        const isEditingDate = editing?.rowId === row.id && editing.field === 'date';
                        const isEditingAmount = editing?.rowId === row.id && editing.field === 'amount';
                        const rowHasError = editing?.rowId === row.id && saveError;

                        return (
                          <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200">
                            <td className="px-4 py-3 text-sm text-slate-900 dark:text-white font-medium whitespace-nowrap max-w-[200px] truncate">
                              {row.filename}
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {isEditingMerchant ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={draftValue}
                                  onChange={(e) => setDraftValue(e.target.value)}
                                  onBlur={() => commitEdit(row)}
                                  onKeyDown={(e) => handleKeyDown(e, row)}
                                  disabled={saving}
                                  className={editInputClasses}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEdit(row, 'merchant')}
                                  className="text-left hover:underline decoration-dashed underline-offset-2 decoration-slate-400"
                                >
                                  {row.merchantName ?? '—'}
                                </button>
                              )}
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {isEditingDate ? (
                                <input
                                  autoFocus
                                  type="date"
                                  value={draftValue}
                                  onChange={(e) => setDraftValue(e.target.value)}
                                  onBlur={() => commitEdit(row)}
                                  onKeyDown={(e) => handleKeyDown(e, row)}
                                  disabled={saving}
                                  className={editInputClasses}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEdit(row, 'date')}
                                  className="text-left hover:underline decoration-dashed underline-offset-2 decoration-slate-400"
                                >
                                  {formatDate(row.transactionDate)}
                                </button>
                              )}
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-900 dark:text-white text-right whitespace-nowrap">
                              {isEditingAmount ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <input
                                    autoFocus
                                    type="text"
                                    value={draftCurrency}
                                    onChange={(e) => setDraftCurrency(e.target.value)}
                                    onBlur={() => commitEdit(row)}
                                    onKeyDown={(e) => handleKeyDown(e, row)}
                                    disabled={saving}
                                    placeholder="KES"
                                    className={`${editInputClasses} w-16`}
                                  />
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={draftValue}
                                    onChange={(e) => setDraftValue(e.target.value)}
                                    onBlur={() => commitEdit(row)}
                                    onKeyDown={(e) => handleKeyDown(e, row)}
                                    disabled={saving}
                                    className={`${editInputClasses} w-24 text-right`}
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEdit(row, 'amount')}
                                  className="hover:underline decoration-dashed underline-offset-2 decoration-slate-400"
                                >
                                  {formatAmount(row.totalAmount, row.currency)}
                                </button>
                              )}
                              {rowHasError && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{saveError}</p>
                              )}
                            </td>

                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 text-right whitespace-nowrap">
                              {lineItemCount(row.lineItemsJson)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <ConfidenceBadge confidence={row.confidence} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-white/10">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Page {page + 1} of {totalPages} &middot; {totalElements} total
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => load(page - 1)}
                      disabled={page === 0}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400 disabled:hover:bg-transparent disabled:hover:text-slate-300 dark:disabled:hover:text-slate-600 transition-colors duration-200"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => load(page + 1)}
                      disabled={page + 1 >= totalPages}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400 disabled:hover:bg-transparent disabled:hover:text-slate-300 dark:disabled:hover:text-slate-600 transition-colors duration-200"
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
    </div>
  );
}
