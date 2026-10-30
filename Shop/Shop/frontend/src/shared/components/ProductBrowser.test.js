import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import ProductBrowser from "./ProductBrowser";

jest.mock("../../services/Api", () => ({ getProducts: jest.fn(), getCategories: jest.fn() }));

const product = (i, extra = {}) => ({ _id: `p${i}`, name: `Sản phẩm ${i}`, image: "x.jpg", price: "100000", original_price: 100000, final_price: 100000, discount_percent: 0, has_discount: false, is_stock: true, ...extra });
const page = (docs, { total = docs.length, currentPage = 1, totalPages = 1 } = {}) => ({
    data: {
        status: "success",
        data: { docs, total, page: currentPage, limit: 12, totalPages },
        pages: { totalRows: total, totalPages, currentPage, next: currentPage + 1, prev: currentPage - 1, hasNext: currentPage < totalPages, hasPrev: currentPage > 1 },
    },
});
const CATS = { data: { data: { docs: [{ _id: "a".repeat(24), name: "Điện thoại" }] } } };

let lastLocation;
const Spy = () => {
    lastLocation = useLocation();
    return null;
};
const setup = (url, api, props = {}) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <Spy />
            <Routes>
                <Route path="/Search" element={<ProductBrowser api={api} {...props} />} />
            </Routes>
        </MemoryRouter>
    );
const params = () => Object.fromEntries(new URLSearchParams(lastLocation.search));

test("đang tải -> danh sách nhiều trang; chuyển trang giữ nguyên bộ lọc", async () => {
    const api = {
        getCategories: jest.fn().mockResolvedValue(CATS),
        getProducts: jest
            .fn()
            .mockResolvedValueOnce(page([product(1, { has_discount: true, final_price: 90000, discount_percent: 10 }), product(2, { is_stock: false })], { total: 14, totalPages: 2 }))
            .mockResolvedValueOnce(page([product(13), product(14)], { total: 14, currentPage: 2, totalPages: 2 })),
    };
    setup("/Search?q=iphone&sort=price_asc&stock=1", api);
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải");
    expect(await screen.findByText("Sản phẩm 1")).toBeInTheDocument();
    expect(api.getProducts).toHaveBeenLastCalledWith({ params: { page: 1, limit: 12, sort: "price_asc", q: "iphone", in_stock: "true" } });
    expect(screen.getByText(/Tìm thấy 14 sản phẩm · Trang 1\/2/)).toBeInTheDocument();
    expect(screen.getByText("Hết hàng")).toBeInTheDocument();
    expect(screen.getAllByText("-10%").length).toBeGreaterThan(0);
    // Chờ React chạy effect của lần render cuối (chạy ở macrotask sau); Link chỉ điều hướng khi đã mount xong.
    await act(() => new Promise((r) => setTimeout(r, 0)));
    fireEvent.click(screen.getByRole("link", { name: "Trang sau" }));
    expect(await screen.findByText("Sản phẩm 13")).toBeInTheDocument();
    expect(api.getProducts).toHaveBeenLastCalledWith({ params: { page: 2, limit: 12, sort: "price_asc", q: "iphone", in_stock: "true" } });
    expect(params()).toEqual({ q: "iphone", sort: "price_asc", stock: "1", page: "2" });
});

