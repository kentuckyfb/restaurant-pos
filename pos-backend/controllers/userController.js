const createHttpError = require("http-errors");
const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { notify, notifyUser, disconnectUser } = require("../services/events");

const clip = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : value);

const ROLES = ["Admin", "Cashier", "Waiter"];
const SESSION_HOURS = 12;

const cookieOptions = {
    httpOnly: true,
    sameSite: 'none',
    secure: true
};

const issueSession = (res, user) => {
    const accessToken = jwt.sign({_id: user._id, v: user.tokenVersion || 0}, config.accessTokenSecret, {
        expiresIn : `${SESSION_HOURS}h`
    });
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 1000 * 60 * 60 * SESSION_HOURS });
}

// Tells the login screen whether this is a brand-new install that needs its first admin
const getSetupStatus = async (req, res, next) => {
    try {
        const users = await User.estimatedDocumentCount();
        res.status(200).json({ success: true, data: { needsSetup: users === 0 } });
    } catch (error) {
        next(error);
    }
}

// Public sign-up only works once, to create the first admin. Staff are added by an admin afterwards.
const register = async (req, res, next) => {
    try {

        const { name, phone, email, password } = req.body;

        if(!name || !phone || !email || !password){
            const error = createHttpError(400, "All fields are required!");
            return next(error);
        }

        if (await User.exists({})) {
            return next(createHttpError(403, "Sign-up is closed. Ask an admin to add you."));
        }

        if (typeof password !== "string" || password.length < 8) return next(createHttpError(400, "Password must be at least 8 characters."));

        const newUser = await User.create({ name: clip(name, 80), phone: clip(phone, 30), email: clip(email, 120), password, role: "Admin" });
        issueSession(res, newUser);
        res.status(201).json({success: true, message: "Admin account created", data: newUser});

    } catch (error) {
        next(error);
    }
}


const login = async (req, res, next) => {

    try {

        const { email, password } = req.body;

        if(!email || !password) {
            const error = createHttpError(400, "All fields are required!");
            return next(error);
        }

        if (typeof email !== "string" || typeof password !== "string") return next(createHttpError(400, "All fields are required!"));
        const isUserPresent = await User.findOne({email: email.toLowerCase().trim()});
        if(!isUserPresent){
            const error = createHttpError(401, "Invalid Credentials");
            return next(error);
        }

        const isMatch = await bcrypt.compare(password, isUserPresent.password);
        if(!isMatch){
            const error = createHttpError(401, "Invalid Credentials");
            return next(error);
        }

        if (!isUserPresent.active) {
            return next(createHttpError(403, "This account has been deactivated."));
        }

        issueSession(res, isUserPresent);
        res.status(200).json({success: true, message: "User login successfully!",
            data: isUserPresent
        });


    } catch (error) {
        next(error);
    }

}

const getUserData = async (req, res, next) => {
    try {
        res.status(200).json({success: true, data: req.user});
    } catch (error) {
        next(error);
    }
}

const logout = async (req, res, next) => {
    try {

        res.clearCookie('accessToken', cookieOptions);
        res.status(200).json({success: true, message: "User logout successfully!"});

    } catch (error) {
        next(error);
    }
}

// --- Staff management (admin only) ---

const listUsers = async (req, res, next) => {
    try {
        const users = await User.find().sort({ active: -1, name: 1 });
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
}

const createUser = async (req, res, next) => {
    try {
        const { name, phone, email, password, role } = req.body;
        if (!name || !phone || !email || !password || !role) return next(createHttpError(400, "All fields are required!"));
        if (!ROLES.includes(role)) return next(createHttpError(400, "Choose a valid role."));
        if (typeof password !== "string" || password.length < 8) return next(createHttpError(400, "Password must be at least 8 characters."));

        const user = await User.create({ name: clip(name, 80), phone: clip(phone, 30), email: clip(email, 120), password, role });
        notify(req, "staff");
        res.status(201).json({ success: true, message: "Staff member added", data: user });
    } catch (error) {
        if (error.code === 11000) return next(createHttpError(409, "That email is already in use."));
        next(error);
    }
}

const updateUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return next(createHttpError(404, "Staff member not found."));

        const { name, phone, email, role, active, password } = req.body;
        const isSelf = String(user._id) === String(req.user._id);
        const losingAdmin = user.role === "Admin" && ((role && role !== "Admin") || active === false);

        if (isSelf && losingAdmin) return next(createHttpError(400, "You can't remove your own admin access."));
        if (losingAdmin && (await User.countDocuments({ role: "Admin", active: true })) <= 1) {
            return next(createHttpError(400, "There must be at least one active admin."));
        }
        if (role && !ROLES.includes(role)) return next(createHttpError(400, "Choose a valid role."));
        if (password && (typeof password !== "string" || password.length < 8)) return next(createHttpError(400, "Password must be at least 8 characters."));

        if (name !== undefined) user.name = clip(name, 80);
        if (phone !== undefined) user.phone = clip(phone, 30);
        if (email !== undefined) user.email = clip(email, 120);
        if (role !== undefined) user.role = role;
        const deactivating = active === false && user.active;
        if (active !== undefined) user.active = Boolean(active);
        if (password) user.password = password;
        // New password or deactivation: sign them out on every device
        if (password || deactivating) user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        if (password || deactivating) disconnectUser(user._id);
        notifyUser(user._id);
        notify(req, "staff");
        // Changing your own password keeps you signed in on this device
        if (password && isSelf) issueSession(res, user);

        res.status(200).json({ success: true, message: "Staff member updated", data: user });
    } catch (error) {
        if (error.code === 11000) return next(createHttpError(409, "That email is already in use."));
        next(error);
    }
}

module.exports = { getSetupStatus, register, login, getUserData, logout, listUsers, createUser, updateUser }
