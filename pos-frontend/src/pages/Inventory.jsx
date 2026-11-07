import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import {
  LuPlus, LuPencil, LuTrash2, LuPackagePlus, LuPackage, LuSearch, LuBoxes, LuTriangleAlert, LuCoins,
  LuShoppingCart, LuArrowDownToLine, LuTrash, LuClipboardCheck, LuHistory,
} from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import Tabs from "../components/shared/Tabs";
import Modal from "../components/shared/Modal";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import StatCard from "../components/shared/StatCard";
import OrderDetailModal from "../components/orders/OrderDetailModal";
import {
  adjustStock, createInventoryItem, deleteInventoryItem, getInventory, getOrder, getStockMovements, updateInventoryItem,
} from "../https";
import { apiError, formatDateAndTime, formatMoney, formatNumber, formatOrderNo } from "../utils";

const UNITS = ["kg", "g", "l", "ml", "pcs", "pack", "bottle"];
const ADJUST_TYPES = [
  { value: "purchase", label: "Stock in", hint: "Delivery or purchase. Adds to stock." },
  { value: "waste", label: "Waste", hint: "Spoiled, spilled or staff use. Removes from stock." },
  { value: "count", label: "Stock count", hint: "Set the exact amount you counted." },
];

// How each kind of stock change is shown in the movements list
const MOVEMENT_TYPES = {
  sale: { label: "Sale", icon: LuShoppingCart, className: "bg-sky-50 text-sky-700 ring-sky-200" },
  purchase: { label: "Stock in", icon: LuArrowDownToLine, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  waste: { label: "Waste", icon: LuTrash, className: "bg-red-50 text-red-700 ring-red-200" },
  count: { label: "Count", icon: LuClipboardCheck, className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
};

const MovementBadge = ({ type }) => {
  const t = MOVEMENT_TYPES[type] || MOVEMENT_TYPES.count;
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset whitespace-nowrap ${t.className}`}>
      <Icon size={13} /> {t.label}
    </span>
  );
};

// Stock level against the reorder point (the grey tick). The bar is full at three times the reorder level.
const LevelBar = ({ item }) => {
  const full = Math.max(item.reorderLevel * 3, item.quantity, 1);
  const pct = Math.max(0, Math.min(100, (item.quantity / full) * 100));
  const mark = Math.min(100, (item.reorderLevel / full) * 100);
  const low = item.quantity <= item.reorderLevel;
  return (
    <div className="relative h-1.5 w-24 rounded-full bg-zinc-100" aria-hidden="true">
      <div className={`absolute inset-y-0 left-0 rounded-full ${low ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      {item.reorderLevel > 0 && <div className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-zinc-400" style={{ left: `${mark}%` }} />}
    </div>
  );
};

const Inventory = () => {
  const [tab, setTab] = useState("stock");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [movementType, setMovementType] = useState("all");
  const [viewOrder, setViewOrder] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    document.title = "Inventory · Restro";
  }, []);

  const { data: items = [], isLoading } = useQuery({ queryKey: ["inventory"], queryFn: getInventory, select: (r) => r.data });
  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ["inventory", "movements", movementType],
    queryFn: () => getStockMovements({ limit: 200, ...(movementType !== "all" && { type: movementType }) }),
    select: (r) => r.data,
    enabled: tab === "movements",
  });

  const openOrder = async (id) => {
    try {
      const { data } = await getOrder(id);
      setViewOrder(data);
    } catch (error) {
      enqueueSnackbar(error.response?.status === 404 ? "That bill has been archived." : apiError(error), { variant: "error" });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ["inventory"] }); enqueueSnackbar(res.message, { variant: "success" }); },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  const lowCount = items.filter((i) => i.quantity <= i.reorderLevel).length;
  const stockValue = items.reduce((sum, i) => sum + Math.max(0, i.quantity) * i.costPerUnit, 0);
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="page">
      <PageHeader title="Inventory">
        <button onClick={() => setEditing({})} className="btn-primary"><LuPlus size={16} /> Add stock item</button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Stock items" icon={<LuBoxes size={18} />} iconTone="blue" value={items.length} hint="ingredients tracked" />
        <StatCard label="Low or out" icon={<LuTriangleAlert size={18} />} iconTone="amber" value={lowCount} tone={lowCount ? "red" : undefined} hint={lowCount ? "need reordering" : "all stocked"} />
        <StatCard label="Stock value" icon={<LuCoins size={18} />} iconTone="green" value={formatMoney(stockValue)} hint="at cost price" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={[{ value: "stock", label: "Stock levels" }, { value: "movements", label: "Stock movements" }]} value={tab} onChange={setTab} />
        {tab === "movements" && (
          <Tabs
            tabs={[{ value: "all", label: "All" }, { value: "sale", label: "Sales" }, { value: "manual", label: "Manual" }]}
            value={movementType}
            onChange={setMovementType}
          />
        )}
        {tab === "stock" && (
          <div className="relative w-full sm:w-72">
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stock" className="input !pl-10" />
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {tab === "stock" ? (
          !isLoading && items.length === 0 ? (
            <EmptyState icon={<LuPackage />} title="No stock items yet">Add ingredients, then link them to dishes in Menu.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th>Item</th><th className="text-right">In stock</th><th>Level</th><th className="text-right">Reorder at</th><th className="text-right">Cost / unit</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const low = item.quantity <= item.reorderLevel;
                    return (
                      <tr key={item._id}>
                        <td className="font-medium">{item.name}</td>
                        <td className={`text-right tabular-nums font-medium ${low ? "text-red-600" : ""}`}>{formatNumber(item.quantity, 3)} {item.unit}</td>
                        <td><LevelBar item={item} /></td>
                        <td className="text-right tabular-nums text-zinc-600">{formatNumber(item.reorderLevel, 3)} {item.unit}</td>
                        <td className="text-right tabular-nums text-zinc-600">{formatMoney(item.costPerUnit)}</td>
                        <td><StatusBadge status={low ? "Low" : "OK"} label={item.quantity <= 0 ? "Out" : low ? "Low" : "OK"} /></td>
                        <td className="text-right whitespace-nowrap">
                          <button onClick={() => setAdjusting(item)} className="btn-ghost !py-1.5 !px-2.5 mr-1 text-[13px]"><LuPackagePlus size={15} /> Adjust</button>
                          <button onClick={() => setEditing(item)} className="btn-icon" aria-label={`Edit ${item.name}`}><LuPencil size={16} /></button>
                          <button
                            onClick={() => window.confirm(`Delete ${item.name}?`) && deleteMutation.mutate(item._id)}
                            className="btn-icon hover:!text-red-600"
                            aria-label={`Delete ${item.name}`}
                          >
                            <LuTrash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          movementsLoading ? (
            <div className="p-5 space-y-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded-lg bg-zinc-100 animate-pulse" />)}</div>
          ) : movements.length === 0 ? (
            <EmptyState icon={<LuHistory />} title={movementType === "sale" ? "No sales logged yet" : "No stock movements yet"}>
              Paid bills take each dish&apos;s recipe out of stock and show here. Deliveries, waste and counts are added with Adjust.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>When</th><th>Item</th><th>Type</th><th className="text-right">Change</th><th className="text-right">Balance</th><th>Details</th><th>By</th></tr></thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m._id}>
                      <td className="text-zinc-600 whitespace-nowrap">{formatDateAndTime(m.createdAt)}</td>
                      <td className="font-medium">{m.item?.name || "Deleted item"}</td>
                      <td><MovementBadge type={m.type} /></td>
                      <td className={`text-right tabular-nums font-medium ${m.change < 0 ? "text-red-600" : "text-emerald-700"}`}>
                        {m.change > 0 ? "+" : ""}{formatNumber(m.change, 3)} <span className="font-normal text-zinc-500">{m.item?.unit}</span>
                      </td>
                      <td className="text-right tabular-nums">{formatNumber(m.balanceAfter, 3)} <span className="text-zinc-500">{m.item?.unit}</span></td>
                      <td className="text-zinc-600">
                        {m.type === "sale" && m.order ? (
                          <button onClick={() => openOrder(m.order)} className="font-medium text-brand-700 hover:underline">Bill #{formatOrderNo(m.orderNo)}</button>
                        ) : (m.note || "—")}
                      </td>
                      <td className="text-zinc-600">{m.user?.name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {movements.length >= 200 && <p className="px-5 py-3 text-[13px] text-zinc-600 border-t border-zinc-100">Showing the latest 200.</p>}
            </div>
          )
        )}
      </div>

      {editing && <StockItemModal item={editing} onClose={() => setEditing(null)} />}
      {adjusting && <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} />}
      {viewOrder && <OrderDetailModal order={viewOrder} readOnly onClose={() => setViewOrder(null)} />}
    </section>
  );
};

