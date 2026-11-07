import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Backup from "./Backup";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuDownload, LuTrash2, LuUpload, LuSearch, LuFileText, LuCheck, LuTriangleAlert, LuDatabase } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import Tabs from "../components/shared/Tabs";
import StatusBadge from "../components/shared/StatusBadge";
import EmptyState from "../components/shared/EmptyState";
import OrderDetailModal from "../components/orders/OrderDetailModal";
import { AreaChart, BarList, ChartCard, ColumnChart } from "../components/reports/Charts";
import StatCard from "../components/shared/StatCard";
import { downloadArchive, getStorage, previewArchive, purgeArchive } from "../https";
import { ORDER_TYPES, apiError, formatCompact, formatDate, formatDateAndTime, formatMoney, formatNumber, formatOrderNo, orderLabel, orderNumber, toInputDate } from "../utils";
import { formatBytes, parseArchiveFile, summarise, toCsv } from "../utils/archive";

// The Data page: backups, storage & archiving, and the archive file viewer
const Archive = () => {
  const [params, setParams] = useSearchParams();
  const tab = ["backup", "archive", "viewer"].includes(params.get("tab")) ? params.get("tab") : "backup";

  useEffect(() => {
    document.title = "Data & backup · Restro";
  }, []);

  return (
    <section className="page">
      <PageHeader title="Data & backup">
        <Tabs
          tabs={[{ value: "backup", label: "Backup" }, { value: "archive", label: "Storage & archive" }, { value: "viewer", label: "View a file" }]}
          value={tab}
          onChange={(value) => setParams({ tab: value }, { replace: true })}
        />
      </PageHeader>
      {tab === "backup" ? <Backup /> : tab === "archive" ? <ArchiveManager /> : <ArchiveViewer />}
    </section>
  );
};

// --- Storage gauge + archive & clear ---

