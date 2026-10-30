// Ô nhập địa chỉ giao hàng: tỉnh/thành – phường/xã – địa chỉ chi tiết.
//  - Mặc định chọn từ danh mục địa giới (API công khai, xem shared/ultils/addressApi.js).
//  - API lỗi hoặc người dùng muốn -> nhập thủ công (có thêm ô quận/huyện tùy chọn cho địa chỉ cũ).
import React from "react";
import { fetchProvinces, fetchWards } from "../ultils/addressApi";

const fieldStyle = { marginBottom: 12 };
const errorStyle = { color: "#c60a11", fontSize: 13, marginTop: 4 };

const FieldError = ({ id, message }) =>
    message ? (
        <div id={id} style={errorStyle}>
            {message}
        </div>
    ) : null;

const AddressFields = ({ value, onChange, errors = {}, idPrefix = "addr", fetchImpl, disabled = false }) => {
    const v = value || {};
    // Địa chỉ đã lưu nhưng không có mã (nhập tay / dữ liệu cũ có quận/huyện) -> mở sẵn chế độ nhập tay.
    const startManual = Boolean((v.province && !v.province_code) || v.district);
    const [manual, setManual] = React.useState(startManual);
    const [provinces, setProvinces] = React.useState([]);
    const [wards, setWards] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [apiError, setApiError] = React.useState("");
    // Giữ cố định giữa các lần render để effect không tải lại liên tục.
    const doFetch = React.useMemo(() => fetchImpl || (typeof fetch !== "undefined" ? (...args) => fetch(...args) : null), [fetchImpl]);

    const fail = React.useCallback(() => {
        setApiError("Không tải được danh sách tỉnh/thành, phường/xã. Bạn vui lòng nhập địa chỉ thủ công.");
        setManual(true);
    }, []);

    React.useEffect(() => {
        if (manual || provinces.length || !doFetch) {
            if (!doFetch && !manual) fail();
            return undefined;
        }
        let alive = true;
        setLoading(true);
        fetchProvinces(doFetch)
            .then((list) => alive && setProvinces(list))
            .catch(() => alive && fail())
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, [manual, provinces.length, doFetch, fail]);

    React.useEffect(() => {
        if (manual || !v.province_code || !doFetch) {
            setWards([]);
            return undefined;
        }
        let alive = true;
        setLoading(true);
        fetchWards(v.province_code, doFetch)
            .then((list) => alive && setWards(list))
            .catch(() => alive && fail())
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, [manual, v.province_code, doFetch, fail]);

    const set = (patch) => onChange({ ...v, ...patch });
    const id = (name) => `${idPrefix}-${name}`;
    const describedBy = (name) => (errors[name] ? `${id(name)}-error` : undefined);

    const onProvince = (e) => {
        const code = Number(e.target.value) || null;
        const p = provinces.find((x) => x.code === code);
        set({ province: p ? p.name : "", province_code: p ? p.code : null, ward: "", ward_code: null, district: "" });
    };
    const onWard = (e) => {
        const code = Number(e.target.value) || null;
        const w = wards.find((x) => x.code === code);
        set({ ward: w ? w.name : "", ward_code: w ? w.code : null });
    };
    const toggle = () => {
        if (manual) {
            // Quay lại chọn từ danh sách: bỏ giá trị tự nhập để chọn lại cho đúng danh mục.
            setApiError("");
            set({ province: "", province_code: null, ward: "", ward_code: null, district: "" });
        }
        setManual(!manual);
    };

    return (
        <div>
            {apiError ? (
                <div className="alert alert-warning" role="status" style={{ fontSize: 14 }}>
                    {apiError}
                </div>
            ) : null}
            <div className="row">
                {manual ? (
                    <>
                        <div className="col-lg-4 col-md-4 col-sm-12" style={fieldStyle}>
                            <label htmlFor={id("province")}>Tỉnh/thành phố *</label>
                            <input id={id("province")} className="form-control" disabled={disabled} value={v.province || ""} maxLength={100} aria-invalid={Boolean(errors.province)} aria-describedby={describedBy("province")} onChange={(e) => set({ province: e.target.value, province_code: null })} />
                            <FieldError id={`${id("province")}-error`} message={errors.province} />
                        </div>
                        <div className="col-lg-4 col-md-4 col-sm-12" style={fieldStyle}>
                            <label htmlFor={id("ward")}>Phường/xã *</label>
                            <input id={id("ward")} className="form-control" disabled={disabled} value={v.ward || ""} maxLength={100} aria-invalid={Boolean(errors.ward)} aria-describedby={describedBy("ward")} onChange={(e) => set({ ward: e.target.value, ward_code: null })} />
                            <FieldError id={`${id("ward")}-error`} message={errors.ward} />
                        </div>
                        <div className="col-lg-4 col-md-4 col-sm-12" style={fieldStyle}>
                            <label htmlFor={id("district")}>Quận/huyện (địa chỉ cũ, không bắt buộc)</label>
                            <input id={id("district")} className="form-control" disabled={disabled} value={v.district || ""} maxLength={100} aria-invalid={Boolean(errors.district)} aria-describedby={describedBy("district")} onChange={(e) => set({ district: e.target.value })} />
                            <FieldError id={`${id("district")}-error`} message={errors.district} />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="col-lg-6 col-md-6 col-sm-12" style={fieldStyle}>
                            <label htmlFor={id("province")}>Tỉnh/thành phố *</label>
                            <select id={id("province")} className="form-control" disabled={disabled || (loading && !provinces.length)} value={v.province_code || ""} aria-invalid={Boolean(errors.province)} aria-describedby={describedBy("province")} onChange={onProvince}>
                                <option value="">{loading && !provinces.length ? "Đang tải..." : "-- Chọn tỉnh/thành phố --"}</option>
                                {provinces.map((p) => (
                                    <option key={p.code} value={p.code}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError id={`${id("province")}-error`} message={errors.province} />
                        </div>
                        <div className="col-lg-6 col-md-6 col-sm-12" style={fieldStyle}>
                            <label htmlFor={id("ward")}>Phường/xã *</label>
                            <select id={id("ward")} className="form-control" disabled={disabled || !v.province_code} value={v.ward_code || ""} aria-invalid={Boolean(errors.ward)} aria-describedby={describedBy("ward")} onChange={onWard}>
                                <option value="">{!v.province_code ? "-- Chọn tỉnh/thành trước --" : loading && !wards.length ? "Đang tải..." : "-- Chọn phường/xã --"}</option>
                                {wards.map((w) => (
                                    <option key={w.code} value={w.code}>
                                        {w.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError id={`${id("ward")}-error`} message={errors.ward} />
                        </div>
                    </>
                )}
                <div className="col-lg-12 col-md-12 col-sm-12" style={fieldStyle}>
                    <label htmlFor={id("detail")}>Địa chỉ chi tiết *</label>
                    <input id={id("detail")} className="form-control" disabled={disabled} placeholder="Số nhà, tên đường, tòa nhà..." value={v.detail || ""} maxLength={200} aria-invalid={Boolean(errors.detail)} aria-describedby={describedBy("detail")} onChange={(e) => set({ detail: e.target.value })} />
                    <FieldError id={`${id("detail")}-error`} message={errors.detail} />
                </div>
            </div>
            <button type="button" className="btn btn-link p-0" style={{ color: "#eb1f27", fontSize: 14 }} disabled={disabled} onClick={toggle}>
                {manual ? "Chọn từ danh sách tỉnh/thành" : "Không tìm thấy? Nhập địa chỉ thủ công"}
            </button>
        </div>
    );
};

export default AddressFields;
