import React from "react";

/** Thông báo kết quả lưu: { type: "success" | "error", text }. */
const Notice = ({ notice }) => {
    if (!notice || !notice.text) return null;
    const ok = notice.type === "success";
    return (
        <div className={`alert ${ok ? "alert-success" : "alert-danger"}`} role={ok ? "status" : "alert"} style={{ fontSize: 14 }}>
            {notice.text}
        </div>
    );
};

export default Notice;
