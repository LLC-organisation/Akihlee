'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { documentsApi, getAuthToken, Document } from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { StatusBadge } from '@/components/StatusBadge';
import { SourceBadge } from '@/components/SourceBadge';

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none transition-all duration-200';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-canvas text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeIcon(contentType: string) {
  if (contentType === 'application/pdf') {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold shrink-0">
        PDF
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold shrink-0">
      IMG
    </span>
  );
}

function TrashIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

export default function DocumentsPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    try {
      const docs = await documentsApi.list();
      setDocuments(docs);
    } catch {
      setError('Could not load your documents. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth) load();
  }, [checkedAuth, load]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await documentsApi.delete(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      setDeleteError('Could not delete the document. Please try again.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (!checkedAuth) return null;

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 lg:pl-20">
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Documents</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Every receipt and invoice captured so far, from upload, email, WhatsApp, or Square.
              Click one to review and approve it.
            </p>
          </div>

          {deleteError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-sm text-red-600 dark:text-red-400">
              {deleteError}
            </div>
          )}

          <div className={cardClasses}>
            {loading && <p className="text-slate-500 dark:text-slate-400 text-center py-12">Loading…</p>}

            {!loading && error && (
              <div className="text-center py-12">
                <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
                <button onClick={load} className={primaryButtonClasses}>
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && documents.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-12">
                No documents yet. Upload your first receipt from the Dashboard.
              </p>
            )}

            {!loading && !error && documents.length > 0 && (
              <>
                {/* Below `lg` (tablet/phone — the same breakpoint where
                    AppSidebar switches to its mobile layout) a 5-column
                    table can't fit without horizontal scroll, so this
                    renders a stacked card per document instead. The table
                    below covers `lg` and up, where it fits without scrolling. */}
                <div className="lg:hidden divide-y divide-slate-100 dark:divide-white/5">
                  {documents.map((doc) => {
                    const href = `/documents/${doc.id}` as Route;
                    return (
                      <div key={doc.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <Link href={href} className="flex items-center gap-3 min-w-0 flex-1">
                            {fileTypeIcon(doc.contentType)}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                {doc.filename}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {new Date(doc.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </Link>
                          {confirmDeleteId !== doc.id && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(doc.id)}
                              aria-label={`Delete ${doc.filename}`}
                              className="shrink-0 p-2 -m-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-200"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center flex-wrap gap-2 mt-3 pl-12">
                          <SourceBadge source={doc.source} />
                          <StatusBadge status={doc.status} />
                        </div>

                        {confirmDeleteId === doc.id && (
                          <div className="flex items-center gap-3 mt-3 pl-12">
                            <span className="text-xs text-slate-500 dark:text-slate-400">Delete this document?</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc.id)}
                              disabled={deletingId === doc.id}
                              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {deletingId === doc.id ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === doc.id}
                              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:pointer-events-none"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <table className="hidden lg:table min-w-full divide-y divide-slate-200 dark:divide-white/10">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Document</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Uploaded</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {documents.map((doc) => {
                      // Link goes inside each <td> (not wrapping the whole
                      // <tr>) to keep valid table markup — an <a> can't span
                      // multiple <td>s. Hover styling still applies to the
                      // whole row via the <tr>'s own class.
                      //
                      // A `{ pathname: '/documents/[id]', query }` href
                      // looks right for a typedRoutes dynamic segment but
                      // actually throws at runtime in the App Router
                      // ("Dynamic href ... found in <Link>, this is not
                      // supported") — a plain templated path string is the
                      // correct form here.
                      const href = `/documents/${doc.id}` as Route;
                      return (
                        <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200">
                          <td className="p-0">
                            <Link href={href} className="flex items-center gap-3 min-w-0 px-4 py-3">
                              {fileTypeIcon(doc.contentType)}
                              <span className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[240px]">
                                {doc.filename}
                              </span>
                            </Link>
                          </td>
                          <td className="p-0">
                            <Link href={href} className="block px-4 py-3">
                              <SourceBadge source={doc.source} />
                            </Link>
                          </td>
                          <td className="p-0">
                            <Link href={href} className="block px-4 py-3">
                              <StatusBadge status={doc.status} />
                            </Link>
                          </td>
                          <td className="p-0">
                            <Link href={href} className="block px-4 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {new Date(doc.createdAt).toLocaleString()}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {confirmDeleteId === doc.id ? (
                              <div className="flex items-center justify-end gap-3">
                                <span className="text-xs text-slate-500 dark:text-slate-400">Delete?</span>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(doc.id)}
                                  disabled={deletingId === doc.id}
                                  className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 disabled:pointer-events-none"
                                >
                                  {deletingId === doc.id ? 'Deleting…' : 'Confirm'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  disabled={deletingId === doc.id}
                                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline disabled:opacity-50 disabled:pointer-events-none"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(doc.id)}
                                aria-label={`Delete ${doc.filename}`}
                                className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-200"
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
