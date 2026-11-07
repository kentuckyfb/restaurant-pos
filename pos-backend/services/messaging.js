const nodemailer = require("nodemailer");
const createHttpError = require("http-errors");
const config = require("../config/config");
const { formatOrderNo } = require("./orderNumber");

// Credentials live in .env (not the database), so they never end up in backup files

const emailConfigured = () => Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
const smsConfigured = () => Boolean(config.sms.userId && config.sms.apiKey && config.sms.senderId);

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
};

// Accepts 0771234567, 771234567, +94 77 123 4567 or 94771234567 and returns 94771234567
const toSriLankanNumber = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^94\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return `94${digits.slice(1)}`;
  if (/^\d{9}$/.test(digits)) return `94${digits}`;
  return null;
};

const sendSms = async (phone, message) => {
  if (!smsConfigured()) throw createHttpError(400, "SMS isn't set up yet. Add the Notify.lk details to the server's .env file.");
  const to = toSriLankanNumber(phone);
  if (!to) throw createHttpError(400, "Enter a valid Sri Lankan mobile number.");

  const params = new URLSearchParams({
    user_id: config.sms.userId,
    api_key: config.sms.apiKey,
    sender_id: config.sms.senderId,
    to,
    message,
  });
  // Unicode lets Sinhala and Tamil text through
  if (/[^\x00-\x7F]/.test(message)) params.set("type", "unicode");

  const response = await fetch(`https://app.notify.lk/api/v1/send?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status !== "success") {
    throw createHttpError(502, `SMS provider error: ${body.message || body.errors || response.statusText}`);
  }
};

const sendEmail = async (to, subject, html, text) => {
  if (!emailConfigured()) throw createHttpError(400, "Email isn't set up yet. Add the SMTP details to the server's .env file.");
  if (!/^\S+@\S+\.\S+$/.test(to || "")) throw createHttpError(400, "Enter a valid email address.");
  await getTransporter().sendMail({ from: config.smtp.from || config.smtp.user, to, subject, html, text });
};

const money = (settings, n) =>
  `${settings.currencySymbol} ${Number(n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const receiptUrl = (order) => (config.publicAppUrl && order.receiptToken ? `${config.publicAppUrl}/r/${order.receiptToken}` : null);

const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const receiptSms = (order, settings) => {
  const url = receiptUrl(order);
  const when = new Date(order.closedAt || order.createdAt).toLocaleString("en-GB", { timeZone: config.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  return [
    `${settings.businessName}`,
    `Bill #${formatOrderNo(order.orderNo)} - ${money(settings, order.bills.total)}${order.payment?.method ? ` paid by ${order.payment.method}` : ""}`,
    when,
    url ? `View bill: ${url}` : null,
    settings.receiptFooter || null,
  ].filter(Boolean).join("\n");
};

const receiptEmail = (order, settings) => {
  const rows = order.items.map((item) => `
    <tr><td style="padding:4px 0">${item.quantity} × ${escape(item.name)}</td><td style="padding:4px 0;text-align:right">${money(settings, item.price * item.quantity)}</td></tr>`).join("");
  const line = (label, value, bold) => `<tr><td style="padding:3px 0;${bold ? "font-weight:600;font-size:16px" : "color:#555"}">${label}</td><td style="padding:3px 0;text-align:right;${bold ? "font-weight:600;font-size:16px" : ""}">${value}</td></tr>`;
  const b = order.bills;
  const url = receiptUrl(order);
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;color:#18181b">
    <h2 style="margin:0">${escape(settings.businessName)}</h2>
    <p style="color:#666;margin:4px 0 16px">${escape(settings.address)}${settings.phone ? ` · ${escape(settings.phone)}` : ""}</p>
    <p style="margin:0 0 12px"><strong>Bill #${formatOrderNo(order.orderNo)}</strong> · ${new Date(order.closedAt || order.createdAt).toLocaleString("en-GB", { timeZone: config.timezone })}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7">${rows}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      ${line("Subtotal", money(settings, b.subtotal))}
      ${b.discount ? line("Discount", `-${money(settings, b.discount)}`) : ""}
      ${b.serviceCharge ? line(`Service charge (${settings.serviceChargeRate}%)`, money(settings, b.serviceCharge)) : ""}
      ${b.vat ? line(`VAT (${settings.vatRate}%)`, money(settings, b.vat)) : ""}
      ${line("Total", money(settings, b.total), true)}
      ${order.payment?.method ? line(`Paid by ${order.payment.method}`, money(settings, order.payment.amountTendered)) : ""}
      ${order.refundedTotal ? line("Refunded", `-${money(settings, order.refundedTotal)}`) : ""}
    </table>
    ${settings.vatNumber ? `<p style="color:#666;font-size:12px">VAT Reg: ${escape(settings.vatNumber)}</p>` : ""}
    ${url ? `<p><a href="${url}" style="color:#ea580c">View this bill online</a></p>` : ""}
    <p style="color:#666">${escape(settings.receiptFooter)}</p>
  </div>`;
  return { subject: `Your bill from ${settings.businessName} (#${formatOrderNo(order.orderNo)})`, html, text: receiptSms(order, settings) };
};

module.exports = { emailConfigured, smsConfigured, sendSms, sendEmail, receiptSms, receiptEmail, toSriLankanNumber };
