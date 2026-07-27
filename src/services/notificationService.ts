/**
 * Owns all direct use of the Web `Notification` API so calling code (e.g.
 * `useFlights.ts`) never touches it inline. Foreground-only by design: a
 * plain `new Notification(...)` only ever fires while this tab is loaded
 * (not necessarily focused), riding on the app's existing refresh cycle —
 * there's no service worker or Web Push subscription here, so nothing fires
 * once the tab/browser is closed.
 */

export function isNotificationSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return Notification.requestPermission();
}

/** `tag: flightLabel` means a second rapid change to the same flight replaces its still-open notification instead of stacking a new one. */
export function notifyFlightChange(flightLabel: string, changes: string[]): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;

  const notification = new Notification(`${flightLabel} update`, {
    body: changes.join('\n'),
    tag: flightLabel,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
