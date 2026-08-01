'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { documentsApi, getAuthToken, Document } from '@/lib/api-client';
import { StatusBadge } from '@/components/StatusBadge';
import { AppHeader } from '@/components/AppHeader';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches the backend's configured limit
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none transition-all duration-200';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';

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

type KpiCardProps = {
  label: string;
  value: number;
  tone: 'blue' | 'amber' | 'emerald';
  icon: React.ReactNode;
  hint: string;
};

const TONE_CLASSES: Record<KpiCardProps['tone'], string> = {
  blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

function KpiCard({ label, value, tone, icon, hint }: KpiCardProps) {
  return (
    <div className={`${cardClasses} p-6 hover:-translate-y-0.5 hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
        </div>
        <span className={`flex items-center justify-center w-11 h-11 rounded-xl ${TONE_CLASSES[tone]}`}>
          {icon}
        </span>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">{hint}</p>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

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

  if (!checkedAuth) {
    return null;
  }

  const pendingCount = documents.filter(
    (d) => d.status === 'PROCESSING' || d.status === 'REVIEW_REQUIRED'
  ).length;
  const approvedCount = documents.filter((d) => d.status === 'APPROVED').length;

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <div className="relative z-10">
        <AppHeader />

        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {/* KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <KpiCard
              label="Total Documents"
              value={documents.length}
              tone="blue"
              hint="All-time uploads"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            />
            <KpiCard
              label="Pending Review"
              value={pendingCount}
              tone="amber"
              hint="Processing or needs attention"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <KpiCard
              label="Approved"
              value={approvedCount}
              tone="emerald"
              hint="Ready for your books"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>

          {/* Upload Section */}
          <div className={`${cardClasses} p-8 mb-8`}>
            <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">Upload Receipt or Invoice</h2>

            {uploadError && (
              <div
                role="alert"
                className="mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300 text-sm px-4 py-3"
              >
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div
                role="status"
                className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-sm px-4 py-3"
              >
                {uploadSuccess}
              </div>
            )}

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 ${
                dragActive
                  ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/5 shadow-md shadow-blue-500/10'
                  : 'border-slate-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/30'
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
              <label
                htmlFor="file-upload"
                className="cursor-pointer inline-flex flex-col items-center"
              >
                {uploading ? (
                  <svg className="w-10 h-10 text-blue-500 mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                ) : (
                  <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-gradient mb-4 shadow-md shadow-blue-500/20">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </span>
                )}
                <span className="text-slate-700 dark:text-slate-200 font-medium">
                  {uploading ? 'Uploading…' : 'Drag & drop or click to upload'}
                </span>
                <span className="text-sm text-slate-400 dark:text-slate-500 mt-1">PNG, JPG, PDF up to 10MB</span>
                {!uploading && (
                  <span className={`${primaryButtonClasses} mt-5`}>Choose File</span>
                )}
              </label>
            </div>
          </div>

          {/* Recent Documents */}
          <div className={`${cardClasses} p-8`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Recent Documents</h2>
              {!loadingList && !listError && (
                <button
                  onClick={loadDocuments}
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  Refresh
                </button>
              )}
            </div>

            {loadingList && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">Loading documents…</p>
            )}

            {!loadingList && listError && (
              <div className="text-center py-8">
                <p className="text-red-800 dark:text-red-300 mb-3">{listError}</p>
                <button onClick={loadDocuments} className={primaryButtonClasses}>
                  Retry
                </button>
              </div>
            )}

            {!loadingList && !listError && documents.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">No documents yet. Upload your first receipt!</p>
            )}

            {!loadingList && !listError && documents.length > 0 && (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="py-4 flex items-center justify-between gap-4 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors duration-200 px-2 -mx-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {fileTypeIcon(doc.contentType)}
                      <div className="min-w-0">
                        <p className="text-slate-900 dark:text-white font-medium truncate">{doc.filename}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {formatBytes(doc.sizeBytes)} &middot;{' '}
                          {new Date(doc.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={doc.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