const ArchiveManager = () => {
  const queryClient = useQueryClient();
  const defaultBefore = new Date();
  defaultBefore.setMonth(defaultBefore.getMonth() - 3, 1);
  const [before, setBefore] = useState(toInputDate(defaultBefore));
  const [downloaded, setDownloaded] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [confirm, setConfirm] = useState("");

  const beforeIso = new Date(`${before}T00:00`).toISOString();
  const { data: storage } = useQuery({ queryKey: ["storage"], queryFn: getStorage, select: (r) => r.data });
  const { data: preview, isFetching } = useQuery({ queryKey: ["archive-preview", beforeIso], queryFn: () => previewArchive(beforeIso), select: (r) => r.data });

  const ready = downloaded && downloaded.beforeIso === beforeIso && downloaded.count === preview?.count && preview.count > 0;

  const download = async () => {
    setDownloading(true);
    try {
      const res = await downloadArchive(beforeIso);
      const count = Number(res.headers["x-archive-count"]);
      const checksum = res.headers["x-archive-checksum"];
      // Check the file is complete before allowing anything to be deleted
      const parsed = JSON.parse(await res.data.text());
      if (parsed.orders?.length !== count || parsed.checksum !== checksum) throw new Error("The downloaded file is incomplete. Try again.");

      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      const filename = `orders-archive-to-${toInputDate(new Date(parsed.before))}.json`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded({ beforeIso, count, checksum, filename });
      setConfirm("");
      enqueueSnackbar(`Saved ${formatNumber(count)} orders to ${filename}`, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(error.message?.includes("incomplete") ? error.message : apiError(error, "Download failed."), { variant: "error" });
    } finally {
      setDownloading(false);
    }
  };

  const purge = useMutation({
    mutationFn: purgeArchive,
    onSuccess: (res) => {
      enqueueSnackbar(res.message, { variant: "success" });
      setDownloaded(null);
      setConfirm("");
      queryClient.invalidateQueries({ queryKey: ["storage"] });
      queryClient.invalidateQueries({ queryKey: ["archive-preview"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  const percent = storage?.percent || 0;
  const barTone = percent >= 85 ? "bg-red-500" : percent >= 65 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><LuDatabase /> Database storage</h2>
            <p className="text-sm text-zinc-600 mt-1">
              {storage ? `${formatBytes(storage.usedBytes)} of ${formatBytes(storage.limitBytes)} used · ${formatNumber(storage.orders)} orders` : "Loading…"}
              {storage?.oldestClosedAt && ` · oldest from ${formatDate(storage.oldestClosedAt)}`}
            </p>
          </div>
          <p className={`text-2xl font-semibold tabular-nums ${percent >= 85 ? "text-red-600" : ""}`}>{percent}%</p>
        </div>
        <div className="h-3 mt-4 rounded-full bg-zinc-100 overflow-hidden" role="meter" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Database storage used">
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        <p className="text-xs text-zinc-600 mt-2">
          {percent >= 85 ? "Nearly full. Archive old orders now." : percent >= 65 ? "Getting full. Plan to archive soon." : "Plenty of space."}
        </p>
      </div>

      <div className="card p-6 space-y-5">
        <div>
          <h2 className="font-semibold">Archive & clear old orders</h2>
          <p className="text-sm text-zinc-600 mt-1">Save old orders to a file, then remove them to free up space. Today's orders are never touched.</p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Orders closed before</label>
            <input type="date" value={before} max={toInputDate(new Date())} onChange={(e) => { setBefore(e.target.value); setDownloaded(null); }} className="input" />
          </div>
          <div className="text-sm text-zinc-600 pb-2.5">
            {isFetching ? "Counting…" : preview?.count
              ? <>{formatNumber(preview.count)} orders from {formatDate(preview.from)} to {formatDate(preview.to)} · {formatMoney(preview.sales)} in sales</>
              : "No orders to archive before this date."}
          </div>
        </div>

        <ol className="grid md:grid-cols-2 gap-4">
          <li className={`rounded-xl border p-4 ${ready ? "border-emerald-200 bg-emerald-50/50" : "border-zinc-200"}`}>
            <p className="text-sm font-semibold flex items-center gap-2">
              {ready ? <LuCheck className="text-emerald-600" /> : <span className="text-zinc-500">1</span>} Download the orders
            </p>
            <p className="text-xs text-zinc-600 mt-1 mb-3">
              {ready ? `Saved as ${downloaded.filename}. Keep a second copy somewhere safe.` : "Every order, item and payment in one file."}
            </p>
            <button onClick={download} disabled={downloading || !preview?.count} className="btn-primary">
              <LuDownload size={16} /> {downloading ? "Preparing…" : ready ? "Download again" : "Download archive"}
            </button>
          </li>
          <li className={`rounded-xl border p-4 ${ready ? "border-red-200" : "border-zinc-200 opacity-60"}`}>
            <p className="text-sm font-semibold flex items-center gap-2"><span className="text-zinc-500">2</span> Remove them from the database</p>
            <p className="text-xs text-zinc-600 mt-1 mb-3">
              Available right after step 1. This can't be undone.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); purge.mutate({ before: beforeIso, count: downloaded.count, checksum: downloaded.checksum, confirm }); }} className="flex flex-wrap gap-2">
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type DELETE" disabled={!ready} className="input !w-40" />
              <button type="submit" disabled={!ready || confirm !== "DELETE" || purge.isPending} className="btn-danger">
                <LuTrash2 size={16} /> Remove {ready ? formatNumber(downloaded.count) : ""} orders
              </button>
            </form>
          </li>
        </ol>
      </div>
    </div>
  );
};

// --- Viewer: opens a file in the browser only ---

const PAGE = 50;

const ArchiveViewer = () => {
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const load = async (picked) => {
    if (!picked) return;
    setError("");
    try {
      const parsed = parseArchiveFile(JSON.parse(await picked.text()));
      const dates = parsed.orders.map((o) => new Date(o.closedAt || o.createdAt)).filter((d) => !isNaN(d)).sort((a, b) => a - b);
      setFile({ name: picked.name, ...parsed });
      setFrom(dates.length ? toInputDate(dates[0]) : "");
      setTo(dates.length ? toInputDate(dates[dates.length - 1]) : "");
      setStatus("all");
      setSearch("");
      setPage(1);
    } catch (e) {
      setError(e instanceof SyntaxError ? "That file isn't valid JSON." : e.message);
    }
  };

  const filtered = useMemo(() => {
    if (!file) return [];
    const start = from ? new Date(`${from}T00:00`) : null;
    const end = to ? new Date(`${to}T23:59:59.999`) : null;
    const term = search.trim().toLowerCase();
    return file.orders
      .filter((o) => {
        const when = new Date(o.closedAt || o.createdAt);
        if (start && when < start) return false;
        if (end && when > end) return false;
        if (status !== "all" && o.status !== status) return false;
        if (!term) return true;
        return formatOrderNo(o.orderNo).includes(term.replace("#", "")) ||
          [o.customer?.name, o.customer?.phone, o.customer?.email].some((v) => v && v.toLowerCase().includes(term)) ||
          (o.items || []).some((i) => i.name.toLowerCase().includes(term));
      })
      .sort((a, b) => new Date(b.closedAt || b.createdAt) - new Date(a.closedAt || a.createdAt));
  }, [file, from, to, status, search]);

  const stats = useMemo(() => summarise(filtered), [filtered]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.name.replace(/\.json$/, "")}${from ? `-${from}-to-${to}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!file) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); load(e.dataTransfer.files?.[0]); }}
        className={`card border-2 border-dashed ${dragging ? "border-brand-400 bg-brand-50/40" : "border-zinc-300"}`}
      >
        <EmptyState icon={<LuFileText />} title="Open an archive or backup file">
          Drop a file here or choose one. It stays on this computer.
        </EmptyState>
        <div className="flex flex-col items-center gap-3 pb-10 -mt-6">
          <button onClick={() => fileRef.current.click()} className="btn-primary"><LuUpload size={16} /> Choose file</button>
          {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><LuTriangleAlert /> {error}</p>}
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const days = stats.byDay.map((d) => ({
    label: new Date(`${d.date}T00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    short: new Date(`${d.date}T00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "numeric" }),
    value: d.value,
  }));

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium flex items-center gap-2"><LuFileText /> {file.name}</p>
          <p className="text-zinc-600">
            {file.info.kind}{file.info.businessName && ` · ${file.info.businessName}`} · saved {formatDateAndTime(file.info.exportedAt)} · {formatNumber(file.orders.length)} orders · view only
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} disabled={!filtered.length} className="btn-secondary"><LuDownload size={16} /> CSV for Excel</button>
          <button onClick={() => setFile(null)} className="btn-ghost">Open another file</button>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div><label className="label">From</label><input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="input" /></div>
        <div><label className="label">To</label><input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="input" /></div>
        <div className="flex-1 min-w-[12rem]">
          <label className="label">Search</label>
          <div className="relative">
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Order number, customer, phone, email or dish" className="input !pl-10" />
          </div>
        </div>
        <Tabs
          tabs={["all", "Paid", "Refunded", "Cancelled", "Merged"].map((s) => ({ value: s, label: s === "all" ? "All" : s }))}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Net sales" value={formatMoney(stats.net)} hint={stats.refunded ? `after ${formatMoney(stats.refunded)} refunds` : "after refunds"} />
        <StatCard label="Bills" value={formatNumber(stats.bills)} hint={`${formatNumber(stats.cancelled)} cancelled · ${formatNumber(stats.merged)} merged`} />
        <StatCard label="Average bill" value={formatMoney(stats.average)} />
        <StatCard label="Guests" value={formatNumber(stats.guests)} />
      </div>

      {days.length > 0 && (
        <ChartCard title="Sales" aside={formatMoney(stats.total)}>
          {days.length > 10
            ? <AreaChart data={days} formatValue={formatMoney} formatAxis={formatCompact} labelEvery={Math.ceil(days.length / 10)} />
            : <ColumnChart data={days} formatValue={formatMoney} formatAxis={formatCompact} />}
        </ChartCard>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Payment methods"><BarList rows={stats.byMethod} formatValue={formatMoney} /></ChartCard>
        <ChartCard title="Order types"><BarList rows={stats.byType.map((r) => ({ ...r, label: ORDER_TYPES[r.label] || r.label }))} formatValue={formatMoney} /></ChartCard>
        <ChartCard title="Categories"><BarList rows={stats.byCategory} formatValue={formatMoney} /></ChartCard>
        <ChartCard title="Taken by"><BarList rows={stats.byStaff} formatValue={formatMoney} /></ChartCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="card overflow-hidden">
          <h2 className="card-title px-5 pt-5 pb-3">Best sellers</h2>
          <table className="data-table">
            <thead><tr><th>Dish</th><th className="text-right">Sold</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              {stats.topItems.map((item) => (
                <tr key={item.name}><td>{item.name}</td><td className="text-right tabular-nums">{formatNumber(item.quantity)}</td><td className="text-right tabular-nums">{formatMoney(item.revenue)}</td></tr>
              ))}
              {stats.topItems.length === 0 && <tr><td colSpan={3} className="text-center text-zinc-600 py-8">No sales in this range.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card overflow-hidden lg:col-span-2">
          <h2 className="card-title px-5 pt-5 pb-3">Bills <span className="text-zinc-500 font-normal">{formatNumber(filtered.length)}</span></h2>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Order</th><th>Closed</th><th>Type</th><th>Customer</th><th>Status</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {rows.map((order) => (
                  <tr key={order._id} onClick={() => setSelected(order)} className="cursor-pointer hover:bg-zinc-50">
                    <td className="font-semibold tabular-nums">{orderNumber(order)}</td>
                    <td className="text-zinc-600 whitespace-nowrap">{formatDateAndTime(order.closedAt || order.createdAt)}</td>
                    <td>{orderLabel(order)}</td>
                    <td className="text-zinc-600">{order.customer?.name || order.customer?.phone || "—"}</td>
                    <td><StatusBadge status={order.status} /></td>
                    <td className={`text-right tabular-nums font-medium ${["Cancelled", "Merged"].includes(order.status) ? "line-through text-zinc-500" : ""}`}>{formatMoney(order.bills?.total)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="text-center text-zinc-600 py-10">No bills match.</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-200 text-sm text-zinc-600">
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="btn-secondary !py-1.5">Previous</button>
              <span className="tabular-nums">{page} / {pages}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages} className="btn-secondary !py-1.5">Next</button>
            </div>
          )}
        </div>
      </div>

      {selected && <OrderDetailModal order={selected} readOnly onClose={() => setSelected(null)} />}
    </div>
  );
};

export default Archive;
