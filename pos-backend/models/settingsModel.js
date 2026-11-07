const mongoose = require("mongoose");

// A single document holding business-wide settings
const settingsSchema = new mongoose.Schema({
    businessName: { type: String, default: "My Restaurant", trim: true },
    address: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    vatNumber: { type: String, default: "", trim: true },
    currencySymbol: { type: String, default: "Rs.", trim: true },
    serviceChargeRate: { type: Number, default: 10, min: 0, max: 100 },
    serviceChargeOnTakeaway: { type: Boolean, default: false },
    vatRate: { type: Number, default: 0, min: 0, max: 100 },
    receiptFooter: { type: String, default: "Thank you! Come again.", trim: true },
    requireShift: { type: Boolean, default: true },
    cashierRefunds: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Settings", settingsSchema);
