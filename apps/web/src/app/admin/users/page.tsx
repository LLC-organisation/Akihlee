'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminUsersApi,
  getAuthToken,
  getCurrentUserRole,
  UserDirectoryEntry,
  UserSummary,
  UserRole,
  AdminTenantSummary,
} from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { TenantSelector } from '@/components/TenantSelector';
import { UserStatusBadge } from '@/components/UserStatusBadge';
import { formatRelativeTime, formatMinutes } from '@/lib/utils/time';

const PAGE_SIZE = 25;

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none transition-all duration-200';
const inputClasses =
  'w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-accent transition-colors duration-200';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-canvas text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';

const TIME_PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
] as const;

function initials(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return chars.toUpperCase();
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${cardClasses} p-4`}>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="text-xs mt-1 text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [rows, setRows] = useState<UserDirectoryEntry[]>([]);
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [tenant, setTenant] = useState<AdminTenantSummary | null>(null);
  const [role, setRole] = useState<UserRole | ''>('');
  const [days, setDays] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState<'lastActiveAt' | 'documentsProcessed'>('lastActiveAt');

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
      const filters = {
        search: search.trim() || undefined,
        tenantId: tenant?.id,
        role: role || undefined,
        days,
      };
      try {
        const [listResult, summaryResult] = await Promise.all([
          adminUsersApi.list({ ...filters, sortBy, page: pageToLoad, size: PAGE_SIZE }),
          adminUsersApi.summary(filters),
        ]);
        setRows(listResult.content);
        setTotalPages(listResult.totalPages);
        setTotalElements(listResult.totalElements);
        setPage(listResult.number);
        setSummary(summaryResult);
      } catch {
        setError('Could not load the user directory. Check your connection and try again.');
      } finally {
        setLoading(false);
      }
    },
    [search, tenant, role, days, sortBy]
  );

  useEffect(() => {
    if (checkedAuth) {
      load(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedAuth]);

  // Sorting re-queries immediately (unlike the other filters, which wait
  // for "Apply filters") since it's a single click with an obvious result.
  useEffect(() => {
    if (checkedAuth) {
      load(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load(0);
  };

  const clearFilters = () => {
    setSearch('');
    setTenant(null);
    setRole('');
    setDays(undefined);
  };

  const toggleStatus = async (row: UserDirectoryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    try {
      await adminUsersApi.updateStatus(row.id, row.status === 'SUSPENDED');
      load(page);
    } catch {
      setActionError(`Could not update status for ${row.email}.`);
    }
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Directory</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Inventory, engagement, and behavioral analytics across every tenant — who&apos;s using the
              product, how much, and who&apos;s gone quiet.
            </p>
          </div>

          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiCard
                label="Total Active Users"
                value={`${summary.dailyActiveUsers} / ${summary.monthlyActiveUsers}`}
                hint="DAU / MAU"
              />
              <KpiCard
                label="Average Session Time"
                value={formatMinutes(summary.avgSessionDurationMinutes)}
                hint="Approximate — reconstructed from request activity, not a real logout event"
              />
              <div className={`${cardClasses} p-4`}>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Top Power Users</p>
                {summary.topPowerUsers.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">No document activity yet</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {summary.topPowerUsers.slice(0, 3).map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-slate-700 dark:text-slate-300">{u.email}</span>
                        <span className="text-slate-400 dark:text-slate-500 shrink-0">{u.documentsProcessedTotal}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <KpiCard
                label="At-Risk Users"
                value={String(summary.atRiskUsers)}
                hint="No activity in over 14 days"
              />
            </div>
          )}

          <form onSubmit={handleFilterSubmit} className={`${cardClasses} p-4 mb-6`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <label htmlFor="search" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Search email or tenant
                </label>
                <input
                  id="search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="user@business.com or business name"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tenant</label>
                <TenantSelector value={tenant} onChange={setTenant} />
              </div>
              <div>
                <label htmlFor="role" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Role
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole | '')}
                  className={inputClasses}
                >
                  <option value="">All roles</option>
                  <option value="ADMIN">Admin</option>
                  <option value="USER">User</option>
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">Activity window</span>
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setDays(preset.days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-200 ${
                    days === preset.days
                      ? 'border-accent text-accent bg-accent/5'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDays(undefined)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-200 ${
                  days === undefined
                    ? 'border-accent text-accent bg-accent/5'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                All time
              </button>
              <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                (scopes document volume — last-active dates always reflect true history)
              </span>
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

          {actionError && (
            <div className="mb-4 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>
            </div>
          )}

          <div className={cardClasses}>
            {loading && <p className="text-slate-500 dark:text-slate-400 text-center py-12">Loading…</p>}

            {!loading && error && (
              <div className="py-10 px-6">
                <div className="max-w-lg mx-auto rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-4">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">Could not load the user directory</p>
                  <p className="text-sm text-red-600 dark:text-red-400/90 mt-1">{error}</p>
                  <button onClick={() => load(page)} className={`${primaryButtonClasses} mt-3`}>
                    Retry
                  </button>
                </div>
              </div>
            )}

            {!loading && !error && rows.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-12">No users match these filters.</p>
            )}

            {!loading && !error && rows.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">User</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Tenant</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Role</th>
                        <th
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap cursor-pointer"
                          onClick={() => setSortBy('lastActiveAt')}
                        >
                          Last Active {sortBy === 'lastActiveAt' && '↓'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Avg Time in App</th>
                        <th
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap cursor-pointer"
                          onClick={() => setSortBy('documentsProcessed')}
                        >
                          Docs Processed {sortBy === 'documentsProcessed' && '↓'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {rows.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => router.push(`/admin/users/${row.id}`)}
                          className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200 cursor-pointer"
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-[10px] font-semibold flex items-center justify-center shrink-0">
                                {initials(row.email)}
                              </span>
                              <span className="text-sm text-slate-900 dark:text-white">{row.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {row.tenantBusinessName}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.role}</td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {formatRelativeTime(row.lastActiveAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {formatMinutes(row.avgSessionDurationMinutes)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {row.documentsProcessedTotal}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <UserStatusBadge status={row.status} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={(e) => toggleStatus(row, e)}
                              className="text-xs font-medium text-accent hover:opacity-80 transition-opacity duration-200"
                            >
                              {row.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                            </button>
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
