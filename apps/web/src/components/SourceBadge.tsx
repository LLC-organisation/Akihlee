import { Document } from '@/lib/api-client';

// Neutral slate styling throughout — source is informational (which channel
// a document arrived through), not a signal that needs status-like color
// coding the way StatusBadge's states do.
const STYLES: Record<Document['source'], string> = {
  UPLOAD: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
  EMAIL: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
  WHATSAPP: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
  SQUARE: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
};

const LABELS: Record<Document['source'], string> = {
  UPLOAD: 'Uploaded',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  SQUARE: 'Square',
};

export function SourceBadge({ source }: { source: Document['source'] }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STYLES[source]}`}>
      {LABELS[source]}
    </span>
  );
}
