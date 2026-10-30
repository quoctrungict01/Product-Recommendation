import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Comment from "./index";

jest.mock("../../services/Api", () => ({}));

const CM = (extra = {}) => ({ _id: "c1", name: "Nguyễn Văn An", content: "Máy chạy rất mượt", createdAt: "2026-10-05T03:00:00.000Z", product_id: "p1", product: { _id: "p1", name: "iPhone 15", image: "a.jpg" }, product_missing: false, ...extra });
const page = (docs, total = docs.length, totalPages = 1) => ({ data: { data: { docs, total, totalPages } } });
const setup = (api, confirmFn = () => true, path = "/comment") =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/comment" element={<Comment api={api} confirmFn={confirmFn} />} />
            </Routes>
        </MemoryRouter>
    );

test("dữ liệu thật từ API: người bình luận, nội dung, sản phẩm; sản phẩm đã xóa ghi rõ; không còn dữ liệu giả", async () => {
    const api = { getAdminComments: jest.fn().mockResolvedValue(page([CM(), CM({ _id: "c2", name: "Lê Cường", content: "Hàng cũ", product: null, product_missing: true, product_id: "x" })])) };
    setup(api);
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải");
    expect(await screen.findByText("Máy chạy rất mượt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "iPhone 15" })).toHaveAttribute("href", "/product-edit/p1");
    expect(screen.getByText("Sản phẩm không còn")).toBeInTheDocument();
    expect(screen.getByText("Có 2 bình luận")).toBeInTheDocument();
    expect(screen.queryByText("Nguyễn Văn A")).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
    expect(api.getAdminComments).toHaveBeenCalledWith({ params: { page: 1, limit: 20 } });
});

test("tìm kiếm và phân trang gửi lên backend; trống -> thông báo", async () => {
    const api = { getAdminComments: jest.fn().mockResolvedValueOnce(page([CM()], 41, 3)).mockResolvedValue(page([])) };
    setup(api);
    await screen.findByText("Máy chạy rất mượt");
    fireEvent.click(screen.getByRole("link", { name: "2" }));
    await waitFor(() => expect(api.getAdminComments).toHaveBeenLastCalledWith({ params: { page: 2, limit: 20 } }));
    fireEvent.change(screen.getByLabelText("Tìm theo người bình luận hoặc nội dung"), { target: { value: " giao nhanh " } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm" }));
    await waitFor(() => expect(api.getAdminComments).toHaveBeenLastCalledWith({ params: { page: 1, limit: 20, q: "giao nhanh" } }));
    expect(await screen.findByText("Không có bình luận nào phù hợp.")).toBeInTheDocument();
});

test("xóa: hủy xác nhận thì không gọi API; xác nhận -> thông báo thành công và tải lại; lỗi -> thông báo lỗi", async () => {
    const confirmFn = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const api = {
        getAdminComments: jest.fn().mockResolvedValue(page([CM()])),
        deleteAdminComment: jest.fn().mockResolvedValueOnce({ data: { message: "Đã xóa bình luận." } }).mockRejectedValueOnce({ response: { status: 500, data: { message: "Lỗi server." } } }),
    };
    setup(api, confirmFn);
    const btn = await screen.findByRole("button", { name: "Xóa bình luận của Nguyễn Văn An" });
    fireEvent.click(btn);
    expect(confirmFn).toHaveBeenLastCalledWith(expect.stringContaining("Máy chạy rất mượt"));
    expect(api.deleteAdminComment).not.toHaveBeenCalled();
    fireEvent.click(btn);
    expect(await screen.findByText("Đã xóa bình luận.")).toBeInTheDocument();
    expect(api.deleteAdminComment).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(api.getAdminComments).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Xóa bình luận của Nguyễn Văn An" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Lỗi server.");
});

test("API lỗi (vd. 403) -> hiện lỗi và thử lại được", async () => {
    const api = { getAdminComments: jest.fn().mockRejectedValueOnce({ response: { status: 403, data: { message: "Chỉ quản trị viên mới được thực hiện thao tác này." } } }).mockResolvedValue(page([])) };
    setup(api);
    expect(await screen.findByRole("alert")).toHaveTextContent("Chỉ quản trị viên");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có bình luận nào.")).toBeInTheDocument();
});
