const createHttpError = require("http-errors");
const { rateLimit } = require("express-rate-limit");
const config = require("../config/config");

// Removes MongoDB operators ("$gt", "$ne", ...) and dotted keys from anything a client sends,
// so a value like {"$ne": null} can never be smuggled into a database query
const stripOperators = (value, depth = 0) => {
  if (depth > 20) return undefined;
  if (Array.isArray(value)) return value.map((v) => stripOperators(v, depth + 1));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const clean = {};
    for (const [key, v] of Object.entries(value)) {
      if (key.startsWith("$") || key.includes(".") || key === "__proto__" || key === "constructor" || key === "prototype") continue;
      clean[key] = stripOperators(v, depth + 1);
    }
    return clean;
  }
  return value;
};

const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === "object") req.body = stripOperators(req.body);
  // Query strings: plain strings only (an array like ?status=a&status=b keeps the first)
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) req.query[key] = typeof value[0] === "string" ? value[0] : undefined;
    else if (typeof value !== "string") delete req.query[key];
  }
  next();
};

// Blocks other websites from making a logged-in till do things (cross-site request forgery).
// Browsers always send Origin on cross-site writes; only our own frontend is allowed.
const blockCrossSite = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin");
  if (origin && !config.frontendUrls.includes(origin)) return next(createHttpError(403, "Request blocked."));
  if (req.get("Sec-Fetch-Site") === "cross-site" && !origin) return next(createHttpError(403, "Request blocked."));
  // Writes with a body must be JSON, which other sites can't send without our permission
  const hasBody = Number(req.get("Content-Length") || 0) > 0 || req.get("Transfer-Encoding");
  if (hasBody && !req.is("application/json")) return next(createHttpError(415, "Send JSON."));
  next();
};

const limitMessage = (message) => ({ status: 429, message });

// Login and first-time sign-up: slows down password guessing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: limitMessage("Too many sign-in attempts. Try again in 15 minutes."),
});

// Customer receipt links (no login)
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: limitMessage("Too many requests."),
});

// Everything else: generous, since a restaurant's tills usually share one internet address
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: limitMessage("Too many requests. Slow down."),
});

module.exports = { sanitizeInput, blockCrossSite, authLimiter, publicLimiter, apiLimiter, stripOperators };
