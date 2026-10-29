// order.js
// const express = require("express");
// const router = express.Router();
// const OrderController = require("../apps/controllers/apis/order");


// router.post("/", OrderController.order);


// module.exports = router;


const express = require("express");
const router = express.Router();
const OrderController = require("../apps/controllers/apis/order");

router.post("/", OrderController.order);
router.get('/getAll', OrderController.getAllOrders);
// router.post("/createRandomOrders", OrderController.createRandomOrders);
router.get('/topProductPairs', OrderController.getTopProductPairsNames);


module.exports = router;

