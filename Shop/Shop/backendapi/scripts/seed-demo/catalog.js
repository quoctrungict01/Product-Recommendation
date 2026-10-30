// Danh mục và sản phẩm demo cho TrungShop.
// Giá, khuyến mại và mô tả là DỮ LIỆU DEMO để thử nghiệm, không phải bảng giá thật.
//
// Trường của Product (src/apps/models/product.js), tất cả đều bắt buộc trừ is_stock/is_featured:
//   name, category_id, image, price (String), status, accessories, promotion (String), details
// Frontend hiển thị ảnh bằng `${BASE_URL}/images/products/${image}`, nên `image` là đường dẫn
// tương đối trong backendapi/src/public/images/products/.

const CATEGORIES = [
    { key: "iphone", name: "iPhone", icon: "phone", color: ["#1f2937", "#6b7280"] },
    { key: "samsung", name: "Samsung", icon: "phone", color: ["#1e3a8a", "#3b82f6"] },
    { key: "xiaomi", name: "Xiaomi", icon: "phone", color: ["#9a3412", "#f97316"] },
    { key: "oppo", name: "OPPO", icon: "phone", color: ["#065f46", "#10b981"] },
    { key: "vivo", name: "Vivo", icon: "phone", color: ["#3730a3", "#818cf8"] },
    { key: "nokia", name: "Nokia", icon: "feature-phone", color: ["#0c4a6e", "#38bdf8"] },
    { key: "tai-nghe", name: "Tai nghe", icon: "earbuds", color: ["#581c87", "#c084fc"] },
    { key: "sac-cap", name: "Sạc & Cáp", icon: "cable", color: ["#713f12", "#eab308"] },
    { key: "pin-du-phong", name: "Pin dự phòng", icon: "battery", color: ["#14532d", "#22c55e"] },
    { key: "op-lung-cuong-luc", name: "Ốp lưng & Cường lực", icon: "case", color: ["#831843", "#f472b6"] },
];

const PHONE_ACCESSORIES = "Cáp sạc, que lấy SIM, sách hướng dẫn";
const NEW_STATUS = "Máy mới 100%, nguyên seal";

