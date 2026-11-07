const createHttpError = require("http-errors");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const { isValidId } = require("../services/orders");
const { notify } = require("../services/events");

const pickItemFields = ({ name, category, price, available, recipe }) => {
  const fields = {};
  if (name !== undefined) fields.name = typeof name === "string" ? name.trim().slice(0, 80) : "";
  if (category !== undefined) fields.category = isValidId(category) ? category : undefined;
  if (price !== undefined) fields.price = Math.min(Number(price), 1e7);
  if (available !== undefined) fields.available = Boolean(available);
  if (recipe !== undefined) {
    fields.recipe = (recipe || [])
      .slice(0, 50)
      .filter((row) => row && isValidId(row.ingredient) && Number(row.quantity) > 0 && Number(row.quantity) < 1e6)
      .map((row) => ({ ingredient: row.ingredient, quantity: Number(row.quantity) }));
  }
  return fields;
};

// Categories and items in one request, so the POS loads the whole menu with a single read
const getMenu = async (req, res, next) => {
  try {
    const [categories, items] = await Promise.all([
      Category.find().sort({ sortOrder: 1, name: 1 }).lean(),
      MenuItem.find().sort({ name: 1 }).lean(),
    ]);
    res.status(200).json({ success: true, data: { categories, items } });
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, sortOrder } = req.body;
    if (typeof name !== "string" || !name.trim()) return next(createHttpError(400, "Enter a category name."));
    const category = await Category.create({ name: name.trim().slice(0, 60), sortOrder: Number(sortOrder) || 0 });
    notify(req, "menu");
    res.status(201).json({ success: true, message: "Category added", data: category });
  } catch (error) {
    if (error.code === 11000) return next(createHttpError(409, "That category already exists."));
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { name, sortOrder } = req.body;
    const update = {};
    if (name !== undefined) update.name = typeof name === "string" ? name.trim().slice(0, 60) : "";
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    const category = await Category.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!category) return next(createHttpError(404, "Category not found."));
    notify(req, "menu");
    res.status(200).json({ success: true, message: "Category updated", data: category });
  } catch (error) {
    if (error.code === 11000) return next(createHttpError(409, "That category already exists."));
    next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const inUse = await MenuItem.exists({ category: req.params.id });
    if (inUse) return next(createHttpError(409, "Move or delete this category's items first."));
    await Category.findByIdAndDelete(req.params.id);
    notify(req, "menu");
    res.status(200).json({ success: true, message: "Category deleted" });
  } catch (error) {
    next(error);
  }
};

const createMenuItem = async (req, res, next) => {
  try {
    const fields = pickItemFields(req.body);
    if (!fields.name?.trim()) return next(createHttpError(400, "Enter a name."));
    if (!isValidId(fields.category)) return next(createHttpError(400, "Choose a category."));
    if (!(fields.price >= 0)) return next(createHttpError(400, "Enter a valid price."));
    const item = await MenuItem.create(fields);
    notify(req, "menu");
    res.status(201).json({ success: true, message: "Item added", data: item });
  } catch (error) {
    next(error);
  }
};

const updateMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(req.params.id, pickItemFields(req.body), { new: true, runValidators: true });
    if (!item) return next(createHttpError(404, "Item not found."));
    notify(req, "menu");
    res.status(200).json({ success: true, message: "Item updated", data: item });
  } catch (error) {
    next(error);
  }
};

// Past orders keep a copy of the name and price, so deleting an item doesn't affect history
const deleteMenuItem = async (req, res, next) => {
  try {
    await MenuItem.findByIdAndDelete(req.params.id);
    notify(req, "menu");
    res.status(200).json({ success: true, message: "Item deleted" });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMenu, createCategory, updateCategory, deleteCategory, createMenuItem, updateMenuItem, deleteMenuItem };
