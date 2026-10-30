# Giai đoạn 4 – Bước 4: M2 — Khai phá mẫu phổ biến có ràng buộc (mục 7.3)

Tạo lúc: 2026-10-27T02:38:27.052Z · Node v20.20.2 · `node scripts/evaluate-constraints.js` · tổng 170 s (đánh giá 166 s).

OFFLINE: dữ liệu sinh lại từ seed, không đọc `.env`, không kết nối MongoDB, không gọi API. Code M2 nằm trong `research/constraints/`; Apriori/FP-Growth trong `src/` không bị sửa. API, UI và tham số website không đổi.

## 1. Phân loại ràng buộc (mục 7.3.2, Bảng 7.2) và cách áp dụng

| Ràng buộc | Mức | Tính chất | Áp dụng |
|---|---|---|---|
| A1: metarule {p} ⇒ {q}: một sản phẩm ⇒ một sản phẩm | M2-A (luật) | ràng buộc cú pháp (metarule) | lọc luật và fallback khi xếp hạng |
| A2: điện thoại(p) ⇒ phụ kiện(q): không gợi ý điện thoại khi đang xem điện thoại | M2-A (luật) | ràng buộc luật | lọc luật và fallback khi xếp hạng |
| A3: p, q tương thích: ốp lưng/kính cường lực đúng dòng máy | M2-A (luật) | ràng buộc luật | lọc luật và fallback khi xếp hạng |
| A4: q còn hàng | M2-A (luật) | ràng buộc dữ liệu (chỉ vế phải) | lọc luật và fallback khi xếp hạng |
| B1: count(S) ≤ 2 (suy từ A1) | M2-B (tập mục) | anti-monotone, weakly succinct | **cắt tỉa trong khai phá** |
| B2: count(S ∩ điện thoại) ≤ 1 (suy từ A2) | M2-B | anti-monotone | **cắt tỉa trong khai phá** |
| B3: không có cặp không tương thích (suy từ A3) | M2-B | anti-monotone (cặp xung đột còn trong mọi tập cha) | **cắt tỉa trong khai phá** (FP-Growth: cả cắt tỉa dữ liệu trong cơ sở mẫu điều kiện) |
| Không có item cùng tổ tiên (cấp đa mức) | M2-B | anti-monotone | **cắt tỉa trong khai phá** (thay bước bỏ tập tầm thường của M1) |
| A4 "còn hàng" dạng S ⊆ còn hàng | – | anti-monotone, succinct | **không đẩy**: sản phẩm đang xem có thể hết hàng mà vẫn cần luật; A4 chỉ áp cho vế phải |
| "S chứa ít nhất một phụ kiện" (S ∩ V ≠ ∅), sum ≥ v, avg ≤ v | – | monotone / convertible | không cắt tỉa trực tiếp được — chỉ có test minh họa, không dùng |

Ràng buộc A1–A3 là ràng buộc luật; B1–B3 là điều kiện cần của chúng trên tập mục. Vì B1–B3 anti-monotone, mọi tập con của tập thỏa ràng buộc cũng thỏa, nên support cần cho confidence luôn có sẵn và luật 1 ⇒ 1 thu được **không đổi** so với hậu lọc (có test và kiểm tra lúc chạy).

Tri thức nghiệp vụ được khai báo, không suy từ bộ sinh dữ liệu: danh mục điện thoại = iPhone, Samsung, Xiaomi, OPPO, Vivo, Nokia; ốp lưng/kính cường lực gắn với dòng máy trong tên ("Ốp lưng silicon iPhone 15" chỉ hợp "iPhone 15 …"); sạc, cáp, tai nghe, pin dùng chuẩn chung nên hợp với mọi máy.

Giao thức như Bước 1–3: chia theo thời gian 0.7/0.1/0.2, Top-5, tham số mọi phương pháp chọn trên validation (lưới như Bước 2–3), chấm test một lần, KTC 95% bootstrap theo **đơn hàng** (1000 lần). **Mức hợp lý nghiệp vụ** = tỷ lệ sản phẩm gợi ý thỏa A2–A4 với sản phẩm đang xem. Chỉ số này dùng chính các ràng buộc của M2, nên M2 đạt 100% theo cách xây dựng; ý nghĩa của nó là cho thấy các phương pháp khác gợi ý bao nhiêu sản phẩm không hợp lý.

## 2. Bộ dữ liệu

