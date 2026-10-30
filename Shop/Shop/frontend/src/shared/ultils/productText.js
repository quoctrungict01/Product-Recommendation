// Bỏ các nhãn chỉ dành cho dữ liệu demo khỏi mô tả sản phẩm khi HIỂN THỊ cho khách.
// Dữ liệu trong MongoDB giữ nguyên. Chỉ xóa đúng các cụm sau, phần mô tả khác không đổi:
//   "[Dữ liệu demo]"
//   "Sản phẩm dùng để thử nghiệm gợi ý bằng Apriori/FP-Growth"
//   "giá và mô tả chỉ mang tính minh họa"
const DEMO_PHRASES = [
    /\[\s*Dữ liệu demo\s*\]/giu,
    /Sản phẩm dùng để thử nghiệm gợi ý bằng Apriori\s*\/\s*FP-Growth\s*[;.,]?/giu,
    /Giá và mô tả chỉ mang tính minh họa\s*\.?/giu,
];

export const cleanProductDetails = (details) => {
    if (typeof details !== "string") return details;
    let text = details;
    for (const pattern of DEMO_PHRASES) text = text.replace(pattern, " ");
    return text
        .replace(/\s+([.,;])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .trim();
};
