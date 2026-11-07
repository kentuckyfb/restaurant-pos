import { formatMoney, formatDateAndTime, orderLabel, orderNumber } from "./index";

const escape = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Sized for 80mm thermal printers; also prints fine on A4
const STYLES = `
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Courier New", monospace; font-size: 12px; color: #000; width: 72mm; margin: 0; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
  .center { text-align: center; }
  .muted { font-size: 11px; }
  .big { font-size: 15px; font-weight: bold; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  td.r { text-align: right; white-space: nowrap; }
  .note { font-size: 11px; padding-left: 8px; }
`;

const printHtml = (body) => {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${STYLES}</style></head><body>${body}</body></html>`);
  doc.close();
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 250);
};

const row = (left, right, cls = "") => `<tr class="${cls}"><td>${left}</td><td class="r">${right}</td></tr>`;

const header = (settings) => `
  <h1>${escape(settings.businessName)}</h1>
  ${settings.address ? `<div class="center muted">${escape(settings.address)}</div>` : ""}
  ${settings.phone ? `<div class="center muted">Tel: ${escape(settings.phone)}</div>` : ""}
  ${settings.vatNumber ? `<div class="center muted">VAT Reg: ${escape(settings.vatNumber)}</div>` : ""}
`;

export const printReceipt = (order, settings, { copy = false } = {}) => {
  const items = order.items
    .map((item) => `
      ${row(`${item.quantity} x ${escape(item.name)}`, formatMoney(item.price * item.quantity).replace(/^\S+\s/, ""))}
      ${item.quantity > 1 ? `<tr><td class="note">@ ${formatMoney(item.price)}</td><td></td></tr>` : ""}
    `)
    .join("");

  const { bills, payment } = order;
  printHtml(`
    ${header(settings)}
    <hr>
    ${copy ? `<div class="center big">** COPY **</div>` : ""}
    <table>
      ${row(`<span class="big">Bill ${orderNumber(order)}</span>`, orderLabel(order))}
      ${row(formatDateAndTime(order.closedAt || order.createdAt), "")}
      ${order.customer?.name ? row(`Customer: ${escape(order.customer.name)}`, "") : ""}
      ${order.createdBy?.name ? row(`Served by: ${escape(order.createdBy.name)}`, "") : ""}
    </table>
    <hr>
    <table>${items}</table>
    <hr>
    <table>
      ${row("Subtotal", formatMoney(bills.subtotal))}
      ${bills.discount ? row(`Discount${order.discount?.reason ? ` (${escape(order.discount.reason)})` : ""}`, `-${formatMoney(bills.discount)}`) : ""}
      ${bills.serviceCharge ? row(`Service charge (${settings.serviceChargeRate}%)`, formatMoney(bills.serviceCharge)) : ""}
      ${bills.vat ? row(`VAT (${settings.vatRate}%)`, formatMoney(bills.vat)) : ""}
      ${row("TOTAL", formatMoney(bills.total), "big")}
    </table>
    ${order.refundedTotal ? `<table>${row("Refunded", `-${formatMoney(order.refundedTotal)}`)}</table>` : ""}
    ${order.local || order.offlineEdit ? `<div class="center muted">Offline bill, synced later</div>` : ""}
    ${payment?.method ? `<hr><table>
      ${row(`Paid by ${payment.method}`, formatMoney(payment.amountTendered))}
      ${payment.change ? row("Change", formatMoney(payment.change)) : ""}
    </table>` : `<hr><div class="center big">UNPAID — PRE-BILL</div>`}
    <hr>
    <div class="center">${escape(settings.receiptFooter)}</div>
  `);
};

// Kitchen order ticket: only the items being sent now, no prices
export const printKOT = (order, ticketItems) => {
  const items = ticketItems
    .map((item) => `
      <tr><td class="big">${item.quantity} x ${escape(item.name)}</td></tr>
      ${item.note ? `<tr><td class="note">** ${escape(item.note)}</td></tr>` : ""}
    `)
    .join("");

  printHtml(`
    <div class="center big">KITCHEN ORDER</div>
    <hr>
    <table>
      ${row(`<span class="big">${orderNumber(order)}</span>`, `<span class="big">${escape(orderLabel(order))}</span>`)}
      ${row(formatDateAndTime(new Date()), order.guests ? `${order.guests} pax` : "")}
      ${order.customer?.name ? row(escape(order.customer.name), "") : ""}
    </table>
    <hr>
    <table>${items}</table>
    <hr>
  `);
};

export const printShiftReport = (shift, settings) => {
  const s = shift.summary || {};
  const methods = (s.byMethod || []).map((m) => row(`${m.method} (${m.count})`, formatMoney(m.total))).join("");
  printHtml(`
    ${header(settings)}
    <hr>
    <div class="center big">${shift.status === "closed" ? "END OF DAY (Z) REPORT" : "SHIFT (X) REPORT"}</div>
    <hr>
    <table>
      ${row("Opened", formatDateAndTime(shift.openedAt))}
      ${row("By", escape(shift.openedBy?.name || ""))}
      ${shift.closedAt ? row("Closed", formatDateAndTime(shift.closedAt)) : ""}
      ${shift.closedBy ? row("By", escape(shift.closedBy.name)) : ""}
    </table>
    <hr>
    <table>
      ${row("Bills", s.orders || 0)}
      ${row("Gross sales", formatMoney(s.subtotal))}
      ${row("Discounts", `-${formatMoney(s.discount)}`)}
      ${row("Service charge", formatMoney(s.serviceCharge))}
      ${row("VAT", formatMoney(s.vat))}
      ${row("NET TOTAL", formatMoney(s.total), "big")}
      ${row("Cancelled orders", s.cancelled || 0)}
      ${s.refundTotal ? row("Refunds given", `-${formatMoney(s.refundTotal)}`) : ""}
      ${s.refundTotal ? row("AFTER REFUNDS", formatMoney(s.netAfterRefunds), "big") : ""}
    </table>
    <hr>
    <table>${methods || row("No payments", "")}</table>
    <hr>
    <table>
      ${row("Opening cash", formatMoney(shift.openingCash))}
      ${row("Cash sales", formatMoney(s.cashSales))}
      ${s.cashRefunds ? row("Cash refunds", `-${formatMoney(s.cashRefunds)}`) : ""}
      ${row("Expected in drawer", formatMoney(shift.expectedCash))}
      ${shift.countedCash !== undefined && shift.countedCash !== null ? row("Counted", formatMoney(shift.countedCash)) : ""}
      ${shift.difference !== undefined && shift.difference !== null ? row(shift.difference < 0 ? "SHORT" : shift.difference > 0 ? "OVER" : "Difference", formatMoney(Math.abs(shift.difference)), "big") : ""}
    </table>
    ${shift.notes ? `<hr><div class="muted">Notes: ${escape(shift.notes)}</div>` : ""}
    <hr>
    <div class="center muted">Printed ${formatDateAndTime(new Date())}</div>
  `);
};
