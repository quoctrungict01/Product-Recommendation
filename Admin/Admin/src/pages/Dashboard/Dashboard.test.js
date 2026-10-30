import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./index";
import { compactMoney, niceMax } from "../../shared/components/BarChart";

jest.mock("../../services/Api", () => ({}));

const SUMMARY = {
    revenue: { today: { revenue: 600000, orders: 1, average_order_value: 600000 }, month: { revenue: 18700000, orders: 2, average_order_value: 9350000 }, year: { revenue: 18700000, orders: 2, average_order_value: 9350000 } },
    orders: { total: 1006, by_status: { pending: 1001, confirmed: 1, shipping: 1, delivered: 2, cancelled: 1 }, pending: 1001, in_progress: 2 },
};
const series = (values) => values.map((v, i) => ({ key: `2026-03-${String(i + 1).padStart(2, "0")}`, revenue: v, orders: v ? 1 : 0 }));
const REVENUE = (values) => ({
    range: { from: "2026-03-01", to: `2026-03-${String(values.length).padStart(2, "0")}`, group: "day" },
    series: series(values),
    totals: { revenue: values.reduce((a, b) => a + b, 0), orders: values.filter(Boolean).length, average_order_value: 0 },
    orders_created: { total: 5, by_status: { pending: 2, confirmed: 1, shipping: 0, delivered: 1, cancelled: 1 } },
});
const ok = (data) => jest.fn().mockResolvedValue({ data: { data } });
const setup = (api) =>
    render(
        <MemoryRouter>
            <Dashboard api={api} />
        </MemoryRouter>
    );

test("số liệu thật từ API: thẻ doanh thu, đơn chờ, biểu đồ, sản phẩm bán chạy, trạng thái", async () => {
    const api = {
        getStatsSummary: ok(SUMMARY),
        getStatsRevenue: ok(REVENUE([0, 18100000, 600000])),
        getTopProducts: ok({ docs: [{ prd_id: "p1", name: "Ốp lưng", qty: 2, revenue: 600000 }, { prd_id: "p2", name: "iPhone 15", qty: 1, revenue: 19000000 }] }),
    };
    setup(api);
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Đang tải");
    expect(await screen.findByText("Doanh thu hôm nay")).toBeInTheDocument();
    expect(screen.getByText("600.000đ", { selector: "div" })).toBeInTheDocument();
    expect(screen.getAllByText("18.700.000đ").length).toBeGreaterThan(0);
    expect(screen.getByText("1.006")).toBeInTheDocument();
    expect(screen.getByText("1.001")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Doanh thu theo ngày" })).toBeInTheDocument();
    expect(screen.getByText("Ốp lưng")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Số đơn theo trạng thái" })).toHaveTextContent("Chờ xác nhận1.001 đơn (100%)");
    expect(api.getStatsRevenue).toHaveBeenCalledWith({ params: { group: "day" } });
    expect(api.getTopProducts).toHaveBeenCalledWith({ params: { sort: "qty", limit: 10 } });

    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-03-10" } });
    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Xem" }));
    expect(await screen.findByText("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.")).toBeInTheDocument();
    expect(api.getStatsRevenue).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Nhóm theo"), { target: { value: "month" } });
    fireEvent.click(screen.getByRole("button", { name: "Xem" }));
    await waitFor(() => expect(api.getStatsRevenue).toHaveBeenLastCalledWith({ params: { from: "2026-01-01", to: "2026-03-01", group: "month" } }));
    await waitFor(() => expect(api.getTopProducts).toHaveBeenLastCalledWith({ params: { from: "2026-01-01", to: "2026-03-01", sort: "qty", limit: 10 } }));
    fireEvent.change(screen.getByLabelText("Xếp hạng theo"), { target: { value: "revenue" } });
    await waitFor(() => expect(api.getTopProducts).toHaveBeenLastCalledWith({ params: { from: "2026-01-01", to: "2026-03-01", sort: "revenue", limit: 10 } }));
    await screen.findByText("Ốp lưng");
});

test("không có đơn đã giao: thông báo trống thay vì biểu đồ toàn số 0", async () => {
    const api = { getStatsSummary: ok({ ...SUMMARY, revenue: { today: { revenue: 0, orders: 0, average_order_value: 0 }, month: { revenue: 0, orders: 0, average_order_value: 0 }, year: { revenue: 0, orders: 0, average_order_value: 0 } } }), getStatsRevenue: ok(REVENUE([0, 0, 0])), getTopProducts: ok({ docs: [] }) };
    setup(api);
    expect(await screen.findByText("Chưa có đơn nào được giao thành công trong khoảng thời gian này.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Doanh thu theo/ })).toBeNull();
    expect(await screen.findByText(/Chưa có sản phẩm nào được bán/)).toBeInTheDocument();
});

test("API lỗi: từng khu vực hiện lỗi và thử lại được", async () => {
    const api = {
        getStatsSummary: jest.fn().mockRejectedValueOnce({ response: { status: 500, data: { message: "Lỗi server." } } }).mockResolvedValue({ data: { data: SUMMARY } }),
        getStatsRevenue: ok(REVENUE([1000])),
        getTopProducts: ok({ docs: [] }),
    };
    setup(api);
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBe(2)); // thẻ + bảng trạng thái
    fireEvent.click(screen.getAllByRole("button", { name: "Thử lại" })[0]);
    expect(await screen.findByText("Doanh thu hôm nay")).toBeInTheDocument();
});

test("trục biểu đồ: số gọn và bước chia tròn", () => {
    expect(compactMoney(18700000)).toBe("18,7 tr");
    expect(compactMoney(1200000000)).toBe("1,2 tỷ");
    expect(compactMoney(0)).toBe("0");
    expect(niceMax(18700000)).toEqual({ top: 20000000, step: 5000000 });
    expect(niceMax(0)).toEqual({ top: 1, step: 1 });
});
