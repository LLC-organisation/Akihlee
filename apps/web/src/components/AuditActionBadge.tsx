// Mirrors AuditAction.java's constants (kept as plain strings, not a
// shared enum, so new actions on the backend don't require a frontend
// build to become filterable/badge-able — see the audit log page).
const SUCCESS_ACTIONS = new Set([
  'LOGIN_SUCCESS',
  'REGISTER',
  'WHATSAPP_NUMBER_CONNECTED',
  'SQUARE_CONNECTED',
  'DOCUMENT_APPROVED',
]);

const ALERT_ACTIONS = new Set([
  'LOGIN_FAILURE',
  'PASSWORD_CHANGE_FAILURE',
  'DOCUMENT_REJECTED',
  'DOCUMENT_DELETED',
  'WHATSAPP_NUMBER_DISCONNECTED',
  'SQUARE_DISCONNECTED',
]);

const DATA_OP_ACTIONS = new Set([
  'DOCUMENT_UPLOAD',
  'DOCUMENT_STATUS_CHANGE',
  'DOCUMENT_IMPORTED',
  'EXTRACTED_DATA_EDITED',
  'BANK_TRANSACTION_EDITED',
]);

type Variant = 'success' | 'alert' | 'data' | 'neutral';

function variantFor(action: string): Variant {
  if (SUCCESS_ACTIONS.has(action)) return 'success';
  if (ALERT_ACTIONS.has(action)) return 'alert';
  if (DATA_OP_ACTIONS.has(action)) return 'data';
  return 'neutral';
}

const VARIANT_CLASSES: Record<Variant, string> = {
  success: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  alert: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
  data: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
  neutral: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
};

export function AuditActionBadge({ action }: { action: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${VARIANT_CLASSES[variantFor(action)]}`}
    >
      {action}
    </span>
  );
}