const StockItemModal = ({ item, onClose }) => {
  const queryClient = useQueryClient();
  const isNew = !item._id;
  const [form, setForm] = useState({
    name: item.name || "",
    unit: item.unit || "kg",
    quantity: "",
    reorderLevel: item.reorderLevel ?? "",
    costPerUnit: item.costPerUnit ?? "",
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const mutation = useMutation({
    mutationFn: isNew ? createInventoryItem : updateInventoryItem,
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ["inventory"] }); enqueueSnackbar(res.message, { variant: "success" }); onClose(); },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  return (
    <Modal title={isNew ? "Add stock item" : `Edit ${item.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ id: item._id, ...form }); }} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Chicken" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Unit</label>
            <select className="input" value={form.unit} onChange={set("unit")}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          {isNew && (
            <div>
              <label className="label">Opening stock</label>
              <input type="number" min="0" step="any" className="input" value={form.quantity} onChange={set("quantity")} placeholder="0" />
            </div>
          )}
          <div>
            <label className="label">Reorder level</label>
            <input type="number" min="0" step="any" className="input" value={form.reorderLevel} onChange={set("reorderLevel")} placeholder="0" />
            <p className="hint">Flagged as low at or below this.</p>
          </div>
          <div>
            <label className="label">Cost per {form.unit}</label>
            <input type="number" min="0" step="any" className="input" value={form.costPerUnit} onChange={set("costPerUnit")} placeholder="0" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Back</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">{isNew ? "Add item" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
};

const AdjustModal = ({ item, onClose }) => {
  const queryClient = useQueryClient();
  const [type, setType] = useState("purchase");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const amount = Number(quantity) || 0;
  const after = type === "purchase" ? item.quantity + amount : type === "waste" ? item.quantity - amount : amount;

  const mutation = useMutation({
    mutationFn: adjustStock,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inventory"] }); enqueueSnackbar("Stock updated", { variant: "success" }); onClose(); },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  return (
    <Modal title={`Adjust ${item.name}`} subtitle={`Currently ${formatNumber(item.quantity, 3)} ${item.unit}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ id: item._id, type, quantity: amount, note }); }} className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {ADJUST_TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={`btn border ${type === t.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-zinc-600">{ADJUST_TYPES.find((t) => t.value === type).hint}</p>
        <div>
          <label className="label">{type === "count" ? "Counted amount" : "Quantity"} ({item.unit})</label>
          <input type="number" min="0" step="any" className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Note <span className="text-zinc-500 font-normal">(optional)</span></label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "purchase" ? "Supplier, invoice no." : "Reason"} />
        </div>
        <p className="text-sm">New balance: <span className={`font-semibold tabular-nums ${after < 0 ? "text-red-600" : ""}`}>{formatNumber(after, 3)} {item.unit}</span></p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Back</button>
          <button type="submit" disabled={mutation.isPending || quantity === ""} className="btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
};

export default Inventory;
