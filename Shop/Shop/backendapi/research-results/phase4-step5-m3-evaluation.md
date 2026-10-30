# Giai đoạn 4 – Bước 5: M3 — Xếp hạng luật kết hợp và đa dạng hóa Top-K

Tạo lúc: 2026-10-27T02:58:12.744Z · Node v20.20.2 · `node scripts/evaluate-ranking.js` · tổng 272 s (đánh giá 268 s).

OFFLINE: dữ liệu sinh lại từ seed, không đọc `.env`, không kết nối MongoDB, không gọi API. Code M3 nằm trong `research/ranking/`; website, API, UI không đổi và chưa tích hợp M3.

## 1. Phương pháp và nguồn trong giáo trình

| Chiến lược | Điểm xếp hạng | Nguồn |
|---|---|---|
| native | thứ tự gốc của phương pháp nền (website: confidence → lift → support; M1: policy đã chọn) | Chương 6 / Bước 3 |
| confidence | conf(X ⇒ q), hòa: lift, số đơn chung | mục 6.2.2, 6.3.2 |
| kulc-ir | Kulc(X, q) × (1 − β·IR(X, q)), β ∈ {0; 0,5; 1} | Kulc (6.11) và IR (6.13), mục 6.3.3 — giáo trình khuyến nghị dùng **cùng nhau**; **công thức gộp là lựa chọn của đồ án** |
| popularity | conf × P(q)^−γ, γ ∈ {0,25; 0,5; 0,75; 1} (γ = 1 chính là lift) | **không có trong giáo trình**; nội suy giữa confidence và lift (6.8) |
| đa dạng hóa λ | chọn tham lam λ·rel − (1 − λ)·[danh mục đã có], rel = 1 − thứ hạng/m; áp cho phần luật rồi phần fallback; λ ∈ {1; 0,9; 0,75; 0,5; 0,25} | **chuyển thể** ý tưởng "redundancy-aware top-k / marginal relevance" của mục 7.5.2 (vốn để chọn mẫu, không phải danh sách gợi ý) |

- Mọi chiến lược chỉ sắp xếp lại **cùng một tập ứng viên** (luật lift > 1, đã qua ràng buộc M2 nếu có). Thứ tự native được kiểm tra cho đúng y hệt phương pháp nền.
- Gợi ý từ luật luôn đứng trước; fallback (website, hoặc fallback có ràng buộc khi có M2) chỉ lấp chỗ còn trống và mang `source = "fallback"`. Mỗi lần chấm đều kiểm tra: mục "luật" phải có luật nguồn và thuộc tập ứng viên, mục fallback không được thuộc tập ứng viên.
- Mỗi gợi ý từ luật giữ: luật nguồn (vế trái, vế phải, loại cấp), support, confidence, lift, Kulc, IR, độ phổ biến, điểm của chiến lược, thứ hạng gốc và việc có bị phạt đa dạng hay không.
- Chọn tham số hai giai đoạn, chỉ trên validation: (1) tham số nền như Bước 2–4; (2) tham số xếp hạng. **M3-R** = Recall@5 validation cao nhất; **M3-C** = Coverage validation cao nhất trong các cấu hình có Recall@5 validation ≥ tốt nhất − 0.5 điểm (ngưỡng khai báo trước). Hòa: ưu tiên native và λ lớn.
- Đa dạng danh mục = số danh mục khác nhau / độ dài danh sách. Sản phẩm hiếm: < 0.5% số đơn lịch sử. KTC 95% bootstrap theo đơn (1000 lần).

## 2. Bộ dữ liệu và tham số được chọn

Bộ sinh `trungshop-research-generator/1.0.0`; checksum **trùng khớp** manifest Bước 2; dữ liệu demo GR2 không đổi.

| Bộ | Checksum | Giây | M3-R trên một cấp | M3-C trên một cấp | M3-R trên M1 | M3-R trên M2 + M1 | M3-C trên M2 + M1 |
|---|---|---:|---|---|---|---|---|
| R1-seed20261101-n20000 | `e84322bb341a…` | 24.7 | kulc-ir β=0, λ=0.9 | kulc-ir β=0, λ=1 | native, λ=1 | native, λ=1 | native, λ=1 |
| R1-seed20261102-n20000 | `44fe1e131afb…` | 30.2 | popularity γ=1, λ=0.75 | native, λ=1 | native, λ=1 | native, λ=1 | native, λ=1 |
| R1-seed20261103-n20000 | `a1ba0842b514…` | 30.8 | kulc-ir β=0.5, λ=1 | kulc-ir β=0.5, λ=1 | native, λ=1 | native, λ=1 | native, λ=1 |
| R1-seed20261104-n20000 | `0bfe7974f9f9…` | 22.4 | kulc-ir β=0, λ=1 | kulc-ir β=0, λ=1 | native, λ=1 | native, λ=1 | popularity γ=1, λ=1 |
| R1-seed20261105-n20000 | `9e9304d55036…` | 22.2 | kulc-ir β=0, λ=0.75 | kulc-ir β=0, λ=1 | native, λ=1 | native, λ=1 | popularity γ=1, λ=1 |
| R1B-seed20261101-n20000 | `ac2ea12f86d6…` | 23.6 | popularity γ=1, λ=0.75 | popularity γ=1, λ=0.75 | native, λ=0.9 | native, λ=1 | native, λ=1 |
| R1B-seed20261102-n20000 | `f3a0bdff2ba1…` | 23.7 | kulc-ir β=0.5, λ=0.9 | kulc-ir β=0.5, λ=0.9 | native, λ=1 | native, λ=1 | native, λ=1 |
| R1B-seed20261103-n20000 | `77216bf5d1a4…` | 28.2 | kulc-ir β=0, λ=0.75 | kulc-ir β=0, λ=0.75 | native, λ=1 | native, λ=1 | native, λ=1 |
| R1B-seed20261104-n20000 | `2d8eab061401…` | 33.5 | popularity γ=0.25, λ=0.9 | kulc-ir β=0.5, λ=1 | native, λ=1 | native, λ=1 | native, λ=1 |
| R1B-seed20261105-n20000 | `7cbbe3fca4ce…` | 29.0 | native, λ=0.75 | kulc-ir β=1, λ=1 | native, λ=1 | native, λ=1 | native, λ=1 |

