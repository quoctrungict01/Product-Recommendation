// Đăng nhập Admin và chặn route quản trị (chỉ là lớp UX; backend luôn tự kiểm tra quyền).
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequireAdmin from "./shared/auth/RequireAdmin";
import Login from "./pages/Login";
import { loadAdminSession, saveAdminSession, clearAdminSession, ADMIN_TOKEN_KEY, ADMIN_USER_KEY } from "./shared/auth/session";

jest.mock("./services/Api", () => ({ loginApi: jest.fn() }));

const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, "");
const tokenWithExp = (secondsFromNow) => `${b64({ alg: "HS256" })}.${b64({ _id: "u1", exp: Math.floor(Date.now() / 1000) + secondsFromNow })}.sig`;

beforeEach(() => localStorage.clear());

test("phiên admin: chỉ lưu khi role là admin; token hết hạn bị xóa", () => {
    expect(() => saveAdminSession({ token: tokenWithExp(3600), user: { email: "m@x.vn", role: "member" } })).toThrow();
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
    saveAdminSession({ token: tokenWithExp(3600), user: { email: "a@x.vn", role: "admin" } });
    expect(loadAdminSession().user.email).toBe("a@x.vn");
    localStorage.setItem(ADMIN_TOKEN_KEY, tokenWithExp(-10));
    expect(loadAdminSession()).toBeNull();
    expect(localStorage.getItem(ADMIN_USER_KEY)).toBeNull();
    clearAdminSession();
});

function renderGuarded(session) {
    return render(
        <MemoryRouter initialEntries={["/product"]}>
            <Routes>
                <Route path="/login" element={<p>Trang đăng nhập</p>} />
                <Route
                    path="/product"
                    element={
                        <RequireAdmin loadSession={() => session}>
                            <p>Quản lý sản phẩm</p>
                        </RequireAdmin>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
}

test("route quản trị: chưa đăng nhập bị chuyển về /login; có phiên admin thì vào được", () => {
    renderGuarded(null);
    expect(screen.getByText("Trang đăng nhập")).toBeInTheDocument();
    expect(screen.queryByText("Quản lý sản phẩm")).toBeNull();
});

test("route quản trị: có phiên admin thì hiển thị trang", () => {
    renderGuarded({ token: "t", user: { role: "admin" } });
    expect(screen.getByText("Quản lý sản phẩm")).toBeInTheDocument();
});

function renderLogin(login) {
    return render(
        <MemoryRouter initialEntries={["/login"]}>
            <Routes>
                <Route path="/login" element={<Login login={login} />} />
                <Route path="/" element={<p>Bảng điều khiển</p>} />
            </Routes>
        </MemoryRouter>
    );
}

const fillAndSubmit = () => {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "x@shop.vn" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), { target: { value: "matkhau-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
};

test("đăng nhập bằng tài khoản thành viên bị từ chối, không lưu token", async () => {
    const login = jest.fn().mockResolvedValue({ data: { data: { token: tokenWithExp(3600), user: { email: "x@shop.vn", role: "member" } } } });
    renderLogin(login);
    fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("không có quyền quản trị");
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
});

test("đăng nhập admin thành công thì lưu phiên và vào bảng điều khiển; sai mật khẩu hiện lỗi từ backend", async () => {
    const wrong = jest.fn().mockRejectedValue({ response: { status: 401, data: { message: "Email hoặc mật khẩu không đúng." } } });
    const { unmount } = renderLogin(wrong);
    fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Email hoặc mật khẩu không đúng.");
    unmount();

    const ok = jest.fn().mockResolvedValue({ data: { data: { token: tokenWithExp(3600), user: { email: "x@shop.vn", role: "admin" } } } });
    renderLogin(ok);
    fillAndSubmit();
    await waitFor(() => expect(screen.getByText("Bảng điều khiển")).toBeInTheDocument());
    expect(loadAdminSession().user.role).toBe("admin");
});
