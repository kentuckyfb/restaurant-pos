const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true },
    category: { type: String, default: "" },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    note: { type: String, default: "", trim: true, maxlength: 200 },
    // True once the item has gone to the kitchen on a KOT
    sent: { type: Boolean, default: false },
});

const orderSchema = new mongoose.Schema({
    orderNo: { type: Number, required: true, unique: true },
    type: { type: String, enum: ["dine-in", "takeaway", "delivery"], required: true },
    table: { type: mongoose.Schema.Types.ObjectId, ref: "Table" },
    customer: {
        name: { type: String, default: "", trim: true, maxlength: 80 },
        phone: { type: String, default: "", trim: true, maxlength: 30 },
        email: { type: String, default: "", trim: true, lowercase: true, maxlength: 120 },
    },
    guests: { type: Number, default: 1, min: 1 },
    items: [orderItemSchema],
    // Merged = folded into another order (see mergedInto); Refunded = paid, then fully refunded
    status: { type: String, enum: ["Open", "Paid", "Cancelled", "Merged", "Refunded"], default: "Open" },
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    kitchenStatus: { type: String, enum: ["New", "Preparing", "Ready", "Served"], default: "New" },
    discount: {
        type: { type: String, enum: ["percent", "amount"], default: "amount" },
        value: { type: Number, default: 0, min: 0 },
        reason: { type: String, default: "", trim: true, maxlength: 200 },
    },
    bills: {
        subtotal: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        serviceCharge: { type: Number, default: 0 },
        vat: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
    },
    payment: {
        method: { type: String, enum: ["Cash", "Card", "Bank transfer", "LankaQR"] },
        amountTendered: Number,
        change: Number,
        reference: { type: String, trim: true },
        // Set when the payment was taken offline, so a retried sync is recognised
        clientRef: String,
    },
    refunds: [{
        amount: { type: Number, required: true },
        method: { type: String, required: true },
        reason: { type: String, required: true, trim: true, maxlength: 200 },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift" },
        at: { type: Date, default: Date.now },
    }],
    refundedTotal: { type: Number, default: 0 },
    cancelReason: { type: String, trim: true, maxlength: 200 },
    // Set by the till when an order was taken offline, so syncing it twice can't duplicate it
    clientRef: { type: String },
    // Unguessable id for the customer's online receipt link
    receiptToken: { type: String },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    closedAt: Date,
}, {
    timestamps: true,
    // Saves fail if another device changed the order since it was loaded; the controller retries
    optimisticConcurrency: true,
});

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ shift: 1 });
orderSchema.index({ closedAt: -1 });
orderSchema.index({ "refunds.at": -1 });
orderSchema.index({ "refunds.shift": 1 });
orderSchema.index({ clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: "string" } } });
orderSchema.index({ receiptToken: 1 }, { unique: true, partialFilterExpression: { receiptToken: { $type: "string" } } });

module.exports = mongoose.model("Order", orderSchema);
