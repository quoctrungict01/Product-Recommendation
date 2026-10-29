const UserModel = require("../../models/user");
const pagination = require("../../../libs/pagination");

// Lấy tất cả thành viên
exports.index = async (req, res) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);
    const skip = page * limit - limit;
    const users = await UserModel.find()
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit);
    res
        .status(200)
        .json({
            status: "success",
            filter: {
                page,
                limit,
            },
            data: {
                docs: users,
            },
            pages: await pagination(UserModel, {}, limit, page),
        });
    }


// Thêm thành viên
exports.create = async (req, res) => {
    try {
        const { full_name, email, password, role } = req.body;
        // Kiểm tra các trường bắt buộc
        if (!email || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Email and password are required.',
            });
        }
        // Kiểm tra xem email đã tồn tại hay chưa
        const existingUser = await UserModel.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                status: 'error',
                message: 'Email already exists. Please choose a different email.',
            });
        }
        const newUser = await UserModel.create({ full_name, email, password, role });
        res.status(201).json({
            status: 'success',
            data: newUser,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
        });
    }
};

// Sửa thông tin thành viên
exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, email, password, role } = req.body;
        const updatedFields = {};
        if (full_name) updatedFields.full_name = full_name;
        if (email) updatedFields.email = email;
        if (password) updatedFields.password = password;
        if (role) updatedFields.role = role;
        
        const updatedUser = await UserModel.findByIdAndUpdate(
            id,
            updatedFields,
            { new: true }
        );
        if (!updatedUser) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found.',
            });
        }
        res.status(200).json({
            status: 'success',
            data: updatedUser,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
        });
    }
};

// Xóa thành viên
exports.delete = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedUser = await UserModel.findByIdAndDelete(id);
        if (!deletedUser) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found.',
            });
        }
        res.status(200).json({
            status: 'success',
            data: deletedUser,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
        });
    }
};

// Lấy tất cả thành viên
// exports.getAll = async (req, res) => {
//     try {
//         const users = await UserModel.find();
//         res.status(200).json({
//             status: 'success',
//             data: users,
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({
//             status: 'error',
//             message: 'Internal Server Error',
//         });
//     }
// };

// Lấy thành viên theo ID
exports.getById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await UserModel.findById(id);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found.',
            });
        }
        res.status(200).json({
            status: 'success',
            data: user,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
        });
    }
};
