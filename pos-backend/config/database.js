
const mongoose = require("mongoose");
const config = require("./config");

const connectDB = async () => {
    try {
        console.log("Connecting to MongoDB Atlas...");

        if (!config.databaseURI) {
            throw new Error("MONGODB_URI is missing from .env");
        }

        const conn = await mongoose.connect(config.databaseURI, {
            serverSelectionTimeoutMS: 10000
        });

        console.log("✅ MongoDB Atlas Connected!");
        console.log("Database Host:", conn.connection.host);
        console.log("Database Name:", conn.connection.name);

    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error.message);
        throw error;
    }
};

module.exports = connectDB;
