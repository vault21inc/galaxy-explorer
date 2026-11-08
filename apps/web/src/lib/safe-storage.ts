/**
 * `localStorage` that never throws. Private windows, blocked site data and full quotas make
 * every access throw in some browsers; settings such as quality, label mode and spoilers are
 * conveniences, so the app falls back to its defaults instead of breaking.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Not stored; the setting lasts until the page reloads.
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to do.
    }
  },
};
