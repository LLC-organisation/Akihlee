'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  adminAuditLogApi,
  getAuthToken,
  getCurrentUserRole,
  AuditLogEntry,
  AdminTenantSummary,
} from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { AuditActionBadge } from '@/components/AuditActionBadge';
import { TenantSelector } from '@/components/TenantSelector';
import { AuditDetailDrawer } from '@/components/AuditDetailDrawer';

const PAGE_SIZE = 25;
const LIVE_SYNC_INTERVAL_MS = 10_000;

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none transition-all duration-200';
const inputClasses =
  'w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-accent transition-colors duration-200';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-canvas text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';

// Mirrors AuditAction.java's constants — kept as plain strings on both
// sides (not a shared enum) since new actions shouldn't require touching
// the frontend build to become filterable, only this dropdown's options.
const ACTIONS = [
  'REGISTER',
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'PASSWORD_CHANGE',
  'PASSWORD_CHANGE_FAILURE',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_STATUS_CHANGE',
  'DOCUMENT_APPROVED',
  'DOCUMENT_REJECTED',
  'DOCUMENT_IMPORTED',
  'DOCUMENT_DELETED',
  'EXTRACTED_DATA_EDITED',
  'BANK_TRANSACTION_EDITED',
  'WHATSAPP_NUMBER_CONNECTED',
  'WHATSAPP_NUMBER_DISCONNECTED',
  'SQUARE_CONNECTED',
  'SQUARE_DISCONNECTED',
] as const;

const QUICK_RANGES = [
  { label: 'Last 15m', minutes: 15 },
  { label: '1H', minutes: 60 },
  { label: '24H', minutes: 60 * 24 },
  { label: '7D', minutes: 60 * 24 * 7 },
] as const;

// datetime-local inputs give/take "YYYY-MM-DDTHH:mm" in the browser's
// local timezone with no offset.
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Converts a datetime-local value to a real instant before sending, so the
// backend's Instant parsing isn't guessing a timezone.
function toIsoInstant(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

type ApiError = { status: number | null; message: string };

function describeError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { status?: number; data?: { message?: string; error?: string } } }).response;
    const status = response?.status ?? null;
    const message = response?.data?.message || response?.data?.error || (status ? `Server responded with ${status}` : null);
    if (message) return { status, message };
  }
  if (err instanceof Error && err.message) {
    return { status: null, message: err.message };
  }
  return { status: null, message: 'Unknown error — check the browser console for details.' };
}

