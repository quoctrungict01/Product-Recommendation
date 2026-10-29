const mongoose = require("../../common/database")();
const commentSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true,
    },
    email:{
        type: String,
        required: true,
    },
    content:{
        type: String,
        required: true,
    },
    product_id:{
        type: String,
        required: true,
    },
}, {timestamps: true});
const CommentModel = mongoose.model("Comments", commentSchema, "comments");
module.exports = CommentModel;