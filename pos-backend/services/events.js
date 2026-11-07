const User = require("../models/userModel");

/*
 Live updates (Server-Sent Events).
 Each logged-in screen keeps one connection open. When something changes, the server sends a tiny
 notice like {"type":"order","id":"..."}: never any order contents, prices or customer details.
 Screens then fetch what changed through the normal API, where every role check still applies.
*/

const MAX_PER_USER = 8;
const MAX_TOTAL = 500;
const HEARTBEAT_MS = 25 * 1000;
const RECHECK_MS = 2 * 60 * 1000;

// Notices only some roles should even hear about
const AUDIENCE = {
  inventory: ["Admin"],
  staff: ["Admin"],
};

const clients = new Set();

const send = (client, payload) => {
  try {
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    close(client);
  }
};

const close = (client) => {
  if (!clients.has(client)) return;
  clients.delete(client);
  clearInterval(client.heartbeat);
  clearInterval(client.recheck);
  clearTimeout(client.expiry);
  try { client.res.end(); } catch { /* already closed */ }
};

// Short, safe id of the browser tab that made a change, so it can skip its own notice
const originOf = (req) => {
  const value = req?.get?.("X-Client-Id") || "";
  return /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : undefined;
};

// Broadcast a change. type: order | tables | shift | menu | settings | inventory | staff | all
const notify = (req, type, id) => {
  const payload = { type };
  if (id) payload.id = String(id);
  const origin = originOf(req);
  if (origin) payload.origin = origin;
  const allowed = AUDIENCE[type];
  for (const client of clients) {
    if (allowed && !allowed.includes(client.role)) continue;
    send(client, payload);
  }
};

// Tell one person's screens to refresh their own profile (name, role)
const notifyUser = (userId) => {
  for (const client of clients) {
    if (client.userId === String(userId)) send(client, { type: "me" });
  }
};

// Drop a person's open connections, e.g. when their account is deactivated
const disconnectUser = (userId) => {
  for (const client of [...clients]) {
    if (client.userId === String(userId)) close(client);
  }
};

// GET /api/events (after isVerifiedUser)
const stream = (req, res) => {
  const userId = String(req.user._id);
  const mine = [...clients].filter((c) => c.userId === userId);
  if (clients.size >= MAX_TOTAL || mine.length >= MAX_PER_USER) {
    // Too many open screens: drop this person's oldest one rather than refuse
    if (mine.length) close(mine[0]);
    else return res.status(503).json({ status: 503, message: "Too many live connections." });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 5000\n\n");

  const client = { res, userId, role: req.user.role, tokenVersion: req.user.tokenVersion || 0 };
  clients.add(client);

  client.heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { close(client); }
  }, HEARTBEAT_MS);

  // Stop streaming to anyone deactivated, signed out everywhere, or whose role changed
  client.recheck = setInterval(async () => {
    try {
      const user = await User.findById(userId, "active role tokenVersion").lean();
      if (!user || !user.active || (user.tokenVersion || 0) !== client.tokenVersion || user.role !== client.role) close(client);
    } catch { /* database hiccup: try again next time */ }
  }, RECHECK_MS);

  // And when the login itself expires
  if (req.tokenExp) {
    const ms = req.tokenExp * 1000 - Date.now();
    client.expiry = setTimeout(() => close(client), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
  }

  req.on("close", () => close(client));
};

const connectionCount = () => clients.size;

module.exports = { stream, notify, notifyUser, disconnectUser, connectionCount };