Checksum đầy đủ trong file JSON.

## 3. R1: bảng so sánh M1, M2, M3 và kết hợp (5 seed, TB ± SD, test)

| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Đa dạng danh mục | Ô có SP hiếm | Có gợi ý từ luật | Ô từ luật | Hợp lý nghiệp vụ | Nhãn fallback sai |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Hệ thống hiện tại (luật + fallback) | 22.6 ± 0.4 | 64.3 ± 0.8 | [62.6; 65.9] | 70.3 ± 0.9 | 97.6 ± 0.0 | 57.1 ± 0.7 | 0.00 ± 0.00 | 83.7 ± 0.6 | 43.2 ± 1.2 | 71.8 ± 0.7 | 0 |
| Luật một cấp (xếp hạng gốc) | 28.5 ± 0.4 | 81.8 ± 0.3 | [80.4; 83.1] | 84.1 ± 0.4 | 89.8 ± 1.1 | 66.7 ± 1.0 | 0.00 ± 0.00 | 98.8 ± 0.1 | 79.0 ± 0.8 | 83.0 ± 1.0 | 0 |
| M3: Kulc × (1 − β·IR) | 28.3 ± 0.5 | 82.3 ± 0.3 | [81.0; 83.7] | 85.9 ± 1.3 | 90.2 ± 0.0 | 65.2 ± 1.6 | 0.00 ± 0.00 | 98.8 ± 0.1 | 79.0 ± 0.8 | 83.0 ± 1.0 | 0 |
| M3: phạt phổ biến conf × P(q)^−γ | 28.4 ± 0.5 | 82.1 ± 0.5 | [80.8; 83.4] | 85.4 ± 1.3 | 89.8 ± 1.1 | 65.3 ± 1.1 | 0.00 ± 0.00 | 98.8 ± 0.1 | 79.0 ± 0.8 | 83.0 ± 1.0 | 0 |
| M3: đa dạng hóa danh mục (λ) | 28.5 ± 0.4 | 81.8 ± 0.4 | [80.4; 83.1] | 84.2 ± 0.4 | 80.5 ± 3.4 | 74.7 ± 5.1 | 0.00 ± 0.00 | 98.8 ± 0.1 | 79.0 ± 0.8 | 88.4 ± 4.4 | 0 |
| M3-R (Recall tốt nhất) | 28.2 ± 0.6 | 82.3 ± 0.4 | [81.0; 83.6] | 86.3 ± 0.8 | 86.3 ± 4.4 | 70.3 ± 6.5 | 0.00 ± 0.00 | 98.8 ± 0.1 | 79.0 ± 0.8 | 86.7 ± 4.5 | 0 |
| M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 28.3 ± 0.5 | 82.3 ± 0.3 | [81.0; 83.7] | 85.9 ± 1.3 | 90.2 ± 0.0 | 65.2 ± 1.6 | 0.00 ± 0.00 | 98.8 ± 0.1 | 79.0 ± 0.8 | 83.0 ± 1.0 | 0 |
| M2 một cấp (xếp hạng gốc) | 28.5 ± 0.4 | 81.7 ± 0.2 | [80.4; 83.1] | 84.1 ± 0.4 | 73.2 ± 1.7 | 67.6 ± 0.7 | 0.00 ± 0.00 | 98.7 ± 0.3 | 78.9 ± 0.8 | 100.0 ± 0.0 | 0 |
| M2 một cấp + M3-R (Recall tốt nhất) | 28.1 ± 0.4 | 82.3 ± 0.2 | [81.0; 83.6] | 86.7 ± 0.4 | 78.5 ± 1.1 | 66.7 ± 2.2 | 0.00 ± 0.00 | 98.7 ± 0.3 | 78.9 ± 0.8 | 100.0 ± 0.0 | 0 |
| M2 một cấp + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 28.1 ± 0.4 | 82.2 ± 0.3 | [80.9; 83.5] | 86.6 ± 0.4 | 79.0 ± 1.3 | 68.6 ± 2.1 | 0.00 ± 0.00 | 98.7 ± 0.3 | 78.9 ± 0.8 | 100.0 ± 0.0 | 0 |
| M1 (xếp hạng gốc) | 28.5 ± 0.4 | 82.0 ± 0.5 | [80.6; 83.3] | 84.3 ± 0.5 | 83.4 ± 1.1 | 68.6 ± 1.1 | 0.00 ± 0.00 | 99.8 ± 0.5 | 94.5 ± 0.4 | 86.0 ± 0.6 | 0 |
| M1 + M3-R (Recall tốt nhất) | 28.5 ± 0.4 | 82.0 ± 0.5 | [80.6; 83.3] | 84.3 ± 0.5 | 83.4 ± 1.1 | 68.6 ± 1.1 | 0.00 ± 0.00 | 99.8 ± 0.5 | 94.5 ± 0.4 | 86.0 ± 0.6 | 0 |
| M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 28.5 ± 0.4 | 82.0 ± 0.5 | [80.6; 83.3] | 84.3 ± 0.5 | 83.4 ± 1.1 | 68.6 ± 1.1 | 0.00 ± 0.00 | 99.8 ± 0.5 | 94.5 ± 0.4 | 86.0 ± 0.6 | 0 |
| M2 + M1 (xếp hạng gốc) | 28.5 ± 0.4 | 81.9 ± 0.4 | [80.6; 83.2] | 84.3 ± 0.3 | 73.2 ± 1.7 | 65.9 ± 1.4 | 0.00 ± 0.00 | 99.8 ± 0.5 | 90.0 ± 0.5 | 100.0 ± 0.0 | 0 |
| M2 + M1 + M3-R (Recall tốt nhất) | 28.5 ± 0.4 | 81.9 ± 0.4 | [80.6; 83.2] | 84.3 ± 0.3 | 73.2 ± 1.7 | 65.9 ± 1.4 | 0.00 ± 0.00 | 99.8 ± 0.5 | 90.0 ± 0.5 | 100.0 ± 0.0 | 0 |
| M2 + M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 28.3 ± 0.6 | 81.9 ± 0.4 | [80.6; 83.2] | 85.0 ± 1.2 | 75.6 ± 3.9 | 64.7 ± 2.4 | 0.00 ± 0.00 | 99.8 ± 0.5 | 90.0 ± 0.5 | 100.0 ± 0.0 | 0 |

