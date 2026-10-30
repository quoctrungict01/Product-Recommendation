# Giai đoạn 4 – Bước 2: Bộ dữ liệu nghiên cứu R1 / R1b

Tạo lúc: 2026-10-26T10:51:59.749Z · Node v20.20.2 · lệnh: `node scripts/evaluate-research-datasets.js`

> **Dữ liệu giả lập.** R1/R1b được sinh offline bằng `research/datasets/generator.js`, dùng lại bộ sinh demo với các luật mua kèm cài sẵn.
> Kết quả đo khả năng *tìm lại mẫu đã cài*, không phản ánh khách hàng thật. Không kết nối, không ghi MongoDB GR2.

## 1. Bộ dữ liệu

- Bộ sinh: `trungshop-research-generator/1.0.0` (phiên bản nằm trong metadata và trong checksum).
- **r1**: Giống dữ liệu demo: 55% đơn điện thoại, 35% đơn phụ kiện, 10% đơn nhiễu (1–3 sản phẩm).
- **r1b**: Khó hơn: 43,8% đơn điện thoại, 30% đơn phụ kiện, 1,2% đơn có sản phẩm ít giao dịch, 25% đơn nhiễu (1–4 sản phẩm trong 41 sản phẩm gốc); xác suất mua kèm × 0,7; thêm 7 sản phẩm hiếm chỉ xuất hiện trong nhánh 1,2%.
- 5 seed mỗi hồ sơ: 20261101, 20261102, 20261103, 20261104, 20261105 · 20000 đơn/bộ · khoảng thời gian 2026-04-01 → 2026-10-25.
- Hồ sơ r1 với seed demo tái tạo y hệt bộ sinh GR2: ✔ · checksum dữ liệu demo 1.000 đơn không đổi (`d1eb602b9280f679…`): ✔.
- Dữ liệu sinh lại từ seed mỗi lần chạy; không lưu file dữ liệu vào repo. Metadata tái lập (phiên bản bộ sinh, seed, cấu hình, SHA-1 cấu hình, checksum, thống kê) trong `phase4-step2-datasets.json`.
- Tổng thời gian: 128 s (đánh giá các bộ: 124 s).

**Giới hạn tài nguyên:** mỗi bộ chạy trong tiến trình con riêng, heap tối đa 2048 MB, dừng sau 600 s.
Trước mỗi lần khai phá có kiểm tra ngân sách: ≤ 5000 item phổ biến, ≤ 5,000,000 ứng viên 2-itemset, giao dịch ≤ 24 item phổ biến, cận trên số tập phổ biến ≤ 20,000,000; vượt thì dừng với thông báo thay vì treo máy.

## 2. Giao thức (giống Bước 1)

- Chia theo thời gian 0.7/0.1/0.2; đơn cùng thời điểm không bị tách; test kiểm tra rò rỉ dữ liệu ở mỗi bộ.
- Che giấu từng sản phẩm trong đơn test có ≥ 2 sản phẩm; Top-5; Precision@5 chia cho 5.
- Tham số luật chọn **riêng cho từng bộ** trên validation (lưới 7×6, minSupport ≥ 0.002 = giới hạn dưới của API website); test chỉ dùng một lần.
- Thống kê qua seed: trung bình ± độ lệch chuẩn mẫu; KTC 95% theo phân phối t (bậc tự do = số seed − 1). Cột “± bootstrap” là nửa độ rộng KTC bootstrap trong một seed (trung bình qua seed).

## R1 (giống dữ liệu demo)

| Seed | Checksum dữ liệu (SHA-1) | Đơn | Truy vấn validation | Truy vấn test (từ … đơn) | Tham số chọn (sup / conf) | SP ít giao dịch | Apriori = FP-Growth | Thời gian |
|---:|---|---:|---:|---:|---|---:|:---:|---:|
| 20261101 | `e84322bb341aeb1d1ba300c07f06479f79de67dc` | 20000 | 2793 | 5251 (2128) | 0.002 / 0 ⚠️ biên | 0 | ✔ | 12.7 s |
| 20261102 | `44fe1e131afbb1862217d54b1e75bb6da30f2c82` | 20000 | 2780 | 5506 (2236) | 0.002 / 0.05 ⚠️ biên | 0 | ✔ | 11.3 s |
| 20261103 | `a1ba0842b514a0d90c6f8c031f44f854a4bde055` | 20000 | 2619 | 5648 (2245) | 0.002 / 0 ⚠️ biên | 0 | ✔ | 11.7 s |
| 20261104 | `0bfe7974f9f9c3b7f8a5fb95fde7d5db85b4f516` | 20000 | 2665 | 5560 (2229) | 0.002 / 0 ⚠️ biên | 0 | ✔ | 12.4 s |
| 20261105 | `9e9304d550364a18860559bbcac3f2b75dcf5df4` | 20000 | 2645 | 5528 (2208) | 0.002 / 0 ⚠️ biên | 0 | ✔ | 12.3 s |

