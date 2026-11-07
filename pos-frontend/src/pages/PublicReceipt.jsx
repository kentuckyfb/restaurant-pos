import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getPublicReceipt } from "../https";
import { formatDateAndTime, formatOrderNo, orderLabel, setCurrencySymbol, formatMoney } from "../utils";

// The page a customer opens from the link in their SMS or email. No login needed.
const PublicReceipt = () => {
  const { token } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-receipt", token],
    queryFn: () => getPublicReceipt(token),
    select: (r) => r.data,
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setCurrencySymbol(data.business.currencySymbol);
      document.title = `Bill #${formatOrderNo(data.order.orderNo)} · ${data.business.businessName}`;
    }
  }, [data]);

  if (isLoading) return null;
  if (isError || !data) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-zinc-600">This receipt link isn't valid.</div>;
  }

  const { order, business } = data;
  const b = order.bills;
  const line = (label, value, cls = "") => (
    <div className={`flex justify-between gap-4 ${cls}`}><dt>{label}</dt><dd className="tabular-nums">{value}</dd></div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="max-w-md mx-auto card p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{business.businessName}</h1>
          {business.address && <p className="text-sm text-zinc-600 mt-1">{business.address}</p>}
          {business.phone && <p className="text-sm text-zinc-600">{business.phone}</p>}
        </div>

        <div className="flex justify-between items-end mt-6 pb-3 border-b border-zinc-200">
          <div>
            <p className="text-lg font-semibold tabular-nums">Bill #{formatOrderNo(order.orderNo)}</p>
            <p className="text-sm text-zinc-600">{orderLabel(order)}</p>
          </div>
          <p className="text-sm text-zinc-600">{formatDateAndTime(order.closedAt || order.createdAt)}</p>
        </div>

        <ul className="divide-y divide-zinc-100 text-sm">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-4 py-2.5">
              <span>{item.quantity} × {item.name}</span>
              <span className="tabular-nums">{formatMoney(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-1.5 text-sm text-zinc-600 border-t border-zinc-200 pt-3">
          {line("Subtotal", formatMoney(b.subtotal))}
          {b.discount > 0 && line(`Discount${order.discount?.reason ? ` (${order.discount.reason})` : ""}`, `-${formatMoney(b.discount)}`)}
          {b.serviceCharge > 0 && line(`Service charge (${business.serviceChargeRate}%)`, formatMoney(b.serviceCharge))}
          {b.vat > 0 && line(`VAT (${business.vatRate}%)`, formatMoney(b.vat))}
          {line("Total", formatMoney(b.total), "text-zinc-900 text-lg font-semibold pt-1")}
          {order.payment?.method && line(`Paid by ${order.payment.method}`, formatMoney(order.payment.amountTendered))}
          {order.payment?.change > 0 && line("Change", formatMoney(order.payment.change))}
          {order.refundedTotal > 0 && line("Refunded", `-${formatMoney(order.refundedTotal)}`, "text-red-600")}
        </dl>

        {business.vatNumber && <p className="text-xs text-zinc-500 mt-4">VAT Reg: {business.vatNumber}</p>}
        {business.receiptFooter && <p className="text-center text-sm text-zinc-600 mt-6">{business.receiptFooter}</p>}
      </div>
    </div>
  );
};

export default PublicReceipt;
