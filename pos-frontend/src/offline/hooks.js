import { useEffect, useState, useSyncExternalStore } from "react";
import { isOnline, subscribeOnline } from "./network";
import { getLocalOrder, listLocalOrders, subscribeLocalOrders } from "./localOrders";

// One local order, kept up to date as it changes or syncs
// Reads straight from storage on each render, so it's never a step behind a just-created order
export const useLocalOrder = (id) => {
  const [, rerender] = useState(0);
  useEffect(() => subscribeLocalOrders(() => rerender((n) => n + 1)), []);
  return id ? getLocalOrder(id) : undefined;
};

export const useOnline = () => useSyncExternalStore(subscribeOnline, isOnline);

// Local (offline) orders that haven't been confirmed by the server yet
export const useLocalOrders = () => {
  const [orders, setOrders] = useState(() => listLocalOrders().filter((o) => o.syncState !== "synced"));
  useEffect(() => subscribeLocalOrders(() => setOrders(listLocalOrders().filter((o) => o.syncState !== "synced"))), []);
  return orders;
};
