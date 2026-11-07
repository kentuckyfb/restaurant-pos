import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LuReceipt } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import Tabs from "../components/shared/Tabs";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import { useOpenOrders } from "../hooks/useAppData";
import { applyLocalEdits } from "../offline/localOrders";
import { formatMoney, minutesSince, orderLabel, orderNumber } from "../utils";
import { useLocalOrders } from "../offline/hooks";

const Orders = () => {

  const [type, setType] = useState("all");

    useEffect(() => {
      document.title = "Open orders · Restro"
    }, [])

  const localOrders = useLocalOrders();
  const { data: serverOrders = [], isLoading, isError, refetch } = useOpenOrders();

  // Offline orders on this till that are still open come first
  const orders = [...localOrders.filter((o) => o.kind === "new" && o.status === "Open"), ...applyLocalEdits(serverOrders, { openOnly: true })];
  const filtered = type === "all" ? orders : orders.filter((order) => order.type === type);
  const tabs = [
    { value: "all", label: "All", count: orders.length },
    { value: "dine-in", label: "Dine-in", count: orders.filter((o) => o.type === "dine-in").length },
    { value: "takeaway", label: "Takeaway", count: orders.filter((o) => o.type === "takeaway").length },
    { value: "delivery", label: "Delivery", count: orders.filter((o) => o.type === "delivery").length },
  ];

  return (
    <section className="page">
      <PageHeader title="Open orders">
        <Tabs tabs={tabs} value={type} onChange={setType} />
      </PageHeader>

      {isLoading && filtered.length === 0 ? (
        // Placeholder cards while loading, so it never looks like "no orders"
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading orders">
          {[0, 1, 2].map((i) => <div key={i} className="card h-[11.5rem] animate-pulse bg-zinc-50" />)}
        </div>
      ) : isError && filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={<LuReceipt />} title="Couldn't load orders">
            <button onClick={() => refetch()} className="btn-secondary mt-3">Try again</button>
          </EmptyState>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={<LuReceipt />} title="No open orders" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((order) => (
            <Link key={order._id} to={`/pos/${order._id}`} className="card p-5 flex flex-col hover:border-zinc-300 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold tabular-nums">{orderNumber(order)}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {orderLabel(order)}{order.customer?.name && ` · ${order.customer.name}`} · {minutesSince(order.createdAt)} min ago
                  </p>
                </div>
                {order.local || order.offlineEdit ? <StatusBadge status="Offline" label={order.local ? "Not synced" : "Changed offline"} tone="amber" /> : <StatusBadge status={order.kitchenStatus} label={order.kitchenStatus === "New" ? "Not sent" : order.kitchenStatus} />}
              </div>
              <ul className="mt-4 space-y-1 text-sm text-zinc-600 flex-1">
                {order.items.slice(0, 4).map((item) => (
                  <li key={item._id} className="truncate">{item.quantity}× {item.name}</li>
                ))}
                {order.items.length > 4 && <li className="text-zinc-500">+{order.items.length - 4} more</li>}
              </ul>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-100">
                <p className="text-xs text-zinc-600">by {order.createdBy?.name}</p>
                <p className="font-semibold tabular-nums">{formatMoney(order.bills.total)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
};

export default Orders;
