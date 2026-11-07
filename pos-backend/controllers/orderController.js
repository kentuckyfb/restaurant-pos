const createHttpError = require("http-errors");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Table = require("../models/tableModel");
const { nextOrderNo, formatOrderNo, orderNoFilter } = require("../services/orderNumber");
const { getSettings } = require("../services/settings");
const { computeBill, round } = require("../services/billing");
const { isValidId, buildOrderItems, getOpenShift, deductStock, releaseTables } = require("../services/orders");
const { sendSms, sendEmail, receiptSms, receiptEmail } = require("../services/messaging");
const { notify } = require("../services/events");

const ORDER_TYPES = ["dine-in", "takeaway", "delivery"];
const PAYMENT_METHODS = ["Cash", "Card", "Bank transfer", "LankaQR"];
const canManageBills = (user) => ["Admin", "Cashier"].includes(user.role);
// Waiters may look at a closed order for this long (e.g. to check what was served)
const WAITER_CLOSED_WINDOW = 12 * 60 * 60 * 1000;

const populateOrder = (query) =>
  query.populate("table", "tableNo").populate("createdBy", "name").populate("closedBy", "name").populate("refunds.by", "name");

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const findOrder = async (id) => {
  if (!isValidId(id)) throw createHttpError(404, "Order not found.");
  const order = await Order.findById(id);
  if (!order) throw createHttpError(404, "Order not found.");
  return order;
};

const requireOpen = (order) => {
  if (order.status !== "Open") throw createHttpError(409, "This order is already closed.");
};

const cleanCustomer = (customer = {}) => ({
  name: text(customer?.name, 80),
  phone: text(customer?.phone, 30),
  email: text(customer?.email, 120).toLowerCase(),
});

const cleanGuests = (guests) => Math.min(500, Math.max(1, Math.floor(Number(guests)) || 1));

// Times sent by a till that was offline. Accepted only if within the last 3 days and not in the future.
const offlineTime = (value) => {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || isNaN(date)) return null;
  const now = Date.now();
  return date.getTime() <= now && now - date.getTime() < 3 * 86400000 ? date : null;
};

// Marks unsent lines as sent and returns them, so the client can print a kitchen ticket
const sendUnsentItems = (order) => {
  const ticket = order.items.filter((item) => !item.sent);
  ticket.forEach((item) => { item.sent = true; });
  if (ticket.length) order.kitchenStatus = "Preparing";
  return ticket.map((item) => ({ name: item.name, quantity: item.quantity, note: item.note }));
};

// Atomically books a free table for an order; returns null if it's taken
const claimTable = (tableId, orderId) =>
  Table.findOneAndUpdate({ _id: tableId, status: "Available" }, { status: "Booked", currentOrder: orderId }, { new: true });

/*
 Load → change → save, safely. If another device saves the same order in between, the save is
 rejected (version check) and the change is re-applied to the fresh copy, so nothing is lost.
 `apply` must only change the order document; it runs again on each retry.
*/
const saveWithRetry = async (id, apply, attempts = 25) => {
  for (let i = 1; ; i++) {
    const order = await findOrder(id);
    const result = await apply(order);
    try {
      await order.save();
      return { order, result };
    } catch (error) {
      if (error.name !== "VersionError") throw error;
      if (i >= attempts) throw createHttpError(409, "This order is busy on another device. Please try again.");
      // A short random pause so simultaneous saves take turns instead of colliding again
      await new Promise((resolve) => setTimeout(resolve, 5 + Math.random() * 20 * Math.min(i, 5)));
    }
  }
};

// Every direct update also bumps the version, so in-flight saves elsewhere notice the change
const bump = { $inc: { __v: 1 } };

const respond = async (res, status, message, orderId, extra = {}) => {
  const saved = await populateOrder(Order.findById(orderId));
  res.status(status).json({ success: true, message, data: saved, ...extra });
};

