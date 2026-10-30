#!/usr/bin/env node
// Tạo ảnh minh họa SVG (tự vẽ, không dùng ảnh bên ngoài) cho các sản phẩm demo.
// Ghi vào backendapi/src/public/images/products/demo/<key>.svg — thư mục tĩnh mà backend
// đã phục vụ sẵn, nên frontend hiển thị qua `${BASE_URL}/images/products/demo/<key>.svg`.
// Không đụng tới database.
//
//   node scripts/seed-demo/make-placeholders.js          # tạo/ghi đè các file SVG demo
//   node scripts/seed-demo/make-placeholders.js --check  # chỉ kiểm tra đã đủ file chưa

const fs = require("fs");
const path = require("path");
const { CATEGORIES, PRODUCTS, placeholderImagePath } = require("./catalog");
const { IMAGE_DIR } = require("./plan");

const escapeXml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

const ICONS = {
    phone: `<rect x="225" y="120" width="150" height="270" rx="22" fill="none" stroke="#fff" stroke-width="10"/>
  <rect x="270" y="138" width="60" height="8" rx="4" fill="#fff"/><circle cx="300" cy="365" r="9" fill="#fff"/>`,
    "feature-phone": `<rect x="235" y="120" width="130" height="270" rx="26" fill="none" stroke="#fff" stroke-width="10"/>
  <rect x="258" y="148" width="84" height="80" rx="6" fill="#fff" opacity=".85"/>
  <g fill="#fff">${[0, 1, 2]
      .flatMap((r) => [0, 1, 2].map((c) => `<circle cx="${268 + c * 32}" cy="${262 + r * 36}" r="9"/>`))
      .join("")}</g>`,
    earbuds: `<g fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round">
  <circle cx="245" cy="205" r="42"/><path d="M262 243 L280 350"/>
  <circle cx="355" cy="205" r="42"/><path d="M338 243 L320 350"/></g>`,
    cable: `<g fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round">
  <rect x="200" y="140" width="56" height="80" rx="10"/><rect x="344" y="290" width="56" height="80" rx="10"/>
  <path d="M228 220 C 228 330, 372 180, 372 290"/></g>`,
    charger: `<g fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round">
  <rect x="220" y="170" width="160" height="190" rx="24"/>
  <path d="M262 170 V120 M338 170 V120" stroke-linecap="round"/>
  <path d="M308 215 L272 275 H306 L292 325 L332 255 H298 Z" fill="#fff" stroke-width="4"/></g>`,
    battery: `<g fill="none" stroke="#fff" stroke-width="10">
  <rect x="215" y="130" width="170" height="250" rx="22"/></g>
  <g fill="#fff"><rect x="240" y="300" width="120" height="50" rx="8"/><rect x="240" y="235" width="120" height="50" rx="8" opacity=".7"/>
  <rect x="240" y="170" width="120" height="50" rx="8" opacity=".35"/></g>`,
    case: `<rect x="220" y="115" width="160" height="280" rx="30" fill="none" stroke="#fff" stroke-width="10"/>
  <rect x="242" y="137" width="62" height="70" rx="16" fill="none" stroke="#fff" stroke-width="8"/>
  <circle cx="262" cy="160" r="9" fill="#fff"/><circle cx="284" cy="185" r="9" fill="#fff"/>`,
    glass: `<rect x="225" y="120" width="150" height="270" rx="22" fill="#fff" fill-opacity=".18" stroke="#fff" stroke-width="10"/>
  <path d="M250 250 L330 170 M250 300 L350 200" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".8"/>`,
};

function wrapName(name, max = 22) {
    const words = name.split(" ");
    const lines = [""];
    for (const w of words) {
        const cur = lines[lines.length - 1];
        if ((cur + " " + w).trim().length > max && cur) lines.push(w);
        else lines[lines.length - 1] = (cur + " " + w).trim();
    }
    return lines.slice(0, 3);
}

function svgFor(product) {
    const category = CATEGORIES.find((c) => c.key === product.category);
    const [c1, c2] = category.color;
    const icon = ICONS[product.icon || category.icon];
    const lines = wrapName(product.name);
    const text = lines
        .map((l, i) => `<text x="300" y="${452 + i * 38}" text-anchor="middle" font-size="32" font-weight="700">${escapeXml(l)}</text>`)
        .join("\n  ");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="${escapeXml(product.name)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="600" height="600" rx="36" fill="url(#g)"/>
  ${icon}
  <g fill="#fff" font-family="Segoe UI, Roboto, Arial, sans-serif">
  ${text}
  <text x="300" y="${452 + lines.length * 38 + 14}" text-anchor="middle" font-size="20" opacity=".75">${escapeXml(category.name)} · Ảnh minh họa</text>
  </g>
</svg>
`;
}

function main() {
    const check = process.argv.includes("--check");
    const missing = [];
    let written = 0;
    for (const product of PRODUCTS) {
        const file = path.join(IMAGE_DIR, placeholderImagePath(product.key));
        if (check) {
            if (!fs.existsSync(file)) missing.push(file);
            continue;
        }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, svgFor(product), "utf8");
        written++;
    }
    if (check) {
        console.log(missing.length ? `Thiếu ${missing.length} file:\n${missing.join("\n")}` : `Đủ ${PRODUCTS.length} ảnh minh họa.`);
        process.exitCode = missing.length ? 1 : 0;
    } else {
        console.log(`Đã ghi ${written} ảnh SVG vào ${path.join(IMAGE_DIR, "demo")}`);
    }
}

if (require.main === module) main();
module.exports = { svgFor };
