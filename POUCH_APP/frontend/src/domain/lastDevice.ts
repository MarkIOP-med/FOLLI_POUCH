/**
 * The last pouch the user worked with, so device-scoped screens (diagnostics,
 * users, settings) stay reachable from the home screen's id-less URL. Session-
 * scoped: a fresh browser session starts clean.
 */
const KEY = 'folli-last-device';

export function setLastDeviceId(id: string): void {
  sessionStorage.setItem(KEY, id);
}

export function getLastDeviceId(): string | null {
  return sessionStorage.getItem(KEY);
}
