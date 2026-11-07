import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { LuArmchair, LuShoppingBag, LuBike } from "react-icons/lu";
import Modal from "./Modal";
import { useCurrentShift, useSettings, useTables } from "../../hooks/useAppData";
import { useLocalOrders } from "../../offline/hooks";
import { canManageBills } from "../../utils";

const types = [
  { value: "dine-in", label: "Dine-in", hint: "Eating here, with or without a table", icon: LuArmchair },
  { value: "takeaway", label: "Takeaway", hint: "Customer collects", icon: LuShoppingBag },
  { value: "delivery", label: "Delivery", hint: "PickMe, Uber Eats, own rider", icon: LuBike },
];

const emptyCustomer = { name: "", phone: "", email: "" };

// Step 1: order type. Step 2: optional table and customer details. Every field is optional.
const NewOrderModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const role = useSelector((state) => state.user.role);
  const { data: shift, isLoading } = useCurrentShift();
  const { data: settings } = useSettings();
  const { data: tables = [] } = useTables({ enabled: isOpen });
  const localOrders = useLocalOrders();
  const [type, setType] = useState(null);
  const [tableId, setTableId] = useState(null);
  const [guests, setGuests] = useState(2);
  const [customer, setCustomer] = useState(emptyCustomer);

  const close = () => {
    setType(null);
    setTableId(null);
    setGuests(2);
    setCustomer(emptyCustomer);
    onClose();
  };

  // Tables taken by offline orders on this device count as occupied too
  const takenOffline = new Set(localOrders.filter((o) => o.kind === "new" && o.status === "Open" && o.table).map((o) => o.table._id));
  const freeTables = tables.filter((t) => t.status === "Available" && !takenOffline.has(t._id));

  const start = (e) => {
    e.preventDefault();
    const table = tables.find((t) => t._id === tableId);
    navigate("/pos/new", {
      state: {
        type,
        table: type === "dine-in" && table ? { _id: table._id, tableNo: table.tableNo } : null,
        guests: type === "dine-in" ? guests : 1,
        customer: { name: customer.name.trim(), phone: customer.phone.trim(), email: customer.email.trim() },
      },
    });
    close();
  };

  if (!isOpen) return null;

  if (!isLoading && !shift && settings?.requireShift) {
    return (
      <Modal title="The day hasn't started" onClose={close} size="sm">
        <p className="text-sm text-zinc-600">
          Orders can only be taken after the day is opened with the starting cash float.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={close} className="btn-secondary">Close</button>
          {canManageBills(role) ? (
            <Link to="/shifts" onClick={close} className="btn-primary">Start the day</Link>
          ) : (
            <p className="text-sm text-zinc-600 self-center">Ask a cashier to start the day.</p>
          )}
        </div>
      </Modal>
    );
  }

  const set = (key) => (e) => setCustomer({ ...customer, [key]: e.target.value });

  return (
    <Modal
      title={type ? `${types.find((t) => t.value === type).label} order` : "New order"}
      subtitle={type ? "Everything here is optional. The order gets a number automatically." : undefined}
      onClose={close}
      size={type === "dine-in" ? "lg" : "md"}
    >
      {!type ? (
        <div className="grid gap-2">
          {types.map(({ value, label, hint, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setType(value)}
              className="flex items-center gap-4 p-4 rounded-xl border border-zinc-200 text-left hover:border-brand-400 hover:bg-brand-50/50 transition"
            >
              <span className="h-11 w-11 flex items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon size={22} /></span>
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-sm text-zinc-600">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={start} className="space-y-5">
          {type === "dine-in" && (
            <div>
              <label className="label">Table</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTableId(null)}
                  className={`px-4 h-11 rounded-xl border text-sm font-medium ${!tableId ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
                >
                  No table
                </button>
                {freeTables.map((table) => (
                  <button
                    type="button"
                    key={table._id}
                    onClick={() => setTableId(table._id)}
                    title={`${table.seats} seats`}
                    className={`w-11 h-11 rounded-xl border text-sm font-semibold tabular-nums ${tableId === table._id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-zinc-200 hover:bg-zinc-50"}`}
                  >
                    {table.tableNo}
                  </button>
                ))}
              </div>
              {freeTables.length === 0 && <p className="hint">No free tables right now. You can still start the order and add a table later.</p>}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Customer name</label>
              <input value={customer.name} onChange={set("name")} className="input" autoFocus={type !== "dine-in"} />
            </div>
            {type === "dine-in" && (
              <div>
                <label className="label">Guests</label>
                <input type="number" min="1" value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))} className="input" />
              </div>
            )}
            <div>
              <label className="label">Phone</label>
              <input value={customer.phone} onChange={set("phone")} type="tel" placeholder="07X XXX XXXX" className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input value={customer.email} onChange={set("email")} type="email" placeholder="For an emailed bill" className="input" />
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-1">
            <button type="button" onClick={() => setType(null)} className="btn-ghost">Back</button>
            <button type="submit" className="btn-primary">Open menu</button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default NewOrderModal;
