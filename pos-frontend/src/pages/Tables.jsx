import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuUsers, LuPlus, LuPencil, LuTrash2, LuArmchair } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import Tabs from "../components/shared/Tabs";
import Modal from "../components/shared/Modal";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import { useCurrentShift, useSettings, useTables } from "../hooks/useAppData";
import { useLocalOrders } from "../offline/hooks";
import { fallbackInterval, useLive } from "../offline/realtime";
import { addTable, deleteTable, updateTable } from "../https";
import { apiError, formatMoney, isAdmin, minutesSince, orderNumber } from "../utils";

const Tables = () => {
  const navigate = useNavigate();
  const role = useSelector((state) => state.user.role);
  const [status, setStatus] = useState("all");
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState(null);
  const live = useLive();
  const { data: serverTables = [], isLoading } = useTables({ refetchInterval: fallbackInterval(live, 30000) });
  const { data: shift } = useCurrentShift();
  const { data: settings } = useSettings();
  const localOrders = useLocalOrders();

    useEffect(() => {
      document.title = "Tables · Restro"
    }, [])

  // Tables taken by offline orders on this till show as occupied until those orders sync
  const localByTable = Object.fromEntries(localOrders.filter((o) => o.kind === "new" && o.status === "Open" && o.table).map((o) => [o.table._id, o]));
  // ...and tables whose orders were paid or cancelled offline show as free
  const closedOffline = new Set(localOrders.filter((o) => o.kind === "edit" && o.status !== "Open").map((o) => o.serverId));
  const tables = serverTables.map((t) => {
    if (t.status === "Available" && localByTable[t._id]) return { ...t, status: "Booked", currentOrder: localByTable[t._id] };
    if (t.currentOrder && closedOffline.has(t.currentOrder._id)) return { ...t, status: "Available", currentOrder: null };
    return t;
  });

  const filtered = status === "all" ? tables : tables.filter((table) => table.status === status);
  const tabs = [
    { value: "all", label: "All", count: tables.length },
    { value: "Available", label: "Free", count: tables.filter((t) => t.status === "Available").length },
    { value: "Booked", label: "Occupied", count: tables.filter((t) => t.status === "Booked").length },
  ];

  const openTable = (table) => {
    if (manage) return setEditing(table);
    if (table.status === "Booked" && table.currentOrder) return navigate(`/pos/${table.currentOrder._id}`);
    if (!shift && settings?.requireShift) {
      enqueueSnackbar("Start the day before taking orders (Day & shifts).", { variant: "warning" });
      return;
    }
    navigate("/pos/new", { state: { type: "dine-in", table: { _id: table._id, tableNo: table.tableNo }, guests: Math.min(2, table.seats) } });
  };

  return (
    <section className="page">
      <PageHeader title="Tables">
        <Tabs tabs={tabs} value={status} onChange={setStatus} />
        {isAdmin(role) && (
          <button onClick={() => setManage(!manage)} className={manage ? "btn-primary" : "btn-secondary"}>
            {manage ? "Done" : "Manage"}
          </button>
        )}
      </PageHeader>

      {!isLoading && tables.length === 0 ? (
        <div className="card">
          <EmptyState icon={<LuArmchair />} title="No tables yet">
            {isAdmin(role) ? "Click Manage, then Add table." : "Ask an admin to add tables."}
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {filtered.map((table) => {
            const order = table.currentOrder;
            const booked = table.status === "Booked";
            return (
              <button
                key={table._id}
                onClick={() => openTable(table)}
                className={`card p-4 text-left transition hover:shadow-sm ${booked ? "border-brand-200 bg-brand-50/40 hover:border-brand-300" : "hover:border-zinc-300"} ${manage ? "ring-2 ring-dashed ring-zinc-200" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <p className="text-2xl font-semibold tabular-nums">{table.tableNo}</p>
                  {manage ? <LuPencil className="text-zinc-500" /> : <StatusBadge status={table.status} label={booked ? "Occupied" : "Free"} />}
                </div>
                <div className="mt-5 h-10 text-sm">
                  {booked && order ? (
                    <>
                      <p className="font-medium truncate">{orderNumber(order)}{order.customer?.name && ` · ${order.customer.name}`}</p>
                      <p className="text-xs text-zinc-600 tabular-nums">{formatMoney(order.bills?.total)} · {minutesSince(order.createdAt)} min</p>
                    </>
                  ) : null}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-zinc-600 mt-1">
                  <LuUsers /> {booked && order ? `${order.guests} / ${table.seats}` : table.seats} seats
                  {booked && order?.kitchenStatus === "Ready" && <span className="ml-auto text-emerald-700 font-medium">Food ready</span>}
                </p>
              </button>
            );
          })}
          {manage && (
            <button onClick={() => setEditing({})} className="rounded-2xl border-2 border-dashed border-zinc-300 p-4 flex flex-col items-center justify-center gap-2 text-sm font-medium text-zinc-600 hover:border-brand-400 hover:text-brand-600 min-h-[9.5rem]">
              <LuPlus size={20} /> Add table
            </button>
          )}
        </div>
      )}

      {editing && <TableModal table={editing} nextNumber={Math.max(0, ...tables.map((t) => t.tableNo)) + 1} onClose={() => setEditing(null)} />}
    </section>
  );
};

const TableModal = ({ table, nextNumber, onClose }) => {
  const queryClient = useQueryClient();
  const isNew = !table._id;
  const [form, setForm] = useState({ tableNo: table.tableNo || nextNumber, seats: table.seats || 4 });

  const onSuccess = (res) => {
    queryClient.invalidateQueries({ queryKey: ["tables"] });
    enqueueSnackbar(res.message, { variant: "success" });
    onClose();
  };
  const onError = (error) => enqueueSnackbar(apiError(error), { variant: "error" });
  const save = useMutation({ mutationFn: isNew ? addTable : updateTable, onSuccess, onError });
  const remove = useMutation({ mutationFn: deleteTable, onSuccess, onError });

  return (
    <Modal title={isNew ? "Add table" : `Table ${table.tableNo}`} onClose={onClose} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate({ id: table._id, ...form }); }} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Table number</label>
            <input type="number" min="1" className="input" value={form.tableNo} onChange={(e) => setForm({ ...form, tableNo: e.target.value })} required autoFocus />
          </div>
          <div>
            <label className="label">Seats</label>
            <input type="number" min="1" className="input" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} required />
          </div>
        </div>
        <div className="flex justify-between gap-2 pt-2">
          {!isNew ? (
            <button type="button" onClick={() => remove.mutate(table._id)} disabled={table.status === "Booked"} className="btn-ghost text-red-600 hover:bg-red-50">
              <LuTrash2 size={16} /> Delete
            </button>
          ) : <span />}
          <button type="submit" disabled={save.isPending} className="btn-primary">{isNew ? "Add table" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
};

export default Tables;
