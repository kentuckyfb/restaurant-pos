const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    price: { type: Number, required: true, min: 0 },
    available: { type: Boolean, default: true },
    // Ingredients used per portion; deducted from inventory when the bill is paid
    recipe: [{
        _id: false,
        ingredient: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
        quantity: { type: Number, required: true, min: 0 },
    }],
}, { timestamps: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