R1 không có sản phẩm nào dưới ngưỡng hiếm.

### R1: so sánh cặp (cùng truy vấn; số seed có KTC theo đơn > 0 / < 0)

| So sánh | ΔRecall@5 | seed | ΔPrecision@5 | ΔHit@5 | ΔĐa dạng | ΔCoverage | ΔRecall nhóm hiếm | seed |
|---|---:|---|---:|---:|---:|---:|---:|---|
| M3-R (Recall tốt nhất) − Luật một cấp (xếp hạng gốc) | +0.52 ± 0.35 | 3 > 0 · 0 < 0 | -0.29 | +2.15 | +3.7 | -3.4 ± 3.7 | – | – |
| M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − Luật một cấp (xếp hạng gốc) | +0.56 ± 0.35 | 4 > 0 · 0 < 0 | -0.18 | +1.79 | -1.5 | +0.5 ± 1.1 | – | – |
| M2 một cấp + M3-R (Recall tốt nhất) − M2 một cấp (xếp hạng gốc) | +0.55 ± 0.30 | 3 > 0 · 0 < 0 | -0.37 | +2.58 | -0.9 | +5.4 ± 2.0 | – | – |
| M2 một cấp + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − M2 một cấp (xếp hạng gốc) | +0.41 ± 0.27 | 1 > 0 · 0 < 0 | -0.44 | +2.51 | +1.0 | +5.9 ± 2.2 | – | – |
| M1 + M3-R (Recall tốt nhất) − M1 (xếp hạng gốc) | +0.00 ± 0.00 | 0 > 0 · 0 < 0 | +0.00 | +0.00 | +0.0 | +0.0 ± 0.0 | – | – |
| M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − M1 (xếp hạng gốc) | +0.00 ± 0.00 | 0 > 0 · 0 < 0 | +0.00 | +0.00 | +0.0 | +0.0 ± 0.0 | – | – |
| M2 + M1 + M3-R (Recall tốt nhất) − M2 + M1 (xếp hạng gốc) | +0.00 ± 0.00 | 0 > 0 · 0 < 0 | +0.00 | +0.00 | +0.0 | +0.0 ± 0.0 | – | – |
| M2 + M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − M2 + M1 (xếp hạng gốc) | -0.05 ± 0.10 | 0 > 0 · 0 < 0 | -0.27 | +0.72 | -1.2 | +2.4 ± 3.4 | – | – |
| M3: Kulc × (1 − β·IR) − Luật một cấp (xếp hạng gốc) | +0.56 ± 0.35 | 4 > 0 · 0 < 0 | -0.18 | +1.79 | -1.5 | +0.5 ± 1.1 | – | – |
| M3: phạt phổ biến conf × P(q)^−γ − Luật một cấp (xếp hạng gốc) | +0.37 ± 0.33 | 2 > 0 · 0 < 0 | -0.11 | +1.22 | -1.4 | +0.0 ± 0.0 | – | – |
| M3: đa dạng hóa danh mục (λ) − Luật một cấp (xếp hạng gốc) | +0.00 ± 0.09 | 0 > 0 · 0 < 0 | -0.02 | +0.02 | +8.1 | -9.3 ± 4.0 | – | – |
| M2 + M1 + M3-R (Recall tốt nhất) − Luật một cấp (xếp hạng gốc) | +0.17 ± 0.13 | 1 > 0 · 0 < 0 | +0.03 | +0.15 | -0.8 | -16.6 ± 2.0 | – | – |
| M2 + M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − Luật một cấp (xếp hạng gốc) | +0.13 ± 0.21 | 1 > 0 · 0 < 0 | -0.25 | +0.87 | -2.0 | -14.1 ± 4.4 | – | – |

