import { ExtractedData } from '@/lib/api-client';

// Deliberately blue/purple/cyan rather than the amber/emerald/red used for
// review status elsewhere on this page — these hues read as "category", not
// "severity", so they don't get confused with the needs-review highlighting.
const STYLES: Record<ExtractedData['documentType'], string> = {
  RECEIPT: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
  INVOICE: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400',
  BANK_STATEMENT: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
};

const LABELS: Record<ExtractedData['documentType'], string> = {
  RECEIPT: 'Receipt',
  INVOICE: 'Invoice',
  BANK_STATEMENT: 'Bank Statement',
};

export function DocumentTypeBadge({ documentType }: { documentType: ExtractedData['documentType'] }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STYLES[documentType]}`}>
      {LABELS[documentType]}
    </span>
  );
}