// useSearchParams() (read below, for a deep-link like ?actorEmail=... from
// a user's profile page) opts the page into client-side rendering and
// requires a Suspense boundary around anything that calls it, or `next
// build` fails prerendering this route — see the default export below.
function AdminAuditLogPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);
  const [liveSync, setLiveSync] = useState(false);

  const [actorEmail, setActorEmail] = useState(() => searchParams.get('actorEmail') ?? '');
  const [tenant, setTenant] = useState<AdminTenantSummary | null>(null);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [activeRange, setActiveRange] = useState<string | null>(null);

  // Filters as they currently stand, kept in a ref so the Live Sync
  // interval always re-runs the latest query without needing to be torn
  // down and rebuilt every time a filter field changes.
  const filtersRef = useRef({ actorEmail, tenant, action, from, to, search });
  filtersRef.current = { actorEmail, tenant, action, from, to, search };

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    if (getCurrentUserRole() !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  const load = useCallback(async (pageToLoad: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    const f = filtersRef.current;
    try {
      const result = await adminAuditLogApi.search({
        actorEmail: f.actorEmail.trim() || undefined,
        tenantId: f.tenant?.id,
        action: f.action || undefined,
        from: toIsoInstant(f.from),
        to: toIsoInstant(f.to),
        q: f.search.trim() || undefined,
        page: pageToLoad,
        size: PAGE_SIZE,
      });
      setRows(result.content);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);
      setPage(result.number);
    } catch (err) {
      if (!opts?.silent) setError(describeError(err));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth) {
      load(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAuth]);

  // Live Sync: silently re-polls the current page/filters every 10s.
  // Silent so a background refresh doesn't flash the loading state or
  // clobber an in-progress filter edit / open drawer.
  useEffect(() => {
    if (!liveSync) return;
    const interval = setInterval(() => load(page, { silent: true }), LIVE_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [liveSync, page, load]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load(0);
  };

  const clearFilters = () => {
    setActorEmail('');
    setTenant(null);
    setAction('');
    setFrom('');
    setTo('');
    setSearch('');
    setActiveRange(null);
  };

  const applyQuickRange = (label: string, minutes: number) => {
    const now = new Date();
    const start = new Date(now.getTime() - minutes * 60_000);
    setFrom(toLocalInputValue(start));
    setTo(toLocalInputValue(now));
    setActiveRange(label);
    // Filters state updates are async, so read the values we just computed
    // rather than relying on the (still stale) filtersRef.
    setTimeout(() => load(0), 0);
  };

  if (!checkedAuth) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 lg:pl-20">
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Log</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Every login, upload, and correction across all tenants — for troubleshooting a specific
                user&apos;s actions and, if something ever needs investigating, a timeline of who did
                what, when, and from where.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 shrink-0">
              <span>Live Sync</span>
              <button
                type="button"
                role="switch"
                aria-checked={liveSync}
                onClick={() => setLiveSync((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                  liveSync ? 'bg-accent' : 'bg-slate-200 dark:bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 ${
                    liveSync ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs text-slate-400 dark:text-slate-500">{liveSync ? 'On' : 'Off'}</span>
            </label>
          </div>

          <form onSubmit={handleFilterSubmit} className={`${cardClasses} p-4 mb-6`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label htmlFor="actorEmail" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Actor email
                </label>
                <input
                  id="actorEmail"
                  type="text"
                  value={actorEmail}
                  onChange={(e) => setActorEmail(e.target.value)}
                  placeholder="user@business.com"
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="tenant" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Tenant
                </label>
                <TenantSelector value={tenant} onChange={setTenant} />
              </div>
              <div>
                <label htmlFor="action" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Action
                </label>
                <select id="action" value={action} onChange={(e) => setAction(e.target.value)} className={inputClasses}>
                  <option value="">All actions</option>
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label htmlFor="search" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Search metadata / entity id / error reason
                </label>
                <input
                  id="search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="e.g. a document id, an error message fragment…"
                  className={inputClasses}
                />
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Time range</p>
              <div className="flex flex-wrap items-center gap-2">
                {QUICK_RANGES.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => applyQuickRange(r.label, r.minutes)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-200 ${
                      activeRange === r.label
                        ? 'border-accent text-accent bg-accent/5'
                        : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setActiveRange(null)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-200 ${
                    activeRange === null
                      ? 'border-accent text-accent bg-accent/5'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  Custom
                </button>
                <div className="flex items-center gap-2 ml-1">
                  <input
                    id="from"
                    type="datetime-local"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setActiveRange(null);
                    }}
                    className={`${inputClasses} !w-auto`}
                  />
                  <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
                  <input
                    id="to"
                    type="datetime-local"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setActiveRange(null);
                    }}
                    className={`${inputClasses} !w-auto`}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button type="submit" className={primaryButtonClasses}>
                Apply filters
              </button>
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  load(0);
                }}
                className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-200"
              >
                Clear
              </button>
            </div>
          </form>

          <div className={cardClasses}>
            {loading && <p className="text-slate-500 dark:text-slate-400 text-center py-12">Loading…</p>}

            {!loading && error && (
              <div className="py-10 px-6">
                <div className="max-w-lg mx-auto rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-4">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    Could not load the audit log
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-400/90 mt-1">
                    {error.status !== null ? `HTTP ${error.status} — ` : ''}
                    {error.message}
                  </p>
                  <button onClick={() => load(page)} className={`${primaryButtonClasses} mt-3`}>
                    Retry
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && rows.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-12">
                No events match these filters.
              </p>
            )}

            {!loading && !error && rows.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Timestamp</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Tenant</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Actor Email</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Action</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Resource / Target</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">IP Address</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {rows.map((entry) => (
                        <tr
                          key={entry.id}
                          onClick={() => setSelectedEntry(entry)}
                          className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200 cursor-pointer"
                        >
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {entry.tenantBusinessName ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-white whitespace-nowrap">
                            {entry.actorEmail ?? <span className="text-slate-400 dark:text-slate-500">system</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <AuditActionBadge action={entry.action} />
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {entry.entityType ? `${entry.entityType} ${entry.entityId ?? ''}`.trim() : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {entry.ipAddress ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate" title={entry.detail ?? undefined}>
                            {entry.detail ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-white/10">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Page {page + 1} of {totalPages} &middot; {totalElements} total
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => load(page - 1)}
                      disabled={page === 0}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-white/5 disabled:hover:bg-transparent transition-colors duration-200"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => load(page + 1)}
                      disabled={page + 1 >= totalPages}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-white/5 disabled:hover:bg-transparent transition-colors duration-200"
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

      {selectedEntry && (
        <AuditDetailDrawer entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}

export default function AdminAuditLogPage() {
  return (
    <Suspense fallback={null}>
      <AdminAuditLogPageContent />
    </Suspense>
  );
}
