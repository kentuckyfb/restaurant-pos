const config = require("../config/config");
const { nextSequence } = require("../models/counterModel");

/*
 Order numbers are the day plus a count that restarts every day: 261025-001, 261025-002, ...
 Stored as one number (YYMMDD × 10000 + count) so they stay unique, sort by date, and search fast.
 Up to 9999 orders a day. Older plain numbers (#1, #2) still display as they were.
*/
const DAY = 10000;

// YYMMDD for a moment, in the restaurant's time zone
const dayKey = (date = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, year: "2-digit", month: "2-digit", day: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}${parts.month}${parts.day}`;
};

// Next number for the day the order was taken (an offline order keeps the day it was taken)
const nextOrderNo = async (date) => {
  const key = dayKey(date);
  const count = await nextSequence(`orderNo-${key}`);
  return Number(key) * DAY + count;
};

const formatOrderNo = (n) => {
  if (!Number.isFinite(n) || n < 1e8) return String(n);
  return `${String(Math.floor(n / DAY)).padStart(6, "0")}-${String(n % DAY).padStart(3, "0")}`;
};

// What a search term means as an order number, or null if it isn't one:
// "261025-001" one order, "261025" that day's orders, "7" or "007" order 7 of any day
const orderNoFilter = (term) => {
  const t = String(term).trim().replace(/^#/, "").replace(/\s/g, "");
  let m = t.match(/^(\d{6})-(\d{1,4})$/);
  if (m) return Number(m[1]) * DAY + Number(m[2]);
  if (/^\d{6}$/.test(t)) return { $gte: Number(t) * DAY, $lte: Number(t) * DAY + DAY - 1 };
  if (/^\d{1,4}$/.test(t)) return { $mod: [DAY, Number(t)] };
  return null;
};

module.exports = { dayKey, nextOrderNo, formatOrderNo, orderNoFilter };
