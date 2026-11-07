// Set from the business settings once they load (see useLoadData)
let currencySymbol = "Rs.";
export const setCurrencySymbol = (symbol) => {
  currencySymbol = symbol || "Rs.";
};

export const formatMoney = (amount) =>
  `${currencySymbol} ${Number(amount || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Short amounts for chart axes: "Rs 12.5k", "Rs 1.2M"
export const formatCompact = (amount) => {
  const n = Number(amount || 0);
  const short = n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`;
  return `${currencySymbol.replace(/\.$/, "")} ${short}`;
};

export const formatNumber = (n, digits = 0) =>
  Number(n || 0).toLocaleString("en-LK", { maximumFractionDigits: digits });

export const getAvatarName = (name) => {
  if(!name) return "";

  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();

}

export const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const formatTime = (date) =>
  new Date(date).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });

export const formatDateAndTime = (date) => `${formatDate(date)}, ${formatTime(date)}`;

export const minutesSince = (date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));

export const ORDER_TYPES = {
  "dine-in": "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

export const orderLabel = (order) =>
  order.type === "dine-in" && order.table ? `Table ${order.table.tableNo}` : ORDER_TYPES[order.type];

// Order numbers are the day plus that day's count, stored as one number (YYMMDD × 10000 + count).
// 2610250001 shows as "261025-001". Older plain numbers show as they were.
export const formatOrderNo = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 1e8) return String(n ?? "");
  return `${String(Math.floor(num / 10000)).padStart(6, "0")}-${String(num % 10000).padStart(3, "0")}`;
};

// The order's id as staff see it: "#261025-001", or "OFF-3" for an order taken offline and not yet synced
export const orderNumber = (order) => (order.local ? order.orderNo : `#${formatOrderNo(order.orderNo)}`);

// Role checks used to show/hide screens; the server enforces the same rules
export const canManageBills = (role) => role === "Admin" || role === "Cashier";
export const isAdmin = (role) => role === "Admin";

const round = (n) => Math.round(n * 100) / 100;

// Mirror of the server's bill maths, for showing totals before saving. The server's figure is final.
export const computeBill = ({ items, type, discount }, settings) => {
  const subtotal = round(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const value = Number(discount?.value) || 0;
  const discountAmount = round(discount?.type === "percent" ? (subtotal * Math.min(value, 100)) / 100 : Math.min(value, subtotal));
  const afterDiscount = subtotal - discountAmount;
  const chargesService = type === "dine-in" || settings.serviceChargeOnTakeaway;
  const serviceCharge = chargesService ? round((afterDiscount * settings.serviceChargeRate) / 100) : 0;
  const vat = round(((afterDiscount + serviceCharge) * settings.vatRate) / 100);
  return { subtotal, discount: discountAmount, serviceCharge, vat, total: round(afterDiscount + serviceCharge + vat) };
};

// Date range helpers (local time)
export const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const toInputDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const apiError = (error, fallback = "Something went wrong.") =>
  error?.response?.data?.message || error?.userMessage || (error && !error.response && error.isAxiosError ? "Can't reach the server." : fallback);

// An error with a message meant for staff (used for checks done on the till itself)
export const userError = (message) => Object.assign(new Error(message), { userMessage: message });