const createOrder = async (req, res, next) => {
  try {
    const { type, tableId, customer, guests, items, send, createdAt } = req.body;
    const clientRef = typeof req.body.clientRef === "string" ? req.body.clientRef.slice(0, 100) : undefined;

    if (!ORDER_TYPES.includes(type)) return next(createHttpError(400, "Choose dine-in, takeaway or delivery."));
    if (!Array.isArray(items) || items.length === 0) return next(createHttpError(400, "Add at least one item."));

    // An offline order that already synced: return it instead of creating a duplicate
    if (clientRef) {
      const existing = await Order.findOne({ clientRef });
      if (existing) return respond(res, 200, "Already synced", existing._id, { ticket: [], duplicate: true });
    }

    const settings = await getSettings();
    const shift = await getOpenShift(settings);
    const orderItems = await buildOrderItems(items);
    const orderId = new mongoose.Types.ObjectId();
    const warnings = [];

    // A table is optional, even for dine-in
    let table = null;
    if (type === "dine-in" && tableId) {
      if (!isValidId(tableId)) return next(createHttpError(400, "Invalid table."));
      table = await claimTable(tableId, orderId);
      if (!table) {
        // An offline order shouldn't fail just because someone else took the table meanwhile
        if (!clientRef) return next(createHttpError(409, "That table already has an open order."));
        warnings.push("Its table was taken while offline, so it was saved without a table.");
      }
    }

    try {
      const at = offlineTime(createdAt);
      const order = new Order({
        _id: orderId,
        // Numbered by the day it was taken, even if it syncs later
        orderNo: await nextOrderNo(at || new Date()),
        type,
        table: table?._id,
        customer: cleanCustomer(customer),
        guests: cleanGuests(guests),
        items: orderItems,
        shift: shift?._id,
        createdBy: req.user._id,
        clientRef,
      });
      if (at) order.createdAt = at;
      const ticket = send === true ? sendUnsentItems(order) : [];
      order.bills = computeBill(order, settings);
      await order.save();

      notify(req, "order", order._id);
      if (table) notify(req, "tables");
      await respond(res, 201, "Order created", order._id, { ticket, warnings });
    } catch (error) {
      if (table) await releaseTables(orderId);
      if (error.code === 11000 && clientRef) {
        // Two syncs of the same offline order raced; the other one won
        const existing = await Order.findOne({ clientRef });
        if (existing) return respond(res, 200, "Already synced", existing._id, { ticket: [], duplicate: true });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

// Replaces the order's lines. Items already sent to the kitchen can only be reduced by a cashier or admin.
const updateOrder = async (req, res, next) => {
  try {
    const { items, customer, guests, send } = req.body;
    const canVoid = canManageBills(req.user);
    // Lines the person had on screen. Lines missing from their list are removed only if they knew about them;
    // lines another device added meanwhile are kept.
    const known = Array.isArray(req.body.knownLineIds) ? new Set(req.body.knownLineIds.slice(0, 500).map(String)) : null;
    if (items !== undefined && !Array.isArray(items)) return next(createHttpError(400, "Invalid items."));
    const settings = await getSettings();

    const { order, result: ticket } = await saveWithRetry(req.params.id, async (order) => {
      requireOpen(order);

      if (Array.isArray(items)) {
        const existing = new Map(order.items.map((item) => [String(item._id), item]));
        const kept = [];
        const added = [];

        for (const entry of items) {
          const old = entry && typeof entry._id === "string" && existing.get(entry._id);
          if (!old) {
            added.push(entry);
            continue;
          }
          existing.delete(String(entry._id));
          const quantity = Math.min(999, Math.floor(Number(entry.quantity)) || 0);

          if (old.sent) {
            if (quantity < old.quantity && !canVoid) {
              throw createHttpError(403, "Only a cashier or admin can remove items already sent to the kitchen.");
            }
            if (quantity >= 1) kept.push({ ...old.toObject(), quantity: Math.min(quantity, old.quantity) });
            // Extra portions of a sent item become a new line so they go to the kitchen
            if (quantity > old.quantity) added.push({ menuItemId: String(old.menuItem), quantity: quantity - old.quantity, note: old.note });
          } else if (quantity >= 1) {
            kept.push({ ...old.toObject(), quantity, note: typeof entry.note === "string" ? text(entry.note, 200) : old.note });
          }
        }

        // Lines added on another device since this person loaded the order: keep them
        for (const [id, item] of [...existing]) {
          if (known && !known.has(id)) {
            kept.push(item.toObject());
            existing.delete(id);
          }
        }

        const removedSent = [...existing.values()].some((item) => item.sent);
        if (removedSent && !canVoid) {
          throw createHttpError(403, "Only a cashier or admin can remove items already sent to the kitchen.");
        }

        const newItems = added.length ? await buildOrderItems(added) : [];
        const nextItems = [...kept, ...newItems];
        if (nextItems.length === 0) throw createHttpError(400, "An order needs at least one item. Cancel it instead.");
        if (nextItems.length > 200) throw createHttpError(400, "Too many lines on one order.");
        order.items = nextItems;
      }

      if (customer && typeof customer === "object") order.customer = cleanCustomer(customer);
      if (guests !== undefined) order.guests = cleanGuests(guests);

      const sentNow = send === true ? sendUnsentItems(order) : [];
      order.bills = computeBill(order, settings);
      return sentNow;
    });

    notify(req, "order", order._id);
    await respond(res, 200, "Order updated", order._id, { ticket });
  } catch (error) {
    next(error);
  }
};

const updateKitchenStatus = async (req, res, next) => {
  try {
    const { kitchenStatus } = req.body;
    if (!["Preparing", "Ready", "Served"].includes(kitchenStatus)) return next(createHttpError(400, "Invalid kitchen status."));
    if (!isValidId(req.params.id)) return next(createHttpError(404, "Order not found."));

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["Open", "Paid"] } },
      { $set: { kitchenStatus }, ...bump },
      { new: true }
    );
    if (!order) return next(createHttpError(404, "Order not found."));
    notify(req, "order", order._id);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// --- Tables: move, join, merge ---

// Moves the order to a different free table (or to no table); its current tables are freed
const moveTable = async (req, res, next) => {
  try {
    const order = await findOrder(req.params.id);
    requireOpen(order);
    const { tableId } = req.body;

    if (tableId) {
      if (!isValidId(tableId)) return next(createHttpError(400, "Invalid table."));
      if (String(order.table) === String(tableId)) return respond(res, 200, "No change", order._id);
      const table = await claimTable(tableId, order._id);
      if (!table) return next(createHttpError(409, "That table is already occupied."));
      const moved = await Order.findOneAndUpdate(
        { _id: order._id, status: "Open" },
        { $set: { table: table._id, type: "dine-in" }, ...bump }
      );
      if (!moved) {
        await Table.updateOne({ _id: table._id, currentOrder: order._id }, { status: "Available", $unset: { currentOrder: 1 } });
        return next(createHttpError(409, "This order was closed meanwhile."));
      }
      await Table.updateMany({ currentOrder: order._id, _id: { $ne: table._id } }, { status: "Available", $unset: { currentOrder: 1 } });
    } else {
      await releaseTables(order._id);
      await Order.updateOne({ _id: order._id }, { $unset: { table: 1 }, ...bump });
    }
    notify(req, "order", order._id);
    notify(req, "tables");
    await respond(res, 200, tableId ? "Moved to new table" : "Table released", order._id);
  } catch (error) {
    next(error);
  }
};

// Adds another free table to this order, e.g. pushing two tables together for a big group
const joinTable = async (req, res, next) => {
  try {
    const order = await findOrder(req.params.id);
    requireOpen(order);
    const { tableId } = req.body;
    if (!isValidId(tableId)) return next(createHttpError(400, "Choose a table."));

    const table = await claimTable(tableId, order._id);
    if (!table) return next(createHttpError(409, "That table is already occupied. Merge the orders instead."));
    if (!order.table) {
      await Order.updateOne({ _id: order._id, table: { $exists: false } }, { $set: { table: table._id, type: "dine-in" }, ...bump });
    }
    notify(req, "order", order._id);
    notify(req, "tables");
    await respond(res, 200, `Table ${table.tableNo} joined`, order._id);
  } catch (error) {
    next(error);
  }
};

// Folds another open order into this one: items, guests and tables move over; the other becomes "Merged".
// All-or-nothing: if the target can't be updated, the other order is put back as it was.
const mergeOrders = async (req, res, next) => {
  try {
    const { sourceOrderId } = req.body;
    if (!isValidId(sourceOrderId)) return next(createHttpError(400, "Choose an order to merge."));
    if (String(sourceOrderId) === String(req.params.id)) return next(createHttpError(400, "Choose a different order."));

    const target = await findOrder(req.params.id);
    requireOpen(target);

    // Claim the source first so nobody can pay or change it during the merge
    const source = await Order.findOneAndUpdate(
      { _id: sourceOrderId, status: "Open" },
      { $set: { status: "Merged", mergedInto: target._id, closedBy: req.user._id, closedAt: new Date() }, ...bump },
      { new: true }
    );
    if (!source) return next(createHttpError(409, "That order is no longer open."));

    const settings = await getSettings();
    try {
      await saveWithRetry(target._id, async (order) => {
        requireOpen(order);
        order.items.push(...source.items.map((item) => {
          const { _id, ...rest } = item.toObject();
          return rest;
        }));
        if (order.items.length > 200) throw createHttpError(400, "Too many lines on one order.");
        order.guests = cleanGuests(order.guests + source.guests);
        // Keep any customer details the target order is missing
        ["name", "phone", "email"].forEach((field) => {
          if (!order.customer[field] && source.customer?.[field]) order.customer[field] = source.customer[field];
        });
        if (source.items.some((item) => item.sent) && order.kitchenStatus === "New") order.kitchenStatus = "Preparing";
        if (!order.table && source.table) {
          order.table = source.table;
          order.type = "dine-in";
        }
        order.bills = computeBill(order, settings);
      });
    } catch (error) {
      await Order.updateOne(
        { _id: source._id, status: "Merged" },
        { $set: { status: "Open" }, $unset: { mergedInto: 1, closedBy: 1, closedAt: 1 }, ...bump }
      );
      throw error;
    }

    await Table.updateMany({ currentOrder: source._id }, { currentOrder: target._id });
    notify(req, "order", source._id);
    notify(req, "order", target._id);
    notify(req, "tables");
    await respond(res, 200, `Order #${formatOrderNo(source.orderNo)} merged in`, target._id);
  } catch (error) {
    next(error);
  }
};

// --- Payment, cancel, refund ---

const payOrder = async (req, res, next) => {
  try {
    // Retries on a fresh copy if the order changes on another device mid-payment
    for (let attempt = 1; attempt <= 4; attempt++) {
    const order = await findOrder(req.params.id);
    const clientRef = typeof req.body.clientRef === "string" ? req.body.clientRef.slice(0, 120) : undefined;

    // A retried offline payment for a bill this till already paid; anything else paid elsewhere is a conflict
    if (order.status === "Paid" && clientRef && order.payment?.clientRef === clientRef) {
      return respond(res, 200, "Already paid", order._id, { ticket: [] });
    }
    requireOpen(order);

    const { method, amountTendered, reference, discount, paidAt } = req.body;
    if (!PAYMENT_METHODS.includes(method)) return next(createHttpError(400, "Choose a payment method."));

    if (discount && typeof discount === "object" && Number(discount.value) > 0) {
      if (!["percent", "amount"].includes(discount.type)) return next(createHttpError(400, "Invalid discount."));
      if (!text(discount.reason, 200)) return next(createHttpError(400, "Give a reason for the discount."));
      order.discount = { type: discount.type, value: Math.min(Number(discount.value), discount.type === "percent" ? 100 : 1e9), reason: text(discount.reason, 200) };
    } else {
      order.discount = { type: "amount", value: 0, reason: "" };
    }

    const settings = await getSettings();
    const shift = await getOpenShift(settings);
    const ticket = sendUnsentItems(order);
    const bills = computeBill(order, settings);

    let tendered = bills.total;
    if (method === "Cash") {
      tendered = round(Number(amountTendered));
      if (!(tendered >= bills.total) || tendered > 1e9) return next(createHttpError(400, "Cash received is less than the total."));
    }

    // The status and version filter stops the same bill being paid twice, or paid while being changed
    const paid = await Order.findOneAndUpdate(
      { _id: order._id, status: "Open", __v: order.__v },
      {
        $set: {
          items: order.items.map((item) => item.toObject()),
          kitchenStatus: order.kitchenStatus,
          discount: order.discount,
          bills,
          status: "Paid",
          payment: { method, amountTendered: tendered, change: round(tendered - bills.total), reference: text(reference, 60), clientRef },
          shift: shift?._id,
          closedBy: req.user._id,
          closedAt: offlineTime(paidAt) || new Date(),
          receiptToken: crypto.randomBytes(16).toString("hex"),
        },
        ...bump,
      },
      { new: true }
    );
    if (!paid) {
      const latest = await Order.findById(order._id, "status").lean();
      if (latest?.status === "Open" && attempt < 4) continue;
      return next(createHttpError(409, "This order changed or was closed on another device. Check it and try again."));
    }

    await releaseTables(paid._id);
    await deductStock(paid, req.user._id);
    notify(req, "order", paid._id);
    notify(req, "tables");
    notify(req, "shift");
    notify(req, "inventory");
    return respond(res, 200, "Payment recorded", paid._id, { ticket });
    }
  } catch (error) {
    next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const reason = text(req.body.reason, 200);
    if (!reason) return next(createHttpError(400, "Give a reason for cancelling."));
    if (!isValidId(req.params.id)) return next(createHttpError(404, "Order not found."));

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: "Open" },
      { $set: { status: "Cancelled", cancelReason: reason, closedBy: req.user._id, closedAt: new Date() }, ...bump },
      { new: true }
    );
    if (!order) return next(createHttpError(409, "Only open orders can be cancelled."));

    await releaseTables(order._id);
    notify(req, "order", order._id);
    notify(req, "tables");
    notify(req, "shift");
    res.status(200).json({ success: true, message: "Order cancelled", data: order });
  } catch (error) {
    next(error);
  }
};

// Gives money back on a paid bill, in full or in part. Stock is not returned (the food was made).
const refundOrder = async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (req.user.role !== "Admin" && !(req.user.role === "Cashier" && settings.cashierRefunds)) {
      return next(createHttpError(403, "Only an admin can give refunds."));
    }

    const order = await findOrder(req.params.id);
    if (order.status !== "Paid") return next(createHttpError(409, "Only paid bills can be refunded."));

    const { method } = req.body;
    const reason = text(req.body.reason, 200);
    const amount = round(Number(req.body.amount));
    const refundable = round(order.bills.total - order.refundedTotal);
    if (!reason) return next(createHttpError(400, "Give a reason for the refund."));
    if (!PAYMENT_METHODS.includes(method)) return next(createHttpError(400, "Choose how the money is returned."));
    if (!(amount > 0) || amount > refundable) return next(createHttpError(400, `Refund must be between 0 and ${refundable}.`));

    // Cash refunds come out of the drawer, so a shift must be open to account for them
    const shift = await getOpenShift({ requireShift: method === "Cash" || settings.requireShift });
    const refundedTotal = round(order.refundedTotal + amount);

    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "Paid", refundedTotal: order.refundedTotal },
      {
        $push: { refunds: { amount, method, reason, by: req.user._id, shift: shift?._id, at: new Date() } },
        $set: { refundedTotal, status: refundedTotal >= order.bills.total ? "Refunded" : "Paid" },
        ...bump,
      },
      { new: true }
    );
    if (!updated) return next(createHttpError(409, "This bill changed. Reload and try again."));
    notify(req, "order", updated._id);
    notify(req, "shift");
    await respond(res, 200, "Refund recorded", updated._id);
  } catch (error) {
    next(error);
  }
};

