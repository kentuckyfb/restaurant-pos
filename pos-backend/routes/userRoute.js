const express = require("express");
const { getSetupStatus, register, login, getUserData, logout, listUsers, createUser, updateUser } = require("../controllers/userController");
const { isVerifiedUser, authorize } = require("../middlewares/tokenVerification");
const router = express.Router();


// Authentication Routes
router.route("/setup").get(getSetupStatus);
router.route("/register").post(register);
router.route("/login").post(login);
router.route("/logout").post(logout)

router.route("/").get(isVerifiedUser , getUserData);

// Staff management
router.route("/staff").get(isVerifiedUser, authorize("Admin"), listUsers);
router.route("/staff").post(isVerifiedUser, authorize("Admin"), createUser);
router.route("/staff/:id").put(isVerifiedUser, authorize("Admin"), updateUser);

module.exports = router;
