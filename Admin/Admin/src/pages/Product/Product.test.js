import React from "react";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import Product from "./index";
import ProductForm, { validateProductForm, toPayload, fromProduct, emptyProduct } from "./ProductForm";

jest.mock("../../services/Api", () => ({}));

const CAT = { _id: "c".repeat(24), name: "Điện thoại" };
const cats = () => jest.fn().mockResolvedValue({ data: { data: { docs: [CAT] } } });
const prod = (i, extra = {}) => ({ _id: `p${i}`, name: `Máy ${i}`, image: "a.jpg", category_id: CAT._id, price: "1000000", promotion: "0", original_price: 1000000, final_price: 1000000, discount_percent: 0, has_discount: false, is_stock: true, is_featured: false, ...extra });
const page = (docs, total, totalPages) => ({ data: { data: { docs, total, totalPages, page: 1, limit: 10 } } });

let loc;
const Spy = () => {
    loc = useLocation();
    return null;
};
const params = () => Object.fromEntries(new URLSearchParams(loc.search));
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

function renderList(api, url = "/product", confirmFn = () => true) {
    return render(
        <MemoryRouter initialEntries={[url]}>
            <Spy />
            <Routes>
                <Route path="/product" element={<Product api={api} confirmFn={confirmFn} />} />
            </Routes>
        </MemoryRouter>
    );
}

test("danh sách: giá bán + giá gốc gạch ngang, phân trang backend giữ bộ lọc, đổi bộ lọc về trang 1", async () => {
    const api = {
        getCategories: cats(),
        getProducts: jest.fn().mockResolvedValue(page([prod(1, { has_discount: true, final_price: 900000, discount_percent: 10 }), prod(2, { is_stock: false })], 25, 3)),
        deleteProduct: jest.fn(),
    };
    renderList(api, "/product?q=may&stock=in");
    expect(await screen.findByText("Máy 1")).toBeInTheDocument();
    expect(api.getProducts).toHaveBeenLastCalledWith({ params: { page: 1, limit: 10, sort: "newest", q: "may", stock: "in" } });
    expect(screen.getByText("900.000đ")).toBeInTheDocument();
    expect(screen.getAllByText("1.000.000đ")[0].tagName).toBe("DEL");
    expect(screen.getByText("-10%")).toBeInTheDocument();
    expect(screen.getByText("Hết hàng", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/Có 25 sản phẩm · Trang 1\/3/)).toBeInTheDocument();
    await tick();
    fireEvent.click(screen.getByRole("link", { name: "3" }));
    await waitFor(() => expect(api.getProducts).toHaveBeenLastCalledWith({ params: { page: 3, limit: 10, sort: "newest", q: "may", stock: "in" } }));
    await screen.findByText("Máy 1");
    fireEvent.change(screen.getByLabelText("Sắp xếp"), { target: { value: "price_desc" } });
    await waitFor(() => expect(params()).toEqual({ q: "may", stock: "in", sort: "price_desc" }));
    await screen.findByText("Máy 1");
    await screen.findByRole("option", { name: "Điện thoại" });
    fireEvent.change(screen.getByLabelText("Danh mục"), { target: { value: CAT._id } });
    await waitFor(() => expect(api.getProducts).toHaveBeenLastCalledWith({ params: { page: 1, limit: 10, sort: "price_desc", q: "may", stock: "in", category_id: CAT._id } }));
    await screen.findByText("Máy 1");
});

test("xóa: phải xác nhận; hủy xác nhận thì không gọi API; lỗi 409 của backend hiện rõ", async () => {
    const confirmFn = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const api = {
        getCategories: cats(),
        getProducts: jest.fn().mockResolvedValue(page([prod(1), prod(2)], 2, 1)),
        deleteProduct: jest.fn().mockRejectedValueOnce({ response: { status: 409, data: { message: 'Không thể xóa "Máy 1": sản phẩm đã có trong 3 đơn hàng.' } } }).mockResolvedValueOnce({ data: {} }),
    };
    renderList(api, "/product", confirmFn);
    await screen.findByText("Máy 1");
    fireEvent.click(screen.getByRole("button", { name: "Xóa Máy 1" }));
    expect(confirmFn).toHaveBeenCalledWith(expect.stringContaining('Xóa sản phẩm "Máy 1"'));
    expect(api.deleteProduct).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xóa Máy 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("đã có trong 3 đơn hàng");
    fireEvent.click(screen.getByRole("button", { name: "Xóa Máy 2" }));
    expect(await screen.findByText('Đã xóa sản phẩm "Máy 2".')).toBeInTheDocument();
    expect(api.deleteProduct).toHaveBeenLastCalledWith("p2");
    await waitFor(() => expect(api.getProducts).toHaveBeenCalledTimes(2)); // tải lại danh sách
    await screen.findByText("Máy 1");
});