test("đổi sắp xếp/danh mục/giá -> về trang 1, giữ các bộ lọc khác; giá sai không gửi request", async () => {
    const api = { getCategories: jest.fn().mockResolvedValue(CATS), getProducts: jest.fn().mockResolvedValue(page([product(1)], { total: 30, currentPage: 3, totalPages: 3 })) };
    setup("/Search?q=op&page=3", api);
    await screen.findByText("Sản phẩm 1");
    fireEvent.change(screen.getByLabelText("Sắp xếp"), { target: { value: "name_asc" } });
    await waitFor(() => expect(params()).toEqual({ q: "op", sort: "name_asc" }));
    await screen.findByText("Sản phẩm 1");
    await screen.findByRole("option", { name: "Điện thoại" });
    fireEvent.change(screen.getByLabelText("Danh mục"), { target: { value: "a".repeat(24) } });
    await waitFor(() => expect(params()).toEqual({ q: "op", sort: "name_asc", category: "a".repeat(24) }));
    await screen.findByText("Sản phẩm 1");
    const calls = api.getProducts.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Giá từ (đ)"), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText("Giá đến (đ)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng giá" }));
    expect(await screen.findByText("Giá từ phải nhỏ hơn hoặc bằng giá đến.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Giá đến (đ)"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng giá" }));
    expect(await screen.findByText("Giá phải là số nguyên không âm.")).toBeInTheDocument();
    expect(api.getProducts.mock.calls.length).toBe(calls);
    fireEvent.change(screen.getByLabelText("Giá đến (đ)"), { target: { value: "2.000.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng giá" }));
    await waitFor(() => expect(api.getProducts).toHaveBeenLastCalledWith({ params: { page: 1, limit: 12, sort: "name_asc", q: "op", category_id: "a".repeat(24), min_price: "500000", max_price: "2000000" } }));
    await screen.findByText("Sản phẩm 1");
});

test("không có kết quả: thông báo rõ và nút xóa bộ lọc", async () => {
    const api = { getCategories: jest.fn().mockResolvedValue(CATS), getProducts: jest.fn().mockResolvedValue(page([], { total: 0, totalPages: 0 })) };
    setup("/Search?q=xyz&stock=1", api);
    expect(await screen.findByText("Không tìm thấy sản phẩm nào phù hợp với “xyz”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    await waitFor(() => expect(lastLocation.search).toBe(""));
    await screen.findByText(/Không có sản phẩm nào phù hợp/);
});

test("API lỗi: hiện thông báo của backend và thử lại được", async () => {
    const api = {
        getCategories: jest.fn().mockRejectedValue(new Error("offline")),
        getProducts: jest
            .fn()
            .mockRejectedValueOnce({ response: { status: 400, data: { message: "sort phải là một trong: newest" } } })
            .mockRejectedValueOnce(new Error("Network Error"))
            .mockResolvedValueOnce(page([product(7)])),
    };
    setup("/Search", api);
    expect(await screen.findByRole("alert")).toHaveTextContent("sort phải là một trong");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Không tải được danh sách sản phẩm"));
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Sản phẩm 7")).toBeInTheDocument();
});

test("trang danh mục: luôn gửi category_id cố định, không hiện ô chọn danh mục; tham số URL sai bị bỏ qua", async () => {
    const api = { getCategories: jest.fn(), getProducts: jest.fn().mockResolvedValue(page([product(1)])) };
    setup("/Search?page=-4&sort=hack&min=-1&keyword=c%C5%A9", api, { fixedCategoryId: "b".repeat(24) });
    await screen.findByText("Sản phẩm 1");
    expect(api.getProducts).toHaveBeenCalledWith({ params: { page: 1, limit: 12, sort: "newest", q: "cũ", category_id: "b".repeat(24) } });
    expect(screen.queryByLabelText("Danh mục")).toBeNull();
    expect(api.getCategories).not.toHaveBeenCalled();
});

test("phản hồi cũ đến muộn không ghi đè kết quả mới", async () => {
    let resolveOld;
    const api = {
        getCategories: jest.fn().mockResolvedValue(CATS),
        getProducts: jest
            .fn()
            .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
            .mockResolvedValueOnce(page([product(2, { name: "Kết quả mới" })])),
    };
    setup("/Search?q=a", api);
    fireEvent.change(screen.getByLabelText("Sắp xếp"), { target: { value: "price_desc" } });
    expect(await screen.findByText("Kết quả mới")).toBeInTheDocument();
    resolveOld(page([product(1, { name: "Kết quả cũ" })]));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Kết quả cũ")).toBeNull();
});
