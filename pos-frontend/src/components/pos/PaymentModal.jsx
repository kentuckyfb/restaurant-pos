import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import { LuBanknote, LuCreditCard, LuLandmark, LuQrCode } from "react-icons/lu";
import Modal from "../shared/Modal";
import { apiError, computeBill, formatMoney, orderNumber } from "../../utils";

const METHODS = [
  { value: "Cash", icon: LuBanknote },
  { value: "Card", icon: LuCreditCard },
  { value: "Bank transfer", icon: LuLandmark },
  { value: "LankaQR", icon: LuQrCode },
];

const DISCOUNT_REASONS = ["Regular customer", "Staff meal", "Complaint", "Promotion"];

// Suggested cash amounts: exact, then rounded up to common notes
const quickCash = (total) => {
  const options = [total, ...[100, 500, 1000, 5000].map((step) => Math.ceil(total / step) * step)];
  return [...new Set(options)].filter((n) => n >= total).slice(0, 5);
};

// onPay(payload) does the actual charge (on the server, or locally when offline) and resolves to { data, ticket }
const PaymentModal = ({ order, settings, onPay, onPaid, onClose }) => {
  const [method, setMethod] = useState("Cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [discount, setDiscount] = useState({ type: "amount", value: "", reason: "" });

  const bill = computeBill({ items: order.items, type: order.type, discount }, settings);
  const cash = Number(tendered) || 0;
  const change = cash - bill.total;
  const hasDiscount = Number(discount.value) > 0;
  const canPay = (method !== "Cash" || cash >= bill.total) && (!hasDiscount || discount.reason.trim());

  const payMutation = useMutation({
    mutationFn: onPay,
    onSuccess: (res) => onPaid(res.data, res.ticket),
    onError: (error) => enqueueSnackbar(apiError(error), { variant: "error" }),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!canPay) return;
    payMutation.mutate({
      method,
      amountTendered: method === "Cash" ? cash : undefined,
      reference,
      discount: hasDiscount ? { ...discount, value: Number(discount.value) } : undefined,
    });
  };

  return (
    <Modal title={`Take payment · ${orderNumber(order)}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-6">
        {/* Left: bill & discount */}
        <div className="space-y-4">
          <dl className="space-y-2 text-sm rounded-xl bg-zinc-50 p-4">
            <div className="flex justify-between text-zinc-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(bill.subtotal)}</dd></div>
            {bill.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd className="tabular-nums">-{formatMoney(bill.discount)}</dd></div>}
            {bill.serviceCharge > 0 && <div className="flex justify-between text-zinc-600"><dt>Service charge ({settings.serviceChargeRate}%)</dt><dd className="tabular-nums">{formatMoney(bill.serviceCharge)}</dd></div>}
            {bill.vat > 0 && <div className="flex justify-between text-zinc-600"><dt>VAT ({settings.vatRate}%)</dt><dd className="tabular-nums">{formatMoney(bill.vat)}</dd></div>}
            <div className="flex justify-between text-lg font-semibold pt-2 border-t border-zinc-200"><dt>Total</dt><dd className="tabular-nums">{formatMoney(bill.total)}</dd></div>
          </dl>

          <div>
            <label className="label">Discount</label>
            <div className="flex gap-2">
              <div className="inline-flex p-1 bg-zinc-100 rounded-xl shrink-0">
                {[["amount", settings.currencySymbol], ["percent", "%"]].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setDiscount({ ...discount, type: value })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${discount.type === value ? "bg-white shadow-sm" : "text-zinc-600"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="0"
                step="any"
                value={discount.value}
                onChange={(e) => setDiscount({ ...discount, value: e.target.value })}
                placeholder="0"
                className="input"
              />
            </div>
            {hasDiscount && (
              <>
                <input
                  value={discount.reason}
                  onChange={(e) => setDiscount({ ...discount, reason: e.target.value })}
                  placeholder="Reason (required)"
                  className="input mt-2"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DISCOUNT_REASONS.map((reason) => (
                    <button type="button" key={reason} onClick={() => setDiscount({ ...discount, reason })} className="px-2.5 py-1 rounded-lg bg-zinc-100 text-xs text-zinc-600 hover:bg-zinc-200">
                      {reason}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: method & amount */}
        <div className="space-y-4">
          <div>
            <label className="label">Payment method</label>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map(({ value, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setMethod(value)}
                  className={`btn !py-3 border ${method === value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
                >
                  <Icon size={18} /> {value}
                </button>
              ))}
            </div>
          </div>

          {method === "Cash" ? (
            <div>
              <label className="label">Cash received</label>
              <input
                type="number"
                min="0"
                step="any"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                className="input !text-lg !py-3 tabular-nums"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {quickCash(bill.total).map((amount) => (
                  <button type="button" key={amount} onClick={() => setTendered(String(amount))} className="px-3 py-1.5 rounded-lg border border-zinc-200 text-sm tabular-nums hover:bg-zinc-50">
                    {amount === bill.total ? "Exact" : formatMoney(amount)}
                  </button>
                ))}
              </div>
              <div className={`mt-4 rounded-xl p-4 ${change >= 0 && cash > 0 ? "bg-emerald-50 text-emerald-800" : "bg-zinc-50 text-zinc-600"}`}>
                <p className="text-sm">Change to give</p>
                <p className="text-2xl font-semibold tabular-nums">{cash > 0 && change >= 0 ? formatMoney(change) : "—"}</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Reference <span className="text-zinc-500 font-normal">(optional)</span></label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "Card" ? "Last 4 digits or approval code" : "Transaction reference"} className="input" />
              <p className="hint">Confirm the payment went through on the terminal or bank app before charging.</p>
            </div>
          )}

          <button type="submit" disabled={!canPay || payMutation.isPending} className="btn-primary w-full !py-3.5 !text-base">
            {payMutation.isPending ? "Processing…" : `Charge ${formatMoney(bill.total)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PaymentModal;
