import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import Coupon from "./index";
import CouponForm, { validateCouponForm, toCouponPayload, emptyCoupon } from "./CouponForm";

jest.mock("../../services/Api", () => ({}));

const CP = (extra = {}) => ({ _id: "c1", code: "GIAM10", description: "Giảm 10%", type: "percent", value: 10, min_order: 500000, max_discount: 200000, starts_at: null, ends_at: null, usage_limit: 100, used_count: 3, is_active: true, state: "active", ...extra });
let loc;
const Spy = () => {
    loc = useLocation();
    return null;
};

test("validate form và dữ liệu gửi backend", () => {
    const v = { ...emptyCoupon(), code: " tet-2027 ", type: "percent", value: "15", max_discount: "300.000", usage_limit: "50", ends_at: "2027-02-28T23:59" };
    expect(validateCouponForm(v)).toEqual({});
    const body = toCouponPayload(v);
    expect(body).toMatchObject({ code: "TET-2027", type: "percent", value: 15, max_discount: 300000, min_order: 0, usage_limit: 50, starts_at: null, is_active: true });
    expect(body.ends_at).toBe(new Date("2027-02-28T23:59").toISOString());
    const e = validateCouponForm({ ...emptyCoupon(), code: "x", type: "percent", value: "150", usage_limit: "0", starts_at: "2027-02-01T00:00", ends_at: "2027-01-01T00:00" });
    expect(Object.keys(e).sort()).toEqual(["code", "ends_at", "usage_limit", "value"]);
    expect(validateCouponForm({ ...emptyCoupon(), code: "ABC", value: "1000", usage_limit: "2" }, 5).usage_limit).toMatch(/đã dùng \(5\)/);
});

test("danh sách: trạng thái, lượt dùng, lọc; vô hiệu hóa phải xác nhận", async () => {
    const confirmFn = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const api = {
        getCoupons: jest.fn().mockResolvedValue({ data: { data: { docs: [CP(), CP({ _id: "c2", code: "HET", state: "expired", type: "fixed", value: 50000, min_order: 0, usage_limit: null })], total: 2, totalPages: 1 } } }),
        setCouponActive: jest.fn().mockResolvedValue({ data: { message: 'Đã vô hiệu hóa mã "GIAM10".' } }),
    };
    render(
        <MemoryRouter initialEntries={["/coupon"]}>
            <Spy />
            <Routes>
                <Route path="/coupon" element={<Coupon api={api} confirmFn={confirmFn} />} />
            </Routes>
        </MemoryRouter>
    );
    expect(await screen.findByText("GIAM10")).toBeInTheDocument();
    expect(screen.getByText("Giảm 10% (tối đa 200.000đ) · đơn từ 500.000đ")).toBeInTheDocument();
    expect(screen.getByText("3 / 100")).toBeInTheDocument();
    expect(screen.getByText("Hết hạn", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("3 / không giới hạn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vô hiệu hóa mã GIAM10" }));
    expect(confirmFn).toHaveBeenLastCalledWith(expect.stringContaining("Khách sẽ không dùng được"));
    expect(api.setCouponActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Vô hiệu hóa mã GIAM10" }));
    expect(await screen.findByText('Đã vô hiệu hóa mã "GIAM10".')).toBeInTheDocument();
    expect(api.setCouponActive).toHaveBeenCalledWith("c1", false);
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "expired" } });
    await waitFor(() => expect(api.getCoupons).toHaveBeenLastCalledWith({ params: { page: 1, limit: 20, state: "expired" } }));
    await screen.findByText("GIAM10");
});

function renderForm(api, path = "/coupon-add") {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Spy />
            <Routes>
                <Route path="/coupon-add" element={<CouponForm api={api} />} />
                <Route path="/coupon-edit/:id" element={<CouponForm api={api} />} />
                <Route path="/coupon" element={<p>Danh sách mã</p>} />
            </Routes>
        </MemoryRouter>
    );
}
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test("tạo mã: chặn dữ liệu sai; gửi đúng JSON; lỗi trùng mã từ backend gắn vào ô Mã", async () => {
    const api = { createCoupon: jest.fn().mockRejectedValueOnce({ response: { status: 409, data: { message: 'Mã "SALE" đã tồn tại.' } } }).mockResolvedValueOnce({ data: { message: 'Đã tạo mã "SALE".' } }) };
    renderForm(api);
    fireEvent.click(screen.getByRole("button", { name: "Tạo mã" }));
    expect(await screen.findByText("Vui lòng sửa các ô được đánh dấu.")).toBeInTheDocument();
    expect(api.createCoupon).not.toHaveBeenCalled();
    fill("Mã *", "sale");
    fill("Số tiền giảm (VND) *", "50000");
    expect(screen.getByText("giảm 50.000đ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tạo mã" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Mã "SALE" đã tồn tại.');
    fireEvent.click(screen.getByRole("button", { name: "Tạo mã" }));
    await waitFor(() => expect(loc.pathname).toBe("/coupon"));
    expect(api.createCoupon).toHaveBeenLastCalledWith(expect.objectContaining({ code: "SALE", type: "fixed", value: 50000, usage_limit: null }));
});

test("sửa mã đã dùng: không đổi được mã, gửi PUT", async () => {
    const api = { getCoupon: jest.fn().mockResolvedValue({ data: { data: CP() } }), updateCoupon: jest.fn().mockResolvedValue({ data: { message: "ok" } }) };
    renderForm(api, "/coupon-edit/c1");
    await waitFor(() => expect(screen.getByLabelText("Mã *")).toHaveValue("GIAM10"));
    expect(screen.getByLabelText("Mã *")).toBeDisabled();
    expect(screen.getByText("Mã đã được dùng 3 lần nên không đổi được.")).toBeInTheDocument();
    fill("Tổng lượt dùng tối đa", "2");
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật" }));
    expect(await screen.findByText("Không được nhỏ hơn số lượt đã dùng (3).")).toBeInTheDocument();
    fill("Tổng lượt dùng tối đa", "200");
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật" }));
    await waitFor(() => expect(api.updateCoupon).toHaveBeenCalledWith("c1", expect.objectContaining({ code: "GIAM10", usage_limit: 200, value: 10, max_discount: 200000, min_order: 500000 })));
});
