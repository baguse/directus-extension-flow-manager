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
}

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
}

export function getTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hour = date.getHours().toString().padStart(2, "0");
  const minute = date.getMinutes().toString().padStart(2, "0");
  const second = date.getSeconds().toString().padStart(2, "0");

  return `${year}${month}${day}${hour}${minute}${second}`;
}
