import { render, screen } from "@testing-library/react";
import CommentForm from "./CommentForm";

const FakeLink = ({ to, children }) => <a href={to}>{children}</a>;

test("khách chưa đăng nhập không thấy form, chỉ thấy lời mời đăng nhập", () => {
    render(<CommentForm isLoggedIn={false} LinkComponent={FakeLink} onChange={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("link", { name: "đăng nhập" })).toHaveAttribute("href", "/login");
});

test("người đã đăng nhập chỉ nhập nội dung; tên lấy từ tài khoản; lỗi được hiển thị", () => {
    render(<CommentForm isLoggedIn user={{ full_name: "Alice", email: "alice@shop.vn" }} content="" error="Phiên đăng nhập đã hết hạn." LinkComponent={FakeLink} onChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("hết hạn");
});
