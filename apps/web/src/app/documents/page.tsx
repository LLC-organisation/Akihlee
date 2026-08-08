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

export default function DocumentsPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (!checkedAuth) return null;

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 lg:pl-64">
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Documents</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Every receipt and invoice captured so far, from upload, email, WhatsApp, or Square.
              Click one to review and approve it.
            </p>
          </div>

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
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Document</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Uploaded</th>
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
