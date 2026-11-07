import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import {
  LuArrowLeft, LuMinus, LuPlus, LuStickyNote, LuSend, LuPrinter, LuBan, LuPencil, LuShoppingBag,
  LuArrowRightLeft, LuUndo2, LuWifiOff,
} from "react-icons/lu";
import MenuPanel from "../components/pos/MenuPanel";
import PaymentModal from "../components/pos/PaymentModal";
import ReceiptModal from "../components/pos/ReceiptModal";
import TableActionsModal from "../components/pos/TableActionsModal";
import RefundModal from "../components/orders/RefundModal";
import SendReceipt from "../components/orders/SendReceipt";
import Modal from "../components/shared/Modal";
import ReasonDialog from "../components/shared/ReasonDialog";
import StatusBadge from "../components/shared/StatusBadge";
import FullScreenLoader from "../components/shared/FullScreenLoader";
import EmptyState from "../components/shared/EmptyState";
import { fetchOrderWithFallback, useCurrentShift, useMenu, useSettings, useTables } from "../hooks/useAppData";
import { cancelOrder, createOrder, payOrder, updateOrder } from "../https";
import { isNetworkError } from "../offline/network";
import { useLocalOrder, useOnline } from "../offline/hooks";
import {
  createLocalOrder, editIdFor, getLocalOrder, isLocalId, saveLocalOrder, saveOrderEdit, setActiveLocalOrder, syncLocalOrders, viewOf,
} from "../offline/localOrders";
import {
  ORDER_TYPES, apiError, canManageBills, computeBill, formatDateAndTime, formatMoney, orderNumber, userError,
} from "../utils";
import { printKOT, printReceipt } from "../utils/print";
import { applyOrderUpdate, isLive } from "../offline/realtime";

let lineKey = 0;
const newKey = () => `line-${Date.now().toString(36)}-${++lineKey}`;
const round = (n) => Math.round(n * 100) / 100;

const toLine = (item) => ({
  key: item._id || newKey(),
  _id: item._id,
  menuItemId: item.menuItem,
  name: item.name,
  category: item.category,
  price: item.price,
  quantity: item.quantity,
  note: item.note || "",
  sent: item.sent,
});

const ticketOf = (lines) => lines.map((l) => ({ name: l.name, quantity: l.quantity, note: l.note }));

