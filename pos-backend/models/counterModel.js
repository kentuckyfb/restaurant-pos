const mongoose = require("mongoose");

// Atomic sequence numbers, e.g. bill numbers
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

const nextSequence = async (name) => {
    const counter = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return counter.seq;
};

module.exports = { Counter, nextSequence };