Bộ sinh `trungshop-research-generator/1.0.0`; checksum **trùng khớp** manifest Bước 2; dữ liệu demo GR2 không đổi.

| Bộ | Checksum | Giây | Một cấp (sup, conf) | M2 một cấp (sup, conf) | M2 + M1 (sp/dm, conf, policy) | Cắt tỉa = hậu lọc (một cấp / đa mức) |
|---|---|---:|---|---|---|:---:|
| R1-seed20261101-n20000 | `e84322bb341aeb1d1ba300c07f06479f79de67dc` | 15.1 | 0.002, 0 | 0.002, 0 | 0.002/0.1, 0, specific-first | ✔ / ✔ |
| R1-seed20261102-n20000 | `44fe1e131afbb1862217d54b1e75bb6da30f2c82` | 15.1 | 0.002, 0.05 | 0.003, 0.05 | 0.003/0.1, 0.05, specific-first | ✔ / ✔ |
| R1-seed20261103-n20000 | `a1ba0842b514a0d90c6f8c031f44f854a4bde055` | 15.3 | 0.002, 0 | 0.002, 0 | 0.002/0.05, 0, specific-first | ✔ / ✔ |
| R1-seed20261104-n20000 | `0bfe7974f9f9c3b7f8a5fb95fde7d5db85b4f516` | 15.2 | 0.002, 0 | 0.002, 0 | 0.002/0.1, 0.05, specific-first | ✔ / ✔ |
| R1-seed20261105-n20000 | `9e9304d550364a18860559bbcac3f2b75dcf5df4` | 15.9 | 0.002, 0 | 0.002, 0 | 0.002/0.05, 0, specific-first | ✔ / ✔ |
| R1B-seed20261101-n20000 | `ac2ea12f86d60fe2c435b4a72ce9552d29e5cf99` | 16.9 | 0.002, 0 | 0.002, 0 | 0.002/0.01, 0, specific-first | ✔ / ✔ |
| R1B-seed20261102-n20000 | `f3a0bdff2ba16671b3a6fecf88c71c905f0fdb1a` | 17.0 | 0.002, 0 | 0.002, 0 | 0.002/0.1, 0, specific-first | ✔ / ✔ |
| R1B-seed20261103-n20000 | `77216bf5d1a45a1f03520553f78abdb3d31e37e0` | 17.1 | 0.002, 0 | 0.002, 0 | 0.002/0.1, 0, specific-first | ✔ / ✔ |
| R1B-seed20261104-n20000 | `2d8eab061401c0772d6761aa132968b98f5c89c7` | 17.8 | 0.002, 0 | 0.002, 0 | 0.002/0.1, 0, specific-first | ✔ / ✔ |
| R1B-seed20261105-n20000 | `7cbbe3fca4ce39cce3d01696788d0589442cca16` | 20.7 | 0.002, 0 | 0.002, 0 | 0.002/0.1, 0, specific-first | ✔ / ✔ |

## 3. R1: toàn bộ truy vấn test (5 seed, TB ± SD)

| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Có gợi ý từ luật | Gợi ý hợp lý nghiệp vụ | Truy vấn có cả 5 gợi ý hợp lý |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Hệ thống hiện tại – luật + fallback | 22.6 ± 0.4 | 64.3 ± 0.8 | [62.6; 65.9] | 70.3 ± 0.9 | 97.6 ± 0.0 | 83.7 ± 0.6 | 71.8 ± 0.7 | 42.8 ± 1.2 |
| Luật một cấp + fallback (validation) | 28.5 ± 0.4 | 81.8 ± 0.3 | [80.4; 83.1] | 84.1 ± 0.4 | 89.8 ± 1.1 | 98.8 ± 0.1 | 83.0 ± 1.0 | 52.4 ± 5.9 |
| M1 + fallback (validation) | 28.5 ± 0.4 | 82.0 ± 0.5 | [80.6; 83.3] | 84.3 ± 0.5 | 83.4 ± 1.1 | 99.8 ± 0.5 | 86.0 ± 0.6 | 59.2 ± 3.6 |
| M2 một cấp – chỉ luật (validation) | 28.3 ± 0.4 | 81.0 ± 0.3 | [79.6; 82.4] | 83.1 ± 0.3 | 73.2 ± 1.7 | 98.7 ± 0.3 | 100.0 ± 0.0 | 100.0 ± 0.0 |
| M2 một cấp + fallback có ràng buộc (validation) | 28.5 ± 0.4 | 81.7 ± 0.2 | [80.4; 83.1] | 84.1 ± 0.4 | 73.2 ± 1.7 | 98.7 ± 0.3 | 100.0 ± 0.0 | 100.0 ± 0.0 |
| M2 + M1 – chỉ luật (validation) | 28.4 ± 0.4 | 81.5 ± 0.5 | [80.1; 82.8] | 83.6 ± 0.3 | 73.2 ± 1.7 | 99.8 ± 0.5 | 100.0 ± 0.0 | 100.0 ± 0.0 |
| M2 + M1 + fallback có ràng buộc (validation) | 28.5 ± 0.4 | 81.9 ± 0.4 | [80.6; 83.2] | 84.3 ± 0.3 | 73.2 ± 1.7 | 99.8 ± 0.5 | 100.0 ± 0.0 | 100.0 ± 0.0 |