Đơn vị: điểm phần trăm.

### R1: đánh đổi Recall – Coverage theo λ (chiến lược của M3-R; mô tả, KHÔNG dùng để chọn tham số)

Nền **Luật một cấp**:

| λ | Recall validation | Coverage validation | Recall test | Coverage test | Đa dạng danh mục test |
|---:|---:|---:|---:|---:|---:|
| 1 | 82.0 ± 1.6 | 90.2 ± 0.0 | 82.2 ± 0.4 | 90.2 ± 0.0 | 64.5 ± 0.4 |
| 0.9 | 82.0 ± 1.6 | 85.4 ± 1.7 | 82.2 ± 0.4 | 85.9 ± 1.1 | 68.2 ± 0.7 |
| 0.75 | 82.0 ± 1.3 | 81.0 ± 2.7 | 82.2 ± 0.4 | 82.4 ± 2.0 | 77.1 ± 0.8 |
| 0.5 | 81.5 ± 1.4 | 79.0 ± 1.3 | 81.6 ± 0.3 | 80.0 ± 2.0 | 80.6 ± 0.7 |
| 0.25 | 81.5 ± 1.4 | 79.0 ± 1.3 | 81.6 ± 0.3 | 80.0 ± 2.0 | 80.6 ± 0.7 |

Nền **M2 + M1**:

| λ | Recall validation | Coverage validation | Recall test | Coverage test | Đa dạng danh mục test |
|---:|---:|---:|---:|---:|---:|
| 1 | 82.0 ± 1.4 | 73.7 ± 1.1 | 81.9 ± 0.4 | 73.2 ± 1.7 | 65.9 ± 1.4 |
| 0.9 | 81.2 ± 1.4 | 72.2 ± 1.3 | 81.2 ± 0.4 | 72.2 ± 1.3 | 68.5 ± 1.5 |
| 0.75 | 79.0 ± 1.3 | 69.8 ± 1.3 | 79.3 ± 1.2 | 69.8 ± 1.3 | 73.5 ± 0.3 |
| 0.5 | 77.1 ± 1.0 | 67.8 ± 3.2 | 77.4 ± 1.3 | 67.3 ± 3.3 | 78.3 ± 1.7 |
| 0.25 | 77.1 ± 1.0 | 67.8 ± 3.2 | 77.4 ± 1.3 | 67.3 ± 3.3 | 78.3 ± 1.7 |

## 3. R1b: bảng so sánh M1, M2, M3 và kết hợp (5 seed, TB ± SD, test)

