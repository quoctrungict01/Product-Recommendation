# Giai đoạn 4 – Bước 3: M1 — Luật kết hợp đa mức (mục 7.2.1)

Tạo lúc: 2026-10-27T02:03:40.678Z · Node v20.20.2 · lệnh `node scripts/evaluate-multilevel.js` · tổng 187 s (đánh giá 183 s).

Toàn bộ chạy OFFLINE: dữ liệu sinh lại từ seed, không đọc `.env`, không kết nối MongoDB, không gọi API. M1 chỉ nằm trong `research/multilevel/` — API, tham số mặc định và giao diện website không đổi.

## 1. Thiết kế

- **Hệ phân cấp 2 cấp đúng như dữ liệu**: `all` (cấp 0, không phải item) → 10 danh mục (cấp 1, nút `C:<category_id>`) → sản phẩm (cấp 2, nút `P:<product_id>`; 41 ở R1, 48 ở R1b). Collection `categories` chỉ có trường `name`, không có danh mục cha, nên không thêm cấp "Điện thoại/Phụ kiện".
- **Khai phá**: mỗi giao dịch được thêm danh mục của các sản phẩm trong đó, rồi chạy **chính Apriori/FP-Growth của Chương 6** một lần ở ngưỡng thấp nhất; tập trộn cấp dùng ngưỡng thấp nhất của các cấp tham gia, tập thuần một cấp dùng ngưỡng của cấp đó (mục 7.2.1). Có test đối chiếu với cách "từng cấp, từ trên xuống" của giáo trình.
- **Ngưỡng**: uniform (cùng ngưỡng mọi cấp) hoặc reduced (ngưỡng danh mục ≥ ngưỡng sản phẩm); chọn trên validation cùng confidence và thứ tự xếp hạng.
- **Loại luật tầm thường**: bỏ mọi tập chứa đồng thời sản phẩm và danh mục cha của nó (vd. `iPhone 15 ⇒ danh mục iPhone`, confidence luôn 100%). Luật dư thừa theo luật tổ tiên (Ví dụ 7.2, sai lệch ≤ 10%) được đếm và báo cáo.
- **Ánh xạ về sản phẩm**: luật `X ⇒ danh mục D` cho điểm `conf(X ⇒ D) × sup(X ∪ {q}) / sup(X ∪ {D})` với q ∈ D, chỉ dùng tập phổ biến đã khai phá; nếu `X ∪ {q}` không phổ biến (sản phẩm ít giao dịch) thì lùi từ sản phẩm lên danh mục của nó, vẫn không có thì bỏ. Thiếu chỗ thì dùng đúng fallback của website.
- **Giao thức** như Bước 1–2: chia theo thời gian 0.7/0.1/0.2, che từng sản phẩm trong đơn ≥ 2 sản phẩm, Top-5; tham số chọn trên validation (học trên train), học lại trên train ∪ validation, chấm test một lần; KTC 95% bootstrap theo cụm **đơn hàng** (1000 lần).
- **Sản phẩm ít giao dịch**: có trong < 0.5% số đơn lịch sử (train ∪ validation) — xác định không dùng test.
- Lưới M1: sup sản phẩm {0.002, 0.003, 0.005, 0.01, 0.015, 0.02, 0.03} × sup danh mục {= sup sản phẩm, 0.01, 0.02, 0.05, 0.1} × conf {0, 0.05, 0.1, 0.2, 0.3, 0.4} × thứ tự {specific-first, score}. Lưới luật một cấp giữ nguyên Bước 2.

## 2. Bộ dữ liệu và tham số được chọn

Bộ sinh `trungshop-research-generator/1.0.0`. Checksum **trùng khớp** manifest Bước 2 (`phase4-step2-datasets.json`). Dữ liệu demo GR2: checksum không đổi.