// existingImage: ảnh sản phẩm đã có sẵn trong project (chỉ dùng khi chạy với --images existing).
// icon: ghi đè icon của danh mục cho ảnh minh họa SVG.
const PRODUCTS = [
    // iPhone
    { key: "iphone-15", name: "iPhone 15 128GB", category: "iphone", price: 19990000, promotion: 500000, featured: true, existingImage: "Iphone-15.jpg" },
    { key: "iphone-14-pro-max", name: "iPhone 14 Pro Max 128GB", category: "iphone", price: 24990000, promotion: 1000000, featured: true, existingImage: "Iphone-14-Promax.jpg" },
    { key: "iphone-14-plus", name: "iPhone 14 Plus 128GB", category: "iphone", price: 19490000, promotion: 500000, featured: false, existingImage: "Iphone-14-plus.webp" },
    { key: "iphone-13", name: "iPhone 13 128GB", category: "iphone", price: 13990000, promotion: 300000, featured: true, existingImage: "Iphone-13-pink.webp" },
    { key: "iphone-12", name: "iPhone 12 64GB", category: "iphone", price: 11490000, promotion: 300000, featured: false, existingImage: "Iphone-12.webp" },
    { key: "iphone-11", name: "iPhone 11 64GB", category: "iphone", price: 8990000, promotion: 200000, featured: false, existingImage: "Iphone-11.webp" },

    // Samsung
    { key: "galaxy-s24-ultra", name: "Samsung Galaxy S24 Ultra 256GB", category: "samsung", price: 29990000, promotion: 1500000, featured: true, existingImage: "Samsung-s24-ultra.webp" },
    { key: "galaxy-s24-plus", name: "Samsung Galaxy S24+ 256GB", category: "samsung", price: 22990000, promotion: 1000000, featured: false, existingImage: "s24-plus.webp" },
    { key: "galaxy-s23-ultra", name: "Samsung Galaxy S23 Ultra 256GB", category: "samsung", price: 23990000, promotion: 1000000, featured: true, existingImage: "Samsung-galaxy-s23-ultra.jpg" },
    { key: "galaxy-z-fold5", name: "Samsung Galaxy Z Fold5 256GB", category: "samsung", price: 36990000, promotion: 2000000, featured: false, existingImage: "Galaxy-z-fold-5.webp" },
    { key: "galaxy-z-flip5", name: "Samsung Galaxy Z Flip5 256GB", category: "samsung", price: 19990000, promotion: 1000000, featured: true, existingImage: "samsung-z-lip5_3.webp" },
    { key: "galaxy-m34", name: "Samsung Galaxy M34 5G 128GB", category: "samsung", price: 6490000, promotion: 300000, featured: false, existingImage: "Samsung-galaxy-m34-5g.webp" },
    { key: "galaxy-a05s", name: "Samsung Galaxy A05s 128GB", category: "samsung", price: 3690000, promotion: 200000, featured: false, existingImage: "samsung-galaxy-a05s.webp" },

    // Xiaomi
    { key: "xiaomi-14-ultra", name: "Xiaomi 14 Ultra 512GB", category: "xiaomi", price: 29990000, promotion: 1500000, featured: true, existingImage: "xiaomi-14-ultra.jpg" },
    { key: "xiaomi-13t-pro", name: "Xiaomi 13T Pro 256GB", category: "xiaomi", price: 14990000, promotion: 700000, featured: false, existingImage: "xiaomi-13T-pro-thumb-xanh-la9.webp" },
    { key: "redmi-note-13-pro-plus", name: "Xiaomi Redmi Note 13 Pro+ 5G 256GB", category: "xiaomi", price: 10490000, promotion: 500000, featured: true, existingImage: "xiaomi-redmi-note-13-pro-plus_9.webp" },
    { key: "redmi-note-13-pro", name: "Xiaomi Redmi Note 13 Pro 128GB", category: "xiaomi", price: 7290000, promotion: 300000, featured: false, existingImage: "xiaomi-redmi-note-13-pro-4g_13__1.webp" },

    // OPPO
    { key: "oppo-reno10", name: "OPPO Reno10 5G 256GB", category: "oppo", price: 9990000, promotion: 500000, featured: true, existingImage: "Oppo-reno10-blue.jpg" },
    { key: "oppo-a17k", name: "OPPO A17K 64GB", category: "oppo", price: 2990000, promotion: 100000, featured: false, existingImage: "oppo-a17k.webp" },

    // Vivo
    { key: "vivo-v30e", name: "Vivo V30e 256GB", category: "vivo", price: 9490000, promotion: 400000, featured: false, existingImage: "dien-thoai-vivo-v30e_2_.webp" },
    { key: "vivo-y36", name: "Vivo Y36 128GB", category: "vivo", price: 5290000, promotion: 200000, featured: false, existingImage: "vivo-y36.webp" },
    { key: "vivo-y18s", name: "Vivo Y18s 128GB", category: "vivo", price: 3790000, promotion: 100000, featured: false, existingImage: "dien-thoai-vivo-y18s-2.webp" },

    // Nokia
    { key: "nokia-105-4g-pro", name: "Nokia 105 4G Pro", category: "nokia", price: 590000, promotion: 0, featured: false, existingImage: "Nokia-105-4g-pro.webp" },
    { key: "nokia-8210-4g", name: "Nokia 8210 4G", category: "nokia", price: 1390000, promotion: 50000, featured: false, existingImage: "Nokia-8210_4g-sand-front_back.webp" },
    { key: "nokia-c21-plus", name: "Nokia C21 Plus 32GB", category: "nokia", price: 1990000, promotion: 100000, featured: false, existingImage: "Nokia-c21-plus-2gb-32gb.webp" },

    // Tai nghe
    { key: "airpods-2", name: "Tai nghe Apple AirPods 2", category: "tai-nghe", price: 2990000, promotion: 200000, featured: true, existingImage: "Airpods2.webp" },
    { key: "tai-nghe-samsung-ia500", name: "Tai nghe có dây Samsung IA500", category: "tai-nghe", price: 190000, promotion: 0, featured: false, existingImage: "tai-nghe-samsung-ia500.jpg" },
    { key: "tai-nghe-sony-ex15", name: "Tai nghe có dây Sony EX15", category: "tai-nghe", price: 290000, promotion: 0, featured: false, existingImage: "tai-nghe-sony-ex15.jpg" },

    // Sạc & Cáp
    { key: "cap-usb-c-apple-1m", name: "Cáp Apple USB-C to USB-C 1m", category: "sac-cap", price: 490000, promotion: 0, featured: false, existingImage: "cap-type-c-type-c-1m-apple-mqkj3.jpg" },
    { key: "cu-sac-usb-c-20w", name: "Củ sạc nhanh USB-C 20W", category: "sac-cap", price: 390000, promotion: 0, featured: false, existingImage: "Sac-typeC-3268B.jpg", icon: "charger" },
    { key: "cu-sac-samsung-45w", name: "Củ sạc nhanh Samsung 45W", category: "sac-cap", price: 690000, promotion: 50000, featured: false, icon: "charger" },
    { key: "cap-usb-c-samsung", name: "Cáp Samsung USB-C 1m", category: "sac-cap", price: 190000, promotion: 0, featured: false },

    // Pin dự phòng
    { key: "pin-samsung-20000-45w", name: "Pin dự phòng Samsung 20.000mAh 45W", category: "pin-du-phong", price: 1290000, promotion: 100000, featured: false, existingImage: "pin-sac-du-phong-samsung-eb-p4520x-20-000-mah-45w.webp" },
    { key: "pin-xiaomi-10000-20w", name: "Pin dự phòng Xiaomi 10.000mAh 20W", category: "pin-du-phong", price: 490000, promotion: 0, featured: false, existingImage: "pin-sac-du-phong-xiaomi-20w-1.webp" },

    // Ốp lưng & Cường lực (chưa có ảnh trong project, luôn dùng ảnh minh họa)
    { key: "op-lung-iphone-15", name: "Ốp lưng silicon iPhone 15", category: "op-lung-cuong-luc", price: 290000, promotion: 0, featured: false },
    { key: "kinh-cuong-luc-iphone-15", name: "Kính cường lực iPhone 15", category: "op-lung-cuong-luc", price: 190000, promotion: 0, featured: false, icon: "glass" },
    { key: "op-lung-iphone-14", name: "Ốp lưng trong suốt iPhone 14 series", category: "op-lung-cuong-luc", price: 250000, promotion: 0, featured: false },
    { key: "op-lung-galaxy-s24-ultra", name: "Ốp lưng Galaxy S24 Ultra", category: "op-lung-cuong-luc", price: 350000, promotion: 0, featured: false },
    { key: "kinh-cuong-luc-galaxy-s24-ultra", name: "Kính cường lực Galaxy S24 Ultra", category: "op-lung-cuong-luc", price: 250000, promotion: 0, featured: false, icon: "glass" },
    { key: "op-lung-redmi-note-13", name: "Ốp lưng Redmi Note 13 Pro series", category: "op-lung-cuong-luc", price: 150000, promotion: 0, featured: false },
    { key: "kinh-cuong-luc-redmi-note-13", name: "Kính cường lực Redmi Note 13 Pro series", category: "op-lung-cuong-luc", price: 120000, promotion: 0, featured: false, icon: "glass" },
];

const PHONE_CATEGORIES = new Set(["iphone", "samsung", "xiaomi", "oppo", "vivo", "nokia"]);

function isPhone(product) {
    return PHONE_CATEGORIES.has(product.category);
}

function placeholderImagePath(key) {
    return `demo/${key}.svg`;
}

/** Trả về các trường Product đúng theo schema (chưa có _id/category_id). */
function productFields(product, imageMode) {
    const image =
        imageMode === "existing" && product.existingImage ? product.existingImage : placeholderImagePath(product.key);
    const phone = isPhone(product);
    return {
        name: product.name,
        image,
        price: String(product.price),
        status: phone ? NEW_STATUS : "Hàng mới 100%",
        accessories: phone ? PHONE_ACCESSORIES : "Hộp, phiếu bảo hành",
        promotion: String(product.promotion),
        details: `[Dữ liệu demo] ${product.name}. Sản phẩm dùng để thử nghiệm gợi ý bằng Apriori/FP-Growth; giá và mô tả chỉ mang tính minh họa.`,
        is_stock: true,
        is_featured: Boolean(product.featured),
    };
}

module.exports = {
    CATEGORIES,
    PRODUCTS,
    isPhone,
    placeholderImagePath,
    productFields,
};
