import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Category, { categoryNameError } from "./index";

jest.mock("../../services/Api", () => ({}));

const cat = (i, count = 0) => ({ _id: `c${i}`, name: `Danh mục ${i}`, product_count: count });
const page = (docs, total, totalPages) => ({ data: { data: { docs, total, totalPages } } });
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

function setup(api, confirmFn = () => true, url = "/category") {
    render(
        <MemoryRouter initialEntries={[url]}>
            <Routes>
                <Route path="/category" element={<Category api={api} confirmFn={confirmFn} />} />
            </Routes>
        </MemoryRouter>
    );
}

test("validate tên danh mục", () => {
    expect(categoryNameError("  ")).toBe("Tên danh mục không được để trống.");
    expect(categoryNameError("x".repeat(101))).toMatch(/tối đa 100/);
    expect(categoryNameError("Phụ kiện")).toBe("");
});

test("thêm danh mục: chặn tên rỗng, gửi { name }, lỗi trùng tên hiện rõ, thành công tải lại", async () => {
    const api = {
        getCategories: jest.fn().mockResolvedValue(page([cat(1, 3)], 1, 1)),
        addCategory: jest.fn().mockRejectedValueOnce({ response: { status: 409, data: { message: 'Danh mục "Phụ kiện" đã tồn tại.' } } }).mockResolvedValueOnce({ data: {} }),
    };
    setup(api);
    await screen.findByText("Danh mục 1");
    expect(api.getCategories).toHaveBeenCalledWith({ params: { page: 1, limit: 10, with_counts: 1 } });
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    expect(await screen.findByText("Tên danh mục không được để trống.")).toBeInTheDocument();
    expect(api.addCategory).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Thêm danh mục"), { target: { value: " Phụ kiện " } });
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    expect(await screen.findByText('Danh mục "Phụ kiện" đã tồn tại.')).toBeInTheDocument();
    expect(api.addCategory).toHaveBeenLastCalledWith({ name: "Phụ kiện" });
    fireEvent.click(screen.getByRole("button", { name: /Thêm/ }));
    expect(await screen.findByText('Đã thêm danh mục "Phụ kiện".')).toBeInTheDocument();
    await waitFor(() => expect(api.getCategories).toHaveBeenCalledTimes(2));
});

test("sửa tên trên dòng; xóa phải xác nhận; backend chặn xóa danh mục còn sản phẩm", async () => {
    const confirmFn = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const api = {
        getCategories: jest.fn().mockResolvedValue(page([cat(1, 2), cat(2, 0)], 2, 1)),
        updateCategory: jest.fn().mockResolvedValue({ data: {} }),
        deleteCategory: jest
            .fn()
            .mockRejectedValueOnce({ response: { status: 409, data: { message: 'Không thể xóa danh mục "Danh mục 1" vì còn 2 sản phẩm.' } } })
            .mockResolvedValueOnce({ data: {} }),
    };
    setup(api, confirmFn);
    await screen.findByText("Danh mục 1");
    fireEvent.click(screen.getByRole("button", { name: "Sửa Danh mục 2" }));
    const input = screen.getByLabelText("Tên mới cho Danh mục 2");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Tên danh mục không được để trống.")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Tai nghe" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText('Đã đổi tên danh mục thành "Tai nghe".')).toBeInTheDocument();
    expect(api.updateCategory).toHaveBeenCalledWith("c2", { name: "Tai nghe" });

    await screen.findByRole("button", { name: "Xóa Danh mục 1" });
    fireEvent.click(screen.getByRole("button", { name: "Xóa Danh mục 1" }));
    expect(confirmFn).toHaveBeenLastCalledWith(expect.stringContaining("đang có 2 sản phẩm"));
    expect(api.deleteCategory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xóa Danh mục 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("vì còn 2 sản phẩm");
    fireEvent.click(screen.getByRole("button", { name: "Xóa Danh mục 2" }));
    expect(await screen.findByText('Đã xóa danh mục "Danh mục 2".')).toBeInTheDocument();
});

test("phân trang danh mục gọi backend với page", async () => {
    const api = { getCategories: jest.fn().mockResolvedValue(page([cat(1)], 25, 3)) };
    setup(api);
    await screen.findByText("Danh mục 1");
    await tick();
    fireEvent.click(screen.getByRole("link", { name: "2" }));
    await waitFor(() => expect(api.getCategories).toHaveBeenLastCalledWith({ params: { page: 2, limit: 10, with_counts: 1 } }));
    await screen.findByText("Danh mục 1");
});