### Kết quả trên tập test — trung bình ± độ lệch chuẩn qua 5 seed

| Phương pháp | Precision@5 | Recall@5 | KTC 95% Recall qua seed (t) | KTC 95% Recall theo đơn hàng (bootstrap, TB qua seed) | Hit Rate@5 | KTC 95% Hit theo đơn hàng | Coverage | Có gợi ý từ luật |
|---|---:|---:|---|---|---:|---|---:|---:|
| Random (seed 42) | 3.1% ± 0.1 | 8.8% ± 0.5 | [8.2%; 9.5%] | [8.2%; 9.4%] | 14.8% ± 0.7 | [14.0%; 15.6%] | 100.0% ± 0.0 | 0.0% ± 0.0 |
| Most Popular | 10.6% ± 0.7 | 32.3% ± 1.8 | [30.0%; 34.5%] | [30.8%; 33.7%] | 42.4% ± 2.6 | [40.5%; 44.3%] | 14.6% ± 0.0 | 0.0% ± 0.0 |
| Category-Based (cùng danh mục → bán chạy) | 7.4% ± 0.6 | 23.2% ± 2.5 | [20.1%; 26.2%] | [22.0%; 24.4%] | 35.4% ± 2.9 | [33.9%; 37.0%] | 95.1% ± 0.0 | 0.0% ± 0.0 |
| Co-occurrence (logic cũ, sup ≥ 1%, conf ≥ 1%) | 24.1% ± 0.5 | 66.6% ± 1.4 | [64.9%; 68.3%] | [64.8%; 68.4%] | 69.7% ± 1.1 | [67.9%; 71.5%] | 50.2% ± 1.3 | 0.0% ± 0.0 |
| Hệ thống hiện tại – chỉ luật (tham số website: sup 0.01, conf 0.2) | 21.5% ± 0.6 | 61.6% ± 1.0 | [60.3%; 62.8%] | [59.9%; 63.2%] | 67.5% ± 1.1 | [65.6%; 69.2%] | 48.8% ± 0.0 | 83.7% ± 0.6 |
| Hệ thống hiện tại – luật + fallback (tham số website) | 22.6% ± 0.4 | 64.3% ± 0.8 | [63.3%; 65.3%] | [62.6%; 65.9%] | 70.3% ± 0.9 | [68.6%; 72.0%] | 97.6% ± 0.0 | 83.7% ± 0.6 |
| Luật – chỉ luật (tham số chọn trên validation) | 28.3% ± 0.4 | 81.1% ± 0.4 | [80.6%; 81.6%] | [79.7%; 82.5%] | 83.1% ± 0.3 | [81.7%; 84.5%] | 73.2% ± 1.7 | 98.8% ± 0.1 |
| Luật + fallback (tham số chọn trên validation) | 28.5% ± 0.4 | 81.8% ± 0.3 | [81.4%; 82.2%] | [80.4%; 83.1%] | 84.1% ± 0.4 | [82.8%; 85.4%] | 89.8% ± 1.1 | 98.8% ± 0.1 |

KTC qua seed: độ bất định do quá trình sinh dữ liệu. KTC theo đơn hàng: bootstrap chọn lại **đơn** (mọi truy vấn của một đơn đi cùng nhau) trong từng seed, rồi lấy trung bình cận dưới/cận trên qua seed.

### Chênh lệch cặp theo seed (A = luật + fallback, tham số chọn trên validation), điểm phần trăm

