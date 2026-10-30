import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Order from "./index";
import OrderDetail from "./Detail";

jest.mock("../../services/Api", () => ({}));

const ID = "65f0a1b2c3d4e5f6a7b8c9d0";
const summary = (extra = {}) => ({ _id: ID, createdAt: "2026-01-12T03:00:00.000Z", fullName: "Nguyễn Văn An", phone: "0912345678", email: "an@mail.vn", totalPrice: 1850000, status: "pending", legacy_status: true, is_member: false, item_count: 3, ...extra });
const detail = (extra = {}) => ({
    ...summary(),
    address: "1 Đại Cồ Việt, Hà Nội",
    shipping_address: null,
    user: null,
    items: [
        { prd_id: "p1", name: "iPhone 15", image: null, price: 900000, qty: 2, subtotal: 1800000 },
        { prd_id: "p2", name: "Sản phẩm đã bị xóa", image: null, price: 50000, qty: 1, subtotal: 50000 },
    ],
    status_history: [],
    next_statuses: ["confirmed", "cancelled"],
    ...extra,
});
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

test("danh sách đơn: mã đơn, khách, tổng tiền, trạng thái; lọc trạng thái và tìm kiếm gửi lên backend, phân trang", async () => {
    const api = { getAdminOrders: jest.fn().mockResolvedValue({ data: { data: { docs: [summary()], total: 41, totalPages: 3 } } }) };
    render(
        <MemoryRouter initialEntries={["/order"]}>
            <Routes>
                <Route path="/order" element={<Order api={api} />} />
            </Routes>
        </MemoryRouter>
    );
    expect(await screen.findByText("#A7B8C9D0")).toBeInTheDocument();
    expect(screen.getByText("Chờ xác nhận", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("1.850.000đ")).toBeInTheDocument();
    expect(screen.getByText("Khách")).toBeInTheDocument();
    expect(api.getAdminOrders).toHaveBeenLastCalledWith({ params: { page: 1, limit: 20, sort: "newest" } });
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "shipping" } });
    await waitFor(() => expect(api.getAdminOrders).toHaveBeenLastCalledWith({ params: { page: 1, limit: 20, sort: "newest", status: "shipping" } }));
    await screen.findByText("#A7B8C9D0");
    fireEvent.change(screen.getByLabelText("Tìm đơn hàng"), { target: { value: " 0912 " } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm" }));
    await waitFor(() => expect(api.getAdminOrders).toHaveBeenLastCalledWith({ params: { page: 1, limit: 20, sort: "newest", status: "shipping", q: "0912" } }));
    await screen.findByText("#A7B8C9D0");
    await tick();
    fireEvent.click(screen.getByRole("link", { name: "2" }));
    await waitFor(() => expect(api.getAdminOrders).toHaveBeenLastCalledWith({ params: { page: 2, limit: 20, sort: "newest", status: "shipping", q: "0912" } }));
    await screen.findByText("#A7B8C9D0");
});

function renderDetail(api, confirmFn = () => true) {
    render(
        <MemoryRouter initialEntries={[`/order/${ID}`]}>
            <Routes>
                <Route path="/order/:id" element={<OrderDetail api={api} confirmFn={confirmFn} />} />
            </Routes>
        </MemoryRouter>
    );
}

test("chi tiết đơn cũ không status: sản phẩm, giá, tổng; chỉ hiện các bước hợp lệ; hủy phải xác nhận", async () => {
    const confirmFn = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const api = {
        getAdminOrder: jest.fn().mockResolvedValue({ data: { data: detail() } }),
        updateOrderStatus: jest.fn().mockResolvedValue({ data: { message: 'Đã chuyển đơn sang "Đã hủy".', data: detail({ status: "cancelled", legacy_status: false, next_statuses: [], status_history: [{ from: "pending", to: "cancelled", at: "2026-02-01T00:00:00Z", by: "a1" }] }) } }),
    };
    renderDetail(api, confirmFn);
    expect(await screen.findByText("iPhone 15")).toBeInTheDocument();
    expect(screen.getByText("Sản phẩm đã bị xóa")).toBeInTheDocument();
    expect(screen.getByText("1.800.000đ")).toBeInTheDocument();
    expect(screen.getByText("1.850.000đ")).toBeInTheDocument();
    expect(screen.getByText(/đơn cũ chưa có trạng thái/)).toBeInTheDocument();
    expect(screen.getByText(/Khách không đăng nhập/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xác nhận đơn" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bắt đầu giao hàng" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Đã giao thành công" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hủy đơn" }));
    expect(confirmFn).toHaveBeenLastCalledWith(expect.stringContaining("không thể khôi phục"));
    expect(api.updateOrderStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hủy đơn" }));
    expect(await screen.findByText('Đã chuyển đơn sang "Đã hủy".')).toBeInTheDocument();
    expect(api.updateOrderStatus).toHaveBeenCalledWith(ID, "cancelled");
    expect(screen.getByText("Đơn đã ở trạng thái cuối, không thể thay đổi.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).toBeNull();
    expect(screen.getByRole("list", { name: "Lịch sử trạng thái" })).toHaveTextContent("Chờ xác nhận → Đã hủy");
});

test("đổi trạng thái bị backend từ chối (409): hiện lỗi và tải lại trạng thái mới nhất", async () => {
    const api = {
        getAdminOrder: jest
            .fn()
            .mockResolvedValueOnce({ data: { data: detail({ status: "confirmed", legacy_status: false, next_statuses: ["shipping", "cancelled"] }) } })
            .mockResolvedValueOnce({ data: { data: detail({ status: "shipping", legacy_status: false, next_statuses: ["delivered"] }) } }),
        updateOrderStatus: jest.fn().mockRejectedValue({ response: { status: 409, data: { message: "Đơn hàng vừa được cập nhật ở nơi khác. Vui lòng tải lại." } } }),
    };
    renderDetail(api);
    fireEvent.click(await screen.findByRole("button", { name: "Hủy đơn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("vừa được cập nhật ở nơi khác");
    expect(await screen.findByRole("button", { name: "Đã giao thành công" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hủy đơn" })).toBeNull();
});

test("đơn không tồn tại: hiện lỗi", async () => {
    const api = { getAdminOrder: jest.fn().mockRejectedValue({ response: { status: 404, data: { message: "Không tìm thấy đơn hàng." } } }) };
    renderDetail(api);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy đơn hàng.");
});
