const createHttpError = require("http-errors");
const User = require("../models/userModel");
const Settings = require("../models/settingsModel");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const InventoryItem = require("../models/inventoryItemModel");
const StockMovement = require("../models/stockMovementModel");
const Table = require("../models/tableModel");
const Order = require("../models/orderModel");
const Shift = require("../models/shiftModel");
const { Counter } = require("../models/counterModel");
const { clearSettingsCache } = require("../services/settings");
const { notify } = require("../services/events");

const BACKUP_VERSION = 1;

// Order matters on restore: referenced data first
const MODELS = {
  users: User,
  settings: Settings,
  categories: Category,
  inventoryItems: InventoryItem,
  menuItems: MenuItem,
  tables: Table,
  shifts: Shift,
  orders: Order,
  stockMovements: StockMovement,
  counters: Counter,
};

const exportBackup = async (req, res, next) => {
  try {
    const collections = {};
    for (const [name, Model] of Object.entries(MODELS)) {
      collections[name] = await Model.find().lean();
    }
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="pos-backup-${date}.json"`);
    res.status(200).json({ app: "restro-pos", version: BACKUP_VERSION, exportedAt: new Date(), collections });
  } catch (error) {
    next(error);
  }
};

// Replaces ALL data with the contents of a backup file
const restoreBackup = async (req, res, next) => {
  try {
    const { backup, confirm } = req.body;
    if (confirm !== "RESTORE") return next(createHttpError(400, "Type RESTORE to confirm."));
    if (backup?.app !== "restro-pos" || backup.version !== BACKUP_VERSION || !backup.collections) {
      return next(createHttpError(400, "This file isn't a valid POS backup."));
    }
    const users = backup.collections.users || [];
    if (!users.some((user) => user.role === "Admin" && user.active !== false)) {
      return next(createHttpError(400, "The backup has no active admin account, so nobody could log in."));
    }

    const counts = {};
    for (const [name, Model] of Object.entries(MODELS)) {
      const docs = backup.collections[name] || [];
      await Model.deleteMany({});
      // insertMany skips save hooks, so password hashes are restored as-is
      if (docs.length) await Model.insertMany(docs);
      counts[name] = docs.length;
    }
    clearSettingsCache();
    notify(req, "all");
    res.status(200).json({ success: true, message: "Backup restored", data: counts });
  } catch (error) {
    next(error);
  }
};

module.exports = { exportBackup, restoreBackup };
