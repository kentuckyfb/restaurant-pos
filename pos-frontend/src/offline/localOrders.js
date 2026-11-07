import { axiosWrapper } from "../https/axiosWrapper";
import { formatOrderNo } from "../utils";
import { isNetworkError, isOnline, subscribeOnline } from "./network";

/*
 Offline work waiting to reach the server, kept in localStorage. Two kinds of record:

 - kind "new":  an order created offline. Temporary number like "OFF-3"; its clientRef makes
                syncing twice safe.
 - kind "edit": changes made offline to an order that already exists on the server. Keeps a copy
                of the order as it was when editing started ("base"), so syncing can merge with
                whatever other devices did meanwhile instead of overwriting it.

 syncState: "pending" | "synced" (kept a day for reference) | "failed" (needs a person)
*/

const KEY = "pos:offlineOrders";
const COUNTER_KEY = "pos:offlineCounter";
const KEEP_SYNCED_FOR = 24 * 60 * 60 * 1000;

const listeners = new Set();
const syncedListeners = new Set();
let syncing = null;
// The order currently open on screen; it waits until the user saves it
let activeId = null;
export const setActiveLocalOrder = (id) => { activeId = id; };

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};

const write = (records) => {
  localStorage.setItem(KEY, JSON.stringify(records));
  listeners.forEach((fn) => fn());
};

export const subscribeLocalOrders = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Called after anything reaches the server, so screens can refresh
export const subscribeSynced = (fn) => {
  syncedListeners.add(fn);
  return () => syncedListeners.delete(fn);
};

export const listLocalOrders = () => read();
export const getLocalOrder = (id) => read().find((o) => o._id === id);
export const isLocalId = (id) => typeof id === "string" && id.startsWith("local-");
export const editIdFor = (serverId) => `edit-${serverId}`;

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const nextTempNumber = () => {
  let n = 0;
  try {
    n = Number(localStorage.getItem(COUNTER_KEY) || 0) + 1;
    localStorage.setItem(COUNTER_KEY, String(n));
  } catch { n = Date.now() % 10000; }
  return `OFF-${n}`;
};

// --- Records ---

export const createLocalOrder = (fields, user) => {
  const order = {
    _id: `local-${uid()}`,
    kind: "new",
    local: true,
    orderNo: nextTempNumber(),
    status: "Open",
    kitchenStatus: "New",
    createdAt: new Date().toISOString(),
    createdBy: { name: user?.name },
    syncState: "pending",
    ...fields,
  };
  write([...read(), order]);
  return order;
};

// Saves changes to an offline record (new or edit); a failed one goes back in the queue
export const saveLocalOrder = (record) => {
  const updated = { ...record, syncState: "pending", syncError: undefined, updatedLocallyAt: new Date().toISOString() };
  write(read().map((o) => (o._id === record._id ? updated : o)));
  return updated;
};

// Records an offline change to a server order. `serverOrder` is the last copy we have of it.
export const saveOrderEdit = (serverOrder, changes) => {
  const id = editIdFor(serverOrder._id);
  const existing = getLocalOrder(id);
  if (existing && existing.syncState !== "synced") return saveLocalOrder({ ...existing, ...changes });

  const { recordId: _r, offlineEdit: _o, ...base } = serverOrder;
  const record = {
    ...base,
    ...changes,
    _id: id,
    kind: "edit",
    serverId: serverOrder._id,
    ref: uid(),
    base,
    syncState: "pending",
    updatedLocallyAt: new Date().toISOString(),
  };
  write([...read().filter((o) => o._id !== id), record]);
  return record;
};

export const removeLocalOrder = (id) => write(read().filter((o) => o._id !== id));

const update = (id, changes) => write(read().map((o) => (o._id === id ? { ...o, ...changes } : o)));

// Records still waiting or needing attention
export const unsyncedOrders = () => read().filter((o) => o.syncState !== "synced");

// --- How offline work looks on screen ---

// An edit record shown as the order it represents (with the server's id)
export const viewOf = (record) =>
  record.kind === "edit" ? { ...record, _id: record.serverId, recordId: record._id, offlineEdit: true } : { ...record, recordId: record._id };

// The pending offline edit for a server order, if any
export const pendingEditFor = (serverId) => {
  const record = getLocalOrder(editIdFor(serverId));
  return record && record.syncState !== "synced" ? record : null;
};

// Lays offline edits over a list of server orders; drops ones closed offline when `openOnly`
export const applyLocalEdits = (orders, { openOnly = false } = {}) =>
  orders
    .map((order) => {
      const edit = pendingEditFor(order._id);
      return edit ? viewOf(edit) : order;
    })
    .filter((order) => !openOnly || order.status === "Open");

// --- Sync ---

const isServerLine = (id) => /^[a-f0-9]{24}$/.test(String(id || ""));
const byId = (items) => Object.fromEntries(items.map((i) => [String(i._id), i]));
const sameLine = (a, b) => a.quantity === b.quantity && (a.note || "") === (b.note || "");

// Three-way merge of order lines: changes made here win only where the server still has
// the line as it was when we went offline; lines other devices changed are kept as they are.
const mergeItems = (baseItems, serverItems, localItems) => {
  const base = byId(baseItems);
  const local = byId(localItems);
  const merged = [];
  for (const line of serverItems) {
    const before = base[line._id];
    const mine = local[line._id];
    if (before && sameLine(before, line)) {
      if (mine) merged.push({ _id: line._id, menuItemId: line.menuItem, quantity: mine.quantity, note: mine.note });
      // else: removed offline
    } else {
      merged.push({ _id: line._id, menuItemId: line.menuItem, quantity: line.quantity, note: line.note });
    }
  }
  localItems
    .filter((line) => !isServerLine(line._id))
    .forEach((line) => merged.push({ menuItemId: line.menuItem, quantity: line.quantity, note: line.note }));
  return merged;
};

