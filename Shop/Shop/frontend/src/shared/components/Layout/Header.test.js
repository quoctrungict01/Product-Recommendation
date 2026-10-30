import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { MemoryRouter, useLocation } from "react-router-dom";
import reducers from "../../../redux-setup/reducers";
import Header, { SEARCH_DEBOUNCE_MS } from "./Header";

let lastLocation;
const Spy = () => {
    lastLocation = useLocation();
    return null;
};
const setup = (url = "/") => {
    localStorage.clear();
    render(
        <Provider store={createStore(reducers)}>
            <MemoryRouter initialEntries={[url]}>
                <Header />
                <Spy />
            </MemoryRouter>
        </Provider>
    );
    return screen.getByRole("searchbox", { name: "Tìm kiếm sản phẩm" });
};
const query = () => Object.fromEntries(new URLSearchParams(lastLocation.search));

test("Enter trong ô tìm kiếm -> trang kết quả, từ khóa được encode", () => {
    const input = setup("/");
    fireEvent.change(input, { target: { value: "ốp lưng & cáp #1" } });
    fireEvent.submit(input.closest("form"));
    expect(lastLocation.pathname).toBe("/Search");
    expect(query()).toEqual({ q: "ốp lưng & cáp #1" });
});

test("bấm nút Tìm kiếm cũng hoạt động; ở trang khác gõ phím không tự chuyển trang", () => {
    jest.useFakeTimers();
    try {
        const input = setup("/Cart");
        fireEvent.change(input, { target: { value: "iphone" } });
        act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 3));
        expect(lastLocation.pathname).toBe("/Cart");
        fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));
        expect(lastLocation.pathname).toBe("/Search");
        expect(query()).toEqual({ q: "iphone" });
    } finally {
        jest.useRealTimers();
    }
});

test("trên trang /Search: tìm tức thời có debounce, giữ bộ lọc và về trang 1", () => {
    jest.useFakeTimers();
    try {
        const input = setup("/Search?q=ip&sort=price_asc&page=3");
        expect(input).toHaveValue("ip");
        for (const v of ["iph", "ipho", "iphon", "iphone"]) {
            fireEvent.change(input, { target: { value: v } });
            act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
        }
        expect(query()).toEqual({ q: "ip", sort: "price_asc", page: "3" }); // chưa ngừng gõ -> chưa đổi URL
        act(() => jest.advanceTimersByTime(60));
        expect(query()).toEqual({ q: "iphone", sort: "price_asc" });
        expect(input).toHaveValue("iphone");
    } finally {
        jest.useRealTimers();
    }
});