| Phương pháp | P@5 | R@5 | KTC theo đơn (R@5) | Hit@5 | Coverage | Đa dạng danh mục | Ô có SP hiếm | Có gợi ý từ luật | Ô từ luật | Hợp lý nghiệp vụ | Nhãn fallback sai |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Hệ thống hiện tại (luật + fallback) | 11.7 ± 0.3 | 36.8 ± 0.9 | [35.1; 38.6] | 47.4 ± 0.7 | 89.6 ± 0.0 | 50.9 ± 0.6 | 2.63 ± 0.09 | 63.8 ± 0.8 | 22.7 ± 0.6 | 54.3 ± 0.2 | 0 |
| Luật một cấp (xếp hạng gốc) | 17.2 ± 0.4 | 55.9 ± 1.0 | [53.9; 57.9] | 63.1 ± 1.0 | 86.3 ± 2.4 | 62.2 ± 0.7 | 1.81 ± 0.03 | 95.6 ± 0.6 | 66.2 ± 1.4 | 72.6 ± 1.0 | 0 |
| M3: Kulc × (1 − β·IR) | 17.2 ± 0.4 | 56.0 ± 1.0 | [54.0; 58.0] | 63.2 ± 0.9 | 86.3 ± 2.4 | 61.6 ± 0.5 | 1.81 ± 0.03 | 95.6 ± 0.6 | 66.2 ± 1.4 | 72.6 ± 1.0 | 0 |
| M3: phạt phổ biến conf × P(q)^−γ | 17.3 ± 0.4 | 56.0 ± 1.0 | [54.0; 58.0] | 63.2 ± 1.0 | 86.3 ± 2.4 | 61.5 ± 0.6 | 1.81 ± 0.03 | 95.6 ± 0.6 | 66.2 ± 1.4 | 72.6 ± 1.0 | 0 |
| M3: đa dạng hóa danh mục (λ) | 17.4 ± 0.3 | 56.2 ± 0.7 | [54.2; 58.2] | 63.6 ± 0.3 | 72.1 ± 4.3 | 78.5 ± 6.6 | 0.05 ± 0.05 | 95.6 ± 0.6 | 66.2 ± 1.4 | 83.1 ± 4.4 | 0 |
| M3-R (Recall tốt nhất) | 17.4 ± 0.3 | 56.2 ± 0.7 | [54.2; 58.2] | 63.7 ± 0.3 | 72.5 ± 4.0 | 77.8 ± 7.1 | 0.05 ± 0.05 | 95.6 ± 0.6 | 66.2 ± 1.4 | 83.1 ± 4.4 | 0 |
| M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 17.4 ± 0.3 | 56.2 ± 0.7 | [54.2; 58.3] | 63.7 ± 0.6 | 77.5 ± 9.0 | 72.1 ± 10.9 | 0.75 ± 0.98 | 95.6 ± 0.6 | 66.2 ± 1.4 | 79.3 ± 6.5 | 0 |
| M2 một cấp (xếp hạng gốc) | 17.5 ± 0.3 | 56.6 ± 0.7 | [54.6; 58.5] | 64.1 ± 0.8 | 69.2 ± 3.4 | 66.0 ± 0.5 | 0.05 ± 0.05 | 95.6 ± 0.6 | 66.2 ± 1.4 | 100.0 ± 0.0 | 0 |
| M2 một cấp + M3-R (Recall tốt nhất) | 17.5 ± 0.3 | 56.7 ± 0.8 | [54.8; 58.7] | 64.2 ± 0.5 | 74.6 ± 3.1 | 70.1 ± 3.9 | 0.17 ± 0.07 | 95.6 ± 0.6 | 66.2 ± 1.4 | 100.0 ± 0.0 | 0 |
| M2 một cấp + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 17.5 ± 0.3 | 56.8 ± 1.0 | [54.8; 58.7] | 64.2 ± 0.7 | 76.7 ± 1.7 | 72.4 ± 1.1 | 0.22 ± 0.04 | 95.6 ± 0.6 | 66.2 ± 1.4 | 100.0 ± 0.0 | 0 |
| M1 (xếp hạng gốc) | 17.4 ± 0.3 | 56.3 ± 0.9 | [54.3; 58.3] | 63.8 ± 0.8 | 81.3 ± 4.2 | 65.8 ± 1.3 | 0.64 ± 0.56 | 100.0 ± 0.0 | 97.5 ± 2.3 | 74.1 ± 0.9 | 0 |
| M1 + M3-R (Recall tốt nhất) | 17.4 ± 0.4 | 56.2 ± 0.9 | [54.2; 58.2] | 63.6 ± 0.8 | 81.3 ± 4.2 | 67.0 ± 2.8 | 0.64 ± 0.56 | 100.0 ± 0.0 | 97.5 ± 2.3 | 74.0 ± 1.1 | 0 |
| M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 17.4 ± 0.4 | 56.2 ± 0.9 | [54.2; 58.2] | 63.6 ± 0.8 | 81.3 ± 4.2 | 67.0 ± 2.8 | 0.64 ± 0.56 | 100.0 ± 0.0 | 97.5 ± 2.3 | 74.0 ± 1.1 | 0 |
| M2 + M1 (xếp hạng gốc) | 17.6 ± 0.3 | 56.9 ± 0.9 | [55.0; 58.9] | 64.5 ± 0.8 | 69.2 ± 3.4 | 61.7 ± 1.4 | 0.05 ± 0.05 | 99.3 ± 1.4 | 80.2 ± 1.5 | 100.0 ± 0.0 | 0 |
| M2 + M1 + M3-R (Recall tốt nhất) | 17.6 ± 0.3 | 56.9 ± 0.9 | [55.0; 58.9] | 64.5 ± 0.8 | 69.2 ± 3.4 | 61.7 ± 1.4 | 0.05 ± 0.05 | 99.3 ± 1.4 | 80.2 ± 1.5 | 100.0 ± 0.0 | 0 |
| M2 + M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 17.6 ± 0.3 | 56.9 ± 0.9 | [55.0; 58.9] | 64.5 ± 0.8 | 69.2 ± 3.4 | 61.7 ± 1.4 | 0.05 ± 0.05 | 99.3 ± 1.4 | 80.2 ± 1.5 | 100.0 ± 0.0 | 0 |

### R1b: nhóm sản phẩm ít giao dịch (khi sản phẩm đang xem là sản phẩm hiếm)