// --- Receipts by SMS / email ---

const sendReceipt = async (req, res, next) => {
  try {
    const { channel } = req.body;
    const to = text(req.body.to, 120);
    if (!isValidId(req.params.id)) return next(createHttpError(404, "Order not found."));
    const order = await populateOrder(Order.findById(req.params.id));
    if (!order) return next(createHttpError(404, "Order not found."));
    if (!["Paid", "Refunded"].includes(order.status)) return next(createHttpError(409, "Only paid bills can be sent."));

    const settings = await getSettings();
    if (channel === "sms") await sendSms(to, receiptSms(order, settings));
    else if (channel === "email") {
      const { subject, html, text: plain } = receiptEmail(order, settings);
      await sendEmail(to, subject, html, plain);
    } else return next(createHttpError(400, "Choose SMS or email."));

    // Remember the contact on the bill if it didn't have one (one small write)
    const field = channel === "sms" ? "phone" : "email";
    if (!order.customer?.[field]) {
      await Order.updateOne({ _id: order._id }, { $set: { [`customer.${field}`]: field === "email" ? to.toLowerCase() : to }, ...bump });
      notify(req, "order", order._id);
    }

    res.status(200).json({ success: true, message: channel === "sms" ? "Receipt sent by SMS" : "Receipt emailed" });
  } catch (error) {
    next(error);
  }
};

