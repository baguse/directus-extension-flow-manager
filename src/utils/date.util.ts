const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatDate = (date?: Date): string => {
  if (!date) return '';
  const toDate = new Date(date);
  const year = toDate.getFullYear();
  const month = (toDate.getMonth() + 1).toString().padStart(2, '0');
  const day = toDate.getDate().toString().padStart(2, '0');
  const hours = toDate.getHours().toString().padStart(2, '0');
  const minutes = toDate.getMinutes().toString().padStart(2, '0');
  const seconds = toDate.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const formatDateLong = (date?: Date): string => {
  if (!date) return '';
  const toDate = new Date(date);
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
  const date = new Date(inputDate);

  if (isNaN(date.getTime())) {
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