| Bộ | Checksum | Giây | SP hiếm | Luật một cấp (sup, conf) | M1 (validation) | Biên lưới M1 | Apriori = FP |
|---|---|---:|---:|---|---|---|:---:|
| R1-seed20261101-n20000 | `e84322bb341aeb1d1ba300c07f06479f79de67dc` | 19.4 | 0 | 0.002, 0 | reduced: sp 0.002 / dm 0.1, conf 0, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; sup danh mục ở giá trị lớn nhất của lưới; minConfidence ở giá trị nhỏ nhất của lưới | ✔ |
| R1-seed20261102-n20000 | `44fe1e131afbb1862217d54b1e75bb6da30f2c82` | 19.1 | 0 | 0.002, 0.05 | reduced: sp 0.002 / dm 0.1, conf 0.05, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; sup danh mục ở giá trị lớn nhất của lưới | ✔ |
| R1-seed20261103-n20000 | `a1ba0842b514a0d90c6f8c031f44f854a4bde055` | 19.9 | 0 | 0.002, 0 | reduced: sp 0.002 / dm 0.1, conf 0, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; sup danh mục ở giá trị lớn nhất của lưới; minConfidence ở giá trị nhỏ nhất của lưới | ✔ |
| R1-seed20261104-n20000 | `0bfe7974f9f9c3b7f8a5fb95fde7d5db85b4f516` | 18.5 | 0 | 0.002, 0 | reduced: sp 0.002 / dm 0.1, conf 0.05, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; sup danh mục ở giá trị lớn nhất của lưới | ✔ |
| R1-seed20261105-n20000 | `9e9304d550364a18860559bbcac3f2b75dcf5df4` | 18.7 | 0 | 0.002, 0 | reduced: sp 0.002 / dm 0.05, conf 0, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; minConfidence ở giá trị nhỏ nhất của lưới | ✔ |
| R1B-seed20261101-n20000 | `ac2ea12f86d60fe2c435b4a72ce9552d29e5cf99` | 18.8 | 7 | 0.002, 0 | reduced: sp 0.002 / dm 0.01, conf 0, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; minConfidence ở giá trị nhỏ nhất của lưới | ✔ |
| R1B-seed20261102-n20000 | `f3a0bdff2ba16671b3a6fecf88c71c905f0fdb1a` | 18.6 | 7 | 0.002, 0 | reduced: sp 0.002 / dm 0.1, conf 0, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; sup danh mục ở giá trị lớn nhất của lưới; minConfidence ở giá trị nhỏ nhất của lưới | ✔ |
| R1B-seed20261103-n20000 | `77216bf5d1a45a1f03520553f78abdb3d31e37e0` | 16.6 | 7 | 0.002, 0 | reduced: sp 0.002 / dm 0.1, conf 0, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; sup danh mục ở giá trị lớn nhất của lưới; minConfidence ở giá trị nhỏ nhất của lưới | ✔ |
| R1B-seed20261104-n20000 | `2d8eab061401c0772d6761aa132968b98f5c89c7` | 16.8 | 7 | 0.002, 0 | reduced: sp 0.002 / dm 0.05, conf 0.05, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới | ✔ |
| R1B-seed20261105-n20000 | `7cbbe3fca4ce39cce3d01696788d0589442cca16` | 16.5 | 7 | 0.002, 0 | reduced: sp 0.002 / dm 0.02, conf 0, specific-first | sup sản phẩm ở giá trị nhỏ nhất của lưới; minConfidence ở giá trị nhỏ nhất của lưới | ✔ |

## 3. R1: toàn bộ truy vấn test (5 seed)

TB ± SD qua seed; KTC theo đơn = trung bình cận dưới/trên của KTC bootstrap theo đơn trong từng seed.

| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Có gợi ý từ luật | Có luật cấp danh mục/trộn cấp |
|---|---:|---:|---|---:|---:|---:|---:|
| Category-Based (cùng danh mục → bán chạy) | 7.4 ± 0.6 | 23.2 ± 2.5 | [22.0; 24.4] | 35.4 ± 2.9 | 95.1 ± 0.0 | 0.0 ± 0.0 | – |
| Hệ thống hiện tại – luật + fallback | 22.6 ± 0.4 | 64.3 ± 0.8 | [62.6; 65.9] | 70.3 ± 0.9 | 97.6 ± 0.0 | 83.7 ± 0.6 | – |
| Luật một cấp – chỉ luật (tham số validation) | 28.3 ± 0.4 | 81.1 ± 0.4 | [79.7; 82.5] | 83.1 ± 0.3 | 73.2 ± 1.7 | 98.8 ± 0.1 | – |
| Luật một cấp + fallback (tham số validation) | 28.5 ± 0.4 | 81.8 ± 0.3 | [80.4; 83.1] | 84.1 ± 0.4 | 89.8 ± 1.1 | 98.8 ± 0.1 | – |
| M1 + fallback (tham số website, uniform) | 24.7 ± 0.5 | 71.0 ± 0.8 | [69.5; 72.5] | 76.4 ± 1.0 | 79.5 ± 1.3 | 92.0 ± 1.8 | 85.2 ± 2.7 |
| M1 – chỉ luật (tham số validation) | 28.4 ± 0.4 | 81.7 ± 0.5 | [80.3; 83.0] | 83.9 ± 0.4 | 73.2 ± 1.7 | 99.8 ± 0.5 | 44.9 ± 4.2 |
| M1 + fallback (tham số validation) | 28.5 ± 0.4 | 82.0 ± 0.5 | [80.6; 83.3] | 84.3 ± 0.5 | 83.4 ± 1.1 | 99.8 ± 0.5 | 44.9 ± 4.2 |

### R1: nhóm sản phẩm ít giao dịch

Không có sản phẩm nào dưới ngưỡng 0.5% số đơn lịch sử ở R1 (sản phẩm ít nhất vẫn có hàng trăm đơn), nên không có nhóm hiếm để báo cáo.

### R1: so sánh cặp (cùng truy vấn, bootstrap theo đơn trong từng seed)

| So sánh | ΔRecall@5 (điểm %, TB ± SD) | Số seed | ΔHit@5 | ΔRecall từng seed [KTC theo đơn] |
|---|---:|---|---:|---|
| M1 + fallback (validation) − hệ thống hiện tại — toàn bộ | +17.69 ± 0.74 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +14.00 ± 0.96 | +18.2 [+17.0; +19.4]<br>+17.4 [+16.4; +18.6]<br>+17.3 [+16.3; +18.4]<br>+18.7 [+17.5; +19.8]<br>+16.8 [+15.6; +18.0] |
| M1 + fallback − luật một cấp + fallback (cả hai chọn tham số trên validation) — toàn bộ | +0.22 ± 0.16 | 4/5 dương · 3 có KTC > 0 · 0 có KTC < 0 | +0.20 ± 0.17 | +0.2 [-0.0; +0.4]<br>+0.5 [+0.2; +0.7]<br>+0.2 [+0.0; +0.4]<br>+0.2 [+0.0; +0.5]<br>-0.0 [-0.2; +0.2] |
| M1 + fallback (tham số website) − hệ thống hiện tại (cùng ngưỡng 0,01 / 0,2) — toàn bộ | +6.72 ± 0.18 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +6.04 ± 0.69 | +6.6 [+6.0; +7.3]<br>+6.7 [+6.1; +7.4]<br>+7.0 [+6.4; +7.6]<br>+6.8 [+6.1; +7.5]<br>+6.6 [+5.8; +7.3] |
| M1 chỉ luật − luật một cấp chỉ luật (tham số validation) — toàn bộ | +0.56 ± 0.15 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +0.75 ± 0.16 | +0.5 [+0.4; +0.7]<br>+0.8 [+0.6; +1.0]<br>+0.6 [+0.4; +0.8]<br>+0.6 [+0.4; +0.8]<br>+0.3 [+0.2; +0.5] |

### R1: khai phá M1 (tham số đã chọn, học trên train ∪ validation)

