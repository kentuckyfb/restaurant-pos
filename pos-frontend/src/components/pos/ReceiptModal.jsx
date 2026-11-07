import React from "react";
import { motion } from "framer-motion";
import { LuCheck, LuPrinter, LuWifiOff } from "react-icons/lu";
import Modal from "../shared/Modal";
import SendReceipt from "../orders/SendReceipt";
import { formatMoney, orderNumber } from "../../utils";
import { printReceipt } from "../../utils/print";

const ReceiptModal = ({ order, settings, onDone }) => {
  const { bills, payment } = order;

  return (
    <Modal title="" onClose={onDone} size="sm">
      <div className="text-center -mt-4">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="mx-auto h-14 w-14 rounded-full bg-emerald-500 text-white flex items-center justify-center"
        >
          <LuCheck size={28} />
        </motion.div>
        <h2 className="text-lg font-semibold mt-4">Paid · Order {orderNumber(order)}</h2>
        <p className="text-sm text-zinc-600">{formatMoney(bills.total)} by {payment.method}</p>
        {(order.local || order.offlineEdit) && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1">
            <LuWifiOff size={12} /> Saved on this till. It will sync when the connection is back.
          </p>
        )}

        {payment.method === "Cash" && (
          <div className="mt-5 rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">Change to give</p>
            <p className="text-3xl font-semibold text-emerald-900 tabular-nums">{formatMoney(payment.change)}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mt-6">
          <button onClick={() => printReceipt(order, settings)} className="btn-secondary !py-3">
            <LuPrinter size={16} /> Print receipt
          </button>
          <button onClick={onDone} className="btn-primary !py-3" autoFocus>
            Done
          </button>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-zinc-100 text-left">
        <p className="label">Send bill to customer</p>
        <SendReceipt order={order} />
      </div>
    </Modal>
  );
};

export default ReceiptModal;