| B | Δ Recall@5 (TB, KTC 95%) | Δ Hit Rate@5 (TB, KTC 95%) | Δ Precision@5 (TB) | Seed A > B (Recall) |
|---|---|---|---:|---:|
| Hệ thống hiện tại – luật + fallback (tham số website) | +17.5 [+16.6; +18.4] | +13.8 [+12.6; +15.0] | +5.9 | 5/5 |
| Co-occurrence (logic cũ, sup ≥ 1%, conf ≥ 1%) | +15.1 [+13.7; +16.6] | +14.4 [+12.9; +15.9] | +4.4 | 5/5 |
| Most Popular | +49.5 [+47.3; +51.7] | +41.8 [+38.9; +44.7] | +17.9 | 5/5 |
| Category-Based (cùng danh mục → bán chạy) | +58.6 [+55.3; +61.9] | +48.7 [+45.3; +52.1] | +21.1 | 5/5 |
| Luật – chỉ luật (tham số chọn trên validation) | +0.7 [+0.5; +0.8] | +1.0 [+0.8; +1.2] | +0.2 | 5/5 |

Không có sản phẩm nào dưới ngưỡng ít giao dịch (< 0.5% đơn lịch sử) trong hồ sơ này.

## R1b (khó hơn: nhiễu + sản phẩm ít giao dịch)

| Seed | Checksum dữ liệu (SHA-1) | Đơn | Truy vấn validation | Truy vấn test (từ … đơn) | Tham số chọn (sup / conf) | SP ít giao dịch | Apriori = FP-Growth | Thời gian |
|---:|---|---:|---:|---:|---|---:|:---:|---:|
| 20261101 | `ac2ea12f86d60fe2c435b4a72ce9552d29e5cf99` | 20000 | 2534 | 5091 (1992) | 0.002 / 0 ⚠️ biên | 7 | ✔ | 12.9 s |
| 20261102 | `f3a0bdff2ba16671b3a6fecf88c71c905f0fdb1a` | 20000 | 2520 | 5058 (1956) | 0.002 / 0 ⚠️ biên | 7 | ✔ | 12.8 s |
| 20261103 | `77216bf5d1a45a1f03520553f78abdb3d31e37e0` | 20000 | 2457 | 5033 (1950) | 0.002 / 0 ⚠️ biên | 7 | ✔ | 12.7 s |
| 20261104 | `2d8eab061401c0772d6761aa132968b98f5c89c7` | 20000 | 2568 | 5150 (2000) | 0.002 / 0 ⚠️ biên | 7 | ✔ | 12.4 s |
| 20261105 | `7cbbe3fca4ce39cce3d01696788d0589442cca16` | 20000 | 2478 | 5093 (1961) | 0.002 / 0 ⚠️ biên | 7 | ✔ | 12.8 s |

### Kết quả trên tập test — trung bình ± độ lệch chuẩn qua 5 seed

| Phương pháp | Precision@5 | Recall@5 | KTC 95% Recall qua seed (t) | KTC 95% Recall theo đơn hàng (bootstrap, TB qua seed) | Hit Rate@5 | KTC 95% Hit theo đơn hàng | Coverage | Có gợi ý từ luật |
|---|---:|---:|---|---|---:|---|---:|---:|
| Random (seed 42) | 3.4% ± 0.1 | 9.4% ± 0.4 | [8.9%; 9.8%] | [8.7%; 10.0%] | 16.5% ± 0.4 | [15.4%; 17.5%] | 100.0% ± 0.0 | 0.0% ± 0.0 |
| Most Popular | 7.9% ± 0.1 | 23.8% ± 0.3 | [23.4%; 24.2%] | [22.6%; 25.0%] | 34.1% ± 0.6 | [32.4%; 35.9%] | 12.5% ± 0.0 | 0.0% ± 0.0 |
| Category-Based (cùng danh mục → bán chạy) | 5.6% ± 0.4 | 16.8% ± 1.2 | [15.2%; 18.3%] | [15.7%; 17.9%] | 26.6% ± 1.4 | [25.1%; 28.1%] | 87.5% ± 0.0 | 0.0% ± 0.0 |
| Co-occurrence (logic cũ, sup ≥ 1%, conf ≥ 1%) | 10.5% ± 0.3 | 35.5% ± 0.8 | [34.5%; 36.4%] | [33.7%; 37.4%] | 41.5% ± 0.7 | [39.4%; 43.7%] | 39.6% ± 0.0 | 0.0% ± 0.0 |
| Hệ thống hiện tại – chỉ luật (tham số website: sup 0.01, conf 0.2) | 9.3% ± 0.3 | 31.4% ± 0.8 | [30.5%; 32.4%] | [29.7%; 33.2%] | 37.4% ± 0.7 | [35.4%; 39.5%] | 39.2% ± 0.9 | 63.8% ± 0.8 |
| Hệ thống hiện tại – luật + fallback (tham số website) | 11.7% ± 0.3 | 36.8% ± 0.9 | [35.7%; 38.0%] | [35.1%; 38.6%] | 47.4% ± 0.7 | [45.4%; 49.4%] | 89.6% ± 0.0 | 63.8% ± 0.8 |
| Luật – chỉ luật (tham số chọn trên validation) | 16.2% ± 0.4 | 53.4% ± 1.0 | [52.1%; 54.7%] | [51.3%; 55.4%] | 58.3% ± 1.0 | [56.2%; 60.4%] | 69.2% ± 3.4 | 95.6% ± 0.6 |
| Luật + fallback (tham số chọn trên validation) | 17.2% ± 0.4 | 55.9% ± 1.0 | [54.7%; 57.1%] | [53.9%; 57.9%] | 63.1% ± 1.0 | [61.2%; 65.1%] | 86.3% ± 2.4 | 95.6% ± 0.6 |