Số gợi ý vi phạm (trung bình mỗi seed, trên toàn bộ danh sách test):

| Phương pháp | A2 điện thoại ⇒ điện thoại | A3 không tương thích |
|---|---:|---:|
| Hệ thống hiện tại – luật + fallback | 4782 | 2976 |
| Luật một cấp + fallback (validation) | 3239 | 1436 |
| M1 + fallback (validation) | 981 | 2870 |
| M2 một cấp – chỉ luật (validation) | – | – |
| M2 một cấp + fallback có ràng buộc (validation) | – | – |
| M2 + M1 – chỉ luật (validation) | – | – |
| M2 + M1 + fallback có ràng buộc (validation) | – | – |

### R1: nhóm sản phẩm ít giao dịch

Không có sản phẩm nào dưới ngưỡng 0.5% số đơn lịch sử ở R1.

### R1: so sánh cặp (cùng truy vấn; KTC bootstrap theo đơn trong từng seed)

| So sánh | ΔRecall@5 | ΔPrecision@5 | ΔHit@5 | ΔTỷ lệ gợi ý hợp lý | Số seed có ý nghĩa (Recall) |
|---|---:|---:|---:|---:|---|
| M2 một cấp − luật một cấp (cả hai + fallback, tham số validation) — toàn bộ | -0.02 ± 0.16 | -0.01 ± 0.03 | -0.05 ± 0.17 | +17.00 ± 1.04 | 0/5 KTC > 0 · 0/5 KTC < 0 |
| M2 + M1 − M1 (cả hai + fallback, tham số validation) — toàn bộ | -0.04 ± 0.11 | -0.01 ± 0.03 | -0.04 ± 0.16 | +14.01 ± 0.60 | 0/5 KTC > 0 · 0/5 KTC < 0 |
| M2 + M1 − luật một cấp — toàn bộ | +0.17 ± 0.13 | +0.03 ± 0.02 | +0.15 ± 0.09 | +17.00 ± 1.04 | 1/5 KTC > 0 · 0/5 KTC < 0 |
| M2 một cấp − hệ thống hiện tại — toàn bộ | +17.45 ± 0.67 | +5.90 ± 0.30 | +13.76 ± 0.97 | +28.22 ± 0.75 | 5/5 KTC > 0 · 0/5 KTC < 0 |

Đơn vị: điểm phần trăm; TB ± SD qua seed.

### R1: cắt tỉa ↔ hậu lọc trong lần chạy đánh giá (tham số M2 đã chọn, train ∪ validation)

Tập mục và danh sách gợi ý giống hệt ở 5/5 seed (một cấp) và 5/5 seed (đa mức), cho cả Apriori và FP-Growth. Thời gian dưới đây đo trong tiến trình đánh giá (5 lần, trung vị), chỉ để tham khảo; số đo có kiểm soát ở mục 4.

| Cấp | Biến thể | Khai phá ms | Tập giữ | Candidate được đếm (Apriori) | Bị loại trước khi đếm | Cây điều kiện (FP) | Item bỏ khỏi cơ sở mẫu |
|---|---|---:|---:|---:|---:|---:|---:|
| một cấp | apriori-push | 12.7 | 109 | 337 | 532 | – | – |
| một cấp | apriori-post | 16.4 | 109 | 886 | – | – | – |
| một cấp | fpgrowth-push | 11.7 | 109 | – | – | 96 | 1093 |
| một cấp | fpgrowth-post | 10.7 | 109 | – | – | 118 | – |
| đa mức | apriori-push | 31.2 | 205 | 576 | 917 | – | – |
| đa mức | apriori-post | 116.6 | 205 | 2769 | – | – | – |
| đa mức | fpgrowth-push | 21.0 | 205 | – | – | 206 | 4901 |
| đa mức | fpgrowth-post | 20.0 | 205 | – | – | 372 | – |

