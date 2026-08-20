'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import {
  documentsApi,
  extractedDataApi,
  bankTransactionsApi,
  getAuthToken,
  Document,
  ExtractedData,
  UpdateExtractedDataRequest,
  LineItem,
  BankTransaction,
} from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { StatusBadge } from '@/components/StatusBadge';
import { SourceBadge } from '@/components/SourceBadge';
import { DocumentTypeBadge } from '@/components/DocumentTypeBadge';
import { ExtractionMethodBadge } from '@/components/ExtractionMethodBadge';
import { SPENDING_CATEGORIES } from '@/lib/utils/categories';

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none transition-all duration-200';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';
const editInputClasses =
  'w-full rounded-md border border-blue-400 dark:border-blue-500 bg-white dark:bg-canvas px-2 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

// localId exists only for React keys / local edit state — the backend has
// no concept of a line-item identity, just array position.
type LineItemRow = LineItem & { localId: string };

function parseLineItems(lineItemsJson: string | null): LineItemRow[] {
  if (!lineItemsJson) return [];
  try {
    const parsed = JSON.parse(lineItemsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LineItem => item && typeof item === 'object' && typeof item.totalPrice === 'number')
      .map((item) => ({ ...item, localId: crypto.randomUUID() }));
  } catch {
    return [];
  }
}

function formatNumberInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function parseNumberInput(raw: string): number | null {
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

type EditingField = 'merchant' | 'date' | 'amount' | 'tax' | null;
// 'category' isn't here — like 'type', it's a select that saves directly
// via saveTransaction rather than going through the click-to-edit-text flow.
type TxnField = 'date' | 'description' | 'payee' | 'amount';
type EditingTxn = { rowId: string; field: TxnField } | null;

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-b-0">
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400 sm:w-32 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const TYPE_BADGE_STYLES: Record<BankTransaction['type'], string> = {
  INCOME: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  EXPENSE: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
  TRANSFER: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
};

type BankTransactionsSectionProps = {
  extractedDataId: string;
  currency: string | null;
  transactions: BankTransaction[];
  setTransactions: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  error: string | null;
  setError: (error: string | null) => void;
  editing: EditingTxn;
  setEditing: (editing: EditingTxn) => void;
  draft: string;
  setDraft: (draft: string) => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  editInputClasses: string;
};

function BankTransactionsSection({
  extractedDataId,
  currency,
  transactions,
  setTransactions,
  error,
  setError,
  editing,
  setEditing,
  draft,
  setDraft,
  saving,
  setSaving,
  editInputClasses,
}: BankTransactionsSectionProps) {
  const fieldValue = (txn: BankTransaction, field: TxnField): string => {
    switch (field) {
      case 'date':
        return txn.transactionDate;
      case 'description':
        return txn.description ?? '';
      case 'payee':
        return txn.payeeOrPayer ?? '';
      case 'amount':
        return String(txn.amount);
    }
  };

  const startEdit = (txn: BankTransaction, field: TxnField) => {
    setError(null);
    setEditing({ rowId: txn.id, field });
    setDraft(fieldValue(txn, field));
  };

  const cancelEdit = () => setEditing(null);

  const buildRequest = (txn: BankTransaction, overrides: Partial<BankTransaction>) => ({
    transactionDate: overrides.transactionDate ?? txn.transactionDate,
    description: overrides.description !== undefined ? overrides.description : txn.description,
    payeeOrPayer: overrides.payeeOrPayer !== undefined ? overrides.payeeOrPayer : txn.payeeOrPayer,
    amount: overrides.amount ?? txn.amount,
    type: overrides.type ?? txn.type,
    category: overrides.category !== undefined ? overrides.category : txn.category,
  });

  const saveTransaction = async (txn: BankTransaction, overrides: Partial<BankTransaction>) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await bankTransactionsApi.update(txn.id, buildRequest(txn, overrides));
      setTransactions((prev) => prev.map((t) => (t.id === txn.id ? updated : t)));
      setEditing(null);
    } catch {
      setError('Could not save transaction. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const commitEdit = (txn: BankTransaction) => {
    if (!editing) return;
    if (editing.field === 'amount' && draft.trim() && Number.isNaN(Number(draft))) {
      setError('Enter a valid number');
      return;
    }
    const overrides: Partial<BankTransaction> =
      editing.field === 'date'
        ? { transactionDate: draft }
        : editing.field === 'description'
          ? { description: draft || null }
          : editing.field === 'payee'
            ? { payeeOrPayer: draft || null }
            : { amount: draft.trim() ? Number(draft) : 0 };
    saveTransaction(txn, overrides);
  };

  const handleKeyDown = (e: React.KeyboardEvent, txn: BankTransaction) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(txn);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const addTransaction = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await bankTransactionsApi.create(extractedDataId, {
        transactionDate: new Date().toISOString().slice(0, 10),
        description: '',
        payeeOrPayer: '',
        amount: 0,
        type: 'EXPENSE',
        category: null,
      });
      setTransactions((prev) => [...prev, created]);
    } catch {
      setError('Could not add transaction. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await bankTransactionsApi.remove(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError('Could not delete transaction. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const netTotal = transactions.reduce(
    (sum, t) => sum + (t.type === 'EXPENSE' ? -t.amount : t.amount),
    0
  );

  const editableCell = (txn: BankTransaction, field: TxnField, display: string, align: 'left' | 'right' = 'left') =>
    editing?.rowId === txn.id && editing.field === field ? (
      <input
        autoFocus
        type="text"
        inputMode={field === 'amount' ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitEdit(txn)}
        onKeyDown={(e) => handleKeyDown(e, txn)}
        disabled={saving}
        className={editInputClasses}
      />
    ) : (
      <button
        type="button"
        onClick={() => startEdit(txn, field)}
        className={`w-full ${align === 'right' ? 'text-right' : 'text-left'} hover:underline decoration-dashed underline-offset-2 decoration-slate-400`}
      >
        {display || '—'}
      </button>
    );

  return (
    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Bank Transactions</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Net: <span className="font-medium text-slate-900 dark:text-white">{formatAmount(netTotal, currency)}</span>
        </p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>}

      {transactions.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500 mb-2">No transactions captured.</p>
      )}

      {transactions.length > 0 && (
        <div className="overflow-x-auto -mx-2">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="px-2 py-1.5 text-left">Date</th>
                <th className="px-2 py-1.5 text-left">Description / Payee</th>
                <th className="px-2 py-1.5 text-left">Type</th>
                <th className="px-2 py-1.5 text-left">Category</th>
                <th className="px-2 py-1.5 text-right">Amount</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => (
                <tr key={txn.id} className="border-t border-slate-100 dark:border-white/5">
                  <td className="p-1 w-32">{editableCell(txn, 'date', formatDate(txn.transactionDate))}</td>
                  <td className="p-1">
                    <div>{editableCell(txn, 'description', txn.description ?? '')}</div>
                    <div className="text-xs text-slate-400">{editableCell(txn, 'payee', txn.payeeOrPayer ?? '')}</div>
                  </td>
                  <td className="p-1 w-32">
                    <select
                      value={txn.type}
                      onChange={(e) => saveTransaction(txn, { type: e.target.value as BankTransaction['type'] })}
                      disabled={saving}
                      className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${TYPE_BADGE_STYLES[txn.type]}`}
                    >
                      <option value="INCOME">Income</option>
                      <option value="EXPENSE">Expense</option>
                      <option value="TRANSFER">Transfer</option>
                    </select>
                  </td>
                  <td className="p-1 w-40">
                    <select
                      value={txn.category ?? 'Uncategorized'}
                      onChange={(e) => saveTransaction(txn, { category: e.target.value })}
                      disabled={saving}
                      className={editInputClasses}
                    >
                      {SPENDING_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1 w-28 text-right">
                    {editableCell(txn, 'amount', formatAmount(txn.amount, currency), 'right')}
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      onClick={() => deleteTransaction(txn.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200"
                      aria-label="Remove transaction"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={addTransaction}
        disabled={saving}
        className="mt-3 text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline disabled:opacity-50"
      >
        + Add Transaction
      </button>
    </div>
  );
}

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const documentId = params.id;

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [doc, setDoc] = useState<Document | null>(null);
  const [data, setData] = useState<ExtractedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [notExtractedYet, setNotExtractedYet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contentUrl, setContentUrl] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditingField>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftCurrency, setDraftCurrency] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [lineItemsDirty, setLineItemsDirty] = useState(false);
  const [savingLineItems, setSavingLineItems] = useState(false);

  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [txnError, setTxnError] = useState<string | null>(null);
  const [editingTxn, setEditingTxn] = useState<EditingTxn>(null);
  const [txnDraft, setTxnDraft] = useState('');
  const [savingTxn, setSavingTxn] = useState(false);

  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setNotExtractedYet(false);
    try {
      const fetchedDoc = await documentsApi.get(documentId);
      setDoc(fetchedDoc);

      try {
        const extracted = await extractedDataApi.getByDocument(documentId);
        setData(extracted);
        setLineItems(parseLineItems(extracted.lineItemsJson));
        setLineItemsDirty(false);
        if (extracted.documentType === 'BANK_STATEMENT') {
          setBankTransactions(await bankTransactionsApi.list(extracted.id));
        }
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 404) {
          setNotExtractedYet(true);
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError('Could not load this document. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (checkedAuth) load();
  }, [checkedAuth, load]);

  // A plain <img src> can't carry the JWT and the endpoint isn't public, so
  // the original file is fetched as a blob and rendered via an object URL.
  // Never fetched for Square-sourced documents — there's no real file.
  useEffect(() => {
    if (!doc || doc.source === 'SQUARE') return;
    let objectUrl: string | null = null;
    let cancelled = false;
    documentsApi
      .getContentBlobUrl(doc.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setContentUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc]);

  const buildPayload = (overrides: Partial<UpdateExtractedDataRequest>): UpdateExtractedDataRequest => {
    if (!data) throw new Error('No extracted data loaded');
    return {
      merchantName: data.merchantName,
      transactionDate: data.transactionDate,
      totalAmount: data.totalAmount,
      currency: data.currency,
      taxAmount: data.taxAmount,
      ...overrides,
    };
  };

  const startEdit = (field: NonNullable<EditingField>) => {
    if (!data) return;
    setSaveError(null);
    setEditing(field);
    if (field === 'merchant') setDraftValue(data.merchantName ?? '');
    if (field === 'date') setDraftValue(data.transactionDate ?? '');
    if (field === 'amount') {
      setDraftValue(data.totalAmount !== null ? String(data.totalAmount) : '');
      setDraftCurrency(data.currency ?? '');
    }
    if (field === 'tax') setDraftValue(data.taxAmount !== null ? String(data.taxAmount) : '');
  };

  const cancelEdit = () => {
    setEditing(null);
    setSaveError(null);
  };

  const commitEdit = async () => {
    if (!editing || !data) return;

    if ((editing === 'amount' || editing === 'tax') && draftValue.trim() && Number.isNaN(Number(draftValue))) {
      setSaveError('Enter a valid number');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const overrides: Partial<UpdateExtractedDataRequest> = {};
      if (editing === 'merchant') overrides.merchantName = draftValue.trim() || null;
      if (editing === 'date') overrides.transactionDate = draftValue || null;
      if (editing === 'amount') {
        overrides.totalAmount = draftValue.trim() ? Number(draftValue) : null;
        overrides.currency = draftCurrency.trim() || null;
      }
      if (editing === 'tax') overrides.taxAmount = draftValue.trim() ? Number(draftValue) : null;

      const updated = await extractedDataApi.update(data.id, buildPayload(overrides));
      setData(updated);
      setEditing(null);
    } catch {
      setSaveError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const updateLineItemField = (localId: string, field: keyof LineItem, value: LineItem[keyof LineItem]) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        const next = { ...item, [field]: value };
        // Quantity/unit price are the ones OCR is most likely to have
        // split correctly — recompute the total from them so the row stays
        // internally consistent. A direct edit to totalPrice itself always
        // wins and doesn't touch quantity/unitPrice.
        if ((field === 'quantity' || field === 'unitPrice') && next.quantity != null && next.unitPrice != null) {
          next.totalPrice = Math.round(next.quantity * next.unitPrice * 100) / 100;
        }
        return next;
      })
    );
    setLineItemsDirty(true);
  };

  const removeLineItem = (localId: string) => {
    setLineItems((prev) => prev.filter((item) => item.localId !== localId));
    setLineItemsDirty(true);
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { localId: crypto.randomUUID(), itemName: null, description: '', totalPrice: 0 },
    ]);
    setLineItemsDirty(true);
  };

  const itemsSubtotal = lineItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

  const saveLineItems = async () => {
    if (!data) return;
    setSavingLineItems(true);
    setSaveError(null);
    try {
      const cleaned: LineItem[] = lineItems
        .filter((item) => item.description.trim() !== '' || item.totalPrice !== 0)
        .map(({ localId, ...item }) => ({
          ...item,
          description: item.description.trim(),
          itemName: item.itemName?.trim() || null,
        }));
      const updated = await extractedDataApi.update(data.id, buildPayload({ lineItems: cleaned }));
      setData(updated);
      setLineItems(parseLineItems(updated.lineItemsJson));
      setLineItemsDirty(false);
    } catch {
      setSaveError('Could not save line items. Try again.');
    } finally {
      setSavingLineItems(false);
    }
  };

  const canReview = doc?.status === 'EXTRACTED' || doc?.status === 'REVIEW_REQUIRED';

  const handleApprove = async () => {
    if (!doc) return;
    setActioning(true);
    setActionError(null);
    try {
      const updated = await documentsApi.approve(doc.id);
      setDoc(updated);
    } catch {
      setActionError('Could not approve. Try again.');
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async () => {
    if (!doc) return;
    setActioning(true);
    setActionError(null);
    try {
      const updated = await documentsApi.reject(doc.id, rejectReason.trim() || null);
      setDoc(updated);
      setRejecting(false);
      setRejectReason('');
    } catch {
      setActionError('Could not reject. Try again.');
    } finally {
      setActioning(false);
    }
  };

  if (!checkedAuth) return null;

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 lg:pl-20">
        <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => router.push('/documents')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-200 mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Documents
          </button>

          {loading && <p className="text-slate-500 dark:text-slate-400 text-center py-12">Loading…</p>}

          {!loading && notFound && (
            <div className="text-center py-12">
              <p className="text-slate-500 dark:text-slate-400">Document not found.</p>
            </div>
          )}

          {!loading && !notFound && error && (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
              <button onClick={load} className={primaryButtonClasses}>
                Retry
              </button>
            </div>
          )}

          {!loading && !notFound && !error && doc && (
            <div className="space-y-6">
              <div className={`${cardClasses} p-6`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">{doc.filename}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {formatBytes(doc.sizeBytes)} &middot; {new Date(doc.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <SourceBadge source={doc.source} />
                    <StatusBadge status={doc.status} />
                    {data && <DocumentTypeBadge documentType={data.documentType} />}
                    {data && <ExtractionMethodBadge extractionMethod={data.extractionMethod} />}
                  </div>
                </div>

                {doc.source === 'SQUARE' ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-canvas rounded-lg px-3 py-2.5">
                    Synced from Square — there&apos;s no receipt file for this transaction.
                  </p>
                ) : contentUrl ? (
                  doc.contentType.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={contentUrl}
                      alt={doc.filename}
                      className="max-w-full max-h-[480px] rounded-lg border border-slate-200 dark:border-white/10 mx-auto"
                    />
                  ) : (
                    <a
                      href={contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      Open original ({doc.contentType})
                    </a>
                  )
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Loading original file…</p>
                )}
              </div>

              {notExtractedYet && (
                <div className={`${cardClasses} p-6 text-center`}>
                  <p className="text-slate-500 dark:text-slate-400">
                    Still being processed — extracted data will appear here once OCR finishes.
                  </p>
                  <button onClick={load} className={`${primaryButtonClasses} mt-4`}>
                    Refresh
                  </button>
                </div>
              )}

              {data && (
                <div className={`${cardClasses} p-6`}>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Extracted Data</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                    Verify each field against the receipt above, then approve or reject.
                  </p>

                  {saveError && (
                    <p className="text-sm text-red-600 dark:text-red-400 mb-2">{saveError}</p>
                  )}

                  <div>
                    <FieldRow label="Merchant">
                      {editing === 'merchant' ? (
                        <input
                          autoFocus
                          type="text"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          disabled={saving}
                          className={editInputClasses}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('merchant')}
                          className="text-left text-sm text-slate-900 dark:text-white hover:underline decoration-dashed underline-offset-2 decoration-slate-400"
                        >
                          {data.merchantName ?? '—'}
                        </button>
                      )}
                    </FieldRow>

                    <FieldRow label="Date">
                      {editing === 'date' ? (
                        <input
                          autoFocus
                          type="date"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          disabled={saving}
                          className={editInputClasses}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('date')}
                          className="text-left text-sm text-slate-900 dark:text-white hover:underline decoration-dashed underline-offset-2 decoration-slate-400"
                        >
                          {formatDate(data.transactionDate)}
                        </button>
                      )}
                    </FieldRow>

                    <FieldRow label="Amount">
                      {editing === 'amount' ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            type="text"
                            value={draftCurrency}
                            onChange={(e) => setDraftCurrency(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={handleKeyDown}
                            disabled={saving}
                            placeholder="KES"
                            className={`${editInputClasses} w-20`}
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={handleKeyDown}
                            disabled={saving}
                            className={`${editInputClasses} w-28`}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('amount')}
                          className="text-left text-sm text-slate-900 dark:text-white hover:underline decoration-dashed underline-offset-2 decoration-slate-400"
                        >
                          {formatAmount(data.totalAmount, data.currency)}
                        </button>
                      )}
                    </FieldRow>

                    <FieldRow label="Tax">
                      {editing === 'tax' ? (
                        <input
                          autoFocus
                          type="text"
                          inputMode="decimal"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                          disabled={saving}
                          className={`${editInputClasses} w-28`}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('tax')}
                          className="text-left text-sm text-slate-900 dark:text-white hover:underline decoration-dashed underline-offset-2 decoration-slate-400"
                        >
                          {formatAmount(data.taxAmount, data.currency)}
                        </button>
                      )}
                    </FieldRow>
                  </div>

                  {data.documentType !== 'BANK_STATEMENT' && (
                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Line Items</h3>
                        {lineItemsDirty && (
                          <button
                            onClick={saveLineItems}
                            disabled={savingLineItems}
                            className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline disabled:opacity-50"
                          >
                            {savingLineItems ? 'Saving…' : 'Save line items'}
                          </button>
                        )}
                      </div>

                      {lineItems.length === 0 && (
                        <p className="text-sm text-slate-400 dark:text-slate-500 mb-2">No line items captured.</p>
                      )}

                      {lineItems.length > 0 && (
                        <div className="overflow-x-auto -mx-2">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                {data.documentType === 'INVOICE' && (
                                  <th className="px-2 py-1.5 text-left">Item Name</th>
                                )}
                                <th className="px-2 py-1.5 text-left">Description</th>
                                <th className="px-2 py-1.5 text-left">SKU</th>
                                <th className="px-2 py-1.5 text-right">Qty</th>
                                <th className="px-2 py-1.5 text-right">Unit Price</th>
                                <th className="px-2 py-1.5 text-right">Total</th>
                                <th className="px-2 py-1.5 text-left">Category</th>
                                <th className="px-2 py-1.5 text-center">Taxable</th>
                                <th className="px-2 py-1.5" />
                              </tr>
                            </thead>
                            <tbody>
                              {lineItems.map((item) => (
                                <tr key={item.localId} className="border-t border-slate-100 dark:border-white/5">
                                  {data.documentType === 'INVOICE' && (
                                    <td className="p-1">
                                      <input
                                        type="text"
                                        value={item.itemName ?? ''}
                                        onChange={(e) => updateLineItemField(item.localId, 'itemName', e.target.value || null)}
                                        className={editInputClasses}
                                      />
                                    </td>
                                  )}
                                  <td className="p-1">
                                    <input
                                      type="text"
                                      value={item.description}
                                      onChange={(e) => updateLineItemField(item.localId, 'description', e.target.value)}
                                      className={editInputClasses}
                                    />
                                  </td>
                                  <td className="p-1 w-24">
                                    <input
                                      type="text"
                                      value={item.sku ?? ''}
                                      onChange={(e) => updateLineItemField(item.localId, 'sku', e.target.value || null)}
                                      className={editInputClasses}
                                    />
                                  </td>
                                  <td className="p-1 w-20">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={formatNumberInput(item.quantity)}
                                      onChange={(e) =>
                                        updateLineItemField(item.localId, 'quantity', parseNumberInput(e.target.value))
                                      }
                                      className={`${editInputClasses} text-right`}
                                    />
                                  </td>
                                  <td className="p-1 w-24">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={formatNumberInput(item.unitPrice)}
                                      onChange={(e) =>
                                        updateLineItemField(item.localId, 'unitPrice', parseNumberInput(e.target.value))
                                      }
                                      className={`${editInputClasses} text-right`}
                                    />
                                  </td>
                                  <td className="p-1 w-24">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={formatNumberInput(item.totalPrice)}
                                      onChange={(e) =>
                                        updateLineItemField(item.localId, 'totalPrice', parseNumberInput(e.target.value) ?? 0)
                                      }
                                      className={`${editInputClasses} text-right`}
                                    />
                                  </td>
                                  <td className="p-1 w-40">
                                    <select
                                      value={item.categoryTag ?? 'Uncategorized'}
                                      onChange={(e) => updateLineItemField(item.localId, 'categoryTag', e.target.value)}
                                      className={editInputClasses}
                                    >
                                      {SPENDING_CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-1 text-center">
                                    <input
                                      type="checkbox"
                                      checked={item.isTaxable ?? false}
                                      onChange={(e) => updateLineItemField(item.localId, 'isTaxable', e.target.checked)}
                                    />
                                  </td>
                                  <td className="p-1">
                                    <button
                                      type="button"
                                      onClick={() => removeLineItem(item.localId)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200"
                                      aria-label="Remove line item"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={addLineItem}
                          className="text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
                        >
                          + Add Line Item
                        </button>
                        {lineItems.length > 0 && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Items subtotal: <span className="font-medium text-slate-900 dark:text-white">{formatAmount(itemsSubtotal, data.currency)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {data.documentType === 'BANK_STATEMENT' && (
                    <BankTransactionsSection
                      extractedDataId={data.id}
                      currency={data.currency}
                      transactions={bankTransactions}
                      setTransactions={setBankTransactions}
                      error={txnError}
                      setError={setTxnError}
                      editing={editingTxn}
                      setEditing={setEditingTxn}
                      draft={txnDraft}
                      setDraft={setTxnDraft}
                      saving={savingTxn}
                      setSaving={setSavingTxn}
                      editInputClasses={editInputClasses}
                    />
                  )}
                </div>
              )}

              {(canReview || doc.status === 'APPROVED' || doc.status === 'REJECTED') && (
                <div className={`${cardClasses} p-6`}>
                  {actionError && (
                    <p className="text-sm text-red-600 dark:text-red-400 mb-3">{actionError}</p>
                  )}

                  {canReview && !rejecting && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button onClick={handleApprove} disabled={actioning} className={primaryButtonClasses}>
                        {actioning ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => setRejecting(true)}
                        disabled={actioning}
                        className="px-4 py-2.5 text-sm font-medium rounded-lg border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-200 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {canReview && rejecting && (
                    <div className="flex flex-col gap-3">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Reason (optional)
                      </label>
                      <input
                        autoFocus
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. duplicate, wrong amount, not a business expense"
                        className={editInputClasses}
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={handleReject}
                          disabled={actioning}
                          className="px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors duration-200 disabled:opacity-50"
                        >
                          {actioning ? 'Rejecting…' : 'Confirm Reject'}
                        </button>
                        <button
                          onClick={() => { setRejecting(false); setRejectReason(''); }}
                          disabled={actioning}
                          className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {!canReview && doc.status === 'APPROVED' && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Approved</p>
                  )}
                  {!canReview && doc.status === 'REJECTED' && (
                    <p className="text-sm text-red-700 dark:text-red-400 font-medium">Rejected</p>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
