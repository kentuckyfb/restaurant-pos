const createHttpError = require("http-errors");
const mongoose = require("mongoose");
const MenuItem = require("../models/menuItemModel");
const InventoryItem = require("../models/inventoryItemModel");
const Shift = require("../models/shiftModel");
const Order = require("../models/orderModel");
const Table = require("../models/tableModel");
const StockMovement = require("../models/stockMovementModel");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Turns [{ menuItemId, quantity, note }] from the client into order lines using the server's prices
const buildOrderItems = async (entries) => {
  if (entries.length > 200) throw createHttpError(400, "Too many lines on one order.");
  const ids = entries.map((entry) => (entry && typeof entry.menuItemId === "string" ? entry.menuItemId : ""));
  if (!ids.every(isValidId)) throw createHttpError(400, "Invalid menu item.");

  const menuItems = await MenuItem.find({ _id: { $in: ids } }).populate("category", "name").lean();
  const byId = new Map(menuItems.map((item) => [String(item._id), item]));

  return entries.map((entry) => {
    const menuItem = byId.get(String(entry.menuItemId));
    if (!menuItem) throw createHttpError(400, "A menu item no longer exists.");
    if (!menuItem.available) throw createHttpError(400, `${menuItem.name} is sold out.`);
    const quantity = Math.floor(Number(entry.quantity));
    if (!(quantity >= 1)) throw createHttpError(400, "Quantity must be at least 1.");
    if (quantity > 999) throw createHttpError(400, "Quantity is too large.");
    return {
      menuItem: menuItem._id,
      name: menuItem.name,
      category: menuItem.category?.name || "",
      price: menuItem.price,
      quantity,
      note: typeof entry.note === "string" ? entry.note.trim().slice(0, 200) : "",
      sent: false,
    };
  });
};

const getOpenShift = async (settings) => {
  const shift = await Shift.findOne({ status: "open" }).lean();
  if (!shift && settings.requireShift) {
    throw createHttpError(409, "No shift is open. A cashier needs to start the day first.");
  }
  return shift;
};

// One batched write per paid bill: subtract each recipe ingredient used
// Takes each dish's recipe out of stock when a bill is paid, and logs it as a "sale" movement.
// One batched update, one read for the new balances, one batched insert: same cost for 1 dish or 50.
const deductStock = async (order, userId) => {
  const items = order.items || [];
  const quantityByMenuItem = {};
  items.forEach((item) => {
    const key = String(item.menuItem);
    quantityByMenuItem[key] = (quantityByMenuItem[key] || 0) + item.quantity;
  });

  const menuItems = await MenuItem.find(
    { _id: { $in: Object.keys(quantityByMenuItem) }, "recipe.0": { $exists: true } },
    "recipe"
  ).lean();

  const usage = {};
  menuItems.forEach((menuItem) =>
    menuItem.recipe.forEach(({ ingredient, quantity }) => {
      const key = String(ingredient);
      usage[key] = (usage[key] || 0) + quantity * quantityByMenuItem[String(menuItem._id)];
    })
  );

  const ops = Object.entries(usage).map(([id, quantity]) => ({
    updateOne: { filter: { _id: id }, update: { $inc: { quantity: -quantity } } },
  }));
  if (!ops.length) return;
  await InventoryItem.bulkWrite(ops);

  // The log is a record only: if writing it fails, the payment and stock change still stand
  try {
    const balances = await InventoryItem.find({ _id: { $in: Object.keys(usage) } }, "quantity").lean();
    const byId = Object.fromEntries(balances.map((b) => [String(b._id), b.quantity]));
    const tidy = (n) => Math.round(n * 10000) / 10000;
    await StockMovement.insertMany(
      Object.entries(usage)
        .filter(([id]) => byId[id] !== undefined)
        .map(([id, quantity]) => ({
          item: id,
          type: "sale",
          change: -tidy(quantity),
          balanceAfter: tidy(byId[id]),
          user: userId,
          order: order._id,
          orderNo: order.orderNo,
        })),
      { ordered: false }
    );
  } catch (error) {
    console.error("Stock log not written for order", order.orderNo, error.message);
  }
};

const SOLD = ["Paid", "Refunded"];

// Totals for a shift, computed from its orders rather than kept as running counters
const computeShiftSummary = async (shiftId) => {
  const id = new mongoose.Types.ObjectId(String(shiftId));
  const refundRows = await Order.aggregate([
    { $match: { "refunds.shift": id } },
    { $unwind: "$refunds" },
    { $match: { "refunds.shift": id } },
    { $group: { _id: "$refunds.method", count: { $sum: 1 }, total: { $sum: "$refunds.amount" } } },
  ]);
  const [result] = await Order.aggregate([
    { $match: { shift: id } },
    {
      $facet: {
        totals: [
          { $match: { status: { $in: SOLD } } },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              subtotal: { $sum: "$bills.subtotal" },
              discount: { $sum: "$bills.discount" },
              serviceCharge: { $sum: "$bills.serviceCharge" },
              vat: { $sum: "$bills.vat" },
              total: { $sum: "$bills.total" },
            },
          },
        ],
        byMethod: [
          { $match: { status: { $in: SOLD } } },
          { $group: { _id: "$payment.method", count: { $sum: 1 }, total: { $sum: "$bills.total" } } },
          { $sort: { total: -1 } },
        ],
        statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
      },
    },
  ]);

  const totals = result.totals[0] || { orders: 0, subtotal: 0, discount: 0, serviceCharge: 0, vat: 0, total: 0 };
  delete totals._id;
  const countOf = (status) => result.statuses.find((s) => s._id === status)?.count || 0;
  const byMethod = result.byMethod.map((m) => ({ method: m._id, count: m.count, total: m.total }));

  const refunds = refundRows.map((r) => ({ method: r._id, count: r.count, total: r.total }));
  const refundTotal = refunds.reduce((sum, r) => sum + r.total, 0);

  return {
    ...totals,
    byMethod,
    cashSales: byMethod.find((m) => m.method === "Cash")?.total || 0,
    refunds,
    refundTotal,
    cashRefunds: refunds.find((r) => r.method === "Cash")?.total || 0,
    netAfterRefunds: totals.total - refundTotal,
    cancelled: countOf("Cancelled"),
    openOrders: countOf("Open"),
  };
};

// Cash that should be in the drawer: float + cash taken - cash given back
const expectedCash = (shift, summary) =>
  Math.round((shift.openingCash + summary.cashSales - summary.cashRefunds) * 100) / 100;

// Frees every table attached to an order (an order can hold several joined tables)
const releaseTables = (orderId) =>
  Table.updateMany({ currentOrder: orderId }, { status: "Available", $unset: { currentOrder: 1 } });

module.exports = { isValidId, buildOrderItems, getOpenShift, deductStock, computeShiftSummary, expectedCash, releaseTables, SOLD };
