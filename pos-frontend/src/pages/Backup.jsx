import React, { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuDownload, LuUpload, LuTriangleAlert, LuShieldCheck } from "react-icons/lu";
import { exportBackup, restoreBackup } from "../https";
import { apiError, formatDateAndTime } from "../utils";

const LAST_BACKUP_KEY = "pos:lastBackup";

const readLastBackup = () => {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
};

const LABELS = {
  users: "Staff", settings: "Settings", categories: "Categories", menuItems: "Dishes", inventoryItems: "Stock items",
  tables: "Tables", shifts: "Days", orders: "Bills", stockMovements: "Stock movements", counters: "Counters",
};

// Full backup download and restore; shown as a tab on the Data page
const Backup = () => {
  const queryClient = useQueryClient();
  const fileRef = useRef();
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [downloading, setDownloading] = useState(false);
  const [file, setFile] = useState(null);
  const [confirm, setConfirm] = useState("");

  const download = async () => {
    setDownloading(true);
    try {
      const res = await exportBackup();
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const now = new Date().toISOString();
      try { localStorage.setItem(LAST_BACKUP_KEY, now); } catch { /* storage unavailable */ }
      setLastBackup(now);
    } catch (error) {
      enqueueSnackbar(apiError(error, "Backup failed."), { variant: "error" });
    } finally {
      setDownloading(false);
    }
  };

  const pickFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    try {
      const backup = JSON.parse(await picked.text());
      if (backup.app !== "restro-pos") throw new Error();
      setFile({ name: picked.name, backup });
      setConfirm("");
    } catch {
      enqueueSnackbar("That file isn't a POS backup.", { variant: "error" });
    }
  };

  const restore = useMutation({
    mutationFn: restoreBackup,
    onSuccess: () => {
      enqueueSnackbar("Backup restored. Reloading…", { variant: "success" });
      queryClient.clear();
      setTimeout(() => window.location.reload(), 1200);
    },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  const daysSince = lastBackup ? Math.floor((Date.now() - new Date(lastBackup)) / 86400000) : null;

  return (
    <div className="space-y-4">

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Download a backup</h2>
            <p className="text-sm text-zinc-600 mt-1">Everything in one file. Download weekly and keep a copy off this computer.</p>
            <p className={`text-sm mt-3 ${daysSince === null || daysSince > 7 ? "text-amber-700" : "text-zinc-600"}`}>
              {lastBackup ? `Last downloaded on this device: ${formatDateAndTime(lastBackup)}` : "No backup downloaded on this device yet."}
            </p>
          </div>
          <button onClick={download} disabled={downloading} className="btn-primary"><LuDownload size={16} /> {downloading ? "Preparing…" : "Download backup"}</button>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Restore from a backup</h2>
            <p className="text-sm text-zinc-600 mt-1">Replaces <strong>all</strong> current data with a backup file.</p>
          </div>
          <button onClick={() => fileRef.current.click()} className="btn-secondary"><LuUpload size={16} /> Choose file</button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={pickFile} className="hidden" />
        </div>

        {file && (
          <form onSubmit={(e) => { e.preventDefault(); restore.mutate({ backup: file.backup, confirm }); }} className="rounded-xl border border-red-200 bg-red-50/60 p-4 space-y-4">
            <div className="flex gap-3">
              <LuTriangleAlert className="text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">{file.name}</p>
                <p className="text-zinc-600">Made {formatDateAndTime(file.backup.exportedAt)}. Everything entered since then will be lost.</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              {Object.entries(file.backup.collections || {}).filter(([key]) => LABELS[key]).map(([key, docs]) => (
                <div key={key} className="rounded-lg bg-white p-2"><dt className="text-xs text-zinc-600">{LABELS[key]}</dt><dd className="font-medium tabular-nums">{docs.length}</dd></div>
              ))}
            </dl>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Type RESTORE to confirm</label>
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
              </div>
              <button type="submit" disabled={confirm !== "RESTORE" || restore.isPending} className="btn-danger">{restore.isPending ? "Restoring…" : "Replace all data"}</button>
              <button type="button" onClick={() => setFile(null)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div className="card p-6 flex gap-3">
        <LuShieldCheck className="text-emerald-600 shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-zinc-600">
          <p className="font-medium text-zinc-900">Automatic backups</p>
          <p className="mt-1">On paid MongoDB Atlas tiers, also turn on Atlas backups. The free tier has none, so download here regularly.</p>
        </div>
      </div>
    </div>
  );
};

export default Backup;
