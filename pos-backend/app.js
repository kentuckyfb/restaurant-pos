const express = require("express");
const helmet = require("helmet");
const connectDB = require("./config/database");
const config = require("./config/config");
const globalErrorHandler = require("./middlewares/globalErrorHandler");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { isVerifiedUser } = require("./middlewares/tokenVerification");
const { sanitizeInput, blockCrossSite, authLimiter, publicLimiter, apiLimiter } = require("./middlewares/security");
const { stream } = require("./services/events");
const { customerRouter, menuRouter, inventoryRouter, shiftRouter, reportRouter, settingsRouter, backupRouter } = require("./routes/adminRoutes");
const app = express();



// Refuse to run with a weak login secret (anyone who guesses it could forge logins)
if (!config.accessTokenSecret || config.accessTokenSecret.length < 32) {
    console.error("❌ JWT_SECRET must be set to a random string of at least 32 characters.");
    if (config.nodeEnv === "production") process.exit(1);
}

const PORT = config.port;
connectDB();

// Behind a hosting proxy (Render, Railway, nginx), set TRUST_PROXY=1 so rate limits see real addresses
if (config.trustProxy) app.set("trust proxy", config.trustProxy);
// Plain query strings only (no nested objects that could reach database queries)
app.set("query parser", "simple");
app.disable("x-powered-by");

// Middlewares
app.use(helmet());
app.use(cors({
    credentials: true,
    origin: config.frontendUrls,
    exposedHeaders: ["X-Archive-Count", "X-Archive-Checksum"]
}))
// Large bodies only where needed (restoring a backup); everything else is small
app.use("/api/backup/restore", express.json({ limit: "25mb" }));
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser())
app.use(sanitizeInput);
app.use("/api", blockCrossSite);


// Root Endpoint
app.get("/", (req,res) => {
    res.json({message : "Hello from POS Server!"});
})

// Lets the till check whether the server is reachable (used by offline mode)
app.get("/api/health", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true });
})

// Customer receipt links (no login)
app.get("/api/public/receipt/:token", publicLimiter, require("./controllers/orderController").getPublicReceipt);

// Slow down password guessing
app.use("/api/user/login", authLimiter);
app.use("/api/user/register", authLimiter);
app.use("/api", apiLimiter);

// Live updates: logged-in screens only
app.get("/api/events", isVerifiedUser, stream);

// Other Endpoints
app.use("/api/user", require("./routes/userRoute"));
app.use("/api/order", require("./routes/orderRoute"));
app.use("/api/table", require("./routes/tableRoute"));
app.use("/api/menu", menuRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/shift", shiftRouter);
app.use("/api/report", reportRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/backup", backupRouter);
app.use("/api/customers", customerRouter);

// Unknown API addresses
app.use("/api", (req, res) => res.status(404).json({ status: 404, message: "Not found." }));

// Global Error Handler
app.use(globalErrorHandler);


// Server
app.listen(PORT, () => {
    console.log(`☑️  POS Server is listening on port ${PORT}`);
})
