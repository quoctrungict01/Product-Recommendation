const CategoryModel = require("../../models/category");
const pagination = require("../../../libs/pagination");
exports.index = async (req, res) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit)||12;
    const skip = page * limit - limit;
    const categories = await CategoryModel.find()
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
                docs: categories,
            },
            pages: await pagination(CategoryModel, {}, limit, page),
        });
}

//get by id
exports.show = async (req, res) => {
    const { id } = req.params;
    const categories = await CategoryModel.findById(id);
    res.status(200).json({
        status: "success",
        data: categories,
    })

}

//Create
exports.create = async (req, res) => {
    try {
        const { name } = req.body;
        // Kiểm tra xem name có tồn tại hay không
        if (!name) {
            return res.status(400).json({
                status: 'error',
                message: 'Name is required.',
            });
        }
        const newCategory = await CategoryModel.create({ name });
        res.status(201).json({
            status: 'success',
            data: newCategory,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
        });
    }
};

// Update
exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                status: 'error',
                message: 'Name is required.',
            });
        }

        const existingCategory = await CategoryModel.findOne({ name, _id: { $ne: id } });

        if (existingCategory) {
            return res.status(400).json({
                status: 'error',
                message: 'Name already exists. Please choose a different name.',
            });
        }

        const updatedCategory = await CategoryModel.findByIdAndUpdate(
            id,
            { name },
            { new: true }
        );

        res.status(200).json({
            status: 'success',
            data: updatedCategory,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
        });
    }
};

//Delete
exports.delete = async (req, res) => {
    try {
      const { id } = req.params;
  
      // Xóa category
      const deletedCategory = await CategoryModel.findByIdAndDelete(id);
  
      // Kiểm tra xem category có tồn tại hay không
      if (!deletedCategory) {
        return res.status(404).json({
          status: 'error',
          message: 'Category not found.',
        });
      }
  
      res.status(200).json({
        status: 'success',
        data: deletedCategory,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
      });
    }
  };



