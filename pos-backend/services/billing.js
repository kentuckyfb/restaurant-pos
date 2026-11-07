const round = (n) => Math.round(n * 100) / 100;

// The single source of truth for bill maths. Service charge is part of the VAT-able amount.
const computeBill = ({ items, type, discount }, settings) => {
  const subtotal = round(items.reduce((sum, item) => sum + item.price * item.quantity, 0));

  const discountValue = discount?.value || 0;
  const discountAmount = round(
    discount?.type === "percent"
      ? (subtotal * Math.min(discountValue, 100)) / 100
      : Math.min(discountValue, subtotal)
  );
  const afterDiscount = subtotal - discountAmount;

  const chargesService = type !== "takeaway" && type !== "delivery" ? true : settings.serviceChargeOnTakeaway;
  const serviceCharge = chargesService ? round((afterDiscount * settings.serviceChargeRate) / 100) : 0;
  const vat = round(((afterDiscount + serviceCharge) * settings.vatRate) / 100);

  return {
    subtotal,
    discount: discountAmount,
    serviceCharge,
    vat,
    total: round(afterDiscount + serviceCharge + vat),
  };
};

module.exports = { computeBill, round };
