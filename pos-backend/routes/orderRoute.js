const express = require("express");
const {
  createOrder, updateOrder, updateKitchenStatus, moveTable, joinTable, mergeOrders,
  payOrder, cancelOrder, refundOrder, sendReceipt, getOrders, getOrderById,
} = require("../controllers/orderController");
const { isVerifiedUser, authorize } = require("../middlewares/tokenVerification");
const router = express.Router();

const till = authorize("Admin", "Cashier");

router.route("/").post(isVerifiedUser, createOrder);
router.route("/").get(isVerifiedUser, getOrders);
router.route("/:id").get(isVerifiedUser, getOrderById);
router.route("/:id").put(isVerifiedUser, updateOrder);
router.route("/:id/kitchen").patch(isVerifiedUser, updateKitchenStatus);
router.route("/:id/table").post(isVerifiedUser, moveTable);
router.route("/:id/join").post(isVerifiedUser, joinTable);
router.route("/:id/merge").post(isVerifiedUser, mergeOrders);
router.route("/:id/pay").post(isVerifiedUser, till, payOrder);
router.route("/:id/cancel").post(isVerifiedUser, till, cancelOrder);
router.route("/:id/refund").post(isVerifiedUser, till, refundOrder);
router.route("/:id/receipt").post(isVerifiedUser, till, sendReceipt);

module.exports = router;
