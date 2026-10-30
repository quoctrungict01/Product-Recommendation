// Hồi quy bố cục: slideshow chỉ ở trang chủ; trang tài khoản và 404 không có banner/slideshow;
// trang tài khoản không bao giờ hiện hình 404; trang mua sắm vẫn có cột banner.
import React from "react";
import { render, act } from "@testing-library/react";
import App from "../../../App";
import store from "../../../redux-setup/store";
import { LOGIN_SUCCESS } from "../../constants/action-type";

const API = "getProducts getCategories getProductsCategory getCategory getProduct getCommentProduct createCommentProduct order getProductSuggestions getRecommendations loginApi registerApi getMe updateMe changePasswordApi getMyOrders previewCoupon";
// Hàm thường (CRA reset jest.fn trước mỗi test): mọi API chờ mãi, không gọi mạng.
jest.mock("../../../services/Api", () => Object.fromEntries(API.split(" ").map((k) => [k, () => new Promise(() => {})])));

const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "");
const token = `${b64({ alg: "HS256" })}.${b64({ _id: "u1", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

async function visit(path) {
    window.history.pushState({}, "", path);
    const utils = render(<App />);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    const c = utils.container;
    const is404 = [...c.querySelectorAll("svg title")].some((t) => t.textContent === "404");
    const main = c.querySelector("#main");
    return { c, is404, slide: Boolean(c.querySelector("#slide")), sidebar: Boolean(c.querySelector("#sidebar")), mainClass: main && main.className, unmount: utils.unmount };
}

beforeAll(() => {
    window.scrollTo = () => {};
    store.dispatch({ type: LOGIN_SUCCESS, payload: { token, user: { _id: "u1", email: "a@b.vn", full_name: "An", role: "member" } } });
});

test.each(["/account/profile", "/account/address", "/account/orders"])("%s: nội dung tài khoản ngay dưới menu, không slideshow/banner/404, toàn chiều rộng", async (path) => {
    const v = await visit(path);
    expect(window.location.pathname).toBe(path);
    expect(v.c.querySelector(".account-box")).not.toBeNull();
    expect(v.is404).toBe(false);
    expect(v.slide).toBe(false);
    expect(v.sidebar).toBe(false);
    expect(v.mainClass).toContain("col-lg-12");
    // .account-box là phần tử đầu tiên trong #main (không có gì chen giữa menu và nội dung tài khoản).
    expect(v.c.querySelector("#main").firstElementChild.className).toBe("account-box");
    v.unmount();
});

test("/account -> chuyển tới /account/profile", async () => {
    const v = await visit("/account");
    expect(window.location.pathname).toBe("/account/profile");
    expect(v.is404).toBe(false);
    v.unmount();
});

test("Trang chủ: có slideshow và cột banner", async () => {
    const v = await visit("/");
    expect(v.slide).toBe(true);
    expect(v.sidebar).toBe(true);
    expect(v.is404).toBe(false);
    v.unmount();
});

test.each(["/Search?keyword=op", "/ProductDetails-65f0a1b2c3d4e5f6a7b8c9d0", "/Cart", "/Category-65f0a1b2c3d4e5f6a7b8c9d0", "/Success"])("%s: không slideshow, vẫn có cột banner, không 404", async (path) => {
    const v = await visit(path);
    expect(v.slide).toBe(false);
    expect(v.sidebar).toBe(true);
    expect(v.is404).toBe(false);
    expect(v.mainClass).toContain("col-lg-8");
    v.unmount();
});

test("URL không tồn tại: trang 404 có lời nhắn, link về trang chủ, không slideshow/banner", async () => {
    const v = await visit("/khong-ton-tai/abc");
    expect(v.is404).toBe(true);
    expect(v.c.textContent).toContain("Không tìm thấy trang");
    expect(v.c.querySelector('a[href="/"]')).not.toBeNull();
    expect(v.slide).toBe(false);
    expect(v.sidebar).toBe(false);
    v.unmount();
});
