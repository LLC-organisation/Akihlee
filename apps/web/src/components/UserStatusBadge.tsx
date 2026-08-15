import { UserAccountStatus } from '@/lib/api-client';

const VARIANT_CLASSES: Record<UserAccountStatus, string> = {
  ACTIVE: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  IDLE: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  AT_RISK: 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400',
  SUSPENDED: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

const LABELS: Record<UserAccountStatus, string> = {
  ACTIVE: 'Active',
  IDLE: 'Idle',
  AT_RISK: 'At-Risk',
  SUSPENDED: 'Suspended',
};

export function UserStatusBadge({ status }: { status: UserAccountStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${VARIANT_CLASSES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
