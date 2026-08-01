import { Document } from '@/lib/api-client';

// Semantic status colors: blue = neutral/in-flight, amber = needs attention,
// emerald = success, red = problem. Text differs per label too, so meaning
// never depends on color alone.
const STYLES: Record<Document['status'], string> = {
  UPLOADED: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
  PROCESSING: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  EXTRACTED: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
  REVIEW_REQUIRED: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

const LABELS: Record<Document['status'], string> = {
  UPLOADED: 'Uploaded',
  PROCESSING: 'Processing',
  EXTRACTED: 'Extracted',
  REVIEW_REQUIRED: 'Review required',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export function StatusBadge({ status }: { status: Document['status'] }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
