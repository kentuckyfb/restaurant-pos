const express = require("express");
const { isVerifiedUser, authorize } = require("../middlewares/tokenVerification");
const menu = require("../controllers/menuController");
const inventory = require("../controllers/inventoryController");
const shifts = require("../controllers/shiftController");
const { getSalesReport } = require("../controllers/reportController");
const { fetchSettings, updateSettings } = require("../controllers/settingsController");
const { exportBackup, restoreBackup } = require("../controllers/backupController");
const archive = require("../controllers/archiveController");
const customers = require("../controllers/customerController");

const admin = [isVerifiedUser, authorize("Admin")];
const cashier = [isVerifiedUser, authorize("Admin", "Cashier")];

// Menu: everyone can read it, only admins change it
const menuRouter = express.Router();
menuRouter.get("/", isVerifiedUser, menu.getMenu);
menuRouter.post("/categories", admin, menu.createCategory);
menuRouter.put("/categories/:id", admin, menu.updateCategory);
menuRouter.delete("/categories/:id", admin, menu.deleteCategory);
menuRouter.post("/items", admin, menu.createMenuItem);
menuRouter.put("/items/:id", admin, menu.updateMenuItem);
menuRouter.delete("/items/:id", admin, menu.deleteMenuItem);

const inventoryRouter = express.Router();
inventoryRouter.get("/", admin, inventory.getInventory);
inventoryRouter.get("/movements", admin, inventory.getMovements);
inventoryRouter.post("/", admin, inventory.createInventoryItem);
inventoryRouter.put("/:id", admin, inventory.updateInventoryItem);
inventoryRouter.delete("/:id", admin, inventory.deleteInventoryItem);
inventoryRouter.post("/:id/adjust", admin, inventory.adjustStock);

// Anyone can see whether the day is open; only cashiers/admins open or close it
const shiftRouter = express.Router();
shiftRouter.get("/current", isVerifiedUser, shifts.getCurrentShift);
shiftRouter.get("/", cashier, shifts.getShifts);
shiftRouter.get("/:id", cashier, shifts.getShiftById);
shiftRouter.post("/open", cashier, shifts.openShift);
shiftRouter.post("/close", cashier, shifts.closeShift);

const reportRouter = express.Router();
reportRouter.get("/sales", admin, getSalesReport);

const settingsRouter = express.Router();
settingsRouter.get("/", isVerifiedUser, fetchSettings);
settingsRouter.put("/", admin, updateSettings);

const backupRouter = express.Router();
backupRouter.get("/export", admin, exportBackup);
backupRouter.post("/restore", admin, restoreBackup);
backupRouter.get("/storage", admin, archive.getStorageStats);
backupRouter.get("/archive/preview", admin, archive.previewArchive);
backupRouter.get("/archive/export", admin, archive.exportArchive);
backupRouter.post("/archive/purge", admin, archive.purgeArchive);

// Customers (built from order details): cashiers and admins
const customerRouter = express.Router();
customerRouter.get("/", cashier, customers.getCustomers);
customerRouter.get("/orders", cashier, customers.getCustomerOrders);

module.exports = { customerRouter, menuRouter, inventoryRouter, shiftRouter, reportRouter, settingsRouter, backupRouter };
