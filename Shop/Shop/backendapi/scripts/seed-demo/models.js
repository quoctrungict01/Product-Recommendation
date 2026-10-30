// Nạp đúng các model THẬT của backend (Product, Category, Order) chỉ để kiểm tra schema,
// mà không mở kết nối nào.
//
// Lý do: mỗi file model gọi require("../../common/database")(), hàm này gọi mongoose.connect()
// ngay khi được require. Ngoài ra Mongoose 6 mặc định tự tạo collection và index khi model
// được biên dịch, tức là sẽ GHI vào database. Ở đây ta:
//   1. tắt autoCreate/autoIndex toàn cục,
//   2. thay mongoose.connect bằng hàm rỗng trước khi require model.
// Script seed dùng một kết nối riêng (createConnection) cho việc đọc/ghi.

const mongoose = require("mongoose");

let cached = null;

function loadModelsOffline() {
    if (cached) return cached;

    mongoose.set("autoCreate", false);
    mongoose.set("autoIndex", false);
    mongoose.set("strictQuery", true);

    const realConnect = mongoose.connect;
    // Promise không bao giờ hoàn tất: database.js sẽ không in "Connected!" và không có socket nào được mở.
    mongoose.connect = () => new Promise(() => {});
    try {
        cached = {
            CategoryModel: require("../../src/apps/models/category"),
            ProductModel: require("../../src/apps/models/product"),
            OrderModel: require("../../src/apps/models/order"),
        };
    } finally {
        mongoose.connect = realConnect;
    }
    if (mongoose.connection.readyState !== 0) {
        throw new Error("Kết nối mặc định của mongoose đã được mở ngoài ý muốn.");
    }
    return cached;
}

/** Mô tả schema thực tế (đường dẫn, kiểu, bắt buộc) để in báo cáo. */
function describeSchema(model) {
    const out = {};
    model.schema.eachPath((path, type) => {
        out[path] = { type: type.instance, required: Boolean(type.isRequired) };
    });
    return out;
}

module.exports = { loadModelsOffline, describeSchema, mongoose };