- Độ dài giao dịch trung bình: 1.82 ± 0.01 sản phẩm → 3.43 ± 0.02 nút sau khi thêm danh mục (dài nhất 10 ± 0).
- Tập khai phá ở ngưỡng thấp nhất: 1770 ± 96; bỏ tập tầm thường (item + tổ tiên): 1260 ± 84; dưới ngưỡng riêng của cấp: 44 ± 4; giữ lại 466 ± 15 (level-1 8 ± 3, level-2 169 ± 3, mixed 288 ± 11).
- Luật 1 ⇒ 1 dùng được (lift > 1, ≥ conf): 227 ± 12 (level-1 2 ± 4, level-2 129 ± 3, mixed 96 ± 7); luật một cấp cùng tham số validation của luật một cấp: 662 ± 17 luật (mọi dạng).
- Luật dư thừa theo luật tổ tiên (Ví dụ 7.2, sai lệch support và confidence ≤ 10% so với kỳ vọng): 21 ± 5 — chỉ thống kê, không loại khỏi xếp hạng (gợi ý từ luật dư thừa gần như trùng điểm với luật tổ tiên).

## 3. R1b: toàn bộ truy vấn test (5 seed)

TB ± SD qua seed; KTC theo đơn = trung bình cận dưới/trên của KTC bootstrap theo đơn trong từng seed.

| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Có gợi ý từ luật | Có luật cấp danh mục/trộn cấp |
|---|---:|---:|---|---:|---:|---:|---:|
| Category-Based (cùng danh mục → bán chạy) | 5.6 ± 0.4 | 16.8 ± 1.2 | [15.7; 17.9] | 26.6 ± 1.4 | 87.5 ± 0.0 | 0.0 ± 0.0 | – |
| Hệ thống hiện tại – luật + fallback | 11.7 ± 0.3 | 36.8 ± 0.9 | [35.1; 38.6] | 47.4 ± 0.7 | 89.6 ± 0.0 | 63.8 ± 0.8 | – |
| Luật một cấp – chỉ luật (tham số validation) | 16.2 ± 0.4 | 53.4 ± 1.0 | [51.3; 55.4] | 58.3 ± 1.0 | 69.2 ± 3.4 | 95.6 ± 0.6 | – |
| Luật một cấp + fallback (tham số validation) | 17.2 ± 0.4 | 55.9 ± 1.0 | [53.9; 57.9] | 63.1 ± 1.0 | 86.3 ± 2.4 | 95.6 ± 0.6 | – |
| M1 + fallback (tham số website, uniform) | 13.7 ± 0.2 | 44.1 ± 0.6 | [42.3; 46.1] | 54.0 ± 0.9 | 78.8 ± 0.9 | 85.6 ± 0.4 | 82.5 ± 0.5 |
| M1 – chỉ luật (tham số validation) | 17.4 ± 0.3 | 56.2 ± 0.9 | [54.2; 58.2] | 63.5 ± 0.9 | 80.0 ± 3.8 | 100.0 ± 0.0 | 67.4 ± 3.1 |
| M1 + fallback (tham số validation) | 17.4 ± 0.3 | 56.3 ± 0.9 | [54.3; 58.3] | 63.8 ± 0.8 | 81.3 ± 4.2 | 100.0 ± 0.0 | 67.4 ± 3.1 |

### R1b: nhóm sản phẩm ít giao dịch

5/5 seed có truy vấn hiếm; trung bình 62 truy vấn/seed (tổng 308). Coverage nhóm = số sản phẩm khác nhau trong các danh sách của nhóm / số sản phẩm; "SP hiếm được gợi ý" = tỷ lệ sản phẩm hiếm xuất hiện trong ít nhất một danh sách test.

