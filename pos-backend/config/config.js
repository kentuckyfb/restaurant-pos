require("dotenv").config();

const config = Object.freeze({
    port: process.env.PORT || 3000,
    databaseURI: process.env.MONGODB_URI,
    nodeEnv : process.env.NODE_ENV || "development",
    accessTokenSecret: process.env.JWT_SECRET,
    // Comma-separated list of allowed frontend origins, e.g. "https://pos.example.com"
    frontendUrls: (process.env.FRONTEND_URL || "http://localhost:5173").split(",").map((url) => url.trim()),
    // Used to group reports by local day/hour
    timezone: process.env.TIMEZONE || "Asia/Colombo",
    // Database size limit, for the storage gauge (MongoDB Atlas free M0 = 512 MB)
    dbLimitMb: Number(process.env.DB_LIMIT_MB) || 512,
    // Number of proxies in front of the server (e.g. 1 on Render/Railway); 0 when exposed directly
    trustProxy: Number(process.env.TRUST_PROXY) || 0,
    // Where customers open their receipt links (the frontend's public address)
    publicAppUrl: (process.env.PUBLIC_APP_URL || "").replace(/\/$/, ""),
    smtp: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM,
    },
    sms: {
        userId: process.env.NOTIFY_USER_ID,
        apiKey: process.env.NOTIFY_API_KEY,
        senderId: process.env.NOTIFY_SENDER_ID,
    },
});

module.exports = config;
