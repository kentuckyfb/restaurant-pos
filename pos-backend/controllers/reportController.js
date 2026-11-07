const createHttpError = require("http-errors");
const Order = require("../models/orderModel");
const config = require("../config/config");
const { SOLD } = require("../services/orders");

// Sales report for paid bills closed between ?from and ?to (ISO dates)
const getSalesReport = async (req, res, next) => {
  try {
    const from = new Date(req.query.from);
    const to = new Date(req.query.to);
    if (isNaN(from) || isNaN(to)) return next(createHttpError(400, "Choose a date range."));

    const timezone = config.timezone;
    const [result] = await Order.aggregate([
      { $match: { closedAt: { $gte: from, $lte: to }, status: { $in: ["Paid", "Refunded", "Cancelled"] } } },
      {
        $facet: {
          totals: [
            { $match: { status: { $in: SOLD } } },
            {
              $group: {
                _id: null,
                orders: { $sum: 1 },
                guests: { $sum: "$guests" },
                subtotal: { $sum: "$bills.subtotal" },
                discount: { $sum: "$bills.discount" },
                serviceCharge: { $sum: "$bills.serviceCharge" },
                vat: { $sum: "$bills.vat" },
                total: { $sum: "$bills.total" },
              },
            },
          ],
          cancelled: [{ $match: { status: "Cancelled" } }, { $count: "count" }],
          byDay: [
            { $match: { status: { $in: SOLD } } },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$closedAt", timezone } },
                orders: { $sum: 1 },
                total: { $sum: "$bills.total" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          byHour: [
            { $match: { status: { $in: SOLD } } },
            { $group: { _id: { $hour: { date: "$closedAt", timezone } }, orders: { $sum: 1 }, total: { $sum: "$bills.total" } } },
            { $sort: { _id: 1 } },
          ],
          byMethod: [
            { $match: { status: { $in: SOLD } } },
            { $group: { _id: "$payment.method", orders: { $sum: 1 }, total: { $sum: "$bills.total" } } },
            { $sort: { total: -1 } },
          ],
          byType: [
            { $match: { status: { $in: SOLD } } },
            { $group: { _id: "$type", orders: { $sum: 1 }, total: { $sum: "$bills.total" } } },
            { $sort: { total: -1 } },
          ],
          topItems: [
            { $match: { status: { $in: SOLD } } },
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.name",
                quantity: { $sum: "$items.quantity" },
                revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
              },
            },
            { $sort: { quantity: -1 } },
            { $limit: 15 },
          ],
          byCategory: [
            { $match: { status: { $in: SOLD } } },
            { $unwind: "$items" },
            {
              $group: {
                _id: "$items.category",
                quantity: { $sum: "$items.quantity" },
                revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
              },
            },
            { $sort: { revenue: -1 } },
          ],
          discounts: [
            { $match: { status: { $in: SOLD }, "bills.discount": { $gt: 0 } } },
            { $sort: { closedAt: -1 } },
            { $limit: 20 },
            { $project: { orderNo: 1, closedAt: 1, "bills.discount": 1, "discount.reason": 1 } },
          ],
        },
      },
    ]);

    // Refunds count on the day they were given, which may differ from the day of the sale
    const refundRows = await Order.aggregate([
      { $match: { "refunds.at": { $gte: from, $lte: to } } },
      { $unwind: "$refunds" },
      { $match: { "refunds.at": { $gte: from, $lte: to } } },
      { $group: { _id: "$refunds.method", count: { $sum: 1 }, total: { $sum: "$refunds.amount" } } },
    ]);

    const totals = result.totals[0] || { orders: 0, guests: 0, subtotal: 0, discount: 0, serviceCharge: 0, vat: 0, total: 0 };
    delete totals._id;
    totals.refunds = refundRows.reduce((sum, r) => sum + r.total, 0);
    totals.net = totals.total - totals.refunds;
    const rename = (rows, key) => rows.map(({ _id, ...rest }) => ({ [key]: _id, ...rest }));

    res.status(200).json({
      success: true,
      data: {
        totals,
        cancelled: result.cancelled[0]?.count || 0,
        byDay: rename(result.byDay, "date"),
        byHour: rename(result.byHour, "hour"),
        byMethod: rename(result.byMethod, "method"),
        byType: rename(result.byType, "type"),
        topItems: rename(result.topItems, "name"),
        byCategory: rename(result.byCategory, "category"),
        discounts: result.discounts,
        refunds: refundRows.map((r) => ({ method: r._id, count: r.count, total: r.total })),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSalesReport };
