'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  analyticsApi,
  bankTransactionsApi,
  extractedDataApi,
  BankTransaction,
  CategorizedLineItem,
  LineItem,
} from '@/lib/api-client';
import { SPENDING_CATEGORIES } from '@/lib/utils/categories';
import { formatCurrency } from '@/lib/utils/currency';

const selectClasses =
  'rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-2 py-1 text-xs text-slate-900 dark:text-white focus:border-accent transition-colors duration-200';

type Row =
  | { kind: 'LINE_ITEM'; key: string; date: string; label: string; amount: number; category: string; item: CategorizedLineItem }
  | { kind: 'BANK_TRANSACTION'; key: string; date: string; label: string; amount: number; category: string; txn: BankTransaction };

function toRows(lineItems: CategorizedLineItem[], bankTransactions: BankTransaction[]): Row[] {
  const rows: Row[] = [
    ...lineItems.map((item) => ({
      kind: 'LINE_ITEM' as const,
      key: `li-${item.extractedDataId}-${item.lineItemIndex}`,
      date: item.date,
      label: item.vendor ? `${item.vendor} — ${item.description}` : item.description,
      amount: item.amount,
      category: item.category,
      item,
    })),
    ...bankTransactions.map((txn) => ({
      kind: 'BANK_TRANSACTION' as const,
      key: `bt-${txn.id}`,
      date: txn.transactionDate,
      label: txn.payeeOrPayer || txn.description || 'Bank transaction',
      amount: txn.amount,
      category: txn.category ?? 'Uncategorized',
      txn,
    })),
  ];
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * "Click a category pill to reassign" panel. Line items have no stable id
 * of their own, so reassigning one means re-fetching its parent
 * ExtractedData, patching just that item's categoryTag by array position,
 * and writing the whole line-items array back — bank transactions have a
 * real id and PUT directly. Either way, a saved row drops out of the list
 * since it no longer belongs to this category.
 */
export function CategoryDrilldownPanel({
  category,
  from,
  to,
  onClose,
  onChanged,
}: {
  category: string;
  from?: string;
  to?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    analyticsApi
      .categoryTransactions(category, { from, to })
      .then((data) => {
        if (!cancelled) setRows(toRows(data.lineItems, data.bankTransactions));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load transactions for this category.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, from, to]);

  const reassignLineItem = async (row: Extract<Row, { kind: 'LINE_ITEM' }>, newCategory: string) => {
    const data = await extractedDataApi.getByDocument(row.item.documentId);
    const items: LineItem[] = data.lineItemsJson ? JSON.parse(data.lineItemsJson) : [];
    if (!items[row.item.lineItemIndex]) throw new Error('Line item no longer exists');
    items[row.item.lineItemIndex] = { ...items[row.item.lineItemIndex], categoryTag: newCategory };
    await extractedDataApi.update(data.id, {
      merchantName: data.merchantName,
      transactionDate: data.transactionDate,
      totalAmount: data.totalAmount,
      currency: data.currency,
      taxAmount: data.taxAmount,
      lineItems: items,
    });
  };

  const reassignBankTransaction = async (row: Extract<Row, { kind: 'BANK_TRANSACTION' }>, newCategory: string) => {
    await bankTransactionsApi.update(row.txn.id, {
      transactionDate: row.txn.transactionDate,
      description: row.txn.description,
      payeeOrPayer: row.txn.payeeOrPayer,
      amount: row.txn.amount,
      type: row.txn.type,
      category: newCategory,
    });
  };

  const handleReassign = async (row: Row, newCategory: string) => {
    setSavingKey(row.key);
    setRowError(null);
    try {
      if (row.kind === 'LINE_ITEM') {
        await reassignLineItem(row, newCategory);
      } else {
        await reassignBankTransaction(row, newCategory);
      }
      setRows((prev) => (prev ? prev.filter((r) => r.key !== row.key) : prev));
      onChanged();
    } catch {
      setRowError({ key: row.key, message: 'Could not save — try again.' });
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{category}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Click a category to reassign it</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3 flex-1">
          {error && <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">{error}</p>}

          {!error && rows === null && (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-10 text-center">Loading…</p>
          )}

          {!error && rows !== null && rows.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-10 text-center">
              Nothing left in this category for the current range.
            </p>
          )}

          {!error && rows !== null && rows.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((row) => (
                <li key={row.key} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 dark:text-white truncate">{row.label}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>{row.date}</span>
                      <span>&middot;</span>
                      <span>{formatCurrency(row.amount)}</span>
                      {row.kind === 'LINE_ITEM' && (
                        <>
                          <span>&middot;</span>
                          <Link href={`/documents/${row.item.documentId}`} className="text-accent hover:opacity-80 transition-opacity duration-200">
                            View document
                          </Link>
                        </>
                      )}
                    </p>
                    {rowError?.key === row.key && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{rowError.message}</p>
                    )}
                  </div>
                  <select
                    value={row.category}
                    disabled={savingKey === row.key}
                    onChange={(e) => handleReassign(row, e.target.value)}
                    className={selectClasses}
                  >
                    {SPENDING_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
