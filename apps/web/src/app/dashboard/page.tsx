'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { documentsApi, tenantApi, getAuthToken, Document } from '@/lib/api-client';
import { StatusBadge } from '@/components/StatusBadge';
import { AppSidebar } from '@/components/AppSidebar';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches the backend's configured limit
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

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

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const IN_PROGRESS_STATUSES: Document['status'][] = ['UPLOADED', 'PROCESSING', 'EXTRACTED'];

type StatusBucket = { label: string; count: number; barClass: string };

function statusBuckets(documents: Document[]): StatusBucket[] {
  return [
    {
      label: 'In progress',
      count: documents.filter((d) => IN_PROGRESS_STATUSES.includes(d.status)).length,
      barClass: 'bg-blue-500',
    },
    {
      label: 'Review',
      count: documents.filter((d) => d.status === 'REVIEW_REQUIRED').length,
      barClass: 'bg-amber-500',
    },
    {
      label: 'Approved',
      count: documents.filter((d) => d.status === 'APPROVED').length,
      barClass: 'bg-emerald-500',
    },
    {
      label: 'Rejected',
      count: documents.filter((d) => d.status === 'REJECTED').length,
      barClass: 'bg-red-500',
    },
  ];
}

function StatusChart({ documents }: { documents: Document[] }) {
  const buckets = statusBuckets(documents);
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">Documents by Status</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-6">Current snapshot across all uploads</p>
      <div className="flex items-end justify-between gap-3 h-40 flex-1">
        {buckets.map((b) => (
          <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{b.count}</span>
            <div
              className={`w-full rounded-t-lg ${b.barClass} transition-all duration-300`}
              style={{ height: `${Math.max(6, (b.count / max) * 100)}%` }}
            />
            <span className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-tight">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type StatTileProps = {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  featured?: boolean;
  tone?: 'blue' | 'amber' | 'emerald' | 'red';
  onClick?: () => void;
};

const TONE_CLASSES: Record<NonNullable<StatTileProps['tone']>, string> = {
  blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  red: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
};

function StatTile({ label, value, hint, icon, featured, tone = 'blue', onClick }: StatTileProps) {
  if (featured) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-2xl bg-accent-dark p-4 flex flex-col justify-between text-white shadow-sm text-left w-full hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
      >
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-white/80">{label}</p>
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20">{icon}</span>
        </div>
        <div>
          <p className="text-2xl font-bold mt-2">{value}</p>
          <p className="text-xs text-white/70 mt-1">{hint}</p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardClasses} p-4 flex flex-col justify-between text-left w-full hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${TONE_CLASSES[tone]}`}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{value}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{hint}</p>
      </div>
    </button>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const recentDocumentsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  const loadDocuments = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const docs = await documentsApi.list();
      setDocuments(docs);
    } catch {
      setListError('Could not load your documents. Check your connection and try again.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth) {
      loadDocuments();
      tenantApi.get().then((t) => setBusinessName(t.businessName)).catch(() => {});
    }
  }, [checkedAuth, loadDocuments]);

  const uploadFile = async (file: File) => {
    setUploadSuccess(null);
    setUploadError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Unsupported file type. Please upload a PNG, JPG, or PDF.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`File is too large (${formatBytes(file.size)}). Maximum size is 10MB.`);
      return;
    }

    setUploading(true);
    try {
      const uploaded = await documentsApi.upload(file);
      setDocuments((prev) => [uploaded, ...prev]);
      setUploadSuccess(`${file.name} uploaded successfully. It's being processed — check the Extracted Data page shortly.`);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const filteredDocuments = useMemo(
    () =>
      documents.filter((d) => {
        const matchesSearch = d.filename.toLowerCase().includes(search.toLowerCase());
        const matchesStatus =
          statusFilter === 'ALL' ||
          (statusFilter === 'PENDING' && (d.status === 'PROCESSING' || d.status === 'REVIEW_REQUIRED')) ||
          (statusFilter === 'APPROVED' && d.status === 'APPROVED') ||
          (statusFilter === 'REJECTED' && d.status === 'REJECTED');
        return matchesSearch && matchesStatus;
      }),
    [documents, search, statusFilter]
  );

  const filterAndScrollToDocuments = (filter: typeof statusFilter) => {
    setStatusFilter(filter);
    recentDocumentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!checkedAuth) {
    return null;
  }

  const now = new Date();
  const documentsThisMonth = documents.filter((d) => {
    const created = new Date(d.createdAt);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const pendingCount = documents.filter(
    (d) => d.status === 'PROCESSING' || d.status === 'REVIEW_REQUIRED'
  ).length;
  const approvedCount = documents.filter((d) => d.status === 'APPROVED').length;
  const rejectedCount = documents.filter((d) => d.status === 'REJECTED').length;

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 lg:pl-64">
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {greetingForHour(now.getHours())}
              {businessName ? `, ${businessName}` : ''}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Stay on top of your documents, monitor processing, and track status.
            </p>
          </div>

          {/* Top bento row: upload / KPI tiles / status chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Upload card */}
            <div className={`${cardClasses} p-6 flex flex-col`}>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Upload Receipt or Invoice</h2>

              {uploadError && (
                <div
                  role="alert"
                  className="mb-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs px-3 py-2"
                >
                  {uploadError}
                </div>
              )}
              {uploadSuccess && (
                <div
                  role="status"
                  className="mb-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs px-3 py-2"
                >
                  {uploadSuccess}
                </div>
              )}

              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`relative flex-1 border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200 flex items-center justify-center ${
                  dragActive
                    ? 'border-accent bg-orange-50/50 dark:bg-accent/5'
                    : 'border-slate-200 dark:border-white/10 hover:border-accent/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept="image/png,image/jpeg,.pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                <label htmlFor="file-upload" className="cursor-pointer inline-flex flex-col items-center">
                  {uploading ? (
                    <svg className="w-9 h-9 text-accent mb-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-accent-dark mb-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </span>
                  )}
                  <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                    {uploading ? 'Uploading…' : 'Drag & drop or click to upload'}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 mt-1">PNG, JPG, PDF up to 10MB</span>
                  {!uploading && <span className={`${primaryButtonClasses} mt-4`}>Choose File</span>}
                </label>
              </div>
            </div>

            {/* 2x2 KPI bento */}
            <div className="grid grid-cols-2 gap-4">
              <StatTile
                featured
                label="Total Documents"
                value={documents.length}
                hint={`${documentsThisMonth} uploaded this month`}
                onClick={() => router.push('/documents')}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
              <StatTile
                tone="blue"
                label="Processing Data"
                value={pendingCount}
                hint="Processing or needs attention"
                onClick={() => filterAndScrollToDocuments('PENDING')}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <StatTile
                tone="emerald"
                label="Review and Approve"
                value={approvedCount}
                hint="Ready for your books"
                onClick={() => filterAndScrollToDocuments('APPROVED')}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <StatTile
                tone="red"
                label="Rejected"
                value={rejectedCount}
                hint="Needs correction"
                onClick={() => filterAndScrollToDocuments('REJECTED')}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </div>

            {/* Status chart */}
            <div className={`${cardClasses} p-6`}>
              <StatusChart documents={documents} />
            </div>
          </div>

          {/* Recent Documents */}
          <div ref={recentDocumentsRef} className={`${cardClasses} p-6 scroll-mt-6`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Recent Documents</h2>
                {statusFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('ALL')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors duration-200"
                  >
                    {statusFilter === 'PENDING' ? 'Processing Data' : statusFilter === 'APPROVED' ? 'Review and Approve' : 'Rejected'}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search documents…"
                    className="pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-accent transition-colors duration-200 w-48"
                  />
                </div>
                {!loadingList && !listError && (
                  <button
                    onClick={loadDocuments}
                    className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-200"
                  >
                    Refresh
                  </button>
                )}
              </div>
            </div>

            {loadingList && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">Loading documents…</p>
            )}

            {!loadingList && listError && (
              <div className="text-center py-8">
                <p className="text-red-600 dark:text-red-400 mb-3">{listError}</p>
                <button onClick={loadDocuments} className={primaryButtonClasses}>
                  Retry
                </button>
              </div>
            )}

            {!loadingList && !listError && documents.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">No documents yet. Upload your first receipt!</p>
            )}

            {!loadingList && !listError && documents.length > 0 && filteredDocuments.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                {search ? <>No documents match &ldquo;{search}&rdquo;.</> : 'No documents match this filter.'}
              </p>
            )}

            {!loadingList && !listError && filteredDocuments.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
                  <thead>
                    <tr>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Document</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Size</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Status</th>
                      <th className="px-2 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {filteredDocuments.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200">
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {fileTypeIcon(doc.contentType)}
                            <span className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[240px]">{doc.filename}</span>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatBytes(doc.sizeBytes)}</td>
                        <td className="px-2 py-3 whitespace-nowrap"><StatusBadge status={doc.status} /></td>
                        <td className="px-2 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(doc.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
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