## 3. R1b: toàn bộ truy vấn test (5 seed, TB ± SD)

| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Có gợi ý từ luật | Gợi ý hợp lý nghiệp vụ | Truy vấn có cả 5 gợi ý hợp lý |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Hệ thống hiện tại – luật + fallback | 11.7 ± 0.3 | 36.8 ± 0.9 | [35.1; 38.6] | 47.4 ± 0.7 | 89.6 ± 0.0 | 63.8 ± 0.8 | 54.3 ± 0.2 | 35.8 ± 0.3 |
| Luật một cấp + fallback (validation) | 17.2 ± 0.4 | 55.9 ± 1.0 | [53.9; 57.9] | 63.1 ± 1.0 | 86.3 ± 2.4 | 95.6 ± 0.6 | 72.6 ± 1.0 | 39.4 ± 2.3 |
| M1 + fallback (validation) | 17.4 ± 0.3 | 56.3 ± 0.9 | [54.3; 58.3] | 63.8 ± 0.8 | 81.3 ± 4.2 | 100.0 ± 0.0 | 74.1 ± 0.9 | 43.1 ± 2.4 |
| M2 một cấp – chỉ luật (validation) | 16.2 ± 0.4 | 53.4 ± 1.0 | [51.3; 55.4] | 58.3 ± 1.0 | 69.2 ± 3.4 | 95.6 ± 0.6 | 100.0 ± 0.0 | 100.0 ± 0.0 |
| M2 một cấp + fallback có ràng buộc (validation) | 17.5 ± 0.3 | 56.6 ± 0.7 | [54.6; 58.5] | 64.1 ± 0.8 | 69.2 ± 3.4 | 95.6 ± 0.6 | 100.0 ± 0.0 | 100.0 ± 0.0 |
| M2 + M1 – chỉ luật (validation) | 16.7 ± 0.4 | 54.8 ± 1.0 | [52.8; 56.8] | 60.6 ± 0.9 | 69.2 ± 3.4 | 99.3 ± 1.4 | 100.0 ± 0.0 | 100.0 ± 0.0 |
| M2 + M1 + fallback có ràng buộc (validation) | 17.6 ± 0.3 | 56.9 ± 0.9 | [55.0; 58.9] | 64.5 ± 0.8 | 69.2 ± 3.4 | 99.3 ± 1.4 | 100.0 ± 0.0 | 100.0 ± 0.0 |

Số gợi ý vi phạm (trung bình mỗi seed, trên toàn bộ danh sách test):

| Phương pháp | A2 điện thoại ⇒ điện thoại | A3 không tương thích |
|---|---:|---:|
| Hệ thống hiện tại – luật + fallback | 7745 | 3881 |
| Luật một cấp + fallback (validation) | 5268 | 1697 |
| M1 + fallback (validation) | 2189 | 4394 |
| M2 một cấp – chỉ luật (validation) | – | – |
| M2 một cấp + fallback có ràng buộc (validation) | – | – |
| M2 + M1 – chỉ luật (validation) | – | – |
| M2 + M1 + fallback có ràng buộc (validation) | – | – |

### R1b: nhóm sản phẩm ít giao dịch

5/5 seed có truy vấn hiếm, trung bình 62 truy vấn/seed.

