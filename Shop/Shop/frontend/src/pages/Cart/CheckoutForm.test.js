import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { MemoryRouter } from "react-router-dom";
import reducers from "../../redux-setup/reducers";
import { LOGIN_SUCCESS } from "../../shared/constants/action-type";
import CheckoutForm from "./CheckoutForm";

jest.mock("../../services/Api", () => ({ order: jest.fn(), getMe: jest.fn() }));

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
const token = (sec) => `${b64({ alg: "HS256" })}.${b64({ _id: "u1", exp: Math.floor(Date.now() / 1000) + sec })}.sig`;
const CARTS = [{ _id: "p1", name: "iPhone", price: 1, qty: 2 }];
const ADDRESS = { province: "Thành phố Hà Nội", province_code: 1, ward: "Phường Bách Khoa", ward_code: 99, district: null, detail: "Số 1 Đại Cồ Việt" };
const PROFILE = { _id: "u1", email: "alice@shop.vn", full_name: "Alice", role: "member", phone: "0912345678", address: ADDRESS };
const offline = () => Promise.reject(new Error("offline"));

function setup({ session, api, onSuccess = jest.fn() }) {
    localStorage.clear();
    const store = createStore(reducers);
    if (session) store.dispatch({ type: LOGIN_SUCCESS, payload: session });
    render(
        <Provider store={store}>
            <MemoryRouter>
                <CheckoutForm carts={CARTS} api={api} onSuccess={onSuccess} fetchImpl={offline} />
            </MemoryRouter>
        </Provider>
    );
    return { store, onSuccess };
}
const buy = () => fireEvent.click(screen.getByRole("button", { name: /Mua ngay/ }));
// Chờ nút trở lại trạng thái bình thường (setSubmitting(false) chạy sau khi đơn gửi xong).
const settled = () => waitFor(() => expect(screen.getByRole("button", { name: /Mua ngay/ })).toHaveTextContent("Mua ngay"));
const phoneInput = () => screen.getByLabelText("Số điện thoại (bắt buộc)");

test("khách: nhập tay và đặt hàng; không gửi user_id hay giá", async () => {
    const api = { getMe: jest.fn(), order: jest.fn().mockResolvedValue({ data: { status: "success", data: { _id: "o1" } } }) };
    const { onSuccess } = setup({ api });
    expect(api.getMe).not.toHaveBeenCalled();
    buy();
    expect(await screen.findByText("Vui lòng nhập họ và tên.")).toBeInTheDocument();
    expect(api.order).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Họ và tên (bắt buộc)"), { target: { value: "Khách" } });
    fireEvent.change(phoneInput(), { target: { value: "0987 654 321" } });
    fireEvent.change(screen.getByLabelText("Email (bắt buộc)"), { target: { value: "khach@mail.vn" } });
    await screen.findByText(/nhập địa chỉ thủ công/);
    fireEvent.change(screen.getByLabelText("Tỉnh/thành phố *"), { target: { value: "Hà Nội" } });
    fireEvent.change(screen.getByLabelText("Phường/xã *"), { target: { value: "Phường Kim Liên" } });
    fireEvent.change(screen.getByLabelText("Địa chỉ chi tiết *"), { target: { value: "Ngõ 1" } });
    buy();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ _id: "o1" }));
    const body = api.order.mock.calls[0][0];
    expect(body).toEqual({
        fullName: "Khách",
        phone: "0987654321",
        email: "khach@mail.vn",
        shipping_address: { province: "Hà Nội", province_code: null, district: null, ward: "Phường Kim Liên", ward_code: null, detail: "Ngõ 1" },
        items: [{ prd_id: "p1", qty: 2 }],
    });
    expect(body.user_id).toBeUndefined();
    await settled();
});

test("thành viên: tự điền từ hồ sơ; sửa địa chỉ chỉ cho đơn này (không cập nhật hồ sơ)", async () => {
    const api = {
        getMe: jest.fn().mockResolvedValue({ data: { data: { user: PROFILE } } }),
        order: jest.fn().mockResolvedValue({ data: { status: "success", data: { _id: "o2" } } }),
        updateMe: jest.fn(),
    };
    setup({ api, session: { token: token(3600), user: { ...PROFILE, phone: null, address: null } } });
    await waitFor(() => expect(phoneInput()).toHaveValue("0912345678"));
    expect(screen.getByLabelText("Họ và tên (bắt buộc)")).toHaveValue("Alice");
    expect(screen.getByLabelText("Địa chỉ chi tiết *")).toHaveValue("Số 1 Đại Cồ Việt");
    fireEvent.change(screen.getByLabelText("Địa chỉ chi tiết *"), { target: { value: "Số 99 Giải Phóng" } });
    buy();
    await waitFor(() => expect(api.order).toHaveBeenCalled());
    expect(api.order.mock.calls[0][0].shipping_address.detail).toBe("Số 99 Giải Phóng");
    expect(api.updateMe).not.toHaveBeenCalled();
    await settled();
});

test("thành viên có token đã hết hạn: không âm thầm đặt thành đơn khách, đăng xuất và báo rõ", async () => {
    const api = { getMe: jest.fn().mockResolvedValue({ data: { data: { user: PROFILE } } }), order: jest.fn() };
    const { store } = setup({ api, session: { token: token(-60), user: PROFILE } });
    await waitFor(() => expect(phoneInput()).toHaveValue("0912345678"));
    buy();
    expect(await screen.findByRole("alert")).toHaveTextContent("Phiên đăng nhập đã hết hạn");
    expect(api.order).not.toHaveBeenCalled();
    expect(store.getState().Auth.isLoggedIn).toBe(false);
});

test("backend trả 401 khi đặt hàng -> báo phiên hết hạn; lỗi khác hiện thông báo của backend", async () => {
    const api = {
        getMe: jest.fn().mockResolvedValue({ data: { data: { user: PROFILE } } }),
        order: jest
            .fn()
            .mockRejectedValueOnce({ response: { status: 400, data: { message: "Sản phẩm iPhone đã hết hàng." } } })
            .mockRejectedValueOnce({ response: { status: 401, data: {} } }),
    };
    setup({ api, session: { token: token(3600), user: PROFILE } });
    await waitFor(() => expect(phoneInput()).toHaveValue("0912345678"));
    buy();
    expect(await screen.findByRole("alert")).toHaveTextContent("đã hết hàng");
    buy();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Phiên đăng nhập đã hết hạn"));
});
