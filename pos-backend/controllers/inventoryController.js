const createHttpError = require("http-errors");
const InventoryItem = require("../models/inventoryItemModel");
const StockMovement = require("../models/stockMovementModel");
const MenuItem = require("../models/menuItemModel");
const { round } = require("../services/billing");
const { isValidId } = require("../services/orders");
const { notify } = require("../services/events");

const pickFields = ({ name, unit, reorderLevel, costPerUnit }) => {
  const fields = {};
  if (name !== undefined) fields.name = typeof name === "string" ? name.trim().slice(0, 80) : "";
  if (unit !== undefined) fields.unit = typeof unit === "string" ? unit.trim().slice(0, 20) : "";
  if (reorderLevel !== undefined) fields.reorderLevel = Number(reorderLevel) || 0;
  if (costPerUnit !== undefined) fields.costPerUnit = Number(costPerUnit) || 0;
  return fields;
};

const getInventory = async (req, res, next) => {
  try {
    const items = await InventoryItem.find().sort({ name: 1 }).lean();
    res.status(200).json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

const createInventoryItem = async (req, res, next) => {
  try {
    const fields = pickFields(req.body);
    if (!fields.name?.trim() || !fields.unit?.trim()) return next(createHttpError(400, "Enter a name and unit."));
    const item = await InventoryItem.create({ ...fields, quantity: Number(req.body.quantity) || 0 });
    notify(req, "inventory");
    res.status(201).json({ success: true, message: "Stock item added", data: item });
  } catch (error) {
    if (error.code === 11000) return next(createHttpError(409, "A stock item with that name already exists."));
    next(error);
  }
};

const updateInventoryItem = async (req, res, next) => {
  try {
    const item = await InventoryItem.findByIdAndUpdate(req.params.id, pickFields(req.body), { new: true, runValidators: true });
    if (!item) return next(createHttpError(404, "Stock item not found."));
    notify(req, "inventory");
    res.status(200).json({ success: true, message: "Stock item updated", data: item });
  } catch (error) {
    if (error.code === 11000) return next(createHttpError(409, "A stock item with that name already exists."));
    next(error);
  }
};

const deleteInventoryItem = async (req, res, next) => {
  try {
    const usedIn = await MenuItem.findOne({ "recipe.ingredient": req.params.id }, "name").lean();
    if (usedIn) return next(createHttpError(409, `Used in the recipe for ${usedIn.name}. Remove it there first.`));
    await InventoryItem.findByIdAndDelete(req.params.id);
    notify(req, "inventory");
    res.status(200).json({ success: true, message: "Stock item deleted" });
  } catch (error) {
    next(error);
  }
};

// type: purchase (+quantity), waste (-quantity) or count (set to quantity)
const adjustStock = async (req, res, next) => {
  try {
    const { type, quantity, note } = req.body;
    const amount = Number(quantity);
    if (!["purchase", "waste", "count"].includes(type)) return next(createHttpError(400, "Choose purchase, waste or count."));
    if (!(amount >= 0) || amount > 1e7) return next(createHttpError(400, "Enter a valid quantity."));
    if (!isValidId(req.params.id)) return next(createHttpError(404, "Stock item not found."));

    const current = await InventoryItem.findById(req.params.id);
    if (!current) return next(createHttpError(404, "Stock item not found."));

    const change = round(type === "purchase" ? amount : type === "waste" ? -amount : amount - current.quantity);
    const item = await InventoryItem.findByIdAndUpdate(current._id, { $inc: { quantity: change } }, { new: true });

    await StockMovement.create({
      item: item._id,
      type,
      change,
      balanceAfter: item.quantity,
      note: typeof note === "string" ? note.trim().slice(0, 200) : "",
      user: req.user._id,
    });
    notify(req, "inventory");
    res.status(200).json({ success: true, message: "Stock updated", data: item });
  } catch (error) {
    next(error);
  }
};

const getMovements = async (req, res, next) => {
  try {
    const filter = isValidId(req.query.item) ? { item: req.query.item } : {};
    if (req.query.type === "sale") filter.type = "sale";
    else if (req.query.type === "manual") filter.type = { $ne: "sale" };
    const movements = await StockMovement.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 500))
      .populate("item", "name unit")
      .populate("user", "name");
    res.status(200).json({ success: true, data: movements });
  } catch (error) {
    next(error);
  }
};

module.exports = { getInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, adjustStock, getMovements };
