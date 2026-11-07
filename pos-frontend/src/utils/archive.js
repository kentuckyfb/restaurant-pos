// Reads archive or backup files in the browser and works out their stats. Nothing is uploaded.
import { formatOrderNo } from "./index";

const SOLD = ["Paid", "Refunded"];

// Accepts an orders archive or a full backup file; returns { info, orders } with names filled in
export const parseArchiveFile = (json) => {
  if (json?.app !== "restro-pos") throw new Error("This isn't a POS archive or backup file.");

  if (json.kind === "orders-archive") {
    return {
      info: {
        kind: "Orders archive",
        exportedAt: json.exportedAt,
        before: json.before,
        businessName: json.business?.businessName,
        currencySymbol: json.business?.currencySymbol,
      },
      orders: json.orders || [],
    };
  }

  if (json.collections) {
    const { orders = [], users = [], tables = [], settings = [] } = json.collections;
    const userName = Object.fromEntries(users.map((u) => [String(u._id), { _id: u._id, name: u.name }]));
    const tableNo = Object.fromEntries(tables.map((t) => [String(t._id), { _id: t._id, tableNo: t.tableNo }]));
    // Backups store ids only; fill in names like a live order has
    const named = orders.map((o) => ({
      ...o,
      table: o.table ? tableNo[String(o.table)] || null : null,
      createdBy: userName[String(o.createdBy)] || null,
      closedBy: userName[String(o.closedBy)] || null,
      refunds: (o.refunds || []).map((r) => ({ ...r, by: userName[String(r.by)] || null })),
    }));
    return {
      info: {
        kind: "Full backup",
        exportedAt: json.exportedAt,
        businessName: settings[0]?.businessName,
        currencySymbol: settings[0]?.currencySymbol,
      },
      orders: named,
    };
  }

  throw new Error("This file doesn't contain any orders.");
};

const dateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const sumBy = (rows, keyOf, valueOf) => {
  const out = {};
  rows.forEach((row) => {
    const key = keyOf(row);
    if (key === undefined || key === null) return;
    out[key] = (out[key] || 0) + valueOf(row);
  });
  return out;
};

const ranked = (map, limit) =>
  Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, limit);

export const summarise = (orders) => {
  const sold = orders.filter((o) => SOLD.includes(o.status));
  const lines = sold.flatMap((o) => o.items || []);
  const refunds = orders.flatMap((o) => o.refunds || []);
  const total = sold.reduce((s, o) => s + (o.bills?.total || 0), 0);
  const refunded = refunds.reduce((s, r) => s + r.amount, 0);

  const byDay = sumBy(sold, (o) => dateKey(o.closedAt || o.createdAt), (o) => o.bills.total);
  const days = Object.keys(byDay).sort();

  return {
    bills: sold.length,
    total,
    refunded,
    net: total - refunded,
    average: sold.length ? total / sold.length : 0,
    guests: sold.reduce((s, o) => s + (o.guests || 0), 0),
    discount: sold.reduce((s, o) => s + (o.bills?.discount || 0), 0),
    serviceCharge: sold.reduce((s, o) => s + (o.bills?.serviceCharge || 0), 0),
    vat: sold.reduce((s, o) => s + (o.bills?.vat || 0), 0),
    cancelled: orders.filter((o) => o.status === "Cancelled").length,
    merged: orders.filter((o) => o.status === "Merged").length,
    byDay: days.map((d) => ({ date: d, value: byDay[d] })),
    byMethod: ranked(sumBy(sold, (o) => o.payment?.method || "Unknown", (o) => o.bills.total)),
    byType: ranked(sumBy(sold, (o) => o.type, (o) => o.bills.total)),
    byStaff: ranked(sumBy(sold, (o) => o.createdBy?.name || "Unknown", (o) => o.bills.total), 10),
    byCategory: ranked(sumBy(lines, (l) => l.category || "Uncategorised", (l) => l.price * l.quantity)),
    topItems: Object.entries(
      lines.reduce((acc, l) => {
        const row = acc[l.name] || { quantity: 0, revenue: 0 };
        row.quantity += l.quantity;
        row.revenue += l.price * l.quantity;
        acc[l.name] = row;
        return acc;
      }, {})
    )
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 20),
  };
};

// Bills as CSV (opens in Excel / Google Sheets)
export const toCsv = (orders) => {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Order", "Status", "Type", "Table", "Customer", "Phone", "Email", "Created", "Closed", "Items", "Subtotal", "Discount", "Service charge", "VAT", "Total", "Refunded", "Payment", "Taken by"];
  const rows = orders.map((o) => [
    formatOrderNo(o.orderNo), o.status, o.type, o.table?.tableNo ?? "", o.customer?.name, o.customer?.phone, o.customer?.email,
    o.createdAt, o.closedAt, (o.items || []).map((i) => `${i.quantity}x ${i.name}`).join("; "),
    o.bills?.subtotal, o.bills?.discount, o.bills?.serviceCharge, o.bills?.vat, o.bills?.total, o.refundedTotal || 0,
    o.payment?.method, o.createdBy?.name,
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
};

export const formatBytes = (bytes) => {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
};
