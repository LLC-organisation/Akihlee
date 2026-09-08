import { useEffect, useState } from 'react';
import { documentsApi, Document } from '@/lib/api-client';

const POLL_INTERVAL_MS = 2000;

/**
 * Polls a document's status/processingStage every 2s while it's still
 * PROCESSING, then stops on its own once the document reaches a terminal
 * status — lets a caller show a live "Redacting personal information..." /
 * "Extracting data..." indicator instead of a static "check back later"
 * message. Returns null until the first successful fetch.
 */
export function useDocumentProcessing(documentId: string | null): Document | null {
  const [doc, setDoc] = useState<Document | null>(null);

  useEffect(() => {
    setDoc(null);
    if (!documentId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const fetched = await documentsApi.get(documentId);
        if (cancelled) return;
        setDoc(fetched);
        // UPLOADED, not just PROCESSING — a freshly uploaded document
        // briefly sits at UPLOADED before document-worker picks it up;
        // stopping here on that first poll would leave the caller stuck
        // showing a stale "just uploaded" state instead of ever advancing.
        if (fetched.status === 'UPLOADED' || fetched.status === 'PROCESSING') {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        // Best-effort — leave the last known state in place and stop
        // polling rather than retry into a possibly-persistent error.
      }
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [documentId]);

  return doc;
}

const STAGE_LABELS: Record<string, string> = {
  REDACTING: 'Redacting personal information…',
  EXTRACTING: 'Extracting data…',
};

/** Human-readable label for a document's live processing state, or null once it's done. */
export function documentProcessingStageLabel(doc: Pick<Document, 'status' | 'processingStage'>): string | null {
  if (doc.status === 'UPLOADED') return 'Uploaded — queued for processing…';
  if (doc.status !== 'PROCESSING') return null;
  return (doc.processingStage && STAGE_LABELS[doc.processingStage]) || 'Processing…';
}
