import React from "react";

/** Thông báo kết quả thao tác: { type: "success" | "danger" | "warning", text }. */
const Notice = ({ notice, onClose }) => {
    if (!notice || !notice.text) return null;
    return (
        <div className={`alert alert-${notice.type || "info"}`} role={notice.type === "danger" ? "alert" : "status"}>
            {onClose ? (
                <button type="button" className="close" aria-label="Đóng" onClick={onClose}>
                    <span aria-hidden="true">×</span>
                </button>
            ) : null}
            {notice.text}
        </div>
    );
};

export default Notice;
