// Hồi quy: tài nguyên tĩnh (CSS/JS/ảnh trong public/) phải dùng đường dẫn tính từ gốc ứng dụng.
// Đường dẫn tương đối ("css/a.css", "images/a.jpg") hỏng ở trang con như /account/profile:
// trình duyệt xin /account/css/a.css, dev server trả index.html -> mất CSS/ảnh, lỗi "Unexpected token '<'".
import fs from "fs";
import path from "path";
import React from "react";
import { render } from "@testing-library/react";
import { publicAsset } from "./publicAsset";
import Slider from "../components/Layout/Slider";
import Sidebar from "../components/Layout/Sidebar";

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");

function jsFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return jsFiles(p);
        return /\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [p] : [];
    });
}
// Thuộc tính trỏ thẳng vào thư mục của public/ mà không có "/" hoặc %PUBLIC_URL% ở đầu.
const RELATIVE_ASSET = /\b(?:src|href)\s*=\s*["'](?:\.\/)?(?:css|js|images)\//;

test("publicAsset: luôn trả đường dẫn tuyệt đối từ gốc", () => {
    expect(publicAsset("images/slide-1.jpg")).toBe("/images/slide-1.jpg");
    expect(publicAsset("/images/a.png")).toBe("/images/a.png");
    expect(publicAsset("//images/a.png")).toBe("/images/a.png");
});

test("public/index.html: mọi CSS/JS dùng %PUBLIC_URL%/..., không còn đường dẫn tương đối", () => {
    const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
    const refs = [...html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(12);
    for (const r of refs) expect(r).toMatch(/^(%PUBLIC_URL%\/|https?:\/\/)/);
    for (const r of refs.filter((x) => x.startsWith("%PUBLIC_URL%/"))) {
        expect(fs.existsSync(path.join(ROOT, "public", r.replace("%PUBLIC_URL%/", "")))).toBe(true);
    }
});

test("Mã nguồn React không còn src/href tương đối tới css/, js/, images/ (bỏ qua dòng chú thích)", () => {
    const offenders = [];
    for (const file of jsFiles(SRC)) {
        fs.readFileSync(file, "utf8")
            .split(/\r?\n/)
            .forEach((line, i) => {
                if (/^\s*(\/\/|\*)/.test(line)) return;
                if (RELATIVE_ASSET.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
            });
    }
    expect(offenders).toEqual([]);
});

test("Slider và Sidebar: ảnh trỏ tới /images/... và file tồn tại trong public/", () => {
    const { container: a } = render(<Slider />);
    const { container: b } = render(<Sidebar />);
    const srcs = [...a.querySelectorAll("img"), ...b.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs.length).toBe(11);
    for (const s of srcs) {
        expect(s).toMatch(/^\/images\//);
        expect(fs.existsSync(path.join(ROOT, "public", s))).toBe(true);
    }
});