| Phương pháp | Recall@5 | KTC theo đơn | Hit@5 | Coverage nhóm | Có gợi ý từ luật | Có luật cấp danh mục/trộn cấp | SP hiếm được gợi ý | Recall gộp mọi seed |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Category-Based (cùng danh mục → bán chạy) | 0.0 ± 0.0 | [0.0; 0.0] | 0.0 ± 0.0 | 43.8 ± 0.0 | 0.0 ± 0.0 | – | 42.9 ± 0.0 | 0.0 |
| Hệ thống hiện tại – luật + fallback | 0.0 ± 0.0 | [0.0; 0.0] | 0.0 ± 0.0 | 43.8 ± 0.0 | 0.0 ± 0.0 | – | 42.9 ± 0.0 | 0.0 |
| Luật một cấp – chỉ luật (tham số validation) | 16.7 ± 18.0 | [9.2; 24.9] | 21.3 ± 20.4 | 3.3 ± 3.5 | 23.0 ± 22.2 | – | 22.9 ± 23.9 | 16.6 |
| Luật một cấp + fallback (tham số validation) | 16.7 ± 18.0 | [9.2; 24.9] | 21.3 ± 20.4 | 45.8 ± 2.6 | 23.0 ± 22.2 | – | 62.9 ± 19.2 | 16.6 |
| M1 + fallback (tham số website, uniform) | 0.0 ± 0.0 | [0.0; 0.0] | 0.0 ± 0.0 | 43.8 ± 0.0 | 78.4 ± 6.8 | 78.4 ± 6.8 | 28.6 ± 0.0 | 0.0 |
| M1 – chỉ luật (tham số validation) | 37.7 ± 18.3 | [25.3; 51.1] | 44.7 ± 17.9 | 41.7 ± 7.7 | 100.0 ± 0.0 | 100.0 ± 0.0 | 22.9 ± 23.9 | 36.9 |
| M1 + fallback (tham số validation) | 37.7 ± 18.3 | [25.3; 51.1] | 44.7 ± 17.9 | 47.5 ± 5.0 | 100.0 ± 0.0 | 100.0 ± 0.0 | 31.4 ± 23.5 | 36.9 |

### R1b: so sánh cặp (cùng truy vấn, bootstrap theo đơn trong từng seed)

| So sánh | ΔRecall@5 (điểm %, TB ± SD) | Số seed | ΔHit@5 | ΔRecall từng seed [KTC theo đơn] |
|---|---:|---|---:|---|
| M1 + fallback (validation) − hệ thống hiện tại — toàn bộ | +19.47 ± 1.21 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +16.39 ± 0.93 | +18.5 [+16.9; +20.0]<br>+21.4 [+19.8; +22.9]<br>+18.4 [+16.8; +19.9]<br>+19.3 [+17.9; +20.8]<br>+19.8 [+18.2; +21.4] |
| M1 + fallback (validation) − hệ thống hiện tại — **nhóm hiếm** | +37.70 ± 18.34 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +44.69 ± 17.86 | +15.5 [+8.7; +24.6]<br>+63.3 [+46.8; +78.6]<br>+26.4 [+16.1; +38.5]<br>+37.3 [+23.4; +51.4]<br>+45.9 [+31.8; +62.2] |
| M1 + fallback − luật một cấp + fallback (cả hai chọn tham số trên validation) — toàn bộ | +0.43 ± 0.36 | 5/5 dương · 2 có KTC > 0 · 0 có KTC < 0 | +0.62 ± 0.57 | +0.6 [-0.0; +1.1]<br>+0.9 [+0.4; +1.4]<br>+0.5 [+0.0; +1.1]<br>+0.1 [-0.3; +0.6]<br>+0.0 [-0.6; +0.5] |
| M1 + fallback − luật một cấp + fallback (cả hai chọn tham số trên validation) — **nhóm hiếm** | +20.95 ± 4.86 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +23.34 ± 7.48 | +15.5 [+8.7; +24.6]<br>+20.0 [+10.6; +30.9]<br>+26.4 [+16.1; +38.5]<br>+17.3 [+9.9; +25.7]<br>+25.5 [+15.7; +36.7] |
| M1 + fallback (tham số website) − hệ thống hiện tại (cùng ngưỡng 0,01 / 0,2) — toàn bộ | +7.30 ± 0.64 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +6.63 ± 0.89 | +6.8 [+5.9; +7.7]<br>+8.0 [+7.1; +9.0]<br>+7.7 [+6.7; +8.7]<br>+6.5 [+5.6; +7.3]<br>+7.6 [+6.4; +8.7] |
| M1 + fallback (tham số website) − hệ thống hiện tại (cùng ngưỡng 0,01 / 0,2) — **nhóm hiếm** | +0.00 ± 0.00 | 0/5 dương · 0 có KTC > 0 · 0 có KTC < 0 | +0.00 ± 0.00 | +0.0 [+0.0; +0.0]<br>+0.0 [+0.0; +0.0]<br>+0.0 [+0.0; +0.0]<br>+0.0 [+0.0; +0.0]<br>+0.0 [+0.0; +0.0] |
| M1 chỉ luật − luật một cấp chỉ luật (tham số validation) — toàn bộ | +2.81 ± 0.47 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +5.19 ± 0.73 | +3.2 [+2.8; +3.6]<br>+3.1 [+2.7; +3.4]<br>+3.1 [+2.7; +3.5]<br>+2.1 [+1.7; +2.5]<br>+2.6 [+2.3; +2.9] |
| M1 chỉ luật − luật một cấp chỉ luật (tham số validation) — **nhóm hiếm** | +20.95 ± 4.86 | 5/5 dương · 5 có KTC > 0 · 0 có KTC < 0 | +23.34 ± 7.48 | +15.5 [+8.7; +24.6]<br>+20.0 [+10.6; +30.9]<br>+26.4 [+16.1; +38.5]<br>+17.3 [+9.9; +25.7]<br>+25.5 [+15.7; +36.7] |