| Phương pháp | Recall@5 | KTC theo đơn | Hit@5 | Có gợi ý từ luật | Coverage nhóm | SP hiếm từng được gợi ý (toàn bộ test) |
|---|---:|---|---:|---:|---:|---:|
| Hệ thống hiện tại (luật + fallback) | 0.0 ± 0.0 | [0.0; 0.0] | 0.0 ± 0.0 | 0.0 ± 0.0 | 43.8 ± 0.0 | 42.9 ± 0.0 |
| Luật một cấp (xếp hạng gốc) | 16.7 ± 18.0 | [9.2; 24.9] | 21.3 ± 20.4 | 23.0 ± 22.2 | 45.8 ± 2.6 | 62.9 ± 19.2 |
| M3: Kulc × (1 − β·IR) | 16.7 ± 18.0 | [9.2; 24.9] | 21.3 ± 20.4 | 23.0 ± 22.2 | 45.8 ± 2.6 | 62.9 ± 19.2 |
| M3: phạt phổ biến conf × P(q)^−γ | 16.7 ± 18.0 | [9.2; 24.9] | 21.3 ± 20.4 | 23.0 ± 22.2 | 45.8 ± 2.6 | 62.9 ± 19.2 |
| M3: đa dạng hóa danh mục (λ) | 22.9 ± 14.9 | [12.6; 34.3] | 31.2 ± 14.1 | 23.0 ± 22.2 | 26.7 ± 9.4 | 22.9 ± 23.9 |
| M3-R (Recall tốt nhất) | 22.9 ± 14.9 | [12.6; 34.3] | 31.2 ± 14.1 | 23.0 ± 22.2 | 26.7 ± 9.4 | 22.9 ± 23.9 |
| M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 21.7 ± 14.8 | [11.6; 33.1] | 29.6 ± 14.1 | 23.0 ± 22.2 | 33.8 ± 13.9 | 40.0 ± 37.0 |
| M2 một cấp (xếp hạng gốc) | 26.1 ± 16.4 | [15.9; 37.3] | 36.6 ± 19.0 | 23.0 ± 22.2 | 13.8 ± 3.5 | 22.9 ± 23.9 |
| M2 một cấp + M3-R (Recall tốt nhất) | 63.2 ± 24.0 | [51.7; 74.5] | 73.4 ± 24.4 | 23.0 ± 22.2 | 20.4 ± 3.7 | 68.6 ± 25.6 |
| M2 một cấp + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 81.4 ± 5.8 | [71.4; 90.3] | 89.4 ± 3.5 | 23.0 ± 22.2 | 22.9 ± 0.0 | 85.7 ± 0.0 |
| M1 (xếp hạng gốc) | 37.7 ± 18.3 | [25.3; 51.1] | 44.7 ± 17.9 | 100.0 ± 0.0 | 47.5 ± 5.0 | 31.4 ± 23.5 |
| M1 + M3-R (Recall tốt nhất) | 38.1 ± 17.7 | [25.6; 51.5] | 45.5 ± 16.5 | 100.0 ± 0.0 | 47.1 ± 5.2 | 31.4 ± 23.5 |
| M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 38.1 ± 17.7 | [25.6; 51.5] | 45.5 ± 16.5 | 100.0 ± 0.0 | 47.1 ± 5.2 | 31.4 ± 23.5 |
| M2 + M1 (xếp hạng gốc) | 43.4 ± 18.9 | [30.0; 57.3] | 51.4 ± 16.6 | 91.7 ± 18.6 | 20.0 ± 3.5 | 22.9 ± 23.9 |
| M2 + M1 + M3-R (Recall tốt nhất) | 43.4 ± 18.9 | [30.0; 57.3] | 51.4 ± 16.6 | 91.7 ± 18.6 | 20.0 ± 3.5 | 22.9 ± 23.9 |
| M2 + M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 43.4 ± 18.9 | [30.0; 57.3] | 51.4 ± 16.6 | 91.7 ± 18.6 | 20.0 ± 3.5 | 22.9 ± 23.9 |

### R1b: so sánh cặp (cùng truy vấn; số seed có KTC theo đơn > 0 / < 0)

| So sánh | ΔRecall@5 | seed | ΔPrecision@5 | ΔHit@5 | ΔĐa dạng | ΔCoverage | ΔRecall nhóm hiếm | seed |
|---|---:|---|---:|---:|---:|---:|---:|---|
| M3-R (Recall tốt nhất) − Luật một cấp (xếp hạng gốc) | +0.33 ± 0.53 | 4 > 0 · 1 < 0 | +0.14 | +0.60 | +15.7 | -13.8 ± 3.2 | +6.2 ± 5.0 | 4 > 0 · 0 < 0 |
| M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − Luật một cấp (xếp hạng gốc) | +0.35 ± 0.35 | 3 > 0 · 0 < 0 | +0.13 | +0.59 | +9.9 | -8.8 ± 8.4 | +5.0 ± 5.7 | 3 > 0 · 0 < 0 |
| M2 một cấp + M3-R (Recall tốt nhất) − M2 một cấp (xếp hạng gốc) | +0.14 ± 0.29 | 3 > 0 · 0 < 0 | +0.04 | +0.07 | +4.1 | +5.4 ± 5.8 | +37.2 ± 36.3 | 3 > 0 · 0 < 0 |
| M2 một cấp + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − M2 một cấp (xếp hạng gốc) | +0.18 ± 0.45 | 2 > 0 · 0 < 0 | +0.03 | +0.11 | +6.4 | +7.5 ± 4.1 | +55.3 ± 17.9 | 5 > 0 · 0 < 0 |
| M1 + M3-R (Recall tốt nhất) − M1 (xếp hạng gốc) | -0.11 ± 0.25 | 0 > 0 · 1 < 0 | -0.02 | -0.16 | +1.2 | +0.0 ± 0.0 | +0.4 ± 0.9 | 0 > 0 · 0 < 0 |
| M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − M1 (xếp hạng gốc) | -0.11 ± 0.25 | 0 > 0 · 1 < 0 | -0.02 | -0.16 | +1.2 | +0.0 ± 0.0 | +0.4 ± 0.9 | 0 > 0 · 0 < 0 |
| M2 + M1 + M3-R (Recall tốt nhất) − M2 + M1 (xếp hạng gốc) | +0.00 ± 0.00 | 0 > 0 · 0 < 0 | +0.00 | +0.00 | +0.0 | +0.0 ± 0.0 | +0.0 ± 0.0 | 0 > 0 · 0 < 0 |
| M2 + M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − M2 + M1 (xếp hạng gốc) | +0.00 ± 0.00 | 0 > 0 · 0 < 0 | +0.00 | +0.00 | +0.0 | +0.0 ± 0.0 | +0.0 ± 0.0 | 0 > 0 · 0 < 0 |
| M3: Kulc × (1 − β·IR) − Luật một cấp (xếp hạng gốc) | +0.08 ± 0.10 | 1 > 0 · 0 < 0 | +0.01 | +0.11 | -0.5 | +0.0 ± 0.0 | +0.0 ± 0.0 | 0 > 0 · 0 < 0 |
| M3: phạt phổ biến conf × P(q)^−γ − Luật một cấp (xếp hạng gốc) | +0.07 ± 0.11 | 1 > 0 · 0 < 0 | +0.02 | +0.09 | -0.6 | +0.0 ± 0.0 | +0.0 ± 0.0 | 0 > 0 · 0 < 0 |
| M3: đa dạng hóa danh mục (λ) − Luật một cấp (xếp hạng gốc) | +0.27 ± 0.51 | 3 > 0 · 1 < 0 | +0.13 | +0.45 | +16.3 | -14.2 ± 3.1 | +6.2 ± 5.0 | 4 > 0 · 0 < 0 |
| M2 + M1 + M3-R (Recall tốt nhất) − Luật một cấp (xếp hạng gốc) | +1.05 ± 0.36 | 5 > 0 · 0 < 0 | +0.39 | +1.34 | -0.5 | -17.1 ± 2.3 | +26.6 ± 6.4 | 5 > 0 · 0 < 0 |
| M2 + M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) − Luật một cấp (xếp hạng gốc) | +1.05 ± 0.36 | 5 > 0 · 0 < 0 | +0.39 | +1.34 | -0.5 | -17.1 ± 2.3 | +26.6 ± 6.4 | 5 > 0 · 0 < 0 |

