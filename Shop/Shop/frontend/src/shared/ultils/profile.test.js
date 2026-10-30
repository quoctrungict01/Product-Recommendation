import { phoneError, emailError, newPasswordError, addressErrors, cleanAddress, formatAddress, orderCode, normalizePhone } from "./profile";

test("số điện thoại: cùng quy tắc với backend", () => {
    expect(phoneError("0912 345 678")).toBe("");
    expect(phoneError("+84912345678")).toBe("");
    expect(phoneError("12345")).not.toBe("");
    expect(phoneError("")).not.toBe("");
    expect(phoneError("", { required: false })).toBe("");
    expect(normalizePhone("0912.345-678")).toBe("0912345678");
});

test("email và mật khẩu mới", () => {
    expect(emailError("a@b.vn")).toBe("");
    expect(emailError("abc")).not.toBe("");
    expect(newPasswordError("ngan1")).toMatch(/8 ký tự/);
    expect(newPasswordError("chicochuthoi")).toMatch(/chữ cái và chữ số/);
    expect(newPasswordError("12345678")).toMatch(/chữ cái và chữ số/);
    expect(newPasswordError("matkhau-moi-1")).toBe("");
});

test("địa chỉ: bắt buộc tỉnh/thành, phường/xã, chi tiết; quận/huyện tùy chọn; chỉ gửi trường cho phép", () => {
    expect(addressErrors({})).toEqual({ province: expect.any(String), ward: expect.any(String), detail: expect.any(String) });
    const a = { province: " Thành phố Hà Nội ", province_code: "1", ward: "Phường Bách Khoa", ward_code: null, district: "", detail: "Số 1", extra: "x" };
    expect(addressErrors(a)).toEqual({});
    expect(addressErrors({ ...a, detail: "x".repeat(201) }).detail).toBeTruthy();
    expect(cleanAddress(a)).toEqual({ province: "Thành phố Hà Nội", province_code: 1, district: null, ward: "Phường Bách Khoa", ward_code: null, detail: "Số 1" });
    expect(formatAddress({ detail: "Số 1", ward: "P. A", district: "Q. B", province: "HN" })).toBe("Số 1, P. A, Q. B, HN");
    expect(orderCode("65f0a1b2c3d4e5f6a7b8c9d0")).toBe("#A7B8C9D0");
});
