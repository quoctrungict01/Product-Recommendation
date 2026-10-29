const mongoose = require("../../common/database")();
const categorySchema = new mongoose.Schema({
    name:{
        type: String,
        required: true,
    },
}, {timestamps: true});
const CategoryModel = mongoose.model("Categories", categorySchema, "categories");
module.exports = CategoryModel;