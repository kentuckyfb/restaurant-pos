const Settings = require("../models/settingsModel");
const config = require("../config/config");
const { getSettings, clearSettingsCache } = require("../services/settings");
const { emailConfigured, smsConfigured } = require("../services/messaging");
const { notify } = require("../services/events");

const EDITABLE = [
  "businessName", "address", "phone", "email", "vatNumber", "currencySymbol",
  "serviceChargeRate", "serviceChargeOnTakeaway", "vatRate", "receiptFooter", "requireShift", "cashierRefunds",
];

// Adds read-only info about what the server has been set up for (from .env)
const withStatus = (settings) => ({
  ...settings,
  messaging: { email: emailConfigured(), sms: smsConfigured(), receiptLinks: Boolean(config.publicAppUrl) },
});

const fetchSettings = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: withStatus(await getSettings()) });
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const update = {};
    EDITABLE.forEach((key) => {
      const value = req.body[key];
      if (value === undefined) return;
      // Only plain values, and text kept to a sensible length
      if (typeof value === "string") update[key] = value.slice(0, 300);
      else if (typeof value === "number" || typeof value === "boolean") update[key] = value;
    });
    // Update the stored settings directly (never a possibly out-of-date copy held in memory)
    clearSettingsCache();
    await getSettings();
    await Settings.findOneAndUpdate({}, update, { runValidators: true, sort: { createdAt: 1 } });
    clearSettingsCache();
    notify(req, "settings");
    res.status(200).json({ success: true, message: "Settings saved", data: withStatus(await getSettings()) });
  } catch (error) {
    next(error);
  }
};

module.exports = { fetchSettings, updateSettings };
