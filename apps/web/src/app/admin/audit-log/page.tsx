'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminAuditLogApi, getAuthToken, getCurrentUserRole, AuditLogEntry } from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';

const PAGE_SIZE = 25;

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
  'EXTRACTED_DATA_EDITED',
  'WHATSAPP_NUMBER_CONNECTED',
  'WHATSAPP_NUMBER_DISCONNECTED',
] as const;

const SECURITY_ACTIONS = new Set(['LOGIN_FAILURE', 'PASSWORD_CHANGE_FAILURE']);

function actionBadgeClasses(action: string): string {
  if (SECURITY_ACTIONS.has(action)) {
    return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400';
  }
  return 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300';
}

// datetime-local inputs give "YYYY-MM-DDTHH:mm" in the browser's local
// timezone with no offset — convert to a real instant before sending, so
// the backend's Instant parsing isn't guessing a timezone.
function toIsoInstant(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export default function AdminAuditLogPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actorEmail, setActorEmail] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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

  const load = useCallback(
    async (pageToLoad: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await adminAuditLogApi.search({
          actorEmail: actorEmail.trim() || undefined,
          action: action || undefined,
          from: toIsoInstant(from),
          to: toIsoInstant(to),
          page: pageToLoad,
          size: PAGE_SIZE,
        });
        setRows(result.content);
        setTotalPages(result.totalPages);
        setTotalElements(result.totalElements);
        setPage(result.number);
      } catch {
        setError('Could not load the audit log. Check your connection and try again.');
      } finally {
        setLoading(false);
      }
    },
    [actorEmail, action, from, to]
  );

  useEffect(() => {
    if (checkedAuth) {
      load(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAuth]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load(0);
  };

  const clearFilters = () => {
    setActorEmail('');
    setAction('');
    setFrom('');
    setTo('');
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
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Log</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Every login, upload, and correction across all tenants — for troubleshooting a specific
              user&apos;s actions and, if something ever needs investigating, a timeline of who did
              what, when, and from where.
            </p>
          </div>

          <form onSubmit={handleFilterSubmit} className={`${cardClasses} p-4 mb-6`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-2">
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
              <div>
                <label htmlFor="from" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  From
                </label>
                <input
                  id="from"
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="to" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  To
                </label>
                <input
                  id="to"
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={inputClasses}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
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
              <div className="text-center py-12">
                <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
                <button onClick={() => load(page)} className={primaryButtonClasses}>
                  Retry
                </button>
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Actor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Tenant</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Action</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Entity</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Detail</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {rows.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200">
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-white whitespace-nowrap">
                            {entry.actorEmail ?? <span className="text-slate-400 dark:text-slate-500">system</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {entry.tenantBusinessName ?? '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${actionBadgeClasses(entry.action)}`}>
                              {entry.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {entry.entityType ? `${entry.entityType} ${entry.entityId ?? ''}`.trim() : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate" title={entry.detail ?? undefined}>
                            {entry.detail ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {entry.ipAddress ?? '—'}
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
    </div>
  );
}
