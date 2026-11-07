import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { axiosWrapper } from "../https/axiosWrapper";
import { getOrder } from "../https";
import { writeCache } from "./cache";

/*
 Live updates from the server (Server-Sent Events).
 The server only says "order X changed" (never the contents). This screen then fetches just that
 one order and slots it into the lists it already has, instead of re-downloading everything.
 If the connection drops, screens fall back to slow polling until it's back, then catch up.
*/

// Identifies this browser tab, so it can recognise (and skip) notices about its own changes
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const clientId = makeId();
axiosWrapper.defaults.headers.common["X-Client-Id"] = clientId;

// --- "Is live" state for components ---
let live = false;
const liveListeners = new Set();
const setLive = (value) => {
  if (value === live) return;
  live = value;
  liveListeners.forEach((fn) => fn());
};
const subscribeLive = (fn) => {
  liveListeners.add(fn);
  return () => liveListeners.delete(fn);
};
export const isLive = () => live;
export const useLive = () => useSyncExternalStore(subscribeLive, isLive);

// How often to re-check as a safety net: rarely when live, more often when not
export const fallbackInterval = (liveValue, normalMs) => (liveValue ? 5 * 60 * 1000 : normalMs);

// --- Keeping cached lists in step with one changed order ---

const isOpen = (o) => o.status === "Open";
const inKitchen = (o) => ["Open", "Paid"].includes(o.status) && ["Preparing", "Ready"].includes(o.kitchenStatus);
const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
const oldestFirst = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

const patchList = (queryClient, key, cacheKey, belongs, order, sort, removedId) => {
  queryClient.setQueryData(key, (old) => {
    if (!old?.data) return old;
    const id = order?._id || removedId;
    const rest = old.data.filter((o) => o._id !== id);
    const data = order && belongs(order) ? [...rest, order].sort(sort) : rest;
    const next = { ...old, data };
    writeCache(cacheKey, next);
    return next;
  });
};

// Orders this tab just saved itself (no need to fetch them again when the notice arrives)
const recentlyApplied = new Map();

// Put a fresh copy of one order into every list that shows it
export const applyOrderUpdate = (queryClient, order) => {
  patchList(queryClient, ["orders", "open"], "orders-open", isOpen, order, newestFirst);
  patchList(queryClient, ["orders", "kitchen"], "orders-kitchen", inKitchen, order, oldestFirst);
  queryClient.setQueryData(["order", order._id], { data: order });
  recentlyApplied.set(order._id, Date.now());
};

const removeOrder = (queryClient, id) => {
  patchList(queryClient, ["orders", "open"], "orders-open", isOpen, null, newestFirst, id);
  patchList(queryClient, ["orders", "kitchen"], "orders-kitchen", inKitchen, null, oldestFirst, id);
  queryClient.removeQueries({ queryKey: ["order", id] });
};

// Lists that aren't patched one-by-one (history, customers, reports) just get marked out of date
const markOrderListsStale = (queryClient) =>
  queryClient.invalidateQueries({
    predicate: (q) => {
      const [root, sub] = q.queryKey;
      if (root === "orders") return sub !== "open" && sub !== "kitchen";
      return ["customers", "customer-orders", "report", "storage"].includes(root);
    },
  });

// --- The connection ---

let source = null;
let wanted = false;
let retryTimer = null;
let pending = new Set();
let flushTimer = null;

const handleOrders = async (queryClient) => {
  const ids = [...pending];
  pending = new Set();
  await Promise.all(ids.map(async (id) => {
    const appliedAt = recentlyApplied.get(id);
    if (appliedAt && Date.now() - appliedAt < 3000) return;
    try {
      const { data } = await getOrder(id);
      applyOrderUpdate(queryClient, data);
    } catch (error) {
      // Deleted (archived) or not visible to this role
      if ([403, 404].includes(error.response?.status)) removeOrder(queryClient, id);
    }
  }));
  markOrderListsStale(queryClient);
};

const handle = (queryClient, message) => {
  switch (message.type) {
    case "order":
      if (!message.id) return;
      pending.add(message.id);
      // Gather notices that arrive together (e.g. a merge touches two orders)
      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => handleOrders(queryClient), 150);
      return;
    case "tables": return queryClient.invalidateQueries({ queryKey: ["tables"] });
    case "shift":
      queryClient.invalidateQueries({ queryKey: ["shift"] });
      return queryClient.invalidateQueries({ queryKey: ["shifts"] });
    case "menu": return queryClient.invalidateQueries({ queryKey: ["menu"] });
    case "settings": return queryClient.invalidateQueries({ queryKey: ["settings"] });
    case "inventory": return queryClient.invalidateQueries({ queryKey: ["inventory"] });
    case "staff": return queryClient.invalidateQueries({ queryKey: ["staff"] });
    case "me": return queryClient.invalidateQueries({ queryKey: ["me"] });
    case "all": return queryClient.invalidateQueries();
    default:
  }
};

const connect = (queryClient) => {
  if (source || !wanted) return;
  const base = import.meta.env.VITE_BACKEND_URL || "";
  let openedBefore = false;
  source = new EventSource(`${base}/api/events`, { withCredentials: true });

  source.onopen = () => {
    setLive(true);
    // After a gap, anything could have changed: refresh what's on screen
    if (openedBefore) queryClient.invalidateQueries();
    openedBefore = true;
  };
  source.onmessage = (event) => {
    try {
      handle(queryClient, JSON.parse(event.data));
    } catch { /* ignore malformed notices */ }
  };
  source.onerror = () => {
    setLive(false);
    // The browser retries by itself; if it gave up (e.g. login expired), try again later
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => connect(queryClient), 15000);
    }
  };
};

const disconnect = () => {
  wanted = false;
  clearTimeout(retryTimer);
  source?.close();
  source = null;
  setLive(false);
};

// Keeps the live connection open while someone is signed in
export const useRealtime = (enabled) => {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return undefined;
    wanted = true;
    connect(queryClient);
    // Close the stream when the page is left (refresh, link, tab close). Otherwise the browser can keep
    // it open in the background, and after a few reloads every request waits behind those old streams.
    const onHide = () => {
      clearTimeout(retryTimer);
      source?.close();
      source = null;
      setLive(false);
    };
    // Page restored from the back/forward cache: reconnect and catch up
    const onShow = (event) => {
      if (!event.persisted || !wanted) return;
      connect(queryClient);
      queryClient.invalidateQueries();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      disconnect();
    };
  }, [enabled, queryClient]);
};
