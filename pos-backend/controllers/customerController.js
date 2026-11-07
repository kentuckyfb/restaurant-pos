const Order = require("../models/orderModel");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Customers are worked out from orders (no separate table to keep in sync).
// One customer = same phone, or else same email, or else same name.
const customerKey = {
  $let: {
    vars: {
      phone: { $trim: { input: { $ifNull: ["$customer.phone", ""] } } },
      email: { $toLower: { $trim: { input: { $ifNull: ["$customer.email", ""] } } } },
      name: { $toLower: { $trim: { input: { $ifNull: ["$customer.name", ""] } } } },
    },
    in: {
      $cond: [
        { $ne: ["$$phone", ""] },
        { $concat: ["phone:", { $replaceAll: { input: { $replaceAll: { input: "$$phone", find: " ", replacement: "" } }, find: "-", replacement: "" } }] },
        { $cond: [{ $ne: ["$$email", ""] }, { $concat: ["email:", "$$email"] }, { $concat: ["name:", "$$name"] }] },
      ],
    },
  },
};

const hasContact = {
  $or: [{ "customer.name": { $nin: ["", null] } }, { "customer.phone": { $nin: ["", null] } }, { "customer.email": { $nin: ["", null] } }],
};

// ?search=text &page=1 &limit=50 &sort=recent|spent|visits
const getCustomers = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const sortBy = { spent: { spent: -1 }, visits: { visits: -1 }, recent: { lastVisit: -1 } }[req.query.sort] || { lastVisit: -1 };
    const match = { status: { $in: ["Paid", "Refunded", "Open"] }, ...hasContact };
    if (req.query.search) {
      const term = escapeRegex(req.query.search.trim());
      match.$and = [{ $or: [
        { "customer.name": { $regex: term, $options: "i" } },
        { "customer.phone": { $regex: term.replace(/\s/g, "") } },
        { "customer.email": { $regex: term, $options: "i" } },
      ] }];
    }

    const [result] = await Order.aggregate([
      { $match: match },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: customerKey,
          // Every non-empty value, oldest first; the latest one is picked below
          names: { $push: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$customer.name", ""] } }, 0] }, "$customer.name", "$REMOVE"] } },
          phones: { $push: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$customer.phone", ""] } }, 0] }, "$customer.phone", "$REMOVE"] } },
          emails: { $push: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$customer.email", ""] } }, 0] }, "$customer.email", "$REMOVE"] } },
          visits: { $sum: 1 },
          spent: { $sum: { $cond: [{ $in: ["$status", ["Paid", "Refunded"]] }, { $subtract: ["$bills.total", { $ifNull: ["$refundedTotal", 0] }] }, 0] } },
          firstVisit: { $min: "$createdAt" },
          lastVisit: { $max: "$createdAt" },
        },
      },
      {
        $project: {
          name: { $arrayElemAt: ["$names", -1] },
          phone: { $arrayElemAt: ["$phones", -1] },
          email: { $arrayElemAt: ["$emails", -1] },
          visits: 1, spent: 1, firstVisit: 1, lastVisit: 1,
        },
      },
      { $sort: sortBy },
      {
        $facet: {
          rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const rows = result.rows.map(({ _id, ...rest }) => ({ key: _id, ...rest }));
    res.status(200).json({ success: true, data: rows, total: result.total[0]?.count || 0, page, limit });
  } catch (error) {
    next(error);
  }
};

// All orders for one customer key (from the list above)
const getCustomerOrders = async (req, res, next) => {
  try {
    const key = String(req.query.key || "").slice(0, 130);
    const [kind, ...rest] = key.split(":");
    const value = rest.join(":");
    if (!value && kind !== "name") return res.status(200).json({ success: true, data: [] });

    let filter;
    if (kind === "phone") {
      // Match the number however it was typed (spaces, dashes)
      const digits = value.split("").map(escapeRegex).join("[\\s-]*");
      filter = { "customer.phone": { $regex: `^\\s*${digits}\\s*$` } };
    } else if (kind === "email") {
      filter = { "customer.email": { $regex: `^\\s*${escapeRegex(value)}\\s*$`, $options: "i" }, "customer.phone": { $in: ["", null] } };
    } else {
      filter = { "customer.name": { $regex: `^\\s*${escapeRegex(value)}\\s*$`, $options: "i" }, "customer.phone": { $in: ["", null] }, "customer.email": { $in: ["", null] } };
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("table", "tableNo")
      .populate("createdBy", "name")
      .populate("closedBy", "name")
      .populate("refunds.by", "name");
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCustomers, getCustomerOrders };
