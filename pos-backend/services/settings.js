const Settings = require("../models/settingsModel");

// Settings are read on almost every bill, so keep them in memory and only hit the DB on change
let cached = null;

const getSettings = async () => {
  if (cached) return cached;
  let settings = await Settings.findOne().lean();
  if (!settings) settings = (await Settings.create({})).toObject();
  cached = settings;
  return cached;
};

const clearSettingsCache = () => {
  cached = null;
};

module.exports = { getSettings, clearSettingsCache };
