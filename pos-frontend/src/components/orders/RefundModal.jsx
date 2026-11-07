import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import Modal from "../shared/Modal";
import { refundOrder } from "../../https";
import { apiError, formatMoney, orderNumber } from "../../utils";

const METHODS = ["Cash", "Card", "Bank transfer", "LankaQR"];
const REASONS = ["Wrong item", "Food quality", "Overcharged", "Order not delivered"];

const RefundModal = ({ order, onDone, onClose }) => {
  const queryClient = useQueryClient();
  const refundable = Math.round((order.bills.total - (order.refundedTotal || 0)) * 100) / 100;
  const [amount, setAmount] = useState(String(refundable));
  const [method, setMethod] = useState(order.payment?.method || "Cash");
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: refundOrder,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["shift"] });
      queryClient.setQueryData(["order", order._id], { data: res.data });
      enqueueSnackbar(`Refunded ${formatMoney(amount)}`, { variant: "success" });
      onDone?.(res.data);
      onClose();
    },
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  const value = Number(amount) || 0;
  const valid = value > 0 && value <= refundable && reason.trim();

  return (
    <Modal title={`Refund bill ${orderNumber(order)}`} subtitle={`Paid ${formatMoney(order.bills.total)} by ${order.payment?.method}. Up to ${formatMoney(refundable)} can be refunded.`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) mutation.mutate({ id: order._id, amount: value, method, reason }); }} className="space-y-4">
        <div>
          <label className="label">Amount</label>
          <div className="flex gap-2">
            <input type="number" min="0" max={refundable} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="input tabular-nums" autoFocus />
            <button type="button" onClick={() => setAmount(String(refundable))} className="btn-secondary shrink-0">Full</button>
          </div>
        </div>
        <div>
          <label className="label">Give back by</label>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button type="button" key={m} onClick={() => setMethod(m)} className={`btn border ${method === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}>
                {m}
              </button>
            ))}
          </div>
          {method === "Cash" && <p className="hint">Cash refunds come out of today's drawer and lower the expected cash at closing.</p>}
        </div>
        <div>
          <label className="label">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input" required />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {REASONS.map((r) => (
              <button type="button" key={r} onClick={() => setReason(r)} className="px-2.5 py-1 rounded-lg bg-zinc-100 text-xs text-zinc-600 hover:bg-zinc-200">{r}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-zinc-600">Stock isn't added back, since the food was already made.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">Back</button>
          <button type="submit" disabled={!valid || mutation.isPending} className="btn-danger">Refund {formatMoney(value)}</button>
        </div>
      </form>
    </Modal>
  );
};

export default RefundModal;
