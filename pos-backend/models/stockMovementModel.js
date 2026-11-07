const mongoose = require("mongoose");

// Every stock change: manual ones (purchase, waste, count) and the automatic deduction when a bill is paid.
// A paid bill adds one batched write for all its ingredients.
const stockMovementSchema = new mongoose.Schema({
    item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    type: { type: String, enum: ["purchase", "waste", "count", "sale"], required: true },
    change: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    note: { type: String, default: "", trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // For sales: the bill that used the stock
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    orderNo: { type: Number },
}, { timestamps: true });

stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ item: 1, createdAt: -1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);
