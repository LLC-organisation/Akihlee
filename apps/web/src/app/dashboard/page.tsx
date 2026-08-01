'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { documentsApi, getAuthToken, Document } from '@/lib/api-client';
import { StatusBadge } from '@/components/StatusBadge';
import { AppHeader } from '@/components/AppHeader';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB, matches the backend's configured limit
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  // Route protection: bounce unauthenticated visitors to /login rather than
  // showing a dashboard that will just 401 on every request.
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadSuccess(null);
    setUploadError(null);

    // Error prevention: validate before spending a round trip on something
    // the backend will reject anyway.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Unsupported file type. Please upload a PNG, JPG, or PDF.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`File is too large (${formatBytes(file.size)}). Maximum size is 10MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  if (!checkedAuth) {
    return null;
  }

  const pendingCount = documents.filter(
    (d) => d.status === 'PROCESSING' || d.status === 'REVIEW_REQUIRED'
  ).length;
  const approvedCount = documents.filter((d) => d.status === 'APPROVED').length;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-lg border border-primary-100 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Documents</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{documents.length}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-lg border border-primary-100 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">Pending Review</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{pendingCount}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-lg border border-primary-100 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">Approved</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{approvedCount}</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-slate-50 dark:bg-slate-800 p-8 rounded-lg border border-primary-100 dark:border-slate-700 mb-8">
          <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">Upload Receipt or Invoice</h2>

          {uploadError && (
            <div
              role="alert"
              className="mb-4 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm px-4 py-3"
            >
              {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div
              role="status"
              className="mb-4 rounded-md bg-primary-50 dark:bg-slate-800 border border-primary-200 dark:border-primary-700 text-primary-800 dark:text-primary-300 text-sm px-4 py-3"
            >
              {uploadSuccess}
            </div>
          )}

          <div className="border-2 border-dashed border-primary-200 dark:border-slate-600 rounded-lg p-12 text-center">
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
                <svg
                  className="w-12 h-12 text-primary-600 mb-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-12 h-12 text-primary-400 mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              )}
              <span className="text-slate-700 dark:text-slate-300">
                {uploading ? 'Uploading…' : 'Click to upload or drag and drop'}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400 mt-2">PNG, JPG, PDF up to 10MB</span>
            </label>
          </div>
        </div>

        {/* Recent Documents */}
        <div className="bg-slate-50 dark:bg-slate-800 p-8 rounded-lg border border-primary-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Recent Documents</h2>
            {!loadingList && !listError && (
              <button
                onClick={loadDocuments}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
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
              <button
                onClick={loadDocuments}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-md"
              >
                Retry
              </button>
            </div>
          )}

          {!loadingList && !listError && documents.length === 0 && (
            <p className="text-slate-500 dark:text-slate-400 text-center py-8">No documents yet. Upload your first receipt!</p>
          )}

          {!loadingList && !listError && documents.length > 0 && (
            <ul className="divide-y divide-primary-50 dark:divide-slate-700">
              {documents.map((doc) => (
                <li key={doc.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-slate-900 dark:text-white font-medium truncate">{doc.filename}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {formatBytes(doc.sizeBytes)} &middot;{' '}
                      {new Date(doc.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={doc.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