| Phương pháp | Recall@5 | KTC theo đơn | Hit@5 | Coverage nhóm | Có gợi ý từ luật | Gợi ý hợp lý | SP hiếm được gợi ý | Recall gộp |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| Hệ thống hiện tại – luật + fallback | 0.0 ± 0.0 | [0.0; 0.0] | 0.0 ± 0.0 | 43.8 ± 0.0 | 0.0 ± 0.0 | 11.4 ± 2.5 | 42.9 ± 0.0 | 0.0 |
| Luật một cấp + fallback (validation) | 16.7 ± 18.0 | [9.2; 24.9] | 21.3 ± 20.4 | 45.8 ± 2.6 | 23.0 ± 22.2 | 16.0 ± 6.7 | 62.9 ± 19.2 | 16.6 |
| M1 + fallback (validation) | 37.7 ± 18.3 | [25.3; 51.1] | 44.7 ± 17.9 | 47.5 ± 5.0 | 100.0 ± 0.0 | 22.8 ± 6.5 | 31.4 ± 23.5 | 36.9 |
| M2 một cấp – chỉ luật (validation) | 16.7 ± 18.0 | [9.2; 24.9] | 21.3 ± 20.4 | 3.3 ± 3.5 | 23.0 ± 22.2 | 100.0 ± 0.0 | 22.9 ± 23.9 | 16.6 |
| M2 một cấp + fallback có ràng buộc (validation) | 26.1 ± 16.4 | [15.9; 37.3] | 36.6 ± 19.0 | 13.8 ± 3.5 | 23.0 ± 22.2 | 100.0 ± 0.0 | 22.9 ± 23.9 | 25.6 |
| M2 + M1 – chỉ luật (validation) | 40.4 ± 18.9 | [27.2; 54.7] | 45.5 ± 16.5 | 12.1 ± 3.1 | 91.7 ± 18.6 | 100.0 ± 0.0 | 22.9 ± 23.9 | 39.4 |
| M2 + M1 + fallback có ràng buộc (validation) | 43.4 ± 18.9 | [30.0; 57.3] | 51.4 ± 16.6 | 20.0 ± 3.5 | 91.7 ± 18.6 | 100.0 ± 0.0 | 22.9 ± 23.9 | 42.4 |

### R1b: so sánh cặp (cùng truy vấn; KTC bootstrap theo đơn trong từng seed)

| So sánh | ΔRecall@5 | ΔPrecision@5 | ΔHit@5 | ΔTỷ lệ gợi ý hợp lý | Số seed có ý nghĩa (Recall) |
|---|---:|---:|---:|---:|---|
| M2 một cấp − luật một cấp (cả hai + fallback, tham số validation) — toàn bộ | +0.71 ± 0.34 | +0.27 ± 0.15 | +0.98 ± 0.44 | +27.40 ± 1.01 | 3/5 KTC > 0 · 0/5 KTC < 0 |
| M2 một cấp − luật một cấp (cả hai + fallback, tham số validation) — **nhóm hiếm** | +9.31 ± 2.52 | +3.04 ± 0.53 | +15.20 ± 2.67 | +83.99 ± 6.66 | 5/5 KTC > 0 · 0/5 KTC < 0 |
| M2 + M1 − M1 (cả hai + fallback, tham số validation) — toàn bộ | +0.63 ± 0.49 | +0.22 ± 0.16 | +0.72 ± 0.71 | +25.90 ± 0.91 | 3/5 KTC > 0 · 0/5 KTC < 0 |
| M2 + M1 − M1 (cả hai + fallback, tham số validation) — **nhóm hiếm** | +5.67 ± 3.34 | +2.27 ± 1.33 | +6.74 ± 2.72 | +77.18 ± 6.49 | 4/5 KTC > 0 · 0/5 KTC < 0 |
| M2 + M1 − luật một cấp — toàn bộ | +1.05 ± 0.36 | +0.39 ± 0.13 | +1.34 ± 0.50 | +27.40 ± 1.01 | 5/5 KTC > 0 · 0/5 KTC < 0 |
| M2 + M1 − luật một cấp — **nhóm hiếm** | +26.62 ± 6.44 | +7.86 ± 2.39 | +30.09 ± 7.91 | +83.99 ± 6.66 | 5/5 KTC > 0 · 0/5 KTC < 0 |
| M2 một cấp − hệ thống hiện tại — toàn bộ | +19.75 ± 0.92 | +5.80 ± 0.34 | +16.75 ± 0.66 | +45.72 ± 0.22 | 5/5 KTC > 0 · 0/5 KTC < 0 |
| M2 một cấp − hệ thống hiện tại — **nhóm hiếm** | +26.05 ± 16.38 | +7.31 ± 3.79 | +36.55 ± 18.96 | +88.59 ± 2.50 | 5/5 KTC > 0 · 0/5 KTC < 0 |

Đơn vị: điểm phần trăm; TB ± SD qua seed.

### R1b: cắt tỉa ↔ hậu lọc trong lần chạy đánh giá (tham số M2 đã chọn, train ∪ validation)

