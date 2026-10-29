const express = require("express");
const router = express.Router();
const UserController = require("../apps/controllers/apis/user");


router.post("/create", UserController.create);
router.put("/update/:id", UserController.update);
router.delete("/delete/:id", UserController.delete);
router.get("/", UserController.index);
router.get("/:id", UserController.getById);

module.exports = router;
