const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Accurately parses a Directus date string, timestamp, or Date object into a UTC Date.
 * Directus `dateTime` fields (like `flow_manager_last_run_at`) are stored and returned
 * in UTC format without timezone designators (e.g. "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss").
 * Without explicit UTC parsing, browser Date parsers treat them as local time, causing severe
 * offset errors (e.g. 7h ago instead of 5m ago in UTC+7).
 */
export function parseDirectusDate(input?: string | number | Date | null): Date | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }

  const str = String(input).trim();
  if (!str) return null;

  // Check if it already has UTC indicator (Z) or timezone offset (+HH:MM or -HH:MM after time)
  const hasTimezone =
    /Z$/i.test(str) || /[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[+-]\d{2}:?\d{2})$/i.test(str);

  if (hasTimezone) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // If it is a datetime without timezone (e.g. "2026-10-09 17:25:00" or "2026-10-09T17:25:00")
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(str)) {
    const normalized = str.replace(' ', 'T') + 'Z';
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export const formatDate = (date?: Date | string | null): string => {
  if (!date) return '';
  const toDate = parseDirectusDate(date);
  if (!toDate || isNaN(toDate.getTime())) return '';
  const year = toDate.getFullYear();
  const month = (toDate.getMonth() + 1).toString().padStart(2, '0');
  const day = toDate.getDate().toString().padStart(2, '0');
  const hours = toDate.getHours().toString().padStart(2, '0');
  const minutes = toDate.getMinutes().toString().padStart(2, '0');
  const seconds = toDate.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const formatDateLong = (date?: Date | string | null): string => {
  if (!date) return '';
  const toDate = parseDirectusDate(date);
  if (!toDate || isNaN(toDate.getTime())) return '';
  const year = toDate.getFullYear();
  const month = MONTH[toDate.getMonth()];
  const day = toDate.getDate().toString().padStart(2, '0');
  const hours = toDate.getHours().toString().padStart(2, '0');
  const minutes = toDate.getMinutes().toString().padStart(2, '0');
  const seconds = toDate.getSeconds().toString().padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
};

export function getTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  const second = date.getSeconds().toString().padStart(2, '0');

  return `${year}${month}${day}${hour}${minute}${second}`;
}

/**
 * Formats a Date into a custom string, supporting both Local and UTC time.
 */
export function extendedFormatDate(
  inputDate: Date | string | number,
  format: string = 'YYYY-MM-DD HH:mm:ss',
  isUTC: boolean = true,
): string {
  const date = parseDirectusDate(inputDate);

  if (!date || isNaN(date.getTime())) {
    throw new Error('Invalid date provided');
  }

  const pad = (num: number): string => num.toString().padStart(2, '0');

  const year = isUTC ? date.getUTCFullYear() : date.getFullYear();
  const month = isUTC ? date.getUTCMonth() : date.getMonth();
  const day = isUTC ? date.getUTCDate() : date.getDate();
  const hours = isUTC ? date.getUTCHours() : date.getHours();
  const minutes = isUTC ? date.getUTCMinutes() : date.getMinutes();
  const seconds = isUTC ? date.getUTCSeconds() : date.getSeconds();

  const tokens: Record<string, string> = {
    YYYY: year.toString(),
    YY: year.toString().slice(-2),
    MM: pad(month + 1),
    DD: pad(day),
    HH: pad(hours),
    mm: pad(minutes),
    ss: pad(seconds),
  };

  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (match) => tokens[match] || '');
}
