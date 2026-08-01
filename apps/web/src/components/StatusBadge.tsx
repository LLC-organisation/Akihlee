import { Document } from '@/lib/api-client';

// Blue tones carry most states (varying intensity = progress), text differs
// per label so meaning never depends on color alone. Red is reserved
// strictly for Rejected, the one state that needs to read as a problem.
const STYLES: Record<Document['status'], string> = {
  UPLOADED: 'bg-primary-50 dark:bg-slate-800 text-primary-700 dark:text-primary-300',
  PROCESSING: 'bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300',
  EXTRACTED: 'bg-primary-600 text-white',
  REVIEW_REQUIRED: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200',
  APPROVED: 'bg-primary-700 text-white',
  REJECTED: 'bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300',
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
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
