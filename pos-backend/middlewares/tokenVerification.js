const createHttpError = require("http-errors");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const User = require("../models/userModel");


const isVerifiedUser = async (req, res, next) => {
    try{

        const { accessToken } = req.cookies;

        if(!accessToken){
            const error = createHttpError(401, "Please log in.");
            return next(error);
        }

        const decodeToken = jwt.verify(accessToken, config.accessTokenSecret);

        const user = await User.findById(decodeToken._id);
        // A password change or deactivation bumps tokenVersion, ending older logins
        if(!user || !user.active || (decodeToken.v || 0) !== (user.tokenVersion || 0)){
            const error = createHttpError(401, "Your account is not active.");
            return next(error);
        }

        req.user = user;
        req.tokenExp = decodeToken.exp;
        next();

    }catch (error) {
        const err = createHttpError(401, "Session expired. Please log in again.");
        next(err);
    }
}

// Use after isVerifiedUser, e.g. authorize("Admin", "Cashier")
const authorize = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return next(createHttpError(403, "You don't have permission to do that."));
    }
    next();
}

module.exports = { isVerifiedUser, authorize };