test("lỗi tải danh sách: hiện thông báo và thử lại được", async () => {
    const api = { getCategories: cats(), getProducts: jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page([prod(7)], 1, 1)), deleteProduct: jest.fn() };
    renderList(api);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được danh sách sản phẩm");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Máy 7")).toBeInTheDocument();
});

const VALID = { ...emptyProduct(), name: "Galaxy A55", category_id: CAT._id, image: "a55.jpg", price: "8.990.000", promo_type: "discount", discount: "500000", status: "Mới", accessories: "Cáp", details: "Mô tả" };

test("validate form sản phẩm và dữ liệu gửi backend (JSON, category_id, giá số, promotion)", () => {
    expect(validateProductForm(VALID)).toEqual({});
    const e = validateProductForm({ ...emptyProduct(), price: "abc", image: "../x.jpg", promo_type: "discount", discount: "0" });
    expect(Object.keys(e).sort()).toEqual(["accessories", "category_id", "details", "discount", "image", "name", "price"].sort());
    expect(validateProductForm({ ...VALID, discount: "8990000" }).discount).toBe("Số tiền giảm phải nhỏ hơn giá gốc.");
    expect(validateProductForm({ ...VALID, promo_type: "gift", gift: "50000" }).gift).toMatch(/phải là chữ/);
    expect(toPayload(VALID)).toEqual({ name: "Galaxy A55", category_id: CAT._id, image: "a55.jpg", price: "8990000", promotion: "500000", status: "Mới", accessories: "Cáp", details: "Mô tả", is_stock: true, is_featured: false });
    expect(toPayload({ ...VALID, promo_type: "none" }).promotion).toBe("0");
    expect(toPayload({ ...VALID, promo_type: "gift", gift: " Tặng ốp " }).promotion).toBe("Tặng ốp");
    expect(fromProduct({ name: "X", price: "100", promotion: "Tặng sạc", is_stock: false })).toMatchObject({ promo_type: "gift", gift: "Tặng sạc", is_stock: false });
    expect(fromProduct({ name: "X", price: "100", promotion: "20" })).toMatchObject({ promo_type: "discount", discount: "20" });
    expect(fromProduct({ name: "X", price: "100", promotion: "0" })).toMatchObject({ promo_type: "none" });
});

