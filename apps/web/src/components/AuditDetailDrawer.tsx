'use client';

import { useEffect, useState } from 'react';
import { AuditLogEntry } from '@/lib/api-client';
import { AuditActionBadge } from '@/components/AuditActionBadge';

const EDIT_ACTIONS = new Set(['EXTRACTED_DATA_EDITED', 'BANK_TRANSACTION_EDITED', 'DOCUMENT_STATUS_CHANGE']);

function fieldClasses() {
  return 'text-sm text-slate-900 dark:text-white break-words';
}

function labelClasses() {
  return 'text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={labelClasses()}>{label}</p>
      <div className={`${fieldClasses()} mt-1`}>{children}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-slate-400 dark:text-slate-500 italic">{children}</span>;
}

/**
 * Pretty-prints `detail` as JSON when it parses as one (most write-side
 * calls pass toJson(request) — see AuditLogService.log callers), otherwise
 * falls back to showing it as plain text. There's no separate "previous
 * value" captured anywhere in the schema today — callers only log the new
 * state — so this deliberately doesn't fabricate a diff.
 */
function DetailPayload({ entry }: { entry: AuditLogEntry }) {
  if (!entry.detail) {
    return <Muted>No payload recorded for this event.</Muted>;
  }
  let pretty: string | null = null;
  try {
    pretty = JSON.stringify(JSON.parse(entry.detail), null, 2);
  } catch {
    pretty = null;
  }

  if (pretty === null) {
    return <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{entry.detail}</p>;
  }

  return (
    <div>
      <pre className="text-xs bg-slate-50 dark:bg-canvas border border-slate-200 dark:border-white/10 rounded-lg p-3 overflow-x-auto text-slate-700 dark:text-slate-300">
        {pretty}
      </pre>
      {EDIT_ACTIONS.has(entry.action) && (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-1.5">
          This shows the new value only — this event type doesn&apos;t capture a before/after diff.
        </p>
      )}
    </div>
  );
}

export function AuditDetailDrawer({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const copyEventJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative h-full w-full max-w-md flex flex-col bg-white dark:bg-surface border-l border-slate-200 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
          <div className="min-w-0">
            <AuditActionBadge action={entry.action} />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              {new Date(entry.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors duration-200 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
          <Field label="Actor">
            {entry.actorEmail ?? <Muted>system</Muted>}
            {entry.actorUserId && (
              <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">{entry.actorUserId}</span>
            )}
          </Field>

          <Field label="Tenant">
            {entry.tenantBusinessName ?? <Muted>none</Muted>}
            {entry.tenantId && (
              <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">{entry.tenantId}</span>
            )}
          </Field>

          <Field label="Resource / target">
            {entry.entityType ? (
              <>
                {entry.entityType}
                {entry.entityId && (
                  <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5 break-all">
                    {entry.entityId}
                  </span>
                )}
              </>
            ) : (
              <Muted>none</Muted>
            )}
          </Field>

          <Field label="IP address">
            {entry.ipAddress ?? <Muted>unknown</Muted>}
            <span className="block text-xs text-slate-400 dark:text-slate-500 italic mt-0.5">
              Geolocation lookup isn&apos;t configured — showing the raw address only.
            </span>
          </Field>

          <Field label="User agent">
            {entry.userAgent ?? <Muted>none recorded</Muted>}
          </Field>

          <Field label="Correlation ID">
            <Muted>Not tracked for this event — no request-correlation id is recorded yet.</Muted>
          </Field>

          <div>
            <div className="flex items-center justify-between">
              <p className={labelClasses()}>Event payload</p>
              <button
                type="button"
                onClick={copyEventJson}
                className="text-xs font-medium text-accent hover:opacity-80 transition-opacity duration-200"
              >
                {copied ? 'Copied' : 'Copy as JSON'}
              </button>
            </div>
            <div className="mt-1">
              <DetailPayload entry={entry} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
