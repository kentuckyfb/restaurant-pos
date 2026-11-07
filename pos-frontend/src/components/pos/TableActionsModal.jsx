import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enqueueSnackbar } from "notistack";
import Modal from "../shared/Modal";
import Tabs from "../shared/Tabs";
import { useOpenOrders, useTables } from "../../hooks/useAppData";
import { joinOrderTable, mergeOrders, moveOrderTable } from "../../https";
import { apiError, formatMoney, orderLabel, orderNumber } from "../../utils";

// Move the order to another table, join an extra table to it, or merge another open order into it
const TableActionsModal = ({ order, onChanged, onClose }) => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("move");
  const { data: tables = [] } = useTables();
  const { data: openOrders = [] } = useOpenOrders();

  const done = (res) => {
    queryClient.invalidateQueries({ queryKey: ["tables"] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    enqueueSnackbar(res.message, { variant: "success" });
    onChanged(res.data);
    onClose();
  };
  const onError = (error) => enqueueSnackbar(apiError(error), { variant: "error" });
  const move = useMutation({ mutationFn: moveOrderTable, onSuccess: done, onError });
  const join = useMutation({ mutationFn: joinOrderTable, onSuccess: done, onError });
  const merge = useMutation({ mutationFn: mergeOrders, onSuccess: done, onError });

  const free = tables.filter((t) => t.status === "Available");
  const ownTables = tables.filter((t) => t.currentOrder?._id === order._id).map((t) => t.tableNo);
  const others = openOrders.filter((o) => o._id !== order._id);

  const tableButtons = (onPick) => (
    <div className="flex flex-wrap gap-2">
      {free.map((table) => (
        <button key={table._id} onClick={() => onPick(table._id)} title={`${table.seats} seats`} className="w-14 h-14 rounded-xl border border-zinc-200 hover:border-brand-400 hover:bg-brand-50 text-lg font-semibold tabular-nums">
          {table.tableNo}
        </button>
      ))}
      {free.length === 0 && <p className="text-sm text-zinc-600">No free tables.</p>}
    </div>
  );

  return (
    <Modal
      title={`Tables for order ${orderNumber(order)}`}
      subtitle={ownTables.length ? `Currently at table ${ownTables.join(" + ")}` : "Not at a table yet"}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-5">
        <Tabs
          tabs={[{ value: "move", label: "Move" }, { value: "join", label: "Join a table" }, { value: "merge", label: "Merge orders" }]}
          value={tab}
          onChange={setTab}
        />

        {tab === "move" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Move this order to a free table. Its current table(s) become free.</p>
            {tableButtons((tableId) => move.mutate({ id: order._id, tableId }))}
            {ownTables.length > 0 && (
              <button onClick={() => move.mutate({ id: order._id, tableId: null })} className="btn-ghost text-sm">Release table (keep order without a table)</button>
            )}
          </div>
        )}

        {tab === "join" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">For a bigger group: add another free table to this same order. All joined tables free up when the bill is paid.</p>
            {tableButtons((tableId) => join.mutate({ id: order._id, tableId }))}
          </div>
        )}

        {tab === "merge" && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Bring another open order's items into this bill. Its table(s) move over too, and it's marked as merged.</p>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {others.map((o) => (
                <li key={o._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{orderNumber(o)} · {orderLabel(o)}{o.customer?.name && ` · ${o.customer.name}`}</p>
                    <p className="text-xs text-zinc-600">{o.items.length} items · {formatMoney(o.bills.total)}</p>
                  </div>
                  <button
                    onClick={() => window.confirm(`Merge ${orderNumber(o)} into ${orderNumber(order)}?`) && merge.mutate({ id: order._id, sourceOrderId: o._id })}
                    disabled={merge.isPending}
                    className="btn-secondary !py-1.5"
                  >
                    Merge in
                  </button>
                </li>
              ))}
              {others.length === 0 && <li className="px-4 py-6 text-sm text-zinc-600 text-center">No other open orders.</li>}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TableActionsModal;
