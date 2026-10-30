import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import reducers from "../../redux-setup/reducers";
import { LOGIN_SUCCESS } from "../../shared/constants/action-type";
import Success from "./index";

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
const token = () => `${b64({ alg: "HS256" })}.${b64({ _id: "u1", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const ID = "65f0a1b2c3d4e5f6a7b8c9d0";

function setup({ loggedIn, state, clipboard }) {
    localStorage.clear();
    window.scrollTo = jest.fn();
    const store = createStore(reducers);
    if (loggedIn) store.dispatch({ type: LOGIN_SUCCESS, payload: { token: token(), user: { _id: "u1", email: "a@shop.vn", role: "member" } } });
    render(
        <Provider store={store}>
            <MemoryRouter initialEntries={[{ pathname: "/Success", state }]}>
                <Routes>
                    <Route path="/Success" element={<Success clipboard={clipboard} />} />
                </Routes>
            </MemoryRouter>
        </Provider>
    );
}

test("khách: mã đơn, tổng tiền, hướng dẫn lưu mã để liên hệ cửa hàng; không nhắc email", async () => {
    const clipboard = { writeText: jest.fn().mockResolvedValue() };
    setup({ loggedIn: false, state: { orderId: ID, totalPrice: 1850000 }, clipboard });
    expect(screen.getByText("Bạn đã đặt hàng thành công!")).toBeInTheDocument();
    expect(screen.getAllByText(/#A7B8C9D0/).length).toBeGreaterThan(0);
    expect(screen.getByText("1.850.000đ")).toBeInTheDocument();
    expect(screen.getByText(/lưu lại mã đơn/)).toBeInTheDocument();
    expect(screen.queryByText(/email/i)).toBeNull();
    expect(screen.queryByRole("link", { name: "Đơn hàng của tôi" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sao chép mã" }));
    expect(clipboard.writeText).toHaveBeenCalledWith("#A7B8C9D0");
    expect(await screen.findByText("Đã sao chép mã đơn.")).toBeInTheDocument();
});

test("thành viên: hướng dẫn theo dõi tại Đơn hàng của tôi; không nhắc email", () => {
    setup({ loggedIn: true, state: { orderId: ID, totalPrice: 290000 } });
    expect(screen.getByRole("link", { name: "Đơn hàng của tôi" })).toHaveAttribute("href", "/account/orders");
    expect(screen.queryByText(/email/i)).toBeNull();
    expect(screen.queryByText(/lưu lại mã đơn/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Sao chép mã" })).toBeNull(); // không có clipboard -> không hiện nút
});

test("vào thẳng /Success (không có đơn) -> không báo đặt hàng thành công", () => {
    setup({ loggedIn: false, state: null });
    expect(screen.queryByText("Bạn đã đặt hàng thành công!")).toBeNull();
    expect(screen.getByText("Không có thông tin đơn hàng để hiển thị")).toBeInTheDocument();
});