### R1b: khai phá M1 (tham số đã chọn, học trên train ∪ validation)

- Độ dài giao dịch trung bình: 1.78 ± 0.01 sản phẩm → 3.41 ± 0.01 nút sau khi thêm danh mục (dài nhất 10 ± 0).
- Tập khai phá ở ngưỡng thấp nhất: 1453 ± 40; bỏ tập tầm thường (item + tổ tiên): 843 ± 28; dưới ngưỡng riêng của cấp: 73 ± 13; giữ lại 537 ± 14 (level-1 18 ± 13, level-2 140 ± 3, mixed 378 ± 8).
- Luật 1 ⇒ 1 dùng được (lift > 1, ≥ conf): 243 ± 20 (level-1 6 ± 6, level-2 121 ± 5, mixed 116 ± 17); luật một cấp cùng tham số validation của luật một cấp: 324 ± 17 luật (mọi dạng).
- Luật dư thừa theo luật tổ tiên (Ví dụ 7.2, sai lệch support và confidence ≤ 10% so với kỳ vọng): 22 ± 4 — chỉ thống kê, không loại khỏi xếp hạng (gợi ý từ luật dư thừa gần như trùng điểm với luật tổ tiên).

## 4. Thời gian và bộ nhớ

Benchmark riêng (`node scripts/benchmark-multilevel.js`, 12th Gen Intel(R) Core(TM) i7-1255U, Node v20.20.2): mỗi lượt đo chạy trong tiến trình con riêng (--expose-gc), trung vị 15 lần sau 1 lần chạy lạnh, cùng giao dịch lịch sử (16000 đơn) và cùng ngưỡng cho mọi cấp. "Một cấp" = giao dịch sản phẩm; "đa mức" = giao dịch đã thêm danh mục. "Toàn bộ" = khai phá + lọc + sinh luật (mine() so với fitMultilevel()).

| Hồ sơ | min_sup | Itemsets một cấp → đa mức | Apriori ms một cấp → đa mức | FP-Growth ms một cấp → đa mức | RSS đỉnh MB A / FP (đa mức) | Toàn bộ FP ms một cấp → M1 | Trùng A = FP |
|---|---:|---|---|---|---|---|:---:|
| r1 | 0.01 | 92 → 556 | 19.3 → 105.8 | 26.0 → 37.1 | 5.5 / 7.1 | 24.9 → 83.9 | ✔ 5/5 |
| r1 | 0.005 | 130 → 985 | 21.1 → 122.2 | 25.1 → 41.4 | 7.2 / 7.4 | 24.0 → 84.4 | ✔ 5/5 |
| r1 | 0.002 | 169 → 1770 | 20.8 → 134.6 | 24.8 → 41.0 | 6.5 / 7.9 | 24.9 → 90.3 | ✔ 5/5 |
| r1b | 0.01 | 61 → 288 | 17.3 → 73.9 | 26.2 → 50.2 | 6.0 / 8.5 | 29.8 → 91.4 | ✔ 5/5 |
| r1b | 0.005 | 88 → 600 | 18.3 → 97.7 | 26.1 → 49.0 | 7.0 / 8.8 | 26.4 → 91.5 | ✔ 5/5 |
| r1b | 0.002 | 140 → 1453 | 19.7 → 129.4 | 28.9 → 53.0 | 7.1 / 12.3 | 28.1 → 116.4 | ✔ 5/5 |

