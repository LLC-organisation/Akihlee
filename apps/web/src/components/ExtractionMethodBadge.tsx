import { ExtractedData } from '@/lib/api-client';

// Vision (Claude) results generally deserve more trust than the regex/Tesseract
// fallback, so this leans on the same green/amber vocabulary used for
// confidence elsewhere rather than the neutral category colors in
// DocumentTypeBadge.
const STYLES: Record<string, string> = {
  vision: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  regex: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  unknown: 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400',
};

const LABELS: Record<string, string> = {
  vision: 'Extracted via Claude',
  regex: 'Extracted via OCR',
  unknown: 'Extraction method unknown',
};

export function ExtractionMethodBadge({ extractionMethod }: { extractionMethod: ExtractedData['extractionMethod'] }) {
  const key = extractionMethod ?? 'unknown';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STYLES[key]}`}>
      {LABELS[key]}
    </span>
  );
}
