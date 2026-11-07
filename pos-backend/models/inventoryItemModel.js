const mongoose = require("mongoose");

const inventoryItemSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    unit: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    costPerUnit: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);
