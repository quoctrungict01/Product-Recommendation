// Biểu đồ cột một chuỗi (doanh thu theo ngày/tháng) bằng SVG thuần — không thêm thư viện.
// Quy ước: cột ≤ 24px, bo 4px ở đầu cột (vuông ở đường gốc), lưới mảnh 1px nhạt, một trục y;
// rê chuột/chạm vào cột -> tooltip; luôn có bảng số liệu thay thế (đọc màn hình, in ấn).
import React from "react";

const W = 800;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 34, left: 64 };
const BAR_COLOR = "#1f78d1"; // đã kiểm tra tương phản trên nền trắng
const GRID = "#e6e6e6";
const INK_MUTED = "#6b6b6b";

/** 12500000 -> "12,5 tr"; 1200000000 -> "1,2 tỷ" (nhãn trục gọn). */
export const compactMoney = (n) => {
    const fmt = (x) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(x);
    if (n >= 1e9) return `${fmt(n / 1e9)} tỷ`;
    if (n >= 1e6) return `${fmt(n / 1e6)} tr`;
    if (n >= 1e3) return `${fmt(n / 1e3)} N`;
    return fmt(n);
};

/** Bước chia trục tròn: 1, 2, 5 × 10^k sao cho có khoảng 4 vạch. */
export const niceMax = (max) => {
    if (!max || max <= 0) return { top: 1, step: 1 };
    const raw = max / 4;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
    return { top: Math.ceil(max / step) * step, step };
};

/** Cột bo 4px ở đầu (trên), vuông ở đường gốc. */
const barPath = (x, y, w, h) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
};

/**
 * @param {{ data: {key: string, label: string, value: number, detail?: string}[], title: string, formatValue: (n:number)=>string }} props
 */
const BarChart = ({ data, title, formatValue }) => {
    const [hover, setHover] = React.useState(null);
    const max = Math.max(0, ...data.map((d) => d.value));
    const { top, step } = niceMax(max);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const band = innerW / Math.max(1, data.length);
    const barW = Math.max(2, Math.min(24, band - 2)); // khoảng trống >= 2px giữa các cột
    const y = (v) => PAD.top + innerH - (v / top) * innerH;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const labelEvery = Math.ceil(data.length / 10); // tối đa ~10 nhãn trục x, không chồng chữ
    const active = hover !== null ? data[hover] : null;

    return (
        <div style={{ position: "relative" }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title} style={{ display: "block", maxHeight: 280 }} onMouseLeave={() => setHover(null)}>
                {ticks.map((v) => (
                    <g key={v}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
                        <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>
                            {compactMoney(v)}
                        </text>
                    </g>
                ))}
                {data.map((d, i) => {
                    const x = PAD.left + i * band + (band - barW) / 2;
                    const h = Math.max(0, PAD.top + innerH - y(d.value));
                    return (
                        <g key={d.key}>
                            {d.value > 0 ? <path d={barPath(x, y(d.value), barW, h)} fill={BAR_COLOR} opacity={hover === null || hover === i ? 1 : 0.45} /> : null}
                            {i % labelEvery === 0 || i === data.length - 1 ? (
                                <text x={PAD.left + i * band + band / 2} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
                                    {d.label}
                                </text>
                            ) : null}
                            {/* Vùng chạm cả dải cột (lớn hơn cột) để dễ rê chuột/chạm trên điện thoại. */}
                            <rect
                                x={PAD.left + i * band}
                                y={PAD.top}
                                width={band}
                                height={innerH}
                                fill="transparent"
                                onMouseEnter={() => setHover(i)}
                                onFocus={() => setHover(i)}
                                onTouchStart={() => setHover(i)}
                                tabIndex={-1}
                            >
                                <title>{`${d.label}: ${formatValue(d.value)}${d.detail ? ` · ${d.detail}` : ""}`}</title>
                            </rect>
                        </g>
                    );
                })}
                <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="#cfcfcf" strokeWidth={1} />
            </svg>
            {active ? (
                <div
                    role="status"
                    style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        background: "#fff",
                        border: "1px solid #ddd",
                        borderRadius: 4,
                        padding: "4px 8px",
                        fontSize: 12,
                        boxShadow: "0 1px 3px rgba(0,0,0,.12)",
                        pointerEvents: "none",
                    }}
                >
                    <b>{active.label}</b>: {formatValue(active.value)}
                    {active.detail ? <span style={{ color: INK_MUTED }}> · {active.detail}</span> : null}
                </div>
            ) : null}
            <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: INK_MUTED }}>Xem dạng bảng</summary>
                <div className="table-responsive" style={{ maxHeight: 240, overflowY: "auto" }}>
                    <table className="table table-condensed" style={{ fontSize: 12 }}>
                        <thead>
                            <tr>
                                <th>Thời gian</th>
                                <th>Doanh thu</th>
                                <th>Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((d) => (
                                <tr key={d.key}>
                                    <td>{d.label}</td>
                                    <td>{formatValue(d.value)}</td>
                                    <td>{d.detail || ""}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
};

export default BarChart;
