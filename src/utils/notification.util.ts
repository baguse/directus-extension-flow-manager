export interface AppNotification {
  title: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  text?: string;
  message?: string;
  code?: string;
  closeable?: boolean;
  persist?: boolean;
}

export interface NotificationsStoreLike {
  add: (options: AppNotification) => void;
}

/**
 * Dispatches a standardized notification in Directus Flow Manager.
 * Ensures consistent behavior:
 * - Always non-persistent by default (auto-dismisses after standard Directus toast timeout)
 * - Always closeable by default (user can dismiss manually at any time)
 */
export function notify(
  store: NotificationsStoreLike | undefined | null,
  options: AppNotification,
): void {
  if (!store?.add) return;
  store.add({
    closeable: options.closeable ?? true,
    ...options,
    persist: options.persist === true,
  });
}

notify.success = (
  store: NotificationsStoreLike | undefined | null,
  title: string,
  text?: string,
): void => {
  notify(store, { type: 'success', title, text });
};

notify.error = (
  store: NotificationsStoreLike | undefined | null,
  title: string,
  text?: string,
): void => {
  notify(store, { type: 'error', title, text });
};

notify.info = (
  store: NotificationsStoreLike | undefined | null,
  title: string,
  text?: string,
): void => {
  notify(store, { type: 'info', title, text });
};

notify.warning = (
  store: NotificationsStoreLike | undefined | null,
  title: string,
  text?: string,
): void => {
  notify(store, { type: 'warning', title, text });
};
