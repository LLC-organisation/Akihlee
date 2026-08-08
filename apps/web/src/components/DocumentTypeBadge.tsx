import { ExtractedData } from '@/lib/api-client';

// Neutral slate styling, same rationale as SourceBadge — this is a
// classification label, not a status that needs color coding.
const LABELS: Record<ExtractedData['documentType'], string> = {
  RECEIPT: 'Receipt',
  INVOICE: 'Invoice',
  BANK_STATEMENT: 'Bank Statement',
};

export function DocumentTypeBadge({ documentType }: { documentType: ExtractedData['documentType'] }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
      {LABELS[documentType]}
    </span>
  );
}