// Public: the customer's receipt link. Exposes only what's printed on the receipt.
const getPublicReceipt = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!/^[a-f0-9]{32}$/.test(token)) return next(createHttpError(404, "Receipt not found."));
    const order = await Order.findOne({ receiptToken: token })
      .select("orderNo type table items.name items.quantity items.price bills payment.method payment.amountTendered payment.change discount.reason refundedTotal status closedAt createdAt")
      .populate("table", "tableNo")
      .lean();
    if (!order) return next(createHttpError(404, "Receipt not found."));

    const s = await getSettings();
    const business = {
      businessName: s.businessName, address: s.address, phone: s.phone, vatNumber: s.vatNumber,
      currencySymbol: s.currencySymbol, serviceChargeRate: s.serviceChargeRate, vatRate: s.vatRate, receiptFooter: s.receiptFooter,
    };
    res.set("Cache-Control", "private, max-age=300");
    res.status(200).json({ success: true, data: { order, business } });
  } catch (error) {
    next(error);
  }
};

// --- Reads ---

// Waiters work with open orders; closed bills and money history are for cashiers and admins
const waiterMaySee = (order) =>
  order.status === "Open" ||
  Boolean(order.closedAt && Date.now() - new Date(order.closedAt).getTime() < WAITER_CLOSED_WINDOW);

