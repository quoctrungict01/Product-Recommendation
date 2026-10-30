import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import reducers from "../../redux-setup/reducers";
import { LOGIN_SUCCESS } from "../../shared/constants/action-type";
import Account from "./index";
import Profile from "./Profile";
import Orders from "./Orders";
import Address from "./Address";

// Trang được tiêm API giả qua props; mock module để Jest không phải nạp axios (ESM).
jest.mock("../../services/Api", () => ({ getMe: jest.fn(), updateMe: jest.fn(), changePasswordApi: jest.fn(), getMyOrders: jest.fn() }));

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
const token = (sec = 3600) => `${b64({ alg: "HS256" })}.${b64({ _id: "u1", exp: Math.floor(Date.now() / 1000) + sec })}.sig`;
const USER = { _id: "u1", email: "alice@shop.vn", full_name: "Alice", role: "member", phone: "0912345678", address: null };

function setup(ui, { loggedIn = true, path = "/account/profile" } = {}) {
    localStorage.clear();
    const store = createStore(reducers);
    if (loggedIn) store.dispatch({ type: LOGIN_SUCCESS, payload: { token: token(), user: USER } });
    render(
        <Provider store={store}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/login" element={<p>Trang đăng nhập</p>} />
                    <Route path="/account" element={<Account />}>
                        <Route path="profile" element={ui} />
                        <Route path="orders" element={ui} />
                        <Route path="address" element={ui} />
                    </Route>
                </Routes>
            </MemoryRouter>
        </Provider>
    );
    return store;
}

test("chưa đăng nhập vào Tài khoản của tôi -> chuyển về trang đăng nhập", () => {
    setup(<p>Bí mật</p>, { loggedIn: false });
    expect(screen.getByText("Trang đăng nhập")).toBeInTheDocument();
    expect(screen.queryByText("Bí mật")).toBeNull();
});

test("hồ sơ: lưu thành công cập nhật tên trên phiên; lỗi backend được hiển thị; đổi email phải nhập mật khẩu", async () => {
    const api = {
        getMe: jest.fn().mockResolvedValue({ data: { data: { user: USER } } }),
        updateMe: jest
            .fn()
            .mockResolvedValueOnce({ data: { data: { user: { ...USER, full_name: "Alice Nguyễn" } } } })
            .mockRejectedValueOnce({ response: { status: 409, data: { message: "Email đã được tài khoản khác sử dụng." } } }),
        changePassword: jest.fn(),
    };
    const store = setup(<Profile api={api} />);
    const name = await screen.findByLabelText("Họ và tên");
    fireEvent.change(name, { target: { value: "Alice Nguyễn" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Đã lưu thông tin cá nhân.");
    expect(api.updateMe).toHaveBeenLastCalledWith({ full_name: "Alice Nguyễn", phone: "0912345678", email: "alice@shop.vn" });
    expect(store.getState().Auth.user.full_name).toBe("Alice Nguyễn");

    fireEvent.change(screen.getByLabelText("Email đăng nhập"), { target: { value: "bob@shop.vn" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));
    expect(await screen.findByText("Nhập mật khẩu hiện tại để đổi email.")).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(/Mật khẩu hiện tại \(bắt buộc/), { target: { value: "alice-matkhau-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email đã được tài khoản khác sử dụng.");
    expect(api.updateMe).toHaveBeenLastCalledWith(expect.objectContaining({ email: "bob@shop.vn", current_password: "alice-matkhau-1" }));
});

test("đổi mật khẩu: kiểm tra ở giao diện, báo lỗi sai mật khẩu hiện tại, thành công thì lưu token mới", async () => {
    const newToken = token(7200);
    const api = {
        getMe: jest.fn().mockResolvedValue({ data: { data: { user: USER } } }),
        updateMe: jest.fn(),
        changePassword: jest
            .fn()
            .mockRejectedValueOnce({ response: { status: 400, data: { message: "Mật khẩu hiện tại không đúng." } } })
            .mockResolvedValueOnce({ data: { data: { user: USER, token: newToken } } }),
    };
    const store = setup(<Profile api={api} />);
    await screen.findByLabelText("Mật khẩu mới");
    const fill = (cur, next, confirm) => {
        fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), { target: { value: cur } });
        fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: next } });
        fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu mới"), { target: { value: confirm } });
        fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));
    };
    fill("cu-matkhau-1", "chiconchu", "chiconchu");
    expect(await screen.findByText("Mật khẩu mới phải có cả chữ cái và chữ số.")).toBeInTheDocument();
    fill("cu-matkhau-1", "matkhau-moi-1", "khac-1");
    expect(await screen.findByText("Mật khẩu nhập lại không khớp.")).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
    fill("sai-matkhau-1", "matkhau-moi-1", "matkhau-moi-1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Mật khẩu hiện tại không đúng.");
    expect(store.getState().Auth.isLoggedIn).toBe(true);
    fill("cu-matkhau-1", "matkhau-moi-1", "matkhau-moi-1");
    expect(await screen.findByText(/Đã đổi mật khẩu/)).toBeInTheDocument();
    expect(store.getState().Auth.token).toBe(newToken);
    expect(localStorage.getItem("token")).toBe(newToken);
});