Đơn vị: điểm phần trăm.

### R1b: đánh đổi Recall – Coverage theo λ (chiến lược của M3-R; mô tả, KHÔNG dùng để chọn tham số)

Nền **Luật một cấp**:

| λ | Recall validation | Coverage validation | Recall test | Coverage test | Đa dạng danh mục test |
|---:|---:|---:|---:|---:|---:|
| 1 | 55.1 ± 1.1 | 86.3 ± 2.4 | 55.9 ± 1.0 | 86.3 ± 2.4 | 61.5 ± 0.6 |
| 0.9 | 55.4 ± 1.2 | 72.9 ± 4.2 | 56.2 ± 0.8 | 74.2 ± 3.5 | 70.4 ± 0.6 |
| 0.75 | 55.6 ± 0.9 | 72.5 ± 4.0 | 56.3 ± 0.8 | 72.5 ± 4.0 | 82.4 ± 1.4 |
| 0.5 | 55.3 ± 0.9 | 71.3 ± 3.1 | 56.0 ± 0.8 | 71.3 ± 3.1 | 83.4 ± 1.2 |
| 0.25 | 55.3 ± 0.9 | 71.3 ± 3.1 | 56.0 ± 0.8 | 71.3 ± 3.1 | 83.4 ± 1.2 |

Nền **M2 + M1**:

| λ | Recall validation | Coverage validation | Recall test | Coverage test | Đa dạng danh mục test |
|---:|---:|---:|---:|---:|---:|
| 1 | 56.0 ± 1.1 | 69.2 ± 3.4 | 56.9 ± 0.9 | 69.2 ± 3.4 | 61.7 ± 1.4 |
| 0.9 | 55.7 ± 1.2 | 68.8 ± 3.3 | 56.5 ± 0.9 | 68.8 ± 3.3 | 64.4 ± 1.2 |
| 0.75 | 55.3 ± 1.0 | 64.2 ± 2.3 | 56.0 ± 0.9 | 64.6 ± 2.6 | 67.5 ± 1.5 |
| 0.5 | 53.7 ± 1.1 | 72.5 ± 0.9 | 54.5 ± 1.0 | 72.5 ± 1.7 | 71.7 ± 1.5 |
| 0.25 | 53.7 ± 1.1 | 72.5 ± 0.9 | 54.5 ± 1.0 | 72.5 ± 1.7 | 71.7 ± 1.5 |

## 4. Chi phí

Thời gian tạo một danh sách (xếp hạng lại + fallback, không cache), trung bình qua seed và hồ sơ:

| Phương pháp | ms / danh sách |
|---|---:|
| Luật một cấp (xếp hạng gốc) | 0.031 |
| M3: Kulc × (1 − β·IR) | 0.032 |
| M3: phạt phổ biến conf × P(q)^−γ | 0.033 |
| M3: đa dạng hóa danh mục (λ) | 0.044 |
| M3-R (Recall tốt nhất) | 0.040 |
| M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 0.033 |
| M2 một cấp (xếp hạng gốc) | 0.027 |
| M2 một cấp + M3-R (Recall tốt nhất) | 0.029 |
| M2 một cấp + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 0.029 |
| M1 (xếp hạng gốc) | 0.035 |
| M1 + M3-R (Recall tốt nhất) | 0.029 |
| M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 0.028 |
| M2 + M1 (xếp hạng gốc) | 0.023 |
| M2 + M1 + M3-R (Recall tốt nhất) | 0.025 |
| M2 + M1 + M3-C (Coverage, Recall ≥ tốt nhất − 0,5) | 0.027 |

Chi phí khai phá không đổi so với nền (M3 không khai phá lại); xem benchmark Bước 2–4.

## 5. Kết luận (sinh tự động từ số liệu)

