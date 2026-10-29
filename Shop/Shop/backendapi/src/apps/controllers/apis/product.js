const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ProductModel = require("../../models/product");
const CategoryModel = require("../../models/category");
const CommentModel = require("../../models/comment");
const pagination = require("../../../libs/pagination");

// exports.index = async (req, res) => {
//     const query = {};
//     query.is_stock = req.query.is_stock || true;
//     query.is_featured = req.query.is_featured || true;
//     if (req.query.category_id) {
//        query.category_id = req.query.category_id;
//     }
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 6;
//     const skip = page*limit - limit;
//     const products = await ProductModel.find(query)
//     .sort({_id: -1})
//     .skip(skip)
//     .limit(limit);
//     res
//         .status(200)
//         .json({
//             status: "success",
//             filter: {
//                 is_stock: query.is_stock,
//                 is_featured: query.is_featured,
//                 page,
//                 limit,
//             },
//             data: {
//                 docs: products,
//             },
//             pages:await pagination(ProductModel, query, limit, page),
//         });

// }
exports.index = async (req, res) => {
    const query = {};
    query.is_stock = req.query.is_stock || true;
    query.is_featured = req.query.is_featured || true;
    if (req.query.category_id) {
        query.category_id = mongoose.Types.ObjectId(req.query.category_id);
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = page * limit - limit;

    try {
        const products = await ProductModel.find(query)
            .sort({ _id: -1, is_featured: -1, is_stock: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            status: "success",
            filter: {
                is_stock: query.is_stock,
                is_featured: query.is_featured,
                page,
                limit,
            },
            data: {
                docs: products,
            },
            pages: await pagination(ProductModel, query, limit, page),
        });
    } catch (error) {
        console.error("Error getting products:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
};

exports.show = async (req, res) => {
    const { id } = req.params;
    const products = await ProductModel.findById(id);
    res.status(200).json({
        status: "success",
        data: products,
    })

}
exports.comments = async (req, res) => {
    const query = {};
    query.product_id = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = page * limit - limit;
    const comments = await CommentModel.find(query)
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
                docs: comments,
            },
            pages: await pagination(CommentModel, query, limit, page),
        });

}

exports.storeComments = async (req, res) => {
    const { id } = req.params;
    const body = req.body;
    const comments = {
        name: body.name,
        email: body.email,
        content: body.content,
        product_id: id,
    }
    await new CommentModel(comments).save();
    res
        .status(201)
        .json({
            status: "success",
            mesage: "create comment succsessfully",
        })

}

exports.deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;

        // Tìm comment bằng ID và xóa nó khỏi cơ sở dữ liệu
        const deletedComment = await CommentModel.findByIdAndRemove(commentId);

        // Kiểm tra nếu không tìm thấy comment
        if (!deletedComment) {
            return res.status(404).json({
                status: "error",
                message: "Comment not found.",
            });
        }

        res.status(200).json({
            status: "success",
            message: "Comment deleted successfully.",
            data: deletedComment,
        });
    } catch (error) {
        console.error("Error deleting comment:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
};


//Get all products in each category
exports.getProductsByCategoryId = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const products = await ProductModel.find({ category_id: id })
            .sort({ _id: -1 }); 

        res.status(200).json({
            status: "success",
            data: {
                docs: products,
            },
        });
    } catch (error) {
        console.error("Error getting products by category id:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

//create products
exports.addProduct = async (req, res) => {
    try {
        const { name, category_id, image, price, status, accessories, promotion, details, is_stock, is_featured } = req.body;

        // Validate required fields
        if (!name || !category_id || !image || !price || !status || !accessories || !promotion || !details) {
            return res.status(400).json({
                status: "error",
                message: "Please provide all required fields.",
            });
        }

        // Check if a product with the same name already exists
        const existingProduct = await ProductModel.findOne({ name });

        if (existingProduct) {
            return res.status(409).json({
                status: "error",
                message: "Product with the same name already exists.",
            });
        }

        // Create a new product
        const newProduct = new ProductModel({
            name,
            category_id,
            image,
            price,
            status,
            accessories,
            promotion,
            details,
            is_stock: is_stock || true,
            is_featured: is_featured || false,
        });

        // Save the product to the database
        await newProduct.save();

        res.status(201).json({
            status: "success",
            message: "Product added successfully.",
            data: newProduct,
        });
    } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
};


//update product
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category_id, image, price, status, accessories, promotion, details, is_stock, is_featured } = req.body;

        // Validate required fields
        if (!name || !category_id || !image || !price || !status || !accessories || !promotion || !details) {
            return res.status(400).json({
                status: "error",
                message: "Please provide all required fields.",
            });
        }
        // Find the product by ID
        const product = await ProductModel.findById(id);
        // Check if the product exists
        if (!product) {
            return res.status(404).json({
                status: "error",
                message: "Product not found.",
            });
        }
        // Update the product's fields
        product.name = name;
        product.category_id = category_id;
        product.image = image;
        product.price = price;
        product.status = status;
        product.accessories = accessories;
        product.promotion = promotion;
        product.details = details;
        product.is_stock = is_stock || true;
        product.is_featured = is_featured || false;
        // Save the updated product to the database
        await product.save();
        res.status(200).json({
            status: "success",
            message: "Product updated successfully.",
            data: product,
        });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
};

//Delete product
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Tìm sản phẩm bằng ID và xóa nó khỏi cơ sở dữ liệu
        const deletedProduct = await ProductModel.findByIdAndRemove(id);

        // Kiểm tra nếu không tìm thấy sản phẩm
        if (!deletedProduct) {
            return res.status(404).json({
                status: "error",
                message: "Product not found.",
            });
        }

        res.status(200).json({
            status: "success",
            message: "Product deleted successfully.",
            data: deletedProduct,
        });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
};


// exports.getProductById = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const product = await ProductModel.findById(id);

//         if (!product) {
//             return res.status(404).json({
//                 status: "error",
//                 message: "Product not found.",
//             });
//         }

//         res.status(200).json({
//             status: "success",
//             data: product,
//         });
//     } catch (error) {
//         console.error("Error getting product by ID:", error);
//         res.status(500).json({
//             status: "error",
//             message: "Internal Server Error",
//         });
//     }
// };

