import { axiosWrapper } from "../https/axiosWrapper";

// Tracks whether the server is reachable. "Offline" means either no internet or the server is down.
let online = typeof navigator === "undefined" ? true : navigator.onLine;
const listeners = new Set();

const setOnline = (value) => {
  if (value === online) return;
  online = value;
  listeners.forEach((fn) => fn(online));
};

export const isOnline = () => online;

export const subscribeOnline = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// A request that got no response at all (timeout, DNS, refused) means we're offline
export const isNetworkError = (error) => Boolean(error) && !error.response && error.code !== "ERR_CANCELED";

axiosWrapper.defaults.timeout = 10000;
axiosWrapper.interceptors.response.use(
  (response) => {
    setOnline(true);
    return response;
  },
  (error) => {
    if (isNetworkError(error)) setOnline(false);
    else if (error.response) setOnline(true);
    return Promise.reject(error);
  }
);

export const checkConnection = async () => {
  try {
    await axiosWrapper.get("/api/health", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

// While offline, check every 10 seconds whether the server is back
setInterval(() => {
  if (!online) checkConnection();
}, 10000);

if (typeof window !== "undefined") {
  window.addEventListener("online", () => checkConnection());
  window.addEventListener("offline", () => setOnline(false));
}