function renderForm(api, productId) {
    return render(
        <MemoryRouter initialEntries={[productId ? `/product-edit/${productId}` : "/product-add"]}>
            <Spy />
            <Routes>
                <Route path="/product-add" element={<ProductForm api={api} />} />
                <Route path="/product-edit/:id" element={<ProductForm api={api} productId={productId} />} />
                <Route path="/product" element={<Product api={{ getCategories: cats(), getProducts: jest.fn().mockResolvedValue(page([], 0, 0)), deleteProduct: jest.fn() }} />} />
            </Routes>
        </MemoryRouter>
    );
}
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test("thêm sản phẩm: chặn gửi khi thiếu dữ liệu; gửi đúng JSON; xem trước giá bán; thành công về danh sách có thông báo", async () => {
    const api = { getCategories: cats(), addProduct: jest.fn().mockResolvedValue({ data: { status: "success" } }), uploadProductImage: jest.fn().mockResolvedValue({ data: { data: { image: "1700-abc.png" } } }) };
    renderForm(api);
    await screen.findByRole("option", { name: "Điện thoại" });
    fireEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    expect(await screen.findByText("Vui lòng sửa các ô được đánh dấu.")).toBeInTheDocument();
    expect(screen.getByText("Tên sản phẩm là bắt buộc.")).toBeInTheDocument();
    expect(api.addProduct).not.toHaveBeenCalled();

    fill("Tên sản phẩm *", "Galaxy A55");
    fill("Danh mục *", CAT._id);
    fill("Giá gốc (VND) *", "8990000");
    fill("Khuyến mại", "discount");
    fill("Số tiền giảm (VND) *", "500000");
    expect(screen.getByText("8.490.000đ")).toBeInTheDocument();
    expect(screen.getByText("-6%")).toBeInTheDocument();
    fill("Phụ kiện đi kèm *", "Cáp");
    fill("Mô tả sản phẩm *", "Máy tốt");
    const file = new File([new Uint8Array([0x89, 0x50])], "a.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Chọn file ảnh"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText("Ảnh sản phẩm *")).toHaveValue("1700-abc.png"));
    fireEvent.click(screen.getByLabelText(/Còn hàng/));
    fireEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    await waitFor(() => expect(loc.pathname).toBe("/product"));
    expect(api.addProduct).toHaveBeenCalledWith({ name: "Galaxy A55", category_id: CAT._id, image: "1700-abc.png", price: "8990000", promotion: "500000", status: "Mới 100%", accessories: "Cáp", details: "Máy tốt", is_stock: false, is_featured: false });
    expect(await screen.findByText('Đã thêm "Galaxy A55".')).toBeInTheDocument();
});

test("upload ảnh sai định dạng bị chặn ở giao diện; lỗi backend gắn vào đúng ô", async () => {
    const api = { getCategories: cats(), addProduct: jest.fn().mockRejectedValue({ response: { status: 409, data: { message: "Đã có sản phẩm cùng tên." } } }), uploadProductImage: jest.fn() };
    renderForm(api);
    await screen.findByRole("option", { name: "Điện thoại" });
    fireEvent.change(screen.getByLabelText("Chọn file ảnh"), { target: { files: [new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })] } });
    expect(await screen.findByText("Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF.")).toBeInTheDocument();
    expect(api.uploadProductImage).not.toHaveBeenCalled();
    fill("Tên sản phẩm *", "iPhone 15");
    fill("Danh mục *", CAT._id);
    fill("Ảnh sản phẩm *", "a.jpg");
    fill("Giá gốc (VND) *", "100");
    fill("Phụ kiện đi kèm *", "Cáp");
    fill("Mô tả sản phẩm *", "x");
    fireEvent.click(screen.getByRole("button", { name: "Thêm mới" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Đã có sản phẩm cùng tên.");
    expect(loc.pathname).toBe("/product-add");
});

test("sửa sản phẩm: nạp dữ liệu hiện có (quà tặng, hết hàng), gửi PUT đúng id", async () => {
    const api = {
        getCategories: cats(),
        getProduct: jest.fn().mockResolvedValue({ data: { data: prod(5, { name: "Nokia 105", promotion: "Tặng sim", is_stock: false, status: "Mới", accessories: "Sạc", details: "Bền" }) } }),
        updateProduct: jest.fn().mockResolvedValue({ data: {} }),
    };
    renderForm(api, "p5");
    await waitFor(() => expect(screen.getByLabelText("Tên sản phẩm *")).toHaveValue("Nokia 105"));
    expect(screen.getByLabelText("Nội dung quà tặng *")).toHaveValue("Tặng sim");
    expect(screen.getByLabelText(/Còn hàng/)).not.toBeChecked();
    fill("Giá gốc (VND) *", "590000");
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật" }));
    await waitFor(() => expect(api.updateProduct).toHaveBeenCalledWith("p5", expect.objectContaining({ price: "590000", promotion: "Tặng sim", is_stock: false, category_id: CAT._id })));
    await waitFor(() => expect(loc.pathname).toBe("/product"));
});

test("sửa sản phẩm không tồn tại: hiện lỗi", async () => {
    const api = { getCategories: cats(), getProduct: jest.fn().mockRejectedValue({ response: { status: 404, data: { message: "Không tìm thấy sản phẩm." } } }) };
    renderForm(api, "nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy sản phẩm.");
    expect(within(document.body).queryByRole("button", { name: "Cập nhật" })).toBeNull();
});
