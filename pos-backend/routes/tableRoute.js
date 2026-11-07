const express = require("express");
const { addTable, getTables, updateTable, deleteTable } = require("../controllers/tableController");
const router = express.Router();
const { isVerifiedUser, authorize } = require("../middlewares/tokenVerification")

router.route("/").post(isVerifiedUser, authorize("Admin"), addTable);
router.route("/").get(isVerifiedUser , getTables);
router.route("/:id").put(isVerifiedUser, authorize("Admin"), updateTable);
router.route("/:id").delete(isVerifiedUser, authorize("Admin"), deleteTable);

module.exports = router;
