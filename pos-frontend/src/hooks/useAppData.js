import { useQuery } from "@tanstack/react-query";
import { getCurrentShift, getMenu, getOrder, getOrders, getSettings, getTables } from "../https";
import { cached, readCache } from "../offline/cache";
import { isNetworkError } from "../offline/network";
import { fallbackInterval, useLive } from "../offline/realtime";

// Shared queries. Each keeps an offline copy on this device. The menu and settings rarely change,
// so they're cached for a while to save reads.
export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: cached("settings", getSettings), select: (r) => r.data, staleTime: 10 * 60 * 1000 });

export const useMenu = () =>
  useQuery({ queryKey: ["menu"], queryFn: cached("menu", getMenu), select: (r) => r.data, staleTime: 5 * 60 * 1000 });

export const useCurrentShift = () =>
  useQuery({ queryKey: ["shift", "current"], queryFn: cached("shift", getCurrentShift), select: (r) => r.data, staleTime: 30 * 1000 });

export const useTables = (options = {}) =>
  useQuery({ queryKey: ["tables"], queryFn: cached("tables", getTables), select: (r) => r.data, ...options });

// Open orders, with full items. The saved copy is what lets staff open and edit them offline.
export const useOpenOrders = (options = {}) => {
  const live = useLive();
  return useQuery({
    queryKey: ["orders", "open"],
    queryFn: cached("orders-open", () => getOrders({ status: "Open", limit: 200 })),
    select: (r) => r.data,
    // Live updates patch this list; polling is only a safety net
    refetchInterval: fallbackInterval(live, 30000),
    ...options,
  });
};

// One order; offline it falls back to the saved open-orders or kitchen list
export const fetchOrderWithFallback = async (id) => {
  try {
    return await getOrder(id);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    for (const key of ["orders-open", "orders-kitchen"]) {
      const hit = readCache(key)?.data?.find((o) => o._id === id);
      if (hit) return { data: hit };
    }
    throw error;
  }
};