const conflict = (message) => Object.assign(new Error(message), { response: { data: { message } } });

const syncNew = async (record) => {
  // Cancelled before it ever reached the server: nothing to send
  if (record.status === "Cancelled" && !record.serverId) return [];

  let serverId = record.serverId;
  const warnings = [];
  if (!serverId) {
    const { data } = await axiosWrapper.post("/api/order", {
      type: record.type,
      tableId: record.table?._id,
      customer: record.customer,
      guests: record.guests,
      items: record.items.map((item) => ({ menuItemId: item.menuItem, quantity: item.quantity, note: item.note })),
      send: record.items.some((item) => item.sent),
      clientRef: record._id,
      createdAt: record.createdAt,
    });
    serverId = data.data._id;
    warnings.push(...(data.warnings || []));
    update(record._id, { serverId, serverOrderNo: data.data.orderNo });
  }

  if (record.status === "Paid") {
    await axiosWrapper.post(`/api/order/${serverId}/pay`, { ...record.payment, discount: record.discount, clientRef: record._id, paidAt: record.closedAt });
  } else if (record.status === "Cancelled") {
    await axiosWrapper.post(`/api/order/${serverId}/cancel`, { reason: record.cancelReason || "Cancelled offline" });
  }
  return warnings;
};

const syncEdit = async (record) => {
  const { base } = record;
  const { data } = await axiosWrapper.get(`/api/order/${record.serverId}`);
  const server = data.data;
  const payRef = `${record._id}:${record.ref}`;

  const itemsChanged = JSON.stringify(record.items.map((i) => [i._id, i.quantity, i.note || ""])) !==
    JSON.stringify(base.items.map((i) => [i._id, i.quantity, i.note || ""]));
  const customerChanged = JSON.stringify(record.customer || {}) !== JSON.stringify(base.customer || {}) || record.guests !== base.guests;
  const baseSent = byId(base.items);
  const newlySent = record.items.some((i) => i.sent && !(baseSent[i._id]?.sent));

  if (server.status !== "Open") {
    if (record.status === "Paid" && server.status === "Paid" && server.payment?.clientRef === payRef) return [];
    const onlyKitchen = !itemsChanged && !customerChanged && record.status === "Open";
    if (onlyKitchen && server.status === "Paid") {
      if (record.kitchenStatus !== base.kitchenStatus) {
        await axiosWrapper.patch(`/api/order/${record.serverId}/kitchen`, { kitchenStatus: record.kitchenStatus });
      }
      return [];
    }
    throw conflict(`Order #${formatOrderNo(server.orderNo)} was ${server.status.toLowerCase()} on another device while this till was offline, so these changes weren't applied. Check it and re-enter anything missing.`);
  }

  if (itemsChanged || customerChanged || newlySent) {
    await axiosWrapper.put(`/api/order/${record.serverId}`, {
      items: mergeItems(base.items, server.items, record.items),
      knownLineIds: server.items.map((i) => i._id),
      ...(customerChanged ? { customer: record.customer, guests: record.guests } : {}),
      send: newlySent,
    });
  }

  if (record.status === "Paid") {
    await axiosWrapper.post(`/api/order/${record.serverId}/pay`, { ...record.payment, discount: record.discount, clientRef: payRef, paidAt: record.closedAt });
  } else if (record.status === "Cancelled") {
    await axiosWrapper.post(`/api/order/${record.serverId}/cancel`, { reason: record.cancelReason || "Cancelled offline" });
  } else if (record.kitchenStatus !== base.kitchenStatus && ["Ready", "Served"].includes(record.kitchenStatus)) {
    await axiosWrapper.patch(`/api/order/${record.serverId}/kitchen`, { kitchenStatus: record.kitchenStatus });
  }
  return [];
};

const runSync = async () => {
  let syncedAny = false;
  const pending = read()
    .filter((o) => o.syncState === "pending" && o._id !== activeId)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  for (const record of pending) {
    try {
      const warnings = record.kind === "edit" ? await syncEdit(record) : await syncNew(record);
      update(record._id, { syncState: "synced", syncedAt: new Date().toISOString(), syncWarning: warnings.join(" ") || undefined });
      syncedAny = true;
    } catch (error) {
      if (isNetworkError(error)) break;
      const message = error.response?.data?.message || "Could not sync.";
      const latest = getLocalOrder(record._id);
      update(record._id, {
        syncState: "failed",
        syncError: latest?.kind === "new" && latest?.serverId ? `Saved as order #${latest.serverOrderNo}, but: ${message}` : message,
      });
    }
  }

  // Drop synced copies after a day
  const now = Date.now();
  const all = read();
  const kept = all.filter((o) => o.syncState !== "synced" || now - new Date(o.syncedAt).getTime() < KEEP_SYNCED_FOR);
  if (kept.length !== all.length) write(kept);
  if (syncedAny) syncedListeners.forEach((fn) => fn());
};

// Pushes waiting work to the server, oldest first. Stops quietly if the connection drops again.
export const syncLocalOrders = () => {
  if (!isOnline()) return Promise.resolve();
  if (!syncing) syncing = runSync().finally(() => { syncing = null; });
  return syncing;
};

// Sync as soon as the connection is back, and every 20 seconds while online
subscribeOnline((online) => online && syncLocalOrders());
setInterval(syncLocalOrders, 20000);
