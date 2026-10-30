import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import User from "./index";
import UserForm, { validateUserForm, toUserPayload, emptyUser } from "./UserForm";

jest.mock("../../services/Api", () => ({}));

const ME = "a0000000000000000000000a";
const U = (extra = {}) => ({ _id: "u1", full_name: "Nguyễn Thị Ánh", email: "anh@shop.vn", phone: "0912345678", role: "member", address: null, createdAt: "2026-10-01T03:00:00.000Z", updatedAt: "2026-10-02T03:00:00.000Z", ...extra });
const ADMIN = U({ _id: ME, full_name: "Quản trị", email: "admin@shop.vn", role: "admin", phone: null });
const OTHER_ADMIN = U({ _id: "a2", full_name: "Admin 2", email: "admin2@shop.vn", role: "admin" });
const list = (docs, total = docs.length, totalPages = 1) => ({ data: { data: { docs, total, totalPages }, pages: { totalRows: total, totalPages } } });
let loc;
const Spy = () => {
    loc = useLocation();
    return null;
};
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

function renderList(api, confirmFn = () => true) {
    render(
        <MemoryRouter initialEntries={["/user"]}>
            <Spy />
            <Routes>
                <Route path="/user" element={<User api={api} confirmFn={confirmFn} meId={ME} />} />
                <Route path="/user-add" element={<p>Trang thêm</p>} />
                <Route path="/user-edit/:id" element={<p>Trang sửa</p>} />
            </Routes>
        </MemoryRouter>
    );
}

test("danh sách: dữ liệu thật, link React Router, không có link .html; không tự xóa / không xóa admin", async () => {
    const api = { getUsers: jest.fn().mockResolvedValue(list([ADMIN, OTHER_ADMIN, U()])) };
    renderList(api);
    expect(await screen.findByText("Nguyễn Thị Ánh")).toBeInTheDocument();
    expect(screen.getByText("Có 3 tài khoản")).toBeInTheDocument();
    expect(screen.getByText("(bạn)")).toBeInTheDocument();
    expect(document.querySelector('a[href$=".html"]')).toBeNull();
    expect(screen.getByRole("link", { name: /Thêm thành viên/ })).toHaveAttribute("href", "/user-add");
    expect(screen.getByRole("link", { name: "Xem và sửa anh@shop.vn" })).toHaveAttribute("href", "/user-edit/u1");
    expect(screen.getByRole("button", { name: "Không thể tự xóa tài khoản của chính mình." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Không xóa được tài khoản quản trị viên." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xóa tài khoản anh@shop.vn" })).toBeEnabled();
    expect(screen.queryByText(/password|\$2b\$/i)).toBeNull();
    await tick();
    fireEvent.click(screen.getByRole("link", { name: "Xem và sửa anh@shop.vn" }));
    await waitFor(() => expect(loc.pathname).toBe("/user-edit/u1"));
});

test("tìm kiếm, lọc vai trò, phân trang gửi lên backend", async () => {
    const api = { getUsers: jest.fn().mockResolvedValueOnce(list([U()], 45, 3)).mockResolvedValue(list([])) };
    renderList(api);
    await screen.findByText("Nguyễn Thị Ánh");
    expect(api.getUsers).toHaveBeenLastCalledWith({ params: { page: 1, limit: 20 } });
    fireEvent.click(screen.getByRole("link", { name: "3" }));
    await waitFor(() => expect(api.getUsers).toHaveBeenLastCalledWith({ params: { page: 3, limit: 20 } }));
    fireEvent.change(screen.getByLabelText("Vai trò"), { target: { value: "member" } });
    await waitFor(() => expect(api.getUsers).toHaveBeenLastCalledWith({ params: { page: 1, limit: 20, role: "member" } }));
    fireEvent.change(screen.getByLabelText("Tìm theo họ tên, email hoặc số điện thoại"), { target: { value: "anh" } });
    fireEvent.click(screen.getByRole("button", { name: "Tìm" }));
    await waitFor(() => expect(api.getUsers).toHaveBeenLastCalledWith({ params: { page: 1, limit: 20, q: "anh", role: "member" } }));
    expect(await screen.findByText("Không có tài khoản nào phù hợp.")).toBeInTheDocument();
});