KTC qua seed: độ bất định do quá trình sinh dữ liệu. KTC theo đơn hàng: bootstrap chọn lại **đơn** (mọi truy vấn của một đơn đi cùng nhau) trong từng seed, rồi lấy trung bình cận dưới/cận trên qua seed.

### Chênh lệch cặp theo seed (A = luật + fallback, tham số chọn trên validation), điểm phần trăm

| B | Δ Recall@5 (TB, KTC 95%) | Δ Hit Rate@5 (TB, KTC 95%) | Δ Precision@5 (TB) | Seed A > B (Recall) |
|---|---|---|---:|---:|
| Hệ thống hiện tại – luật + fallback (tham số website) | +19.0 [+17.6; +20.5] | +15.8 [+14.9; +16.6] | +5.5 | 5/5 |
| Co-occurrence (logic cũ, sup ≥ 1%, conf ≥ 1%) | +20.4 [+19.6; +21.2] | +21.6 [+21.3; +22.0] | +6.7 | 5/5 |
| Most Popular | +32.1 [+31.2; +33.0] | +29.0 [+27.9; +30.1] | +9.4 | 5/5 |
| Category-Based (cùng danh mục → bán chạy) | +39.1 [+37.5; +40.7] | +36.6 [+35.0; +38.1] | +11.6 | 5/5 |
| Luật – chỉ luật (tham số chọn trên validation) | +2.5 [+2.1; +2.9] | +4.8 [+4.2; +5.4] | +1.1 | 5/5 |

### Truy vấn có sản phẩm đang xem ít giao dịch (< 0.5% đơn lịch sử)

Trung bình 62 truy vấn/seed — rất ít, chỉ để quan sát xu hướng.

| Phương pháp | Recall@5 | Hit Rate@5 | Có gợi ý từ luật |
|---|---:|---:|---:|
| Random (seed 42) | 2.9% ± 0.6 | 5.9% ± 1.2 | 0.0% ± 0.0 |
| Most Popular | 9.3% ± 2.5 | 15.2% ± 2.7 | 0.0% ± 0.0 |
| Category-Based (cùng danh mục → bán chạy) | 0.0% ± 0.0 | 0.0% ± 0.0 | 0.0% ± 0.0 |
| Co-occurrence (logic cũ, sup ≥ 1%, conf ≥ 1%) | 0.0% ± 0.0 | 0.0% ± 0.0 | 0.0% ± 0.0 |
| Hệ thống hiện tại – chỉ luật (tham số website: sup 0.01, conf 0.2) | 0.0% ± 0.0 | 0.0% ± 0.0 | 0.0% ± 0.0 |
| Hệ thống hiện tại – luật + fallback (tham số website) | 0.0% ± 0.0 | 0.0% ± 0.0 | 0.0% ± 0.0 |
| Luật – chỉ luật (tham số chọn trên validation) | 16.7% ± 18.0 | 21.3% ± 20.4 | 23.0% ± 22.2 |
| Luật + fallback (tham số chọn trên validation) | 16.7% ± 18.0 | 21.3% ± 20.4 | 23.0% ± 22.2 |