Thời gian/bộ nhớ phụ thuộc máy; chỉ dùng để so tương đối.

## 5. Kết luận (sinh tự động từ số liệu)

- **R1, toàn bộ**: M1 − luật một cấp (cùng chọn tham số trên validation) = +0.22 điểm Recall@5 (SD 0.16); 3/5 seed có KTC theo đơn nằm trên 0, 0/5 nằm dưới 0. So với hệ thống hiện tại: +17.7 điểm (phần lớn đến từ việc chọn ngưỡng, xem dòng luật một cấp).
- **R1b, toàn bộ**: M1 − luật một cấp (cùng chọn tham số trên validation) = +0.43 điểm Recall@5 (SD 0.36); 2/5 seed có KTC theo đơn nằm trên 0, 0/5 nằm dưới 0. So với hệ thống hiện tại: +19.5 điểm (phần lớn đến từ việc chọn ngưỡng, xem dòng luật một cấp).
- **R1b, sản phẩm ít giao dịch**: M1 − luật một cấp = +21.0 điểm Recall@5 (SD 4.9); 5/5 seed có KTC theo đơn nằm trên 0. So với hệ thống hiện tại: +37.7 điểm.

## 6. Hạn chế

- Dữ liệu giả lập với luật mua kèm cài sẵn. Sản phẩm hiếm của R1b có quan hệ mua kèm theo **thương hiệu** (vd. Galaxy S24 FE → củ sạc Samsung), đúng loại cấu trúc mà luật danh mục nắm bắt được; không suy ra được mức cải thiện trên dữ liệu thật.
- Nhóm hiếm nhỏ (vài chục truy vấn mỗi seed, 7 sản phẩm) nên KTC rộng; R1 không có sản phẩm hiếm theo định nghĩa này.
- Sản phẩm hiếm khi là **đáp án** (vd. ốp lưng Galaxy S24 FE) vẫn khó được gợi ý: ánh xạ danh mục → sản phẩm ưu tiên sản phẩm phổ biến trong danh mục, nên tỷ lệ sản phẩm hiếm từng được gợi ý của M1 + fallback THẤP hơn luật một cấp + fallback (cột "SP hiếm được gợi ý").
- Coverage toàn danh mục của M1 + fallback thấp hơn luật một cấp + fallback: luật danh mục lấp các chỗ trống mà trước đây fallback dùng, và chúng dồn về các sản phẩm phổ biến.
- M1 với tham số website (uniform 0,01) có nhiều gợi ý từ luật danh mục cho sản phẩm hiếm nhưng Recall nhóm hiếm vẫn 0%: ở ngưỡng này các luật danh mục chỉ trỏ tới phụ kiện phổ biến, không trúng phụ kiện của máy hiếm. Lợi ích ở nhóm hiếm chỉ xuất hiện khi ngưỡng sản phẩm thấp (0,002) để có các tập trộn cấp như {danh mục Samsung, củ sạc Samsung}.
- Mức cải thiện chung so với hệ thống hiện tại (+17,7 / +19,5 điểm) chủ yếu do chọn ngưỡng trên validation (luật một cấp đã đạt +17,5 / +19,0 ở Bước 2); phần riêng của M1 trên toàn bộ truy vấn chỉ +0,2 / +0,4 điểm.
- Hệ phân cấp chỉ có 2 cấp và danh mục là thương hiệu/loại phụ kiện; chưa thử cấp "Điện thoại/Phụ kiện" vì dữ liệu không có.
- Ngưỡng sản phẩm tốt nhất vẫn nằm ở biên dưới của lưới (0,002 — giới hạn của API), như Bước 2.
- Luật dư thừa chỉ được thống kê, chưa thử loại bỏ khi xếp hạng.

## 7. Tái lập

```
node scripts/evaluate-multilevel.js                               # 2 hồ sơ × 5 seed
node scripts/evaluate-multilevel.js --profile r1b --seed 20261103  # một bộ
node scripts/benchmark-multilevel.js
node --test test/
```
