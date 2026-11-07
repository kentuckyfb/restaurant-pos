const createHttpError = require("http-errors");
const Shift = require("../models/shiftModel");
const Order = require("../models/orderModel");
const { round } = require("../services/billing");
const { notify } = require("../services/events");
const { isValidId, computeShiftSummary, expectedCash } = require("../services/orders");

const populateShift = (query) => query.populate("openedBy", "name").populate("closedBy", "name");

// The open shift, with live totals
const getCurrentShift = async (req, res, next) => {
  try {
    const shift = await populateShift(Shift.findOne({ status: "open" })).lean();
    if (!shift) return res.status(200).json({ success: true, data: null });
    // Waiters only need to know whether the day is open, not the money
    if (req.user.role === "Waiter") return res.status(200).json({ success: true, data: { _id: shift._id, status: shift.status, openedAt: shift.openedAt } });

    const summary = await computeShiftSummary(shift._id);
    shift.summary = summary;
    shift.expectedCash = expectedCash(shift, summary);
    res.status(200).json({ success: true, data: shift });
  } catch (error) {
    next(error);
  }
};

const openShift = async (req, res, next) => {
  try {
    const openingCash = Number(req.body.openingCash) || 0;
    if (openingCash < 0 || openingCash > 1e9) return next(createHttpError(400, "Opening cash can't be negative."));

    const existing = await Shift.exists({ status: "open" });
    if (existing) return next(createHttpError(409, "A shift is already open."));

    const shift = await Shift.create({ openedBy: req.user._id, openingCash });
    notify(req, "shift");
    res.status(201).json({ success: true, message: "Shift opened", data: shift });
  } catch (error) {
    next(error);
  }
};

const closeShift = async (req, res, next) => {
  try {
    const { countedCash, notes } = req.body;
    if (countedCash === undefined || countedCash === "" || Number(countedCash) < 0) {
      return next(createHttpError(400, "Enter the cash counted in the drawer."));
    }

    const shift = await Shift.findOne({ status: "open" });
    if (!shift) return next(createHttpError(409, "No shift is open."));

    const openOrders = await Order.countDocuments({ status: "Open" });
    if (openOrders > 0) {
      return next(createHttpError(409, `${openOrders} order(s) are still open. Settle or cancel them before closing.`));
    }

    const summary = await computeShiftSummary(shift._id);
    const expected = expectedCash(shift, summary);

    shift.set({
      status: "closed",
      closedBy: req.user._id,
      closedAt: new Date(),
      countedCash: round(Number(countedCash)),
      expectedCash: expected,
      difference: round(Number(countedCash) - expected),
      notes: typeof notes === "string" ? notes.trim().slice(0, 500) : "",
      summary,
    });
    await shift.save();
    notify(req, "shift");

    const saved = await populateShift(Shift.findById(shift._id));
    res.status(200).json({ success: true, message: "Shift closed", data: saved });
  } catch (error) {
    next(error);
  }
};

const getShifts = async (req, res, next) => {
  try {
    const shifts = await populateShift(Shift.find().sort({ openedAt: -1 }).limit(Math.min(Number(req.query.limit) || 30, 200)));
    res.status(200).json({ success: true, data: shifts });
  } catch (error) {
    next(error);
  }
};

const getShiftById = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return next(createHttpError(404, "Shift not found."));
    const shift = await populateShift(Shift.findById(req.params.id)).lean();
    if (!shift) return next(createHttpError(404, "Shift not found."));
    if (shift.status === "open") {
      shift.summary = await computeShiftSummary(shift._id);
      shift.expectedCash = expectedCash(shift, shift.summary);
    }
    res.status(200).json({ success: true, data: shift });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCurrentShift, openShift, closeShift, getShifts, getShiftById };
