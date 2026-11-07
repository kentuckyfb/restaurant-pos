import React, { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LuSearch, LuHistory } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import Tabs from "../components/shared/Tabs";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import OrderDetailModal from "../components/orders/OrderDetailModal";
import { useOnline } from "../offline/hooks";
import { getOrders } from "../https";
import { endOfDay, formatDateAndTime, formatMoney, orderLabel, orderNumber, startOfDay, toInputDate } from "../utils";

const PAGE_SIZE = 50;

const History = () => {
  const [from, setFrom] = useState(toInputDate(new Date()));
  const [to, setTo] = useState(toInputDate(new Date()));
  const [status, setStatus] = useState("Paid,Refunded,Cancelled,Merged");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const online = useOnline();

  useEffect(() => {
    document.title = "Bills · Restro";
  }, []);

  // Wait for typing to pause before searching
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useQuery({
    queryKey: ["orders", "history", from, to, status, query, page],
    queryFn: () => getOrders({
      status,
      from: startOfDay(new Date(`${from}T00:00`)).toISOString(),
      to: endOfDay(new Date(`${to}T00:00`)).toISOString(),
      search: query || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });

  const orders = data?.data || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const paidTotal = orders.filter((o) => ["Paid", "Refunded"].includes(o.status)).reduce((sum, o) => sum + o.bills.total - (o.refundedTotal || 0), 0);

  return (
    <section className="page">
      <PageHeader title="Bills" />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="input" />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="label">Search</label>
          <div className="relative">
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order number, customer, phone or email" className="input !pl-10" />
          </div>
        </div>
        <Tabs
          tabs={[{ value: "Paid,Refunded,Cancelled,Merged", label: "All" }, { value: "Paid", label: "Paid" }, { value: "Refunded", label: "Refunded" }, { value: "Cancelled", label: "Cancelled" }, { value: "Merged", label: "Merged" }]}
          value={status}
          onChange={(value) => { setStatus(value); setPage(1); }}
        />
      </div>

      <div className="card overflow-hidden">
        {orders.length === 0 && !isFetching ? (
          online ? <EmptyState icon={<LuHistory />} title="No bills found">Try a wider date range.</EmptyState> : <EmptyState icon={<LuHistory />} title="You're offline">Bill history needs a connection to the server.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Date & time</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order._id} onClick={() => setSelected(order)} className="cursor-pointer hover:bg-zinc-50">
                    <td className="font-semibold tabular-nums">{orderNumber(order)}</td>
                    <td className="text-zinc-600 whitespace-nowrap">{formatDateAndTime(order.closedAt || order.createdAt)}</td>
                    <td>{orderLabel(order)}</td>
                    <td className="text-zinc-600">{order.customer?.name || "—"}</td>
                    <td className="text-zinc-600">{order.payment?.method || "—"}</td>
                    <td><StatusBadge status={order.status} /></td>
                    <td className={`text-right font-medium tabular-nums ${["Cancelled", "Merged"].includes(order.status) ? "line-through text-zinc-500" : ""}`}>{formatMoney(order.bills.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-zinc-200 text-sm text-zinc-600">
          <span>{total === 1 ? "1 bill" : `${total} bills`} · {formatMoney(paidTotal)} paid on this page</span>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="btn-secondary !py-1.5">Previous</button>
              <span className="tabular-nums">{page} / {pages}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages} className="btn-secondary !py-1.5">Next</button>
            </div>
          )}
        </div>
      </div>

      {selected && <OrderDetailModal order={selected} onClose={() => setSelected(null)} />}
    </section>
  );
};

export default History;