test("đơn hàng của tôi: mã đơn, ngày, sản phẩm, tổng tiền, trạng thái", async () => {
    const order = {
        _id: "65f0a1b2c3d4e5f6a7b8c9d0",
        createdAt: "2026-01-12T03:00:00.000Z",
        status: "delivered",
        totalPrice: 20280000,
        fullName: "Alice",
        phone: "0912345678",
        address: "Số 1, P. Bách Khoa, Hà Nội",
        items: [
            { prd_id: "p1", name: "iPhone 15", image: null, price: 19990000, qty: 1 },
            { prd_id: "p2", name: "Ốp lưng", image: null, price: 290000, qty: 1 },
        ],
    };
    const load = jest.fn().mockResolvedValue({ data: { data: { docs: [order], page: 1, pages: 1, total: 1, limit: 5 } } });
    setup(<Orders load={load} />, { path: "/account/orders" });
    expect(await screen.findByText("#A7B8C9D0")).toBeInTheDocument();
    expect(screen.getByText("Đã giao")).toBeInTheDocument();
    expect(screen.getByText("iPhone 15")).toBeInTheDocument();
    expect(screen.getByText(/20\.280\.000/)).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith({ params: { page: 1, limit: 5 } });
});

test("đơn hàng của tôi: chưa có đơn", async () => {
    const load = jest.fn().mockResolvedValue({ data: { data: { docs: [], page: 1, pages: 0, total: 0, limit: 5 } } });
    setup(<Orders load={load} />, { path: "/account/orders" });
    expect(await screen.findByText(/chưa có đơn hàng nào/)).toBeInTheDocument();
});

test("địa chỉ mặc định: kiểm tra ô bắt buộc trước khi gửi, lưu thành công khi nhập tay", async () => {
    const savedAddress = { province: "Hà Nội", ward: "Phường Bách Khoa", detail: "Số 1", district: null, province_code: null, ward_code: null };
    const api = {
        getMe: jest.fn().mockResolvedValue({ data: { data: { user: USER } } }),
        updateMe: jest.fn().mockResolvedValue({ data: { data: { user: { ...USER, address: savedAddress } } } }),
    };
    const failing = () => Promise.reject(new Error("offline"));
    setup(<Address api={api} fetchImpl={failing} />, { path: "/account/address" });
    await screen.findByText(/nhập địa chỉ thủ công/);
    fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ" }));
    expect(await screen.findByText("Vui lòng kiểm tra lại các ô được đánh dấu.")).toBeInTheDocument();
    expect(api.updateMe).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tỉnh/thành phố *"), { target: { value: "Hà Nội" } });
    fireEvent.change(screen.getByLabelText("Phường/xã *"), { target: { value: "Phường Bách Khoa" } });
    fireEvent.change(screen.getByLabelText("Địa chỉ chi tiết *"), { target: { value: "Số 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu địa chỉ" }));
    await waitFor(() => expect(screen.getByText("Đã lưu địa chỉ mặc định.")).toBeInTheDocument());
    expect(api.updateMe).toHaveBeenCalledWith({ address: { province: "Hà Nội", province_code: null, district: null, ward: "Phường Bách Khoa", ward_code: null, detail: "Số 1" } });
});
