'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  adminUsersApi,
  getAuthToken,
  getCurrentUserRole,
  UserDetail,
  AuditLogEntry,
} from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { AuditActionBadge } from '@/components/AuditActionBadge';
import { AuditDetailDrawer } from '@/components/AuditDetailDrawer';
import { UserStatusBadge } from '@/components/UserStatusBadge';
import { formatRelativeTime, formatMinutes } from '@/lib/utils/time';

const PAGE_SIZE = 20;

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none transition-all duration-200';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-canvas text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';

function initials(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return chars.toUpperCase();
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={`${cardClasses} p-4`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-xl font-bold mt-1.5 text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function WeeklyTrendChart({ data }: { data: UserDetail['weeklyActivityTrend'] }) {
  const max = Math.max(1, ...data.map((d) => d.eventCount));
  if (data.every((d) => d.eventCount === 0)) {
    return <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">No activity in the last 12 weeks.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-2 h-40 min-w-max px-1">
        {data.map((point) => (
          <div key={point.weekStart} className="flex flex-col items-center justify-end h-full gap-1.5 w-9 shrink-0">
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
              {point.eventCount > 0 ? point.eventCount : ''}
            </span>
            <div
              className="w-full rounded-t-md bg-accent-gradient transition-all duration-300"
              style={{ height: `${Math.max(2, (point.eventCount / max) * 100)}%` }}
            />
            <span className="text-[9px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
              {point.weekStart.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentActivityBreakdown({ activity }: { activity: UserDetail['documentActivity'] }) {
  const rows: { label: string; value: number; colorClass: string }[] = [
    { label: 'Uploaded', value: activity.uploaded, colorClass: 'bg-blue-500' },
    { label: 'Approved', value: activity.approved, colorClass: 'bg-emerald-500' },
    { label: 'Rejected', value: activity.rejected, colorClass: 'bg-red-500' },
    { label: 'Corrected', value: activity.corrected, colorClass: 'bg-amber-500' },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-600 dark:text-slate-300">{row.label}</span>
            <span className="font-medium text-slate-900 dark:text-white">{row.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full ${row.colorClass} transition-all duration-300`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminUserProfilePage({ params }: { params: { userId: string } }) {
  const router = useRouter();
  const userId = params.userId;

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const [activityRows, setActivityRows] = useState<AuditLogEntry[]>([]);
  const [activityPage, setActivityPage] = useState(0);
  const [activityTotalPages, setActivityTotalPages] = useState(0);
  const [activityLoading, setActivityLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

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

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await adminUsersApi.detail(userId);
      setDetail(result);
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err && (err as { response?: { status?: number } }).response?.status === 404) {
        setNotFound(true);
      } else {
        setError('Could not load this user’s profile. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadActivity = useCallback(
    async (pageToLoad: number) => {
      setActivityLoading(true);
      try {
        const result = await adminUsersApi.activity(userId, pageToLoad, PAGE_SIZE);
        setActivityRows(result.content);
        setActivityTotalPages(result.totalPages);
        setActivityPage(result.number);
      } catch {
        // Non-fatal — the profile header/cards above still render fine without the timeline.
      } finally {
        setActivityLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (checkedAuth) {
      loadDetail();
      loadActivity(0);
    }
  }, [checkedAuth, loadDetail, loadActivity]);

  const toggleStatus = async () => {
    if (!detail) return;
    setStatusUpdating(true);
    try {
      const updated = await adminUsersApi.updateStatus(detail.id, detail.status === 'SUSPENDED');
      setDetail(updated);
    } catch {
      setError('Could not update this account’s status.');
    } finally {
      setStatusUpdating(false);
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
        <main className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-200 mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            User Directory
          </Link>

          {loading && <p className="text-slate-500 dark:text-slate-400 text-center py-16">Loading…</p>}

          {!loading && notFound && (
            <div className={`${cardClasses} p-10 text-center`}>
              <p className="text-slate-500 dark:text-slate-400">No user found with this id.</p>
            </div>
          )}

          {!loading && error && !notFound && (
            <div className={`${cardClasses} p-6 max-w-lg`}>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Something went wrong</p>
              <p className="text-sm text-red-600 dark:text-red-400/90 mt-1">{error}</p>
              <button onClick={loadDetail} className={`${primaryButtonClasses} mt-3`}>
                Retry
              </button>
            </div>
          )}

          {!loading && detail && (
            <div className="space-y-6">
              {/* Profile header */}
              <div className={`${cardClasses} p-6`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <span className="w-14 h-14 rounded-full bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-lg font-semibold flex items-center justify-center shrink-0">
                      {initials(detail.email)}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{detail.email}</h1>
                        <UserStatusBadge status={detail.status} />
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {detail.tenantBusinessName} &middot; {detail.role}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Registered {new Date(detail.registeredAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                    <Link
                      href={`/admin/audit-log?actorEmail=${encodeURIComponent(detail.email)}`}
                      className="text-sm font-medium text-accent hover:opacity-80 transition-opacity duration-200"
                    >
                      View in Audit Log →
                    </Link>
                    <button
                      onClick={toggleStatus}
                      disabled={statusUpdating}
                      className="text-sm font-medium rounded-lg px-3 py-1.5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200 disabled:opacity-50"
                    >
                      {detail.status === 'SUSPENDED' ? 'Reactivate account' : 'Suspend account'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-white/5">
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Last known IP</p>
                    <p className="text-sm text-slate-900 dark:text-white mt-0.5">{detail.lastKnownIp ?? '—'}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 italic mt-0.5">No geolocation lookup configured</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Last device / user agent</p>
                    <p className="text-sm text-slate-900 dark:text-white mt-0.5 truncate" title={detail.lastKnownUserAgent ?? undefined}>
                      {detail.lastKnownUserAgent ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Last login</p>
                    <p className="text-sm text-slate-900 dark:text-white mt-0.5">{formatRelativeTime(detail.lastLoginAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Last active</p>
                    <p className="text-sm text-slate-900 dark:text-white mt-0.5">{formatRelativeTime(detail.lastActiveAt)}</p>
                  </div>
                </div>
              </div>

              {/* Engagement analytics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile label="Total Sessions" value={detail.totalSessions} />
                <StatTile label="Avg Time in App" value={formatMinutes(detail.avgSessionDurationMinutes)} />
                <StatTile label="Documents Uploaded" value={detail.documentActivity.uploaded} />
                <StatTile
                  label="Documents Processed"
                  value={detail.documentActivity.uploaded + detail.documentActivity.approved + detail.documentActivity.rejected}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={`${cardClasses} p-5`}>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Weekly active usage (12 weeks)</h2>
                  <WeeklyTrendChart data={detail.weeklyActivityTrend} />
                </div>
                <div className={`${cardClasses} p-5`}>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Document activity breakdown</h2>
                  <DocumentActivityBreakdown activity={detail.documentActivity} />
                </div>
              </div>

              {/* Activity timeline */}
              <div className={cardClasses}>
                <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Activity timeline</h2>
                  <Link
                    href={`/admin/audit-log?actorEmail=${encodeURIComponent(detail.email)}`}
                    className="text-xs font-medium text-accent hover:opacity-80 transition-opacity duration-200"
                  >
                    View in Audit Log →
                  </Link>
                </div>

                {activityLoading && <p className="text-slate-400 dark:text-slate-500 text-center py-10 text-sm">Loading…</p>}

                {!activityLoading && activityRows.length === 0 && (
                  <p className="text-slate-400 dark:text-slate-500 text-center py-10 text-sm">No recorded activity for this user.</p>
                )}

                {!activityLoading && activityRows.length > 0 && (
                  <>
                    <ul className="divide-y divide-slate-100 dark:divide-white/5">
                      {activityRows.map((entry) => (
                        <li
                          key={entry.id}
                          onClick={() => setSelectedEntry(entry)}
                          className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200 cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <AuditActionBadge action={entry.action} />
                            <span className="text-sm text-slate-500 dark:text-slate-400 truncate">
                              {entry.entityType ? `${entry.entityType} ${entry.entityId ?? ''}`.trim() : entry.detail ?? ''}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-white/10">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Page {activityPage + 1} of {activityTotalPages}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadActivity(activityPage - 1)}
                          disabled={activityPage === 0}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-white/5 disabled:hover:bg-transparent transition-colors duration-200"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => loadActivity(activityPage + 1)}
                          disabled={activityPage + 1 >= activityTotalPages}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-white/5 disabled:hover:bg-transparent transition-colors duration-200"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {selectedEntry && <AuditDetailDrawer entry={selectedEntry} onClose={() => setSelectedEntry(null)} />}
    </div>
  );
}