Tập mục và danh sách gợi ý giống hệt ở 5/5 seed (một cấp) và 5/5 seed (đa mức), cho cả Apriori và FP-Growth. Thời gian dưới đây đo trong tiến trình đánh giá (5 lần, trung vị), chỉ để tham khảo; số đo có kiểm soát ở mục 4.

| Cấp | Biến thể | Khai phá ms | Tập giữ | Candidate được đếm (Apriori) | Bị loại trước khi đếm | Cây điều kiện (FP) | Item bỏ khỏi cơ sở mẫu |
|---|---|---:|---:|---:|---:|---:|---:|
| một cấp | apriori-push | 13.7 | 114 | 381 | 692 | – | – |
| một cấp | apriori-post | 19.3 | 114 | 1077 | – | – | – |
| một cấp | fpgrowth-push | 15.5 | 114 | – | – | 101 | 4841 |
| một cấp | fpgrowth-post | 13.9 | 114 | – | – | 105 | – |
| đa mức | apriori-push | 34.9 | 296 | 639 | 1398 | – | – |
| đa mức | apriori-post | 117.1 | 296 | 3790 | – | – | – |
| đa mức | fpgrowth-push | 42.4 | 296 | – | – | 321 | 19225 |
| đa mức | fpgrowth-post | 33.0 | 296 | – | – | 564 | – |

## 4. Chi phí khai phá có kiểm soát (benchmark riêng)

`node scripts/benchmark-constraints.js` · 12th Gen Intel(R) Core(TM) i7-1255U · Node v20.20.2 · 15 lần/lượt, mỗi lượt một tiến trình con, cùng 16000 đơn lịch sử. Chi tiết: `phase4-step4-m2-benchmark.md`.

| Hồ sơ | min_sup | Cấp | Apriori: hậu lọc → cắt tỉa ms (candidate đếm) | FP-Growth: hậu lọc → cắt tỉa ms | Thời gian lọc (A / FP) ms | Phần bao không ràng buộc A / FP ms (gốc) | Trùng |
|---|---:|---|---|---|---|---|:---:|
| r1 | 0.01 | một cấp | 15.5 → 13.4 (842 → 337) | 18.9 → 20.5 | 0.05 / 0.05 | 15.9 (15.4) / 19.3 (18.8) | ✔ |
| r1 | 0.01 | đa mức | 88.2 → 32.1 (1676 → 576) | 31.8 → 35.8 | 0.22 / 0.20 | 87.5 (87.9) / 30.2 (31.6) | ✔ |
| r1 | 0.005 | một cấp | 16.8 → 13.8 (870 → 337) | 19.3 → 20.3 | 0.06 / 0.07 | 16.7 (16.7) / 18.8 (19.2) | ✔ |
| r1 | 0.005 | đa mức | 101.1 → 31.5 (2102 → 576) | 31.7 → 35.7 | 0.23 / 0.25 | 105.8 (100.8) / 33.3 (31.4) | ✔ |
| r1 | 0.002 | một cấp | 16.7 → 13.7 (888 → 337) | 19.4 → 20.4 | 0.08 / 0.08 | 17.1 (16.6) / 19.5 (19.3) | ✔ |
| r1 | 0.002 | đa mức | 113.7 → 31.5 (2848 → 576) | 31.6 → 35.3 | 0.28 / 0.28 | 123.1 (113.5) / 27.0 (31.2) | ✔ |
| r1b | 0.01 | một cấp | 13.8 → 14.2 (823 → 337) | 21.5 → 24.6 | 0.05 / 0.05 | 14.8 (13.7) / 23.6 (21.4) | ✔ |
| r1b | 0.01 | đa mức | 58.7 → 34.0 (1438 → 576) | 36.8 → 49.6 | 0.20 / 0.22 | 61.2 (58.5) / 40.2 (36.5) | ✔ |
| r1b | 0.005 | một cấp | 14.9 → 14.2 (840 → 337) | 22.0 → 25.0 | 0.06 / 0.06 | 15.0 (14.8) / 24.2 (21.9) | ✔ |
| r1b | 0.005 | đa mức | 75.8 → 34.7 (1800 → 576) | 39.1 → 52.3 | 0.26 / 0.28 | 77.0 (75.5) / 40.8 (38.7) | ✔ |
| r1b | 0.002 | một cấp | 15.8 → 14.4 (1077 → 381) | 22.7 → 25.8 | 0.08 / 0.08 | 16.4 (15.7) / 24.6 (22.6) | ✔ |
| r1b | 0.002 | đa mức | 103.9 → 34.2 (3790 → 639) | 41.4 → 53.4 | 0.37 / 0.41 | 107.5 (103.3) / 41.5 (40.5) | ✔ |

