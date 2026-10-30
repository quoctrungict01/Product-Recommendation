import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AddressFields from "./AddressFields";
import { clearAddressCache } from "../ultils/addressApi";
import { emptyAddress } from "../ultils/profile";

const json = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
const makeOkFetch = () => jest.fn((url) => {
    if (url.endsWith("/p/")) return json([{ code: 1, name: "Thành phố Hà Nội" }, { code: 79, name: "Thành phố Hồ Chí Minh" }]);
    if (url.includes("/p/1?depth=2")) return json({ code: 1, wards: [{ code: 4, name: "Phường Ba Đình" }, { code: 70, name: "Phường Hoàn Kiếm" }] });
    return Promise.resolve({ ok: false, status: 404 });
});

function Harness({ fetchImpl, initial = emptyAddress(), onValue }) {
    const [value, setValue] = React.useState(initial);
    return (
        <AddressFields
            value={value}
            fetchImpl={fetchImpl}
            onChange={(v) => {
                setValue(v);
                onValue && onValue(v);
            }}
        />
    );
}

// CRA bật resetMocks: tạo hàm fetch giả mới trong từng test.
let okFetch;
beforeEach(() => {
    clearAddressCache();
    okFetch = makeOkFetch();
});

test("chọn tỉnh/thành rồi phường/xã từ danh mục; lưu cả tên và mã", async () => {
    const onValue = jest.fn();
    render(<Harness fetchImpl={okFetch} onValue={onValue} />);
    await screen.findByRole("option", { name: "Thành phố Hà Nội" });
    fireEvent.change(screen.getByLabelText("Tỉnh/thành phố *"), { target: { value: "1" } });
    await screen.findByRole("option", { name: "Phường Hoàn Kiếm" });
    fireEvent.change(screen.getByLabelText("Phường/xã *"), { target: { value: "70" } });
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ province: "Thành phố Hà Nội", province_code: 1, ward: "Phường Hoàn Kiếm", ward_code: 70 }));
    // Không gửi token hay cookie sang dịch vụ ngoài.
    for (const [, options] of okFetch.mock.calls) {
        expect(options.credentials).toBe("omit");
        expect(options.headers).toBeUndefined();
    }
});

test("API địa giới lỗi -> báo rõ và chuyển sang nhập thủ công (có quận/huyện tùy chọn)", async () => {
    const failing = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const onValue = jest.fn();
    render(<Harness fetchImpl={failing} onValue={onValue} />);
    expect(await screen.findByRole("status")).toHaveTextContent("nhập địa chỉ thủ công");
    const province = screen.getByLabelText("Tỉnh/thành phố *");
    expect(province.tagName).toBe("INPUT");
    fireEvent.change(province, { target: { value: "Hà Nội" } });
    fireEvent.change(screen.getByLabelText("Phường/xã *"), { target: { value: "Phường Bách Khoa" } });
    fireEvent.change(screen.getByLabelText(/Quận\/huyện/), { target: { value: "Quận Hai Bà Trưng" } });
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ province: "Hà Nội", province_code: null, ward: "Phường Bách Khoa", district: "Quận Hai Bà Trưng" }));
});

test("địa chỉ cũ đã lưu có quận/huyện -> mở sẵn chế độ nhập tay, không gọi API", async () => {
    render(<Harness fetchImpl={okFetch} initial={{ ...emptyAddress(), province: "Hà Nội", district: "Quận Đống Đa", ward: "Phường Láng Thượng", detail: "Số 5" }} />);
    expect(screen.getByLabelText(/Quận\/huyện/)).toHaveValue("Quận Đống Đa");
    await waitFor(() => expect(okFetch).not.toHaveBeenCalled());
});
