import React from "react";

/** Phân trang dạng nút: « 1 … 4 [5] 6 … 20 » — trang do backend cắt, component chỉ báo trang được chọn. */
const Pager = ({ page, totalPages, onChange, disabled = false }) => {
    if (!totalPages || totalPages <= 1) return null;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) pages.push(i);
        else if (pages[pages.length - 1] !== "…") pages.push("…");
    }
    const go = (p) => (e) => {
        e.preventDefault();
        if (!disabled && p >= 1 && p <= totalPages && p !== page) onChange(p);
    };
    return (
        <nav aria-label="Phân trang">
            <ul className="pagination" style={{ margin: 0 }}>
                <li className={page <= 1 ? "disabled" : ""}>
                    <a href="#prev" onClick={go(page - 1)} aria-label="Trang trước">
                        «
                    </a>
                </li>
                {pages.map((p, i) =>
                    p === "…" ? (
                        <li key={`gap-${i}`} className="disabled">
                            <span>…</span>
                        </li>
                    ) : (
                        <li key={p} className={p === page ? "active" : ""}>
                            <a href={`#page-${p}`} onClick={go(p)} aria-current={p === page ? "page" : undefined}>
                                {p}
                            </a>
                        </li>
                    )
                )}
                <li className={page >= totalPages ? "disabled" : ""}>
                    <a href="#next" onClick={go(page + 1)} aria-label="Trang sau">
                        »
                    </a>
                </li>
            </ul>
        </nav>
    );
};

export default Pager;
