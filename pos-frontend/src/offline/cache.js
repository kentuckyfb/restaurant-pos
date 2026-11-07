import { isNetworkError } from "./network";

// Keeps the last good copy of key data on this device, so the till still works offline
const PREFIX = "pos:cache:";

export const readCache = (key) => {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

export const writeCache = (key, value) => {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* storage full or blocked: offline copy just won't update */ }
};

// On logout: forget who was signed in, but keep the menu etc. for offline use
export const forgetUser = () => {
  try {
    localStorage.removeItem(PREFIX + "user");
  } catch { /* ignore */ }
};

export const clearCache = () => {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

// Wraps a fetch: saves successful results, and falls back to the saved copy when the network is down
export const cached = (key, fetcher) => async () => {
  try {
    const result = await fetcher();
    writeCache(key, result);
    return result;
  } catch (error) {
    const saved = readCache(key);
    if (isNetworkError(error) && saved !== undefined) return saved;
    throw error;
  }
};
