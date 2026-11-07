// Loads a sample Sri Lankan menu, stock items and tables into an empty database.
// Usage: npm run seed   (does nothing if a menu already exists)
const mongoose = require("mongoose");
const config = require("../config/config");
const Category = require("../models/categoryModel");
const MenuItem = require("../models/menuItemModel");
const InventoryItem = require("../models/inventoryItemModel");
const Table = require("../models/tableModel");
const { getSettings } = require("../services/settings");

const inventory = [
  { name: "Rice (samba)", unit: "kg", quantity: 25, reorderLevel: 10, costPerUnit: 260 },
  { name: "Chicken", unit: "kg", quantity: 12, reorderLevel: 5, costPerUnit: 1450 },
  { name: "Eggs", unit: "pcs", quantity: 120, reorderLevel: 60, costPerUnit: 45 },
  { name: "Godamba roti", unit: "pcs", quantity: 60, reorderLevel: 40, costPerUnit: 60 },
  { name: "Fish (seer)", unit: "kg", quantity: 4, reorderLevel: 3, costPerUnit: 3200 },
  { name: "Tea leaves", unit: "g", quantity: 900, reorderLevel: 250, costPerUnit: 2.4 },
  { name: "Fresh milk", unit: "l", quantity: 6, reorderLevel: 4, costPerUnit: 480 },
  { name: "King coconut", unit: "pcs", quantity: 8, reorderLevel: 10, costPerUnit: 120 },
  { name: "Ginger beer bottle", unit: "pcs", quantity: 48, reorderLevel: 24, costPerUnit: 140 },
  { name: "Water bottle 500ml", unit: "pcs", quantity: 60, reorderLevel: 24, costPerUnit: 70 },
];

// [category, [name, price, recipe: [[stock item, quantity per portion]]]]
const menu = [
  ["Rice & Curry", [
    ["Chicken Rice & Curry", 1200, [["Rice (samba)", 0.2], ["Chicken", 0.15]]],
    ["Fish Rice & Curry", 1300, [["Rice (samba)", 0.2], ["Fish (seer)", 0.12]]],
    ["Vegetable Rice & Curry", 850, [["Rice (samba)", 0.2]]],
    ["Lamprais", 1800, [["Rice (samba)", 0.25], ["Chicken", 0.1], ["Eggs", 1]]],
  ]],
  ["Kottu", [
    ["Chicken Kottu", 1400, [["Godamba roti", 2], ["Chicken", 0.15], ["Eggs", 1]]],
    ["Egg Kottu", 1000, [["Godamba roti", 2], ["Eggs", 2]]],
    ["Cheese Kottu", 1700, [["Godamba roti", 2], ["Chicken", 0.12], ["Eggs", 1]]],
    ["Vegetable Kottu", 900, [["Godamba roti", 2]]],
  ]],
  ["Hoppers", [
    ["Plain Hopper", 80, []],
    ["Egg Hopper", 180, [["Eggs", 1]]],
    ["Milk Hopper", 150, []],
    ["String Hoppers (10) & Curry", 650, []],
  ]],
  ["Fried Rice & Noodles", [
    ["Chicken Fried Rice", 1350, [["Rice (samba)", 0.2], ["Chicken", 0.1], ["Eggs", 1]]],
    ["Seafood Fried Rice", 1800, [["Rice (samba)", 0.2], ["Eggs", 1]]],
    ["Chicken Noodles", 1250, [["Chicken", 0.1], ["Eggs", 1]]],
  ]],
  ["Devilled & Bites", [
    ["Devilled Chicken", 1600, [["Chicken", 0.25]]],
    ["Hot Butter Cuttlefish", 1900, []],
    ["Fish Cutlets (4)", 400, [["Fish (seer)", 0.05]]],
  ]],
  ["Short Eats", [
    ["Fish Bun", 150, []],
    ["Vegetable Roti", 120, []],
    ["Chicken Roll", 180, []],
    ["Isso Wade", 200, []],
  ]],
  ["Desserts", [
    ["Watalappan", 450, [["Eggs", 1]]],
    ["Curd & Treacle", 500, []],
    ["Ice Cream", 350, []],
  ]],
  ["Beverages", [
    ["Plain Tea", 150, [["Tea leaves", 3]]],
    ["Milk Tea", 220, [["Tea leaves", 3], ["Fresh milk", 0.05]]],
    ["Iced Coffee", 550, [["Fresh milk", 0.15]]],
    ["King Coconut", 300, [["King coconut", 1]]],
    ["Fresh Lime Juice", 400, []],
    ["Ginger Beer", 250, [["Ginger beer bottle", 1]]],
    ["Bottled Water", 150, [["Water bottle 500ml", 1]]],
  ]],
];

const run = async () => {
  await mongoose.connect(config.databaseURI);
  await getSettings(); // creates default settings if missing

  if (await MenuItem.exists({})) {
    console.log("Menu already exists, nothing seeded.");
    return mongoose.disconnect();
  }

  const stock = await InventoryItem.insertMany(inventory);
  const stockId = Object.fromEntries(stock.map((item) => [item.name, item._id]));

  for (const [index, [categoryName, items]] of menu.entries()) {
    const category = await Category.create({ name: categoryName, sortOrder: index });
    await MenuItem.insertMany(items.map(([name, price, recipe]) => ({
      name,
      price,
      category: category._id,
      recipe: recipe.map(([ingredient, quantity]) => ({ ingredient: stockId[ingredient], quantity })),
    })));
  }

  if (!(await Table.exists({}))) {
    await Table.insertMany([2, 4, 4, 6, 2, 4, 6, 8].map((seats, i) => ({ tableNo: i + 1, seats })));
  }

  console.log(`Seeded ${menu.length} categories, ${menu.reduce((n, [, items]) => n + items.length, 0)} dishes, ${inventory.length} stock items.`);
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
