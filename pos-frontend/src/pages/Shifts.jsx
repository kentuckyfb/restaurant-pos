import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuPlay, LuSquare, LuPrinter, LuTriangleAlert } from "react-icons/lu";
import PageHeader from "../components/shared/PageHeader";
import StatusBadge from "../components/shared/StatusBadge";
import Modal from "../components/shared/Modal";
import StatCard from "../components/shared/StatCard";
import { useCurrentShift, useSettings } from "../hooks/useAppData";
import { closeShift, getShift, getShifts, openShift } from "../https";
import { apiError, formatDateAndTime, formatMoney, formatNumber } from "../utils";
import { printShiftReport } from "../utils/print";

// Sri Lankan notes and coins, for counting the drawer
const DENOMINATIONS = [5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

const SummaryRows = ({ shift }) => {
  const s = shift.summary || {};
  const rows = [
    ["Bills paid", formatNumber(s.orders)],
    ["Gross sales", formatMoney(s.subtotal)],
    ["Discounts", s.discount ? `-${formatMoney(s.discount)}` : formatMoney(0)],
    ["Service charge", formatMoney(s.serviceCharge)],
    ["VAT", formatMoney(s.vat)],
    ["Net total", formatMoney(s.total)],
    ["Cancelled orders", formatNumber(s.cancelled)],
    ...(s.refundTotal ? [["Refunds given", `-${formatMoney(s.refundTotal)}`], ["After refunds", formatMoney(s.netAfterRefunds)]] : []),
  ];
  return (
    <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between border-b border-zinc-100 pb-2">
          <dt className="text-zinc-600">{label}</dt><dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
      {(s.byMethod || []).map((m) => (
        <div key={m.method} className="flex justify-between border-b border-zinc-100 pb-2">
          <dt className="text-zinc-600">{m.method} ({m.count})</dt><dd className="font-medium tabular-nums">{formatMoney(m.total)}</dd>
        </div>
      ))}
    </dl>
  );
};

const Shifts = () => {
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { data: shift, isLoading } = useCurrentShift();
  const [openingCash, setOpeningCash] = useState("");
  const [closing, setClosing] = useState(false);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    document.title = "Day & shifts · Restro";
  }, []);

  const { data: history = [] } = useQuery({ queryKey: ["shifts"], queryFn: getShifts, select: (r) => r.data });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shift"] });
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
  };

  const openMutation = useMutation({
    mutationFn: openShift,
    onSuccess: () => { refresh(); setOpeningCash(""); enqueueSnackbar("Day started. You can take orders now.", { variant: "success" }); },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  if (isLoading) return null;

  return (
    <section className="page">
      <PageHeader title="Day & shifts" />

      {!shift ? (
        <form
          onSubmit={(e) => { e.preventDefault(); openMutation.mutate({ openingCash: Number(openingCash) || 0 }); }}
          className="card p-6 flex flex-wrap items-end gap-4"
        >
          <div className="flex-1 min-w-[14rem]">
            <h2 className="font-semibold">Start the day</h2>
            <p className="text-sm text-zinc-600 mt-1 mb-4">Count the cash in the drawer before the first sale.</p>
            <label className="label">Opening cash ({settings?.currencySymbol})</label>
            <input type="number" min="0" step="any" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0" className="input max-w-xs !text-lg tabular-nums" autoFocus />
          </div>
          <button type="submit" disabled={openMutation.isPending} className="btn-primary !py-3 !px-6">
            <LuPlay size={16} /> Start the day
          </button>
        </form>
      ) : (
        <div className="card p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Current shift</h2>
                <StatusBadge status="open" label="Open" />
              </div>
              <p className="text-sm text-zinc-600 mt-1">Started {formatDateAndTime(shift.openedAt)} by {shift.openedBy?.name} with {formatMoney(shift.openingCash)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => printShiftReport(shift, settings)} className="btn-secondary"><LuPrinter size={16} /> X report</button>
              <button onClick={() => setClosing(true)} className="btn-primary"><LuSquare size={14} /> Close the day</button>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="Net sales" value={formatMoney(shift.summary?.total)} hint={`${formatNumber(shift.summary?.orders)} bills`} />
            <StatCard label="Cash sales" value={formatMoney(shift.summary?.cashSales)} />
            <StatCard label="Expected in drawer" value={formatMoney(shift.expectedCash)} hint={`incl. ${formatMoney(shift.openingCash)} float`} />
          </div>
          <SummaryRows shift={shift} />
        </div>
      )}

      <div className="card overflow-hidden">
        <h2 className="card-title px-5 pt-5 pb-3">Past days</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>Opened</th><th>Closed</th><th>Bills</th><th className="text-right">Net sales</th><th className="text-right">Cash difference</th><th /></tr>
            </thead>
            <tbody>
              {history.filter((s) => s.status === "closed").map((s) => (
                <tr key={s._id} onClick={() => setViewing(s._id)} className="cursor-pointer hover:bg-zinc-50">
                  <td className="whitespace-nowrap">{formatDateAndTime(s.openedAt)}<span className="block text-xs text-zinc-600">{s.openedBy?.name}</span></td>
                  <td className="whitespace-nowrap">{formatDateAndTime(s.closedAt)}<span className="block text-xs text-zinc-600">{s.closedBy?.name}</span></td>
                  <td className="tabular-nums">{s.summary?.orders}</td>
                  <td className="text-right tabular-nums font-medium">{formatMoney(s.summary?.total)}</td>
                  <td className={`text-right tabular-nums font-medium ${s.difference < 0 ? "text-red-600" : s.difference > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {s.difference === 0 ? "Balanced" : `${s.difference < 0 ? "Short" : "Over"} ${formatMoney(Math.abs(s.difference))}`}
                  </td>
                  <td className="text-right text-brand-600 text-sm">View</td>
                </tr>
              ))}
              {history.filter((s) => s.status === "closed").length === 0 && (
                <tr><td colSpan={6} className="text-center text-zinc-600 py-10">No closed days yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {closing && shift && <CloseShiftModal shift={shift} settings={settings} onClose={() => setClosing(false)} onClosed={refresh} />}
      {viewing && <ShiftReportModal id={viewing} settings={settings} onClose={() => setViewing(null)} />}
    </section>
  );
};

const CloseShiftModal = ({ shift, settings, onClose, onClosed }) => {
  const [counts, setCounts] = useState({});
  const [manual, setManual] = useState("");
  const [notes, setNotes] = useState("");
  const [useNotes, setUseNotes] = useState(true);
  const openOrders = shift.summary?.openOrders || 0;

  const counted = useNotes
    ? DENOMINATIONS.reduce((sum, d) => sum + d * (Number(counts[d]) || 0), 0)
    : Number(manual) || 0;
  const difference = counted - shift.expectedCash;

  const mutation = useMutation({
    mutationFn: closeShift,
    onSuccess: (res) => {
      onClosed();
      enqueueSnackbar("Day closed", { variant: "success" });
      printShiftReport(res.data, settings);
      onClose();
    },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  return (
    <Modal title="Close the day" subtitle="Count the cash in the drawer. The end-of-day report prints when you confirm." onClose={onClose} size="lg">
      {openOrders > 0 ? (
        <div className="rounded-xl bg-amber-50 text-amber-900 p-4 flex gap-3">
          <LuTriangleAlert className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{openOrders === 1 ? "1 order is" : `${openOrders} orders are`} still open</p>
            <p className="text-sm mt-1">Take payment for them or cancel them before closing the day.</p>
            <Link to="/orders" onClick={onClose} className="btn-secondary mt-3">Go to open orders</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ countedCash: counted, notes }); }} className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Cash counted</label>
              <button type="button" onClick={() => setUseNotes(!useNotes)} className="text-xs text-brand-600 font-medium">
                {useNotes ? "Enter a total instead" : "Count by notes"}
              </button>
            </div>
            {useNotes ? (
              <div className="grid grid-cols-2 gap-2">
                {DENOMINATIONS.map((d) => (
                  <div key={d} className="flex items-center gap-2">
                    <span className="w-14 text-right text-sm text-zinc-600 tabular-nums">{d} ×</span>
                    <input
                      type="number"
                      min="0"
                      value={counts[d] || ""}
                      onChange={(e) => setCounts({ ...counts, [d]: e.target.value })}
                      className="input !py-1.5 tabular-nums"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <input type="number" min="0" step="any" value={manual} onChange={(e) => setManual(e.target.value)} className="input !text-lg tabular-nums" autoFocus />
            )}
          </div>
          <div className="space-y-4">
            <dl className="rounded-xl bg-zinc-50 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-zinc-600">Opening float</dt><dd className="tabular-nums">{formatMoney(shift.openingCash)}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-600">Cash sales</dt><dd className="tabular-nums">{formatMoney(shift.summary?.cashSales)}</dd></div>
              {shift.summary?.cashRefunds > 0 && <div className="flex justify-between"><dt className="text-zinc-600">Cash refunds</dt><dd className="tabular-nums">-{formatMoney(shift.summary.cashRefunds)}</dd></div>}
              <div className="flex justify-between font-medium"><dt>Expected</dt><dd className="tabular-nums">{formatMoney(shift.expectedCash)}</dd></div>
              <div className="flex justify-between font-medium"><dt>Counted</dt><dd className="tabular-nums">{formatMoney(counted)}</dd></div>
              <div className={`flex justify-between text-base font-semibold pt-2 border-t border-zinc-200 ${difference < 0 ? "text-red-600" : difference > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                <dt>{difference < 0 ? "Short" : difference > 0 ? "Over" : "Balanced"}</dt>
                <dd className="tabular-nums">{formatMoney(Math.abs(difference))}</dd>
              </div>
            </dl>
            <div>
              <label className="label">Notes <span className="text-zinc-500 font-normal">(optional)</span></label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" placeholder="e.g. Rs. 500 paid to supplier from drawer" />
            </div>
            <button type="submit" disabled={mutation.isPending} className="btn-primary w-full !py-3">Close the day & print report</button>
          </div>
        </form>
      )}
    </Modal>
  );
};

const ShiftReportModal = ({ id, settings, onClose }) => {
  const { data: shift } = useQuery({ queryKey: ["shifts", id], queryFn: () => getShift(id), select: (r) => r.data });
  if (!shift) return null;

  return (
    <Modal
      title={`Day of ${new Date(shift.openedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
      subtitle={`${formatDateAndTime(shift.openedAt)} – ${formatDateAndTime(shift.closedAt)}`}
      onClose={onClose}
      size="lg"
      footer={<button onClick={() => printShiftReport(shift, settings)} className="btn-primary"><LuPrinter size={16} /> Print Z report</button>}
    >
      <div className="space-y-5">
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl bg-zinc-50 p-3"><p className="text-zinc-600">Expected cash</p><p className="font-semibold tabular-nums">{formatMoney(shift.expectedCash)}</p></div>
          <div className="rounded-xl bg-zinc-50 p-3"><p className="text-zinc-600">Counted</p><p className="font-semibold tabular-nums">{formatMoney(shift.countedCash)}</p></div>
          <div className="rounded-xl bg-zinc-50 p-3"><p className="text-zinc-600">Difference</p><p className={`font-semibold tabular-nums ${shift.difference < 0 ? "text-red-600" : ""}`}>{formatMoney(shift.difference)}</p></div>
        </div>
        <SummaryRows shift={shift} />
        {shift.notes && <p className="text-sm text-zinc-600">Notes: {shift.notes}</p>}
      </div>
    </Modal>
  );
};

export default Shifts;
