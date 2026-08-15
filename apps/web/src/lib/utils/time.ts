/** "3 hours ago" / "2 days ago" — falls back to a locale date string past ~30 days. */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

/** null means "not enough ping data yet" (see UserActivityService) — never render that as "0m". */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return 'Not enough data';
  if (minutes < 1) return '<1m';
  const wholeMinutes = Math.round(minutes);
  if (wholeMinutes < 60) return `${wholeMinutes}m`;
  const hours = Math.floor(wholeMinutes / 60);
  const remMinutes = wholeMinutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}