test("xóa thành viên phải xác nhận; thành công / lỗi đều có thông báo", async () => {
    const confirmFn = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const api = {
        getUsers: jest.fn().mockResolvedValue(list([U()])),
        deleteUser: jest.fn().mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce({ response: { status: 403, data: { message: "Không thể xóa tài khoản quản trị viên." } } }),
    };
    renderList(api, confirmFn);
    const btn = await screen.findByRole("button", { name: "Xóa tài khoản anh@shop.vn" });
    fireEvent.click(btn);
    expect(confirmFn).toHaveBeenLastCalledWith(expect.stringContaining("không hoàn tác"));
    expect(api.deleteUser).not.toHaveBeenCalled();
    fireEvent.click(btn);
    expect(await screen.findByText("Đã xóa tài khoản anh@shop.vn.")).toBeInTheDocument();
    expect(api.deleteUser).toHaveBeenCalledWith("u1");
    fireEvent.click(await screen.findByRole("button", { name: "Xóa tài khoản anh@shop.vn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể xóa tài khoản quản trị viên.");
});

test("API lỗi -> thông báo và thử lại", async () => {
    const api = { getUsers: jest.fn().mockRejectedValueOnce({ response: { status: 500, data: { message: "Lỗi server." } } }).mockResolvedValue(list([])) };
    renderList(api);
    expect(await screen.findByRole("alert")).toHaveTextContent("Lỗi server.");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có tài khoản nào.")).toBeInTheDocument();
});

test("validate form và dữ liệu gửi đi: không bao giờ có role; sửa thì mật khẩu tùy chọn", () => {
    const v = { ...emptyUser(), full_name: " Người mới ", email: " Moi@Shop.VN ", phone: "0912 345 678", password: "matkhau1" };
    expect(validateUserForm(v, true)).toEqual({});
    expect(toUserPayload(v, true)).toEqual({ full_name: "Người mới", email: "moi@shop.vn", phone: "0912345678", password: "matkhau1" });
    expect(toUserPayload({ ...v, phone: "", password: "" }, false)).toEqual({ full_name: "Người mới", email: "moi@shop.vn", phone: null });
    expect(Object.keys(validateUserForm({ ...emptyUser(), email: "x", phone: "12", password: "abc" }, true)).sort()).toEqual(["email", "password", "phone"]);
    expect(validateUserForm({ ...emptyUser(), email: "a@b.vn" }, true).password).toMatch(/ít nhất 8/);
    expect(validateUserForm({ ...emptyUser(), email: "a@b.vn" }, false)).toEqual({});
    expect(validateUserForm({ ...emptyUser(), email: "a@b.vn", password: "chiconchu" }, false).password).toMatch(/chữ cái và chữ số/);
});

function renderForm(api, path) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Spy />
            <Routes>
                <Route path="/user-add" element={<UserForm api={api} />} />
                <Route path="/user-edit/:id" element={<UserForm api={api} />} />
                <Route path="/user" element={<p>Danh sách thành viên</p>} />
            </Routes>
        </MemoryRouter>
    );
}
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test("thêm: không có ô vai trò; lỗi trùng email gắn vào ô Email; thành công -> về danh sách kèm thông báo", async () => {
    const api = { createUser: jest.fn().mockRejectedValueOnce({ response: { status: 409, data: { message: "Email đã tồn tại." } } }).mockResolvedValueOnce({ data: {} }) };
    renderForm(api, "/user-add");
    expect(screen.queryByLabelText(/Vai trò|Quyền/)).toBeNull();
    expect(screen.getByText(/luôn là thành viên/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    expect(await screen.findByText("Vui lòng sửa các ô được đánh dấu.")).toBeInTheDocument();
    expect(api.createUser).not.toHaveBeenCalled();
    fill("Email *", "bob@shop.vn");
    fill("Mật khẩu *", "matkhau-moi-1");
    fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email đã tồn tại.");
    expect(screen.getByLabelText("Email *")).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    await waitFor(() => expect(loc.pathname).toBe("/user"));
    expect(loc.state.notice.text).toBe("Đã tạo tài khoản bob@shop.vn.");
    expect(api.createUser.mock.calls[1][0]).not.toHaveProperty("role");
});

test("sửa: tải thông tin (không có mật khẩu), gửi PUT; đặt lại mật khẩu báo rõ phiên cũ bị đăng xuất; 404 -> thông báo", async () => {
    const api = { getUser: jest.fn().mockResolvedValue({ data: { data: U({ address: { detail: "1 Đại Cồ Việt", ward: "Bách Khoa", province: "Hà Nội" } }) } }), updateUser: jest.fn().mockResolvedValue({ data: {} }) };
    renderForm(api, "/user-edit/u1");
    await waitFor(() => expect(screen.getByLabelText("Email *")).toHaveValue("anh@shop.vn"));
    expect(screen.getByText("1 Đại Cồ Việt, Bách Khoa, Hà Nội")).toBeInTheDocument();
    expect(screen.getByText("Thành viên", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByLabelText("Đặt lại mật khẩu (để trống nếu không đổi)")).toHaveValue("");
    fill("Số điện thoại", "");
    fill("Đặt lại mật khẩu (để trống nếu không đổi)", "matkhau-moi-2");
    fireEvent.click(screen.getByRole("button", { name: "Cập nhật" }));
    await waitFor(() => expect(loc.pathname).toBe("/user"));
    expect(api.updateUser).toHaveBeenCalledWith("u1", { full_name: "Nguyễn Thị Ánh", email: "anh@shop.vn", phone: null, password: "matkhau-moi-2" });
    expect(loc.state.notice.text).toMatch(/đặt lại mật khẩu/);
});

test("sửa: tài khoản không tồn tại -> thông báo, không hiện form", async () => {
    const api = { getUser: jest.fn().mockRejectedValue({ response: { status: 404, data: { message: "Không tìm thấy tài khoản." } } }) };
    renderForm(api, "/user-edit/zz");
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tìm thấy tài khoản (có thể đã bị xóa).");
    expect(screen.queryByRole("button", { name: "Cập nhật" })).toBeNull();
});
