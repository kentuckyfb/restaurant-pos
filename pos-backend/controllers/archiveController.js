const createHttpError = require("http-errors");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const Shift = require("../models/shiftModel");
const StockMovement = require("../models/stockMovementModel");
const config = require("../config/config");
const { getSettings } = require("../services/settings");
const { notify } = require("../services/events");

const CLOSED = ["Paid", "Refunded", "Cancelled", "Merged"];

// Which orders can be archived: closed before the cutoff, with no later refunds,
// and never anything from the day that's currently open
const archiveFilter = async (beforeInput) => {
  const before = new Date(beforeInput);
  if (isNaN(before)) throw createHttpError(400, "Choose a date.");

  let cutoff = before > new Date() ? new Date() : before;
  const openShift = await Shift.findOne({ status: "open" }).lean();
  if (openShift && openShift.openedAt < cutoff) cutoff = openShift.openedAt;

  const filter = {
    status: { $in: CLOSED },
    closedAt: { $lt: cutoff },
    refunds: { $not: { $elemMatch: { at: { $gte: cutoff } } } },
  };
  if (openShift) filter.shift = { $ne: openShift._id };
  return { filter, cutoff };
};

// The exact set of orders, as a fingerprint, so deleting can be matched to what was downloaded
const fingerprint = async (filter) => {
  const ids = (await Order.find(filter, { _id: 1 }).sort({ _id: 1 }).lean()).map((o) => String(o._id));
  const checksum = crypto.createHash("sha256").update(ids.join(",")).digest("hex");
  return { ids, count: ids.length, checksum };
};

const getStorageStats = async (req, res, next) => {
  try {
    const stats = await mongoose.connection.db.stats();
    const [orders, oldest] = await Promise.all([
      Order.estimatedDocumentCount(),
      Order.findOne({ status: { $in: CLOSED } }).sort({ closedAt: 1 }).select("closedAt").lean(),
    ]);
    const limitBytes = config.dbLimitMb * 1024 * 1024;
    // Atlas counts data + indexes towards the storage limit
    const usedBytes = (stats.dataSize || 0) + (stats.indexSize || 0);
    res.status(200).json({
      success: true,
      data: {
        usedBytes,
        limitBytes,
        percent: Math.round((usedBytes / limitBytes) * 1000) / 10,
        orders,
        oldestClosedAt: oldest?.closedAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

const previewArchive = async (req, res, next) => {
  try {
    const { filter, cutoff } = await archiveFilter(req.query.before);
    const [summary] = await Order.aggregate([
      { $match: filter },
      { $group: { _id: null, count: { $sum: 1 }, from: { $min: "$closedAt" }, to: { $max: "$closedAt" }, sales: { $sum: { $cond: [{ $in: ["$status", ["Paid", "Refunded"]] }, "$bills.total", 0] } } } },
    ]);
    res.status(200).json({ success: true, data: { cutoff, count: summary?.count || 0, from: summary?.from, to: summary?.to, sales: summary?.sales || 0 } });
  } catch (error) {
    next(error);
  }
};

// Streams the orders as a JSON file, so even a large archive doesn't need to fit in memory
const exportArchive = async (req, res, next) => {
  try {
    const { filter, cutoff } = await archiveFilter(req.query.before);
    const { ids, count, checksum } = await fingerprint(filter);
    const settings = await getSettings();
    const date = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="orders-archive-to-${cutoff.toISOString().slice(0, 10)}-${date}.json"`);
    res.setHeader("X-Archive-Count", String(count));
    res.setHeader("X-Archive-Checksum", checksum);

    const header = {
      app: "restro-pos",
      kind: "orders-archive",
      version: 1,
      exportedAt: new Date(),
      before: cutoff,
      count,
      checksum,
      business: { businessName: settings.businessName, currencySymbol: settings.currencySymbol },
    };
    res.write(JSON.stringify(header).slice(0, -1) + ',"orders":[');

    // Fetch in batches of ids so names (table, staff) come along with each order
    let first = true;
    for (let i = 0; i < ids.length; i += 500) {
      const batch = await Order.find({ _id: { $in: ids.slice(i, i + 500) } })
        .sort({ _id: 1 })
        .populate("table", "tableNo")
        .populate("createdBy", "name")
        .populate("closedBy", "name")
        .populate("refunds.by", "name")
        .lean();
      for (const order of batch) {
        res.write((first ? "" : ",") + JSON.stringify(order));
        first = false;
      }
    }
    res.end("]}");
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    next(error);
  }
};

// Deletes the archived orders, but only if they're exactly the set that was downloaded
const purgeArchive = async (req, res, next) => {
  try {
    const { before, count, checksum, confirm } = req.body;
    if (confirm !== "DELETE") return next(createHttpError(400, "Type DELETE to confirm."));

    const { filter } = await archiveFilter(before);
    const current = await fingerprint(filter);
    if (current.count !== Number(count) || current.checksum !== checksum) {
      return next(createHttpError(409, "The orders changed since you downloaded the archive. Download it again, then delete."));
    }

    const result = await Order.deleteMany({ _id: { $in: current.ids } });
    // Their automatic stock-sale log goes with them (stock levels themselves are unchanged)
    await StockMovement.deleteMany({ type: "sale", order: { $in: current.ids } });
    notify(req, "all");
    res.status(200).json({ success: true, message: `${result.deletedCount} orders removed from the database`, data: { deleted: result.deletedCount } });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStorageStats, previewArchive, exportArchive, purgeArchive };