## 3. Hiệu năng Apriori và FP-Growth (benchmark riêng, có kiểm soát)

Khai phá trên train ∪ validation (16000 đơn) của từng bộ; mỗi lượt đo chạy trong tiến trình con riêng; thời gian là trung vị 15 lần sau 1 lần chạy đầu; RSS = mức tăng bộ nhớ đỉnh của lần chạy đầu. Không dùng thời gian API hay cache.

| Hồ sơ | min_sup | Itemsets (TB) | Candidate Apriori (TB) | Apriori ms (TB ± SD) | FP-Growth ms (TB ± SD) | Tỷ lệ A/FP (TB) | RSS Apriori MB (TB) | RSS FP MB (TB) | Kết quả trùng |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| r1 | 0.01 | 92 | 842 | 15.3 ± 0.5 | 18.7 ± 0.3 | ×0.82 | 2.3 | 8.9 | ✔ 5/5 |
| r1 | 0.005 | 130 | 870 | 15.6 ± 0.2 | 18.7 ± 0.3 | ×0.84 | 3.0 | 9.5 | ✔ 5/5 |
| r1 | 0.002 | 169 | 888 | 16.5 ± 0.5 | 18.8 ± 0.6 | ×0.88 | 3.3 | 9.5 | ✔ 5/5 |
| r1b | 0.01 | 61 | 823 | 18.2 ± 3.9 | 25.5 ± 3.8 | ×0.71 | 1.9 | 10.8 | ✔ 5/5 |
| r1b | 0.005 | 88 | 840 | 17.8 ± 3.4 | 26.0 ± 6.3 | ×0.70 | 1.9 | 11.5 | ✔ 5/5 |
| r1b | 0.002 | 140 | 1077 | 20.3 ± 2.2 | 26.8 ± 1.9 | ×0.76 | 2.0 | 11.6 | ✔ 5/5 |

Thời gian phụ thuộc máy; chỉ so sánh tương đối giữa hai thuật toán trên cùng máy, cùng dữ liệu. Chi tiết: `phase4-step2-benchmark.{md,json}`.

## 4. Giới hạn của dữ liệu giả lập

- Luật mua kèm do chính bộ sinh cài sẵn (“điện thoại ⇒ phụ kiện”), nên phương pháp dựa trên luật có lợi thế cấu trúc; không suy ra cho khách hàng thật.
- Hành vi không đổi theo thời gian (bộ sinh dừng), nên chia theo thời gian gần như chia ngẫu nhiên; chưa thử xu hướng thay đổi theo mùa hoặc sản phẩm mới ra mắt giữa kỳ.
- Không có thông tin khách hàng, giá thay đổi hay tồn kho; mọi sản phẩm còn hàng.
- 5 seed cùng một bộ sinh: độ lệch giữa seed chỉ phản ánh ngẫu nhiên khi sinh, không phản ánh khác biệt giữa các cửa hàng thật.
- Tham số chọn trên validation thường nằm ở biên dưới của lưới (giới hạn API minSupport 0,002): giá trị tốt hơn có thể nằm ngoài vùng website cho phép.
- Nhóm “sản phẩm ít giao dịch” của R1b chỉ có vài chục truy vấn mỗi seed.

## 5. Tái lập

```
cd Shop/Shop/backendapi
node scripts/benchmark-research-datasets.js                          # ~40 s, ghi phase4-step2-benchmark.{md,json} (chạy trước)
node scripts/evaluate-research-datasets.js                           # ~2 phút, ghi phase4-step2-r1-evaluation.{md,json} + phase4-step2-datasets.json
node scripts/evaluate-research-datasets.js --profile r1b --seed 20261103   # chạy riêng một bộ (ghi file có hậu tố)
node scripts/benchmark-research-datasets.js --profiles r1 --seeds 1        # benchmark riêng một bộ
node scripts/evaluate-research-datasets.js --export-dir ../r1-data   # (tùy chọn) xuất dữ liệu + metadata JSON ra ngoài repo
node --test test/
```
Cùng seed + cùng cấu hình cho cùng checksum và cùng bảng chất lượng; cột thời gian thay đổi theo máy.