- **R1, Kulc × (1 − β·IR)** so với xếp hạng gốc: ΔRecall@5 +0.56 (4 > 0 · 0 < 0), ΔCoverage +0.5, ΔĐa dạng -1.5.
- **R1, phạt phổ biến** so với xếp hạng gốc: ΔRecall@5 +0.37 (2 > 0 · 0 < 0), ΔCoverage +0.0, ΔĐa dạng -1.4.
- **R1, đa dạng hóa danh mục** so với xếp hạng gốc: ΔRecall@5 +0.00 (0 > 0 · 0 < 0), ΔCoverage -9.3, ΔĐa dạng +8.1.
- **R1, M3-R trên luật một cấp** so với xếp hạng gốc: ΔRecall@5 +0.52 (3 > 0 · 0 < 0), ΔCoverage -3.4, ΔĐa dạng +3.7.
- **R1, M3-C trên luật một cấp** so với xếp hạng gốc: ΔRecall@5 +0.56 (4 > 0 · 0 < 0), ΔCoverage +0.5, ΔĐa dạng -1.5.
- **R1, M3-R trên M1** so với xếp hạng gốc: ΔRecall@5 +0.00 (0 > 0 · 0 < 0), ΔCoverage +0.0, ΔĐa dạng +0.0.
- **R1, M3-R trên M2 + M1** so với xếp hạng gốc: ΔRecall@5 +0.00 (0 > 0 · 0 < 0), ΔCoverage +0.0, ΔĐa dạng +0.0.
- **R1, M3-C trên M2 + M1** so với xếp hạng gốc: ΔRecall@5 -0.05 (0 > 0 · 0 < 0), ΔCoverage +2.4, ΔĐa dạng -1.2.
- **R1b, Kulc × (1 − β·IR)** so với xếp hạng gốc: ΔRecall@5 +0.08 (1 > 0 · 0 < 0), ΔCoverage +0.0, ΔĐa dạng -0.5, ΔRecall nhóm hiếm +0.0 (0 > 0 · 0 < 0).
- **R1b, phạt phổ biến** so với xếp hạng gốc: ΔRecall@5 +0.07 (1 > 0 · 0 < 0), ΔCoverage +0.0, ΔĐa dạng -0.6, ΔRecall nhóm hiếm +0.0 (0 > 0 · 0 < 0).
- **R1b, đa dạng hóa danh mục** so với xếp hạng gốc: ΔRecall@5 +0.27 (3 > 0 · 1 < 0), ΔCoverage -14.2, ΔĐa dạng +16.3, ΔRecall nhóm hiếm +6.2 (4 > 0 · 0 < 0).
- **R1b, M3-R trên luật một cấp** so với xếp hạng gốc: ΔRecall@5 +0.33 (4 > 0 · 1 < 0), ΔCoverage -13.8, ΔĐa dạng +15.7, ΔRecall nhóm hiếm +6.2 (4 > 0 · 0 < 0).
- **R1b, M3-C trên luật một cấp** so với xếp hạng gốc: ΔRecall@5 +0.35 (3 > 0 · 0 < 0), ΔCoverage -8.8, ΔĐa dạng +9.9, ΔRecall nhóm hiếm +5.0 (3 > 0 · 0 < 0).
- **R1b, M3-R trên M1** so với xếp hạng gốc: ΔRecall@5 -0.11 (0 > 0 · 1 < 0), ΔCoverage +0.0, ΔĐa dạng +1.2, ΔRecall nhóm hiếm +0.4 (0 > 0 · 0 < 0).
- **R1b, M3-R trên M2 + M1** so với xếp hạng gốc: ΔRecall@5 +0.00 (0 > 0 · 0 < 0), ΔCoverage +0.0, ΔĐa dạng +0.0, ΔRecall nhóm hiếm +0.0 (0 > 0 · 0 < 0).
- **R1b, M3-C trên M2 + M1** so với xếp hạng gốc: ΔRecall@5 +0.00 (0 > 0 · 0 < 0), ΔCoverage +0.0, ΔĐa dạng +0.0, ΔRecall nhóm hiếm +0.0 (0 > 0 · 0 < 0).

## 6. Hạn chế

- Mỗi sản phẩm chỉ có vài ứng viên từ luật (thường ≤ 10), nên xếp hạng lại hầu như chỉ đổi THỨ TỰ trong Top-5; Precision/Recall@5 ít nhạy với thứ tự. Đánh giá theo thứ hạng (vd. MRR, NDCG) chưa được dùng.
- Đa dạng hóa tăng số danh mục khác nhau trong mỗi danh sách nhưng có thể làm GIẢM Coverage toàn danh mục: fallback "cùng danh mục" (trải ra nhiều sản phẩm) bị thay bằng vài sản phẩm bán chạy ở danh mục khác. Đa dạng trong một danh sách và độ phủ toàn danh mục là hai đại lượng khác nhau.
- Kulc và IR của ứng viên từ luật danh mục (M1) dùng số đơn chung ƯỚC LƯỢNG (điểm M1 × sup(ngữ cảnh)), không phải số đếm thật của cặp sản phẩm.
- Tham số chọn hai giai đoạn (nền rồi xếp hạng) có thể bỏ lỡ tổ hợp tốt hơn khi chọn đồng thời.
- Đa dạng hóa chỉ theo danh mục (10 danh mục); chưa xét thương hiệu hay khoảng giá. Dữ liệu vẫn là giả lập.

## 7. Tái lập

```
node scripts/evaluate-ranking.js
node scripts/evaluate-ranking.js --profile r1b --seed 20261103
node --test test/
```
