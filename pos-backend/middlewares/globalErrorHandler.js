const config = require("../config/config");

const globalErrorHandler = (err, req, res, next) => {
    // Mongoose validation failures are bad input, not server errors
    const statusCode = err.statusCode || err.status || (["ValidationError", "CastError"].includes(err.name) ? 400 : 500);
    const isDev = config.nodeEnv === "development";

    if (statusCode >= 500) console.error(err);

    return res.status(statusCode).json({
        status: statusCode,
        // Unexpected server errors may leak internals, so hide their message outside development
        message: statusCode >= 500 && !isDev ? "Something went wrong" : err.message,
        ...(isDev && { errorStack: err.stack })
    })
}

module.exports = globalErrorHandler;