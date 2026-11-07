import React, { useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { LuPrinter, LuUndo2 } from "react-icons/lu";
import Modal from "../shared/Modal";
import StatusBadge from "../shared/StatusBadge";
import RefundModal from "./RefundModal";
import SendReceipt from "./SendReceipt";
import { useSettings } from "../../hooks/useAppData";
import { useOnline } from "../../offline/hooks";
import { formatDateAndTime, formatMoney, orderLabel, orderNumber } from "../../utils";
import { printReceipt } from "../../utils/print";

const Row = ({ label, children, className = "" }) => (
  <div className={`flex justify-between gap-4 ${className}`}>
    <dt className="text-zinc-600">{label}</dt>
    <dd className="text-right tabular-nums">{children}</dd>
  </div>
);

// readOnly: for bills opened from an archive file (no refunds or sending)
const OrderDetailModal = ({ order: initial, readOnly = false, onClose }) => {
  const { data: settings } = useSettings();
  const role = useSelector((state) => state.user.role);
  const online = useOnline();
  const [order, setOrder] = useState(initial);
  const [refunding, setRefunding] = useState(false);
  const { bills, payment } = order;
  const sold = ["Paid", "Refunded"].includes(order.status);
  const canRefund = role === "Admin" || (role === "Cashier" && settings?.cashierRefunds);

  if (refunding) return <RefundModal order={order} onDone={setOrder} onClose={() => setRefunding(false)} />;

  return (
    <Modal
      title={`Bill ${orderNumber(order)}`}
      subtitle={`${orderLabel(order)} · ${formatDateAndTime(order.createdAt)}`}
      onClose={onClose}
      footer={sold && settings && (
        <>
          {order.status === "Paid" && canRefund && !readOnly && (
            <button onClick={() => setRefunding(true)} disabled={!online} className="btn-secondary text-red-600"><LuUndo2 size={16} /> Refund</button>
          )}
          <button onClick={() => printReceipt(order, settings, { copy: true })} className="btn-primary">
            <LuPrinter size={16} /> Reprint receipt
          </button>
        </>
      )}
    >
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          {order.customer?.name && <span className="text-zinc-700">{order.customer.name}</span>}
          {order.customer?.phone && <span className="text-zinc-600">· {order.customer.phone}</span>}
          {order.customer?.email && <span className="text-zinc-600">· {order.customer.email}</span>}
        </div>

        {order.status === "Cancelled" && (
          <p className="rounded-xl bg-red-50 text-red-800 p-3">Cancelled by {order.closedBy?.name}: “{order.cancelReason}”</p>
        )}
        {order.status === "Merged" && (
          <p className="rounded-xl bg-zinc-100 text-zinc-700 p-3">
            Merged into another order by {order.closedBy?.name}. {!readOnly && <Link to={`/pos/${order.mergedInto}`} onClick={onClose} className="text-brand-600 font-medium">Open that order</Link>}
          </p>
        )}

        <ul className="divide-y divide-zinc-100 border-y border-zinc-100">
          {order.items.map((item) => (
            <li key={item._id} className="flex justify-between gap-4 py-2">
              <span>
                {item.quantity} × {item.name}
                {item.note && <span className="block text-xs text-amber-700">“{item.note}”</span>}
              </span>
              <span className="tabular-nums">{formatMoney(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-1.5">
          <Row label="Subtotal">{formatMoney(bills.subtotal)}</Row>
          {bills.discount > 0 && <Row label={`Discount (${order.discount?.reason})`}>-{formatMoney(bills.discount)}</Row>}
          {bills.serviceCharge > 0 && <Row label="Service charge">{formatMoney(bills.serviceCharge)}</Row>}
          {bills.vat > 0 && <Row label="VAT">{formatMoney(bills.vat)}</Row>}
          <Row label="Total" className="font-semibold text-base pt-1 [&>dt]:text-zinc-900">{formatMoney(bills.total)}</Row>
        </dl>

        {payment?.method && (
          <dl className="space-y-1.5 rounded-xl bg-zinc-50 p-3">
            <Row label="Paid by">{payment.method}{payment.reference && ` · ${payment.reference}`}</Row>
            {payment.method === "Cash" && <Row label="Received / change">{formatMoney(payment.amountTendered)} / {formatMoney(payment.change)}</Row>}
          </dl>
        )}

        {order.refunds?.length > 0 && (
          <div className="rounded-xl bg-red-50/60 p-3 space-y-1.5">
            <p className="font-medium text-red-800">Refunds · {formatMoney(order.refundedTotal)}</p>
            {order.refunds.map((r, i) => (
              <p key={i} className="text-xs text-zinc-600">
                {formatMoney(r.amount)} by {r.method}, “{r.reason}” · {r.by?.name} · {formatDateAndTime(r.at)}
              </p>
            ))}
          </div>
        )}

        {sold && !readOnly && (
          <div>
            <p className="label">Send bill to customer</p>
            <SendReceipt order={order} />
          </div>
        )}

        <dl className="space-y-1.5 text-xs">
          <Row label="Taken by">{order.createdBy?.name || "—"}</Row>
          {order.closedAt && <Row label={sold ? "Settled by" : "Closed by"}>{order.closedBy?.name} · {formatDateAndTime(order.closedAt)}</Row>}
        </dl>
      </div>
    </Modal>
  );
};

export default OrderDetailModal;