## 5. Kết luận (sinh tự động từ số liệu)

- **R1**: gợi ý hợp lý nghiệp vụ tăng từ 83.0% (luật một cấp) / 86.0% (M1) lên 100% (M2, theo cách xây dựng). ΔRecall@5 M2 một cấp − luật một cấp = -0.02 điểm (0/5 seed KTC > 0, 0/5 KTC < 0); M2 + M1 − M1 = -0.04 điểm (0 > 0, 0 < 0). Coverage: 89.8% → 73.2% (một cấp), 83.4% → 73.2% (M1).
- **R1b**: gợi ý hợp lý nghiệp vụ tăng từ 72.6% (luật một cấp) / 74.1% (M1) lên 100% (M2, theo cách xây dựng). ΔRecall@5 M2 một cấp − luật một cấp = +0.71 điểm (3/5 seed KTC > 0, 0/5 KTC < 0); M2 + M1 − M1 = +0.63 điểm (3 > 0, 0 < 0). Coverage: 86.3% → 69.2% (một cấp), 81.3% → 69.2% (M1).
- **R1b, nhóm hiếm**: ΔRecall@5 M2 một cấp − luật một cấp = +9.3 điểm (5/5 KTC > 0, 0 KTC < 0); M2 + M1 − M1 = +5.7 điểm (4/5 KTC > 0, 0 KTC < 0).

## 6. Hạn chế

- Mức hợp lý nghiệp vụ dùng đúng các ràng buộc của M2, nên M2 đạt 100% theo định nghĩa; đây không phải bằng chứng độc lập rằng gợi ý "tốt hơn" với khách hàng thật.
- Tương thích chỉ suy từ tên sản phẩm (dòng máy trong tên ốp/kính); danh mục không có thuộc tính tương thích. Sạc/cáp/pin được coi là hợp mọi máy — giả định nghiệp vụ, chưa kiểm chứng.
- Ground truth là đơn giả lập; nếu bộ sinh có cặp "không hợp lý" (vd. điện thoại mua kèm điện thoại trong đơn nhiễu), M2 sẽ bị tính trượt các cặp đó — đây là chi phí thật của ràng buộc và được giữ nguyên, không sửa dữ liệu.
- Mức tăng Recall ở nhóm hiếm của M2 một cấp đến từ **fallback có ràng buộc**, không phải từ luật: M2 một cấp chỉ dùng luật có Recall nhóm hiếm đúng bằng luật một cấp (cùng luật sản phẩm ⇒ sản phẩm). Khi xem điện thoại hiếm, fallback của website gợi ý điện thoại cùng hãng (không bao giờ trúng), còn fallback có ràng buộc gợi ý phụ kiện tương thích bán chạy.
- Cắt tỉa (M2-B) không làm thay đổi chất lượng gợi ý — theo lý thuyết và theo kiểm tra, nó cho đúng cùng kết quả với hậu lọc; khác biệt chỉ nằm ở chi phí khai phá.
- Tỷ lệ sản phẩm hiếm từng được gợi ý (khi là đáp án) giảm so với luật một cấp + fallback, và Coverage nhóm hiếm thấp.
- Fallback có ràng buộc thu hẹp tập ứng viên (không còn "điện thoại cùng hãng" khi xem điện thoại), nên Coverage giảm.
- Ràng buộc chỉ cắt tỉa được rất ít trên giao dịch một cấp ngắn (tập phổ biến đã nhỏ); lợi ích tốc độ chỉ rõ ở Apriori trên giao dịch đa mức. FP-Growth có cắt tỉa có thể chậm hơn hậu lọc vì phải kiểm tra ràng buộc cho từng item của cơ sở mẫu điều kiện.
- Tham số tốt nhất vẫn ở biên dưới lưới (0,002 — giới hạn API).

## 7. Tái lập

```
node scripts/benchmark-constraints.js
node scripts/evaluate-constraints.js
node scripts/evaluate-constraints.js --profile r1b --seed 20261103
node --test test/
```
