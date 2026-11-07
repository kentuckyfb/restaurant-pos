const mongoose = require("mongoose");

const shiftSchema = new mongoose.Schema({
    status: { type: String, enum: ["open", "closed"], default: "open" },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    openedAt: { type: Date, default: Date.now },
    openingCash: { type: Number, default: 0, min: 0 },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    closedAt: Date,
    countedCash: Number,
    expectedCash: Number,
    difference: Number,
    notes: { type: String, default: "", trim: true },
    // Snapshot of the shift's totals, written once when the shift closes
    summary: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

module.exports = mongoose.model("Shift", shiftSchema);
