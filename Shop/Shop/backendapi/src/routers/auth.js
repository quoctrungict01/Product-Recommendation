// BackendAPI/src/routers/auth.js
const express = require("express");
const router = express.Router();
const AuthController = require("../apps/controllers/apis/auth");

router.post("/login", AuthController.login);
router.post("/register", AuthController.register);

module.exports = router;