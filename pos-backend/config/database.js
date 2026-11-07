const mongoose = require("mongoose");
const config = require("./config");

const connectDB = async () => {
    try {
        console.log("Connecting to MongoDB Atlas...");

        if (!config.databaseURI) {
            throw new Error("MONGODB_URI is missing from environment variables.");
        }

        const conn = await mongoose.connect(config.databaseURI, {
            serverSelectionTimeoutMS: 15000,
        });

        console.log("✅ MongoDB Atlas Connected!");
        console.log("Database Host:", conn.connection.host);
        console.log("Database Name:", conn.connection.name);
        return conn;
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error.message);
        if (error.message.includes("whitelist") || error.message.includes("SSL") || error.message.includes("tlsv1")) {
            console.error("⚠️ ACTION REQUIRED: In MongoDB Atlas Dashboard -> Network Access -> Add IP Address -> Choose 'Allow Access From Anywhere' (0.0.0.0/0).");
        }
        throw error;
    }
};

module.exports = connectDB;
