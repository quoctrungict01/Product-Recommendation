import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import reducers from "../../redux-setup/reducers";
import { LOGIN_SUCCESS, ADD_TO_CART } from "../../shared/constants/action-type";
import { order, getMe, getProduct } from "../../services/Api";
import Cart from "./index";

jest.mock("../../services/Api", () => ({ order: jest.fn(), getMe: jest.fn(), getProduct: jest.fn() }));

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
const token = () => `${b64({ alg: "HS256" })}.${b64({ _id: "u1", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const PROFILE = {
    _id: "u1", email: "alice@shop.vn", full_name: "Alice", role: "member", phone: "0912345678",
    address: { province: "Hà Nội", province_code: null, district: null, ward: "Phường Bách Khoa", ward_code: null, detail: "Số 1" },
};
const ITEM = { _id: "p1", name: "iPhone 15", price: 19490000, image: "a.jpg", qty: 2 };

function setup() {
    localStorage.clear();
    const store = createStore(reducers);
    store.dispatch({ type: LOGIN_SUCCESS, payload: { token: token(), user: PROFILE } });
    store.dispatch({ type: ADD_TO_CART, payload: ITEM });
    getMe.mockResolvedValue({ data: { data: { user: PROFILE } } });
    getProduct.mockResolvedValue({ data: { data: { _id: "p1", name: "iPhone 15", image: "a.jpg", final_price: 19490000, is_stock: true } } });
    render(
        <Provider store={store}>
            <MemoryRouter initialEntries={["/Cart"]}>
                <Routes>
                    <Route path="/Cart" element={<Cart />} />
                    <Route path="/Success" element={<p>Đặt hàng thành công</p>} />
                </Routes>
            </MemoryRouter>
        </Provider>
    );
    return store;
}
const buy = () => fireEvent.click(screen.getByRole("button", { name: /Mua ngay/ }));
const ready = () => waitFor(() => expect(screen.getByLabelText("Số điện thoại (bắt buộc)")).toHaveValue("0912345678"));

test("đặt hàng thành công: backend xác nhận rồi mới xóa giỏ (cả state lẫn localStorage)", async () => {
    order.mockResolvedValue({ data: { status: "success", data: { _id: "o1" } } });
    const store = setup();
    await ready();
    expect(JSON.parse(localStorage.getItem("cart_u1"))).toHaveLength(1);
    buy();
    expect(await screen.findByText("Đặt hàng thành công")).toBeInTheDocument();
    expect(order).toHaveBeenCalledTimes(1);
    expect(store.getState().Cart.items).toEqual([]);
    expect(JSON.parse(localStorage.getItem("cart_u1"))).toEqual([]);
});

test("đặt hàng thất bại (hết hàng / lỗi mạng): giữ nguyên giỏ để sửa và thử lại", async () => {
    order
        .mockRejectedValueOnce({ response: { status: 400, data: { message: 'Sản phẩm "iPhone 15" đã hết hàng.' } } })
        .mockRejectedValueOnce(new Error("Network Error"));
    const store = setup();
    await ready();
    buy();
    expect(await screen.findByRole("alert")).toHaveTextContent("đã hết hàng");
    expect(store.getState().Cart.items).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole("button", { name: /Mua ngay/ })).toHaveTextContent("Mua ngay"));
    buy();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Không đặt được hàng"));
    expect(store.getState().Cart.items).toEqual([expect.objectContaining({ _id: "p1", qty: 2 })]);
    expect(JSON.parse(localStorage.getItem("cart_u1"))).toHaveLength(1);
    expect(screen.queryByText("Đặt hàng thành công")).toBeNull();
});
