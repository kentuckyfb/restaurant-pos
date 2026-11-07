import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuWifiOff, LuCloudUpload, LuTriangleAlert, LuRefreshCw } from "react-icons/lu";
import Modal from "./Modal";
import { useLocalOrders, useOnline } from "../../offline/hooks";
import { checkConnection } from "../../offline/network";
import { removeLocalOrder, saveLocalOrder, syncLocalOrders, unsyncedOrders } from "../../offline/localOrders";
import { formatDateAndTime, formatMoney, formatOrderNo, orderLabel, orderNumber } from "../../utils";

const describe = (record) =>
  record.kind === "edit"
    ? `Changes to order #${formatOrderNo(record.orderNo)}${record.status !== "Open" ? ` (${record.status.toLowerCase()} offline)` : ""}`
    : `New order ${orderNumber(record)} · ${orderLabel(record)}`;

// Manual sync: push offline work, then reload everything
const useSyncNow = () => {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const syncNow = async () => {
    setBusy(true);
    try {
      const reachable = await checkConnection();
      if (!reachable) {
        enqueueSnackbar("Still offline. Everything is saved on this till.", { variant: "warning" });
        return;
      }
      await syncLocalOrders();
      await queryClient.invalidateQueries();
      const left = unsyncedOrders().length;
      enqueueSnackbar(left ? "Synced what could be synced." : "Everything is up to date.", { variant: "success" });
    } finally {
      setBusy(false);
    }
  };
  return { syncNow, busy };
};

// Small icon button for the sidebar footer
export const SyncButton = () => {
  const { syncNow, busy } = useSyncNow();
  return (
    <button onClick={syncNow} disabled={busy} title="Sync now" aria-label="Sync now" className="p-2 rounded-lg text-zinc-500 hover:bg-white/10 hover:text-white disabled:opacity-50">
      <LuRefreshCw size={16} className={busy ? "animate-spin" : ""} />
    </button>
  );
};

// Sidebar notice: only shown when offline, when work is waiting to sync, or when a sync failed
const SyncStatus = () => {
  const online = useOnline();
  const records = useLocalOrders();
  const { syncNow, busy } = useSyncNow();
  const [open, setOpen] = useState(false);
  const failed = records.filter((o) => o.syncState === "failed");
  const waiting = records.filter((o) => o.syncState === "pending");

  if (online && records.length === 0) return null;

  // Colours for the dark sidebar
  const tone = failed.length
    ? "bg-red-500/15 text-red-300 border-red-500/30"
    : !online
      ? "bg-amber-500/10 text-amber-300 border-amber-500/25"
      : waiting.length ? "bg-sky-500/10 text-sky-300 border-sky-500/25" : "bg-white/[0.04] text-zinc-400 border-white/10";
  const Icon = failed.length ? LuTriangleAlert : !online ? LuWifiOff : LuCloudUpload;
  const label = failed.length
    ? `${failed.length} need${failed.length > 1 ? "" : "s"} attention`
    : !online
      ? waiting.length ? `Offline · ${waiting.length} waiting` : "Offline"
      : waiting.length ? `${waiting.length} waiting to sync` : "All synced";

  return (
    <>
      <div className={`mb-3 flex items-center rounded-xl border text-xs font-medium ${tone}`}>
        <button onClick={() => setOpen(true)} title={label} className="flex-1 min-w-0 flex items-center justify-center lg:justify-start gap-2 px-3 py-2">
          <Icon size={16} className="shrink-0" />
          <span className="hidden lg:inline truncate">{label}</span>
        </button>
        <button onClick={syncNow} disabled={busy} title="Sync now" aria-label="Sync now" className="hidden lg:flex p-2 mr-1 rounded-lg hover:bg-white/10 disabled:opacity-50">
          <LuRefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      {open && <SyncModal online={online} records={records} busy={busy} onSync={syncNow} onClose={() => setOpen(false)} />}
    </>
  );
};

const SyncModal = ({ online, records, busy, onSync, onClose }) => (
  <Modal
    title={online ? "Sync" : "You're offline"}
    subtitle={online
      ? "Work done offline on this till is sent to the server automatically every 20 seconds, or now with Sync."
      : "Keep working: new orders, adding items, kitchen updates and payments are saved on this till and synced when the connection is back."}
    onClose={onClose}
    size="lg"
    footer={<button onClick={onSync} disabled={busy} className="btn-primary"><LuRefreshCw size={16} className={busy ? "animate-spin" : ""} /> Sync now</button>}
  >
    {records.length === 0 ? (
      <p className="text-sm text-zinc-500">Nothing waiting. This till is up to date.</p>
    ) : (
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
        {records.map((record) => (
          <li key={record._id} className="px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{describe(record)}</p>
                <p className="text-xs text-zinc-500">
                  {formatMoney(record.bills?.total)} · saved {formatDateAndTime(record.updatedLocallyAt || record.createdAt)}
                </p>
              </div>
              <span className={`text-xs font-medium ${record.syncState === "failed" ? "text-red-600" : "text-zinc-500"}`}>
                {record.syncState === "failed" ? "Failed" : "Waiting"}
              </span>
              {record.status === "Open" && (
                <Link to={`/pos/${record.kind === "edit" ? record.serverId : record._id}`} onClick={onClose} className="btn-secondary !py-1 !px-2.5 text-xs">Open</Link>
              )}
            </div>
            {record.syncState === "failed" && (
              <div className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-800">
                <p>{record.syncError}</p>
                <p className="mt-1 text-red-700/80">Fix the cause (e.g. start the day, or re-add a deleted dish), then retry. If you've entered it again by hand, remove it here.</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { saveLocalOrder(record); syncLocalOrders(); }} className="btn-secondary !py-1 !px-2.5 text-xs">Retry</button>
                  <button onClick={() => window.confirm("Remove this from the till? It won't be sent to the server.") && removeLocalOrder(record._id)} className="btn-ghost !py-1 !px-2.5 text-xs text-red-700">Remove</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    )}
  </Modal>
);

export default SyncStatus;
