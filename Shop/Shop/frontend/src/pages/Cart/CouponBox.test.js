import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { MemoryRouter } from "react-router-dom";
import reducers from "../../redux-setup/reducers";
import CheckoutForm from "./CheckoutForm";

jest.mock("../../services/Api", () => ({ order: jest.fn(), getMe: jest.fn(), previewCoupon: jest.fn() }));

const CARTS = [{ _id: "p1", name: "iPhone", price: 19000000, qty: 1 }];
const offline = () => Promise.reject(new Error("offline"));
const PREVIEW = { code: "GIAM10", description: "", type: "percent", value: 10, subtotal_original: 20000000, product_discount: 1000000, subtotal: 19000000, coupon_discount: 1900000, total: 17100000 };

function setup(api, carts = CARTS) {
    localStorage.clear();
    const store = createStore(reducers);
    const onSuccess = jest.fn();
    const view = render(
        <Provider store={store}>
            <MemoryRouter>
                <CheckoutForm carts={carts} api={api} onSuccess={onSuccess} fetchImpl={offline} />
            </MemoryRouter>
        </Provider>
    );
    const rerender = (next) =>
        view.rerender(
            <Provider store={store}>
                <MemoryRouter>
                    <CheckoutForm carts={next} api={api} onSuccess={onSuccess} fetchImpl={offline} />
                </MemoryRouter>
            </Provider>
        );
    return { onSuccess, rerender };
}

async function fillGuest() {
    fireEvent.change(screen.getByLabelText("Họ và tên (bắt buộc)"), { target: { value: "Khách" } });
    fireEvent.change(screen.getByLabelText("Số điện thoại (bắt buộc)"), { target: { value: "0987654321" } });
    fireEvent.change(screen.getByLabelText("Email (bắt buộc)"), { target: { value: "khach@mail.vn" } });
    await screen.findByText(/nhập địa chỉ thủ công/);
    fireEvent.change(screen.getByLabelText("Tỉnh/thành phố *"), { target: { value: "Hà Nội" } });
    fireEvent.change(screen.getByLabelText("Phường/xã *"), { target: { value: "Phường Kim Liên" } });
    fireEvent.change(screen.getByLabelText("Địa chỉ chi tiết *"), { target: { value: "Ngõ 1" } });
}
const buy = () => fireEvent.click(screen.getByRole("button", { name: /Mua ngay/ }));
const settled = () => waitFor(() => expect(screen.getByRole("button", { name: /Mua ngay/ })).toHaveTextContent("Mua ngay"));

test("khách áp mã: xem trước số tiền giảm; đặt hàng chỉ gửi MÃ (không gửi số tiền)", async () => {
    const api = { getMe: jest.fn(), previewCoupon: jest.fn().mockResolvedValue({ data: { data: PREVIEW } }), order: jest.fn().mockResolvedValue({ data: { status: "success", data: { _id: "o1" } } }) };
    const { onSuccess } = setup(api);
    await fillGuest();
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(await screen.findByText("Vui lòng nhập mã giảm giá.")).toBeInTheDocument();
    expect(api.previewCoupon).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Mã giảm giá"), { target: { value: "giam10" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(await screen.findByText("-1.900.000 ₫", { normalizer: (s) => s.replace(/\s/g, " ") })).toBeInTheDocument();
    expect(screen.getByText(/17\.100\.000/)).toBeInTheDocument();
    expect(api.previewCoupon).toHaveBeenCalledWith({ code: "giam10", items: [{ prd_id: "p1", qty: 1 }] });
    buy();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = api.order.mock.calls[0][0];
    expect(body.coupon_code).toBe("GIAM10");
    expect(body).not.toHaveProperty("coupon_discount");
    expect(body).not.toHaveProperty("totalPrice");
    await settled();
});

test("mã sai/hết hạn: hiện lý do của backend, không áp; đặt hàng không gửi mã", async () => {
    const api = {
        getMe: jest.fn(),
        previewCoupon: jest.fn().mockRejectedValue({ response: { status: 400, data: { message: "Mã giảm giá đã hết hạn.", details: { field: "coupon_code" } } } }),
        order: jest.fn().mockResolvedValue({ data: { status: "success", data: { _id: "o2" } } }),
    };
    setup(api);
    await fillGuest();
    fireEvent.change(screen.getByLabelText("Mã giảm giá"), { target: { value: "HETHAN" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    expect(await screen.findByText("Mã giảm giá đã hết hạn.")).toBeInTheDocument();
    expect(screen.queryByText("Dự kiến thanh toán")).toBeNull();
    buy();
    await waitFor(() => expect(api.order).toHaveBeenCalled());
    expect(api.order.mock.calls[0][0].coupon_code).toBeUndefined();
    await settled();
});

test("mã vừa hết lượt lúc đặt (409): đơn chưa tạo, bỏ mã, báo rõ; đặt lại không dùng mã được", async () => {
    const api = {
        getMe: jest.fn(),
        previewCoupon: jest.fn().mockResolvedValue({ data: { data: PREVIEW } }),
        order: jest
            .fn()
            .mockRejectedValueOnce({ response: { status: 409, data: { message: "Mã giảm giá vừa hết lượt hoặc bị vô hiệu hóa. Vui lòng bỏ mã hoặc dùng mã khác." } } })
            .mockResolvedValueOnce({ data: { status: "success", data: { _id: "o3" } } }),
    };
    const { onSuccess } = setup(api);
    await fillGuest();
    fireEvent.change(screen.getByLabelText("Mã giảm giá"), { target: { value: "GIAM10" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await screen.findByText("Dự kiến thanh toán");
    buy();
    expect(await screen.findByText(/Đơn chưa được tạo vì mã giảm giá/)).toBeInTheDocument();
    expect(screen.getByText(/vừa hết lượt/)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText("Dự kiến thanh toán")).toBeNull();
    await settled();
    buy();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ _id: "o3" }));
    expect(api.order.mock.calls[1][0].coupon_code).toBeUndefined();
    await settled();
});

test("giỏ hàng thay đổi sau khi áp mã: bỏ kết quả xem trước cũ, yêu cầu áp lại", async () => {
    const api = { getMe: jest.fn(), previewCoupon: jest.fn().mockResolvedValue({ data: { data: PREVIEW } }), order: jest.fn() };
    const { rerender } = setup(api);
    fireEvent.change(screen.getByLabelText("Mã giảm giá"), { target: { value: "GIAM10" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await screen.findByText("Dự kiến thanh toán");
    rerender([{ ...CARTS[0], qty: 2 }]);
    expect(await screen.findByText(/Giỏ hàng đã thay đổi/)).toBeInTheDocument();
    expect(screen.queryByText("Dự kiến thanh toán")).toBeNull();
    expect(screen.getByRole("button", { name: "Áp dụng" })).toBeInTheDocument();
});
