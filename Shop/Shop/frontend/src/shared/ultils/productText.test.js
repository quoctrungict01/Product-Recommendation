import { cleanProductDetails } from "./productText";

test("Bỏ đúng các nhãn demo, giữ phần mô tả còn lại", () => {
    const raw =
        "[Dữ liệu demo] iPhone 15 128GB. Sản phẩm dùng để thử nghiệm gợi ý bằng Apriori/FP-Growth; giá và mô tả chỉ mang tính minh họa.";
    expect(cleanProductDetails(raw)).toBe("iPhone 15 128GB.");
});

test("Không động tới mô tả bình thường hoặc thông số thật", () => {
    const real = "Màn hình 6.1 inch, chip A16 Bionic; pin 3349 mAh. Bảo hành 12 tháng.";
    expect(cleanProductDetails(real)).toBe(real);
    expect(cleanProductDetails("Ảnh minh họa sản phẩm thật")).toBe("Ảnh minh họa sản phẩm thật");
});

test("Giá trị không phải chuỗi được trả lại nguyên vẹn", () => {
    expect(cleanProductDetails(undefined)).toBeUndefined();
    expect(cleanProductDetails(null)).toBeNull();
});