const getOrderById = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return next(createHttpError(404, "Order not found."));
    const order = await populateOrder(Order.findById(req.params.id));
    if (!order) return next(createHttpError(404, "Order not found."));
    if (req.user.role === "Waiter" && !waiterMaySee(order)) return next(createHttpError(403, "You don't have permission to do that."));
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// ?status=Open,Paid &from=ISO &to=ISO &search=text &kitchen=1 &shift=id &page=1 &limit=50
const getOrders = async (req, res, next) => {
  try {
    const { status, from, to, search, kitchen, shift } = req.query;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), 10000);
    const filter = {};
    const waiter = req.user.role === "Waiter";

    if (status) filter.status = { $in: String(status).split(",").slice(0, 6) };
    if (kitchen) {
      filter.status = { $in: ["Open", "Paid"] };
      filter.kitchenStatus = { $in: ["Preparing", "Ready"] };
      // Tickets nobody marked served don't linger on the kitchen screen forever
      filter.updatedAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    } else if (waiter) {
      // Waiters only get the open orders list
      filter.status = "Open";
    }
    if (!waiter && (from || to)) {
      filter.createdAt = {};
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (from && !isNaN(fromDate)) filter.createdAt.$gte = fromDate;
      if (to && !isNaN(toDate)) filter.createdAt.$lte = toDate;
    }
    if (!waiter && shift && isValidId(shift)) filter.shift = shift;
    if (search) {
      const term = String(search).trim().slice(0, 60);
      const digits = term.replace(/^#/, "").replace(/[\s-]/g, "");
      const byNumber = orderNoFilter(term);
      if (byNumber !== null) {
        // An order number: "261025-001" that bill, "261025" that day, "7" order 7 of any day
        filter.orderNo = byNumber;
      } else {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // 7+ digits is a phone number: match it however it was typed (spaces, dashes)
        const phone = /^\d{7,}$/.test(digits) ? digits.split("").join("[\\s-]*") : escaped;
        filter.$or = [
          { "customer.name": { $regex: escaped, $options: "i" } },
          { "customer.phone": { $regex: phone } },
          { "customer.email": { $regex: escaped, $options: "i" } },
        ];
      }
    }

    const [orders, total] = await Promise.all([
      populateOrder(Order.find(filter).sort({ createdAt: kitchen ? 1 : -1 }).skip((page - 1) * limit).limit(limit)),
      Order.countDocuments(filter),
    ]);
    res.status(200).json({ success: true, data: orders, total, page, limit });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder, updateOrder, updateKitchenStatus, moveTable, joinTable, mergeOrders,
  payOrder, cancelOrder, refundOrder, sendReceipt, getPublicReceipt, getOrderById, getOrders,
};