const OrderScreen = () => {
  const { id: routeId } = useParams();
  // A new order gets its id once first saved; we keep the user on the same screen
  const [createdId, setCreatedId] = useState(null);
  const id = routeId || createdId;
  const isNew = !id;
  const isLocal = isLocalId(id);
  const { state: navState } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useSelector((s) => s.user);
  const online = useOnline();
  const { data: menu } = useMenu();
  const { data: settings } = useSettings();
  const { data: shift } = useCurrentShift();

  const { data: serverOrder, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrderWithFallback(id),
    select: (r) => r.data,
    enabled: !isNew && !isLocal,
  });
  const localOrder = useLocalOrder(isLocal ? id : null);
  // Changes made to this server order while offline, not yet synced
  const editRecord = useLocalOrder(!isNew && !isLocal ? editIdFor(id) : null);
  const pendingEdit = editRecord && editRecord.syncState !== "synced" ? editRecord : null;
  const savedOrder = isLocal ? localOrder && viewOf(localOrder) : pendingEdit ? viewOf(pendingEdit) : serverOrder;
  // Save on this till instead of the server: offline, or while earlier offline changes still wait to sync
  const workOffline = isLocal || Boolean(pendingEdit) || !online;

  const [meta, setMeta] = useState(() => ({
    type: navState?.type || "takeaway",
    table: navState?.table || null,
    customer: { name: "", phone: "", email: "", ...navState?.customer },
    guests: navState?.guests || 1,
  }));
  const [lines, setLines] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState(null);
  const [modal, setModal] = useState(null); // details | tables | cancel | refund
  const [payingOrder, setPayingOrder] = useState(null);
  const [paidOrder, setPaidOrder] = useState(null);

  // Load a saved order into the editor (and again whenever it changes on the server)
  useEffect(() => {
    if (!savedOrder) return;
    setMeta({ type: savedOrder.type, table: savedOrder.table || null, customer: { name: "", phone: "", email: "", ...savedOrder.customer }, guests: savedOrder.guests });
    setLines(savedOrder.items.map(toLine));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOrder?._id, savedOrder?.updatedAt, savedOrder?.updatedLocallyAt, savedOrder?.items?.length, savedOrder?.status]);

  // While an order with offline work is open here, don't sync it underneath the user
  const lockId = isNew ? null : isLocal ? id : editIdFor(id);
  useEffect(() => {
    if (!lockId) return;
    setActiveLocalOrder(lockId);
    return () => {
      setActiveLocalOrder(null);
      syncLocalOrders();
    };
  }, [lockId]);

  // An offline order that has since synced: open the real one
  useEffect(() => {
    if (isLocal && localOrder?.syncState === "synced" && localOrder.serverId && !paidOrder) {
      navigate(`/pos/${localOrder.serverId}`, { replace: true });
    }
  }, [isLocal, localOrder, navigate, paidOrder]);

  // Tab title
  useEffect(() => {
    document.title = `${savedOrder ? `Order ${orderNumber(savedOrder)}` : "New order"} · Restro`;
  }, [savedOrder?._id, savedOrder?.orderNo]); // eslint-disable-line react-hooks/exhaustive-deps

  const menuById = useMemo(() => Object.fromEntries((menu?.items || []).map((i) => [i._id, i])), [menu]);
  const categoryName = useMemo(() => Object.fromEntries((menu?.categories || []).map((c) => [c._id, c.name])), [menu]);
  const quantities = useMemo(() => {
    const q = {};
    lines.forEach((l) => { q[l.menuItemId] = (q[l.menuItemId] || 0) + l.quantity; });
    return q;
  }, [lines]);

  const canVoid = canManageBills(user.role);
  const canRefund = user.role === "Admin" || (user.role === "Cashier" && settings?.cashierRefunds);
  const isClosed = savedOrder && savedOrder.status !== "Open";
  const editable = !isClosed;
  const unsentCount = lines.filter((l) => !l.sent).reduce((n, l) => n + l.quantity, 0);
  const bill = settings ? computeBill({ items: lines, type: meta.type }, settings) : null;

  const edit = (updater) => {
    setLines(updater);
    setDirty(true);
  };

  const addItem = (menuItem) => {
    if (!editable) return;
    edit((prev) => {
      const existing = prev.find((l) => !l.sent && l.menuItemId === menuItem._id && !l.note);
      if (existing) return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key: newKey(), menuItemId: menuItem._id, name: menuItem.name, category: categoryName[menuItem.category], price: menuItem.price, quantity: 1, note: "", sent: false }];
    });
  };

  const changeQuantity = (line, delta) => {
    if (line.sent && delta > 0) {
      const menuItem = menuById[line.menuItemId];
      if (menuItem?.available) addItem(menuItem);
      return;
    }
    if (line.sent && !canVoid) {
      enqueueSnackbar("Only a cashier or admin can remove items already sent to the kitchen.", { variant: "warning" });
      return;
    }
    edit((prev) =>
      prev.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0)
    );
  };

  const setNote = (line, note) => edit((prev) => prev.map((l) => (l.key === line.key ? { ...l, note } : l)));

  // Slot the saved order into the cached lists; live notices handle tables and the day's totals
  const refresh = (order) => {
    applyOrderUpdate(queryClient, order);
    if (!isLive()) {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      queryClient.invalidateQueries({ queryKey: ["shift"] });
    }
  };

  // --- Saving: to the server, or on this till when offline ---

  const saveOnServer = async (send) => {
    const body = {
      items: lines.map((l) => ({ _id: l._id, menuItemId: l.menuItemId, quantity: l.quantity, note: l.note })),
      // Which lines this screen knew about, so lines added elsewhere meanwhile are never dropped
      knownLineIds: (savedOrder?.items || []).map((i) => i._id),
      customer: meta.customer,
      guests: meta.guests,
      send,
    };
    const res = isNew
      ? await createOrder({ ...body, type: meta.type, tableId: meta.table?._id })
      : await updateOrder({ id, ...body });
    refresh(res.data);
    if (isNew) setCreatedId(res.data._id);
    return res;
  };

  const saveLocally = (send) => {
    if (isNew && settings.requireShift && !shift) throw userError("The day hasn't been started, so orders can't be taken.");
    const ticket = send ? lines.filter((l) => !l.sent) : [];
    const items = lines.map((l) => ({
      _id: l._id || l.key, menuItem: l.menuItemId, name: l.name, category: l.category, price: l.price,
      quantity: l.quantity, note: l.note, sent: Boolean(l.sent || send),
    }));
    const fields = {
      type: meta.type,
      table: meta.table,
      customer: meta.customer,
      guests: meta.guests,
      items,
      bills: computeBill({ items, type: meta.type }, settings),
      kitchenStatus: ticket.length ? "Preparing" : savedOrder?.kitchenStatus || "New",
    };
    let record;
    if (isLocal) record = saveLocalOrder({ ...getLocalOrder(id), ...fields });
    else if (!isNew) record = saveOrderEdit(savedOrder, fields);
    else {
      record = createLocalOrder(fields, user);
      setCreatedId(record._id);
    }
    return { data: viewOf(record), ticket: ticketOf(ticket) };
  };

  const save = async ({ send }) => {
    setBusy(true);
    try {
      let res;
      if (workOffline) {
        res = saveLocally(send);
      } else {
        try {
          res = await saveOnServer(send);
        } catch (error) {
          // Lost the connection while saving: keep the work on the till instead
          if (!isNetworkError(error)) throw error;
          res = saveLocally(send);
          enqueueSnackbar("No connection. Saved on this till; it will sync automatically.", { variant: "warning" });
        }
      }
      if (res.ticket?.length) printKOT(res.data, res.ticket);
      setDirty(false);
      return res.data;
    } catch (error) {
      enqueueSnackbar(apiError(error), { variant: "error" });
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    try {
      const order = await save({ send: true });
      enqueueSnackbar(unsentCount ? `Order ${orderNumber(order)} sent to kitchen` : "Order saved", { variant: "success" });
      navigate(meta.type === "dine-in" && meta.table ? "/tables" : "/orders");
    } catch { /* error already shown */ }
  };

  const handlePay = async () => {
    try {
      const order = isNew || dirty ? await save({ send: false }) : savedOrder;
      setPayingOrder(order);
    } catch { /* error already shown */ }
  };

  // Takes payment on this till (offline). Works for offline orders and for server orders.
  const payLocally = async ({ method, amountTendered, reference, discount }) => {
    const record = payingOrder.recordId ? getLocalOrder(payingOrder.recordId) : null;
    const current = record ? viewOf(record) : payingOrder;
    const bills = computeBill({ items: current.items, type: current.type, discount }, settings);
    let tendered = bills.total;
    if (method === "Cash") {
      tendered = round(Number(amountTendered));
      if (!(tendered >= bills.total)) throw userError("Cash received is less than the total.");
    }
    const ticket = current.items.filter((i) => !i.sent);
    const paidFields = {
      items: current.items.map((i) => ({ ...i, sent: true })),
      kitchenStatus: ticket.length ? "Preparing" : current.kitchenStatus,
      discount: discount || { type: "amount", value: 0, reason: "" },
      bills,
      status: "Paid",
      payment: { method, amountTendered: tendered, change: round(tendered - bills.total), reference: reference || "" },
      closedAt: new Date().toISOString(),
      closedBy: { name: user.name },
    };
    const saved = current.local ? saveLocalOrder({ ...record, ...paidFields }) : saveOrderEdit(current, paidFields);
    return { data: viewOf(saved), ticket: ticketOf(ticket) };
  };

  const payOnServerOrHere = async (payload) => {
    if (payingOrder.recordId || !online) return payLocally(payload);
    try {
      return await payOrder({ id: payingOrder._id, ...payload });
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      enqueueSnackbar("No connection. Payment saved on this till; it will sync automatically.", { variant: "warning" });
      return payLocally(payload);
    }
  };

  const handlePaid = (order, ticket) => {
    setPayingOrder(null);
    if (!order.local && !order.offlineEdit) refresh(order);
    if (ticket?.length) printKOT(order, ticket);
    setPaidOrder(order);
  };

  const cancelMutation = useMutation({
    mutationFn: async ({ reason }) => {
      const fields = { status: "Cancelled", cancelReason: reason, closedAt: new Date().toISOString() };
      const cancelHere = () => ({ data: viewOf(isLocal ? saveLocalOrder({ ...getLocalOrder(id), ...fields }) : saveOrderEdit(savedOrder, fields)) });
      if (workOffline) return cancelHere();
      try {
        return await cancelOrder({ id, reason });
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        return cancelHere();
      }
    },
    onSuccess: (res) => {
      if (!res.data.local && !res.data.offlineEdit) refresh(res.data);
      enqueueSnackbar(`Order ${orderNumber(res.data)} cancelled`, { variant: "info" });
      navigate("/orders");
    },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  if (!menu || !settings || (!isNew && !isLocal && isLoading && !serverOrder)) {
    if (!isNew && !isLocal && !online && !serverOrder && !pendingEdit) {
      return (
        <section className="p-8">
          <div className="card max-w-lg mx-auto">
            <EmptyState icon={<LuWifiOff />} title="You're offline">
              This order wasn't saved on this till before the connection dropped. Reconnect to open it. New orders work offline.
            </EmptyState>
          </div>
        </section>
      );
    }
    return <FullScreenLoader />;
  }

  const where = meta.type === "dine-in" && meta.table ? `Table ${meta.table.tableNo}` : ORDER_TYPES[meta.type];
  const title = isNew || !savedOrder ? "New order" : `Order ${orderNumber(savedOrder)}`;
  const statusLabel = savedOrder && (savedOrder.status === "Open" ? savedOrder.kitchenStatus === "New" ? "Not sent" : savedOrder.kitchenStatus : savedOrder.status);

  return (
    <section className="flex h-screen">
      <div className="flex-1 min-w-0">
        <MenuPanel menu={menu} quantities={quantities} onAdd={addItem} />
      </div>

      <aside className="w-[22rem] xl:w-[26rem] shrink-0 flex flex-col bg-white border-l border-zinc-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="btn-icon -ml-2" aria-label="Back"><LuArrowLeft size={18} /></button>
            <h1 className="text-lg font-semibold tabular-nums">{title}</h1>
            {savedOrder && <StatusBadge status={savedOrder.status === "Open" ? savedOrder.kitchenStatus : savedOrder.status} label={statusLabel} />}
            {savedOrder && !isClosed && !isLocal && !pendingEdit && online && (
              <button onClick={() => setModal("tables")} className="btn-ghost !px-2 !py-1 ml-auto text-xs" title="Move, join or merge tables">
                <LuArrowRightLeft size={14} /> Tables
              </button>
            )}
          </div>
          <button onClick={() => editable && setModal("details")} className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-800 text-left">
            <span>
              {where}
              {meta.type === "dine-in" && ` · ${meta.guests} ${meta.guests === 1 ? "guest" : "guests"}`}
              {meta.customer?.name ? ` · ${meta.customer.name}` : editable ? " · Add customer" : ""}
            </span>
            {editable && <LuPencil size={12} className="shrink-0" />}
          </button>
          {(isLocal || (isNew && !online)) && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">
              <LuWifiOff size={12} /> Offline order. Saved on this till and synced when the connection is back.
            </p>
          )}
          {!isNew && !isLocal && (pendingEdit || !online) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">
              <LuWifiOff size={12} className="shrink-0" />
              <span className="flex-1">
                {pendingEdit?.syncState === "failed"
                  ? "These offline changes couldn't sync. See the sync panel in the sidebar."
                  : online ? "Changes made offline are waiting to sync." : "Offline. Changes are saved on this till and synced later."}
              </span>
              {online && pendingEdit && (
                <button onClick={() => { setActiveLocalOrder(null); syncLocalOrders(); }} className="font-semibold underline">Sync now</button>
              )}
            </div>
          )}
        </div>

        {/* Lines */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5">
          {lines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
              <LuShoppingBag size={32} />
              <p className="text-sm mt-3">Tap a dish to add it.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {lines.map((line) => (
                <li key={line.key} className="py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">
                        {line.name}
                        {line.sent && <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sent</span>}
                      </p>
                      <p className="text-xs text-zinc-600 tabular-nums">{formatMoney(line.price)}</p>
                      {line.note && noteFor !== line.key && <p className="text-xs text-amber-700 mt-0.5">“{line.note}”</p>}
                    </div>
                    {editable ? (
                      <div className="flex items-center rounded-lg border border-zinc-200">
                        <button aria-label="Less" onClick={() => changeQuantity(line, -1)} className="p-1.5 text-zinc-600 hover:text-zinc-900"><LuMinus size={14} /></button>
                        <span className="w-6 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                        <button aria-label="More" onClick={() => changeQuantity(line, 1)} className="p-1.5 text-zinc-600 hover:text-zinc-900"><LuPlus size={14} /></button>
                      </div>
                    ) : (
                      <span className="text-sm tabular-nums">×{line.quantity}</span>
                    )}
                    <p className="w-20 text-right text-sm font-semibold tabular-nums">{formatMoney(line.price * line.quantity).replace(/^\S+\s/, "")}</p>
                  </div>
                  {!line.sent && editable && (
                    noteFor === line.key ? (
                      <input
                        autoFocus
                        defaultValue={line.note}
                        placeholder="e.g. less spicy, no onion"
                        onBlur={(e) => { setNote(line, e.target.value.trim()); setNoteFor(null); }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        className="input !py-1.5 mt-2 text-xs"
                      />
                    ) : (
                      <button onClick={() => setNoteFor(line.key)} className="mt-1 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700">
                        <LuStickyNote size={12} /> {line.note ? "Edit note" : "Add note"}
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Totals & actions */}
        <div className="border-t border-zinc-200 px-5 py-4 space-y-3">
          {isClosed ? (
            <ClosedOrderPanel
              order={savedOrder}
              settings={settings}
              canRefund={canRefund && online && !isLocal && !pendingEdit}
              onRefund={() => setModal("refund")}
            />
          ) : (
            <>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between text-zinc-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(bill.subtotal)}</dd></div>
                {bill.serviceCharge > 0 && <div className="flex justify-between text-zinc-600"><dt>Service charge ({settings.serviceChargeRate}%)</dt><dd className="tabular-nums">{formatMoney(bill.serviceCharge)}</dd></div>}
                {bill.vat > 0 && <div className="flex justify-between text-zinc-600"><dt>VAT ({settings.vatRate}%)</dt><dd className="tabular-nums">{formatMoney(bill.vat)}</dd></div>}
                <div className="flex justify-between text-base font-semibold pt-1"><dt>Total</dt><dd className="tabular-nums">{formatMoney(bill.total)}</dd></div>
              </dl>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSend}
                  disabled={busy || lines.length === 0 || (!unsentCount && !dirty)}
                  className="btn-secondary !py-3"
                >
                  <LuSend size={16} />
                  {unsentCount ? `Send (${unsentCount})` : dirty ? "Save" : "Sent"}
                </button>
                {canVoid ? (
                  <button onClick={handlePay} disabled={busy || lines.length === 0} className="btn-primary !py-3">
                    Pay {formatMoney(bill.total)}
                  </button>
                ) : (
                  <button
                    onClick={() => savedOrder && printReceipt({ ...savedOrder, payment: null }, settings)}
                    disabled={!savedOrder || dirty}
                    className="btn-secondary !py-3"
                  >
                    <LuPrinter size={16} /> Print bill
                  </button>
                )}
              </div>
              <div className="flex justify-between">
                {canVoid && savedOrder ? (
                  <button onClick={() => printReceipt({ ...savedOrder, payment: null }, settings)} disabled={dirty} className="btn-ghost !px-2 text-xs">
                    <LuPrinter size={14} /> Print bill
                  </button>
                ) : <span />}
                {savedOrder && canVoid ? (
                  <button onClick={() => setModal("cancel")} className="btn-ghost !px-2 text-xs text-red-600 hover:bg-red-50">
                    <LuBan size={14} /> Cancel order
                  </button>
                ) : isNew && lines.length > 0 ? (
                  <button onClick={() => navigate(-1)} className="btn-ghost !px-2 text-xs text-red-600 hover:bg-red-50">Discard</button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </aside>

      {modal === "details" && (
        <OrderDetailsModal
          meta={meta}
          canChangeTable={isNew || isLocal}
          onSave={(next) => { setMeta(next); setDirty(true); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "tables" && <TableActionsModal order={savedOrder} onChanged={refresh} onClose={() => setModal(null)} />}
      {modal === "refund" && <RefundModal order={savedOrder} onClose={() => setModal(null)} />}
      {modal === "cancel" && (
        <ReasonDialog
          title={`Cancel order ${orderNumber(savedOrder)}?`}
          message="The table will be freed. Items already cooked are not returned to stock."
          confirmLabel="Cancel order"
          suggestions={["Customer left", "Wrong order", "Duplicate order"]}
          isPending={cancelMutation.isPending}
          onConfirm={(reason) => cancelMutation.mutate({ reason })}
          onClose={() => setModal(null)}
        />
      )}
      {payingOrder && (
        <PaymentModal
          order={payingOrder}
          settings={settings}
          onPay={payOnServerOrHere}
          onPaid={handlePaid}
          onClose={() => setPayingOrder(null)}
        />
      )}
      {paidOrder && (
        <ReceiptModal order={paidOrder} settings={settings} onDone={() => navigate(paidOrder.type === "dine-in" && paidOrder.table ? "/tables" : "/")} />
      )}
    </section>
  );
};

// Summary and actions for a paid, cancelled or merged order
const ClosedOrderPanel = ({ order, settings, canRefund, onRefund }) => {
  const { bills } = order;
  return (
    <div className="space-y-3 text-sm">
      <dl className="space-y-1">
        <div className="flex justify-between text-zinc-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(bills.subtotal)}</dd></div>
        {bills.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd className="tabular-nums">-{formatMoney(bills.discount)}</dd></div>}
        {bills.serviceCharge > 0 && <div className="flex justify-between text-zinc-600"><dt>Service charge</dt><dd className="tabular-nums">{formatMoney(bills.serviceCharge)}</dd></div>}
        {bills.vat > 0 && <div className="flex justify-between text-zinc-600"><dt>VAT</dt><dd className="tabular-nums">{formatMoney(bills.vat)}</dd></div>}
        <div className="flex justify-between text-base font-semibold pt-1"><dt>Total</dt><dd className="tabular-nums">{formatMoney(bills.total)}</dd></div>
        {order.refundedTotal > 0 && <div className="flex justify-between text-red-600"><dt>Refunded</dt><dd className="tabular-nums">-{formatMoney(order.refundedTotal)}</dd></div>}
      </dl>
      {order.status === "Cancelled" && <p className="text-zinc-600">Cancelled: “{order.cancelReason}”</p>}
      {order.status === "Merged" && <p className="text-zinc-600">Merged into another order.</p>}
      {order.payment?.method && <p className="text-zinc-600">Paid by {order.payment.method}{order.closedAt && ` · ${formatDateAndTime(order.closedAt)}`}</p>}
      {["Paid", "Refunded"].includes(order.status) && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => printReceipt(order, settings, { copy: true })} className="btn-secondary"><LuPrinter size={16} /> Reprint</button>
            <button onClick={onRefund} disabled={!canRefund || order.status === "Refunded"} className="btn-secondary text-red-600" title={canRefund ? "" : "Admins can refund (or cashiers, if allowed in Settings)"}>
              <LuUndo2 size={16} /> Refund
            </button>
          </div>
          <SendReceipt order={order} />
        </>
      )}
    </div>
  );
};

const OrderDetailsModal = ({ meta, canChangeTable, onSave, onClose }) => {
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", ...meta.customer });
  const [guests, setGuests] = useState(meta.guests || 1);
  const [type, setType] = useState(meta.type);
  const [table, setTable] = useState(meta.table);
  const { data: tables = [] } = useTables({ enabled: canChangeTable });
  const free = tables.filter((t) => t.status === "Available" || t._id === meta.table?._id);
  const set = (key) => (e) => setCustomer({ ...customer, [key]: e.target.value });

  return (
    <Modal title="Order details" subtitle="All optional." onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ ...meta, type, table: type === "dine-in" ? table : null, customer, guests }); }} className="space-y-4">
        {canChangeTable && (
          <div>
            <label className="label">Order type</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ORDER_TYPES).map(([value, label]) => (
                <button type="button" key={value} onClick={() => setType(value)} className={`btn border ${type === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200 text-zinc-600"}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
        {canChangeTable && type === "dine-in" && (
          <div>
            <label className="label">Table</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTable(null)} className={`px-3 h-10 rounded-xl border text-sm ${!table ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200"}`}>None</button>
              {free.map((t) => (
                <button type="button" key={t._id} onClick={() => setTable({ _id: t._id, tableNo: t.tableNo })} className={`w-10 h-10 rounded-xl border text-sm font-semibold ${table?._id === t._id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200"}`}>{t.tableNo}</button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="label">Customer name</label>
            <input className="input" value={customer.name} onChange={set("name")} autoFocus />
          </div>
          {type === "dine-in" && (
            <div className="col-span-2 sm:col-span-1">
              <label className="label">Guests</label>
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-2 py-1">
                <button type="button" onClick={() => setGuests((g) => Math.max(1, g - 1))} className="btn-icon"><LuMinus /></button>
                <span className="text-sm font-medium">{guests}</span>
                <button type="button" onClick={() => setGuests((g) => Math.min(50, g + 1))} className="btn-icon"><LuPlus /></button>
              </div>
            </div>
          )}
          <div className="col-span-2 sm:col-span-1">
            <label className="label">Phone</label>
            <input className="input" type="tel" placeholder="07X XXX XXXX" value={customer.phone} onChange={set("phone")} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="label">Email</label>
            <input className="input" type="email" value={customer.email} onChange={set("email")} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Back</button>
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
};

export default OrderScreen;
