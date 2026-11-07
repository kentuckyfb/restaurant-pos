import React, { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LuSearch, LuUsers, LuDownload, LuPhone, LuMail } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import Tabs from "../components/shared/Tabs";
import Modal from "../components/shared/Modal";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import OrderDetailModal from "../components/orders/OrderDetailModal";
import { getCustomerOrders, getCustomers } from "../https";
import { formatDate, formatDateAndTime, formatMoney, formatNumber, getAvatarName, orderLabel, orderNumber } from "../utils";

const PAGE_SIZE = 50;

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const Customers = () => {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    document.title = "Customers · Restro";
  }, []);

  // Wait for typing to pause before searching
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useQuery({
    queryKey: ["customers", query, sort, page],
    queryFn: () => getCustomers({ search: query || undefined, sort, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const customers = data?.data || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCsv = async () => {
    const all = await getCustomers({ search: query || undefined, sort, limit: 200, page: 1 });
    const rows = [["Name", "Phone", "Email", "Visits", "Total spent", "First visit", "Last visit"],
      ...all.data.map((c) => [c.name, c.phone, c.email, c.visits, c.spent, formatDate(c.firstVisit), formatDate(c.lastVisit)])];
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="page">
      <PageHeader title="Customers">
        <Tabs tabs={[{ value: "recent", label: "Recent" }, { value: "spent", label: "Top spenders" }, { value: "visits", label: "Most visits" }]} value={sort} onChange={(v) => { setSort(v); setPage(1); }} />
        <button onClick={exportCsv} disabled={!total} className="btn-secondary"><LuDownload size={16} /> CSV</button>
      </PageHeader>

      <div className="relative max-w-md">
        <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or email" className="input !pl-10" />
      </div>

      <div className="card overflow-hidden">
        {customers.length === 0 && !isFetching ? (
          <EmptyState icon={<LuUsers />} title={query ? "No matching customers" : "No customers yet"}>
            {!query && "Add a name, phone or email when taking an order and they appear here."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>Customer</th><th>Phone</th><th>Email</th><th className="text-right">Visits</th><th className="text-right">Spent</th><th>Last visit</th></tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.key} onClick={() => setSelected(c)} className="cursor-pointer">
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                          {getAvatarName(c.name) || <LuUsers size={14} />}
                        </span>
                        <span className="font-medium text-zinc-900">{c.name || <span className="text-zinc-500 font-normal">No name</span>}</span>
                      </div>
                    </td>
                    <td className="tabular-nums">{c.phone || "—"}</td>
                    <td className="text-zinc-600">{c.email || "—"}</td>
                    <td className="text-right">{formatNumber(c.visits)}</td>
                    <td className="text-right font-medium text-zinc-900">{formatMoney(c.spent)}</td>
                    <td className="text-zinc-600 whitespace-nowrap">{formatDate(c.lastVisit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-zinc-200 text-sm text-zinc-600">
            <span>{formatNumber(total)} customers</span>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="btn-secondary !py-1.5">Previous</button>
                <span className="tabular-nums">{page} / {pages}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages} className="btn-secondary !py-1.5">Next</button>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && <CustomerModal customer={selected} onClose={() => setSelected(null)} />}
    </section>
  );
};

const CustomerModal = ({ customer, onClose }) => {
  const [order, setOrder] = useState(null);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["customer-orders", customer.key],
    queryFn: () => getCustomerOrders(customer.key),
    select: (r) => r.data,
  });

  if (order) return <OrderDetailModal order={order} onClose={() => setOrder(null)} />;

  return (
    <Modal title={customer.name || "Customer"} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-700">
          {customer.phone && <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand-700"><LuPhone size={14} /> {customer.phone}</a>}
          {customer.email && <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 hover:text-brand-700"><LuMail size={14} /> {customer.email}</a>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Visits", formatNumber(customer.visits)],
            ["Total spent", formatMoney(customer.spent)],
            ["Customer since", formatDate(customer.firstVisit)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-200 p-3">
              <p className="text-xs text-zinc-600">{label}</p>
              <p className="font-semibold tabular-nums mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Order</th><th>Date</th><th>Type</th><th>Status</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id} onClick={() => setOrder(o)} className="cursor-pointer">
                  <td className="font-semibold tabular-nums">{orderNumber(o)}</td>
                  <td className="text-zinc-600 whitespace-nowrap">{formatDateAndTime(o.createdAt)}</td>
                  <td>{orderLabel(o)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="text-right">{formatMoney(o.bills.total)}</td>
                </tr>
              ))}
              {!isLoading && orders.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-500 py-8">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

export default Customers;
