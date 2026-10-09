import { parseDirectusDate } from '../../utils/date.util';

export { parseDirectusDate };

/**
 * Formats a date into a human-readable relative time string (e.g. "2m ago", "Just now").
 */
export function formatRelativeTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return 'Never';
  const date = parseDirectusDate(dateInput);
  if (!date || isNaN(date.getTime())) return 'Never';

  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Formats millisecond duration into a clean string (e.g. "450ms", "1.2s").
 */
export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
