// BackendAPI/src/apps/controllers/apis/auth.js
const UserModel = require("../../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: "error",
                message: "Email và mật khẩu là bắt buộc.",
            });
        }

        // Tìm user theo email
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(401).json({
                status: "error",
                message: "Email hoặc mật khẩu không đúng.",
            });
        }

        // So sánh password
        // Nếu password chưa được hash (dữ liệu cũ), so sánh trực tiếp
        let isMatch = false;
        if (user.password && user.password.startsWith("$2b$")) {
            // Password đã được bcrypt hash
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            // Password plaintext (dữ liệu cũ) — so sánh trực tiếp
            isMatch = password === user.password;
        }

        if (!isMatch) {
            return res.status(401).json({
                status: "error",
                message: "Email hoặc mật khẩu không đúng.",
            });
        }

        // Tạo JWT token
        const token = jwt.sign(
            { _id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET || "phone_shop_secret_key",
            { expiresIn: "7d" }
        );

        res.status(200).json({
            status: "success",
            message: "Đăng nhập thành công.",
            data: {
                token,
                user: {
                    _id: user._id,
                    full_name: user.full_name,
                    email: user.email,
                    role: user.role,
                },
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server.",
        });
    }
};

exports.register = async (req, res) => {
    try {
        const { full_name, email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: "error",
                message: "Email và mật khẩu là bắt buộc.",
            });
        }

        const existing = await UserModel.findOne({ email });
        if (existing) {
            return res.status(400).json({
                status: "error",
                message: "Email đã tồn tại.",
            });
        }

        // Hash password trước khi lưu
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await UserModel.create({
            full_name,
            email,
            password: hashedPassword,
            role: "member",
        });

        const token = jwt.sign(
            { _id: newUser._id, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET || "phone_shop_secret_key",
            { expiresIn: "7d" }
        );

        res.status(201).json({
            status: "success",
            message: "Đăng ký thành công.",
            data: {
                token,
                user: {
                    _id: newUser._id,
                    full_name: newUser.full_name,
                    email: newUser.email,
                    role: newUser.role,
                },
            },
        });
    } catch (error) {
        console.error("Register error:", error);
        res.status(500).json({
            status: "error",
            message: "Lỗi server.",
        });
    }
};