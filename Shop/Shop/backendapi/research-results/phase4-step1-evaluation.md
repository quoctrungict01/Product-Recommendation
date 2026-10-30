# Giai đoạn 4 – Bước 1: Đánh giá offline hệ thống gợi ý và baseline

Tạo lúc: 2026-10-26T10:01:45.094Z · Node v20.20.2 · lệnh: `node scripts/evaluate-recommenders.js`

> **Dữ liệu giả lập.** Bộ dữ liệu được sinh bởi `scripts/seed-demo` với các luật mua kèm cài sẵn.
> Kết quả dưới đây đo khả năng *tìm lại các mẫu đã cài*, không phản ánh hành vi khách hàng thật.

## 1. Dữ liệu

- Bộ dữ liệu: **GR2-demo (tái tạo offline)** — nguồn: scripts/seed-demo/plan.js (dữ liệu giả lập có luật cài sẵn)
- Seed: 20261026 · 1000 đơn · 41 sản phẩm · checksum đơn hàng (SHA-1): `d1eb602b9280f67944583f56b7e9f832539a7925`
- Tái tạo offline trong bộ nhớ; không kết nối, không ghi MongoDB GR2.

## 2. Chia dữ liệu theo thời gian và giao thức

| Tập | Đơn | Đơn có ≥ 2 sản phẩm | Truy vấn (lượt thử) | Khoảng thời gian |
|---|---:|---:|---:|---|
| train | 700 | 391 | – | 2026-03-31 → 2026-08-22 |
| validation | 100 | 54 | 130 | 2026-08-22 → 2026-09-12 |
| test | 200 | 114 | 281 | 2026-09-12 → 2026-10-25 |

Tỷ lệ 0.7 / 0.1 / 0.2. Đơn cùng thời điểm không bị tách qua ranh giới.

**Giao thức (che giấu từng sản phẩm):** với mỗi đơn đánh giá có ≥ 2 sản phẩm khác nhau, lần lượt lấy một sản phẩm q làm “sản phẩm đang xem”; các sản phẩm còn lại của đơn là đáp án. Mỗi phương pháp gợi ý Top-5 không chứa q. Đơn chỉ có 1 sản phẩm không tạo truy vấn.

**Chống rò rỉ dữ liệu:**
- max(time train) ≤ min(time validation)
- max(time train ∪ validation) ≤ min(time test)
- không đơn nào nằm ở hai tập
- tham số chỉ chọn bằng validation; test chỉ dùng một lần
- Khi chọn tham số: mọi phương pháp chỉ học từ **train**. Khi chấm test: học từ **train ∪ validation** (đều xảy ra trước test).
- Số lượng bán (Most Popular, Category-Based, fallback) và luật đều tính từ lịch sử được phép; không dùng cache của website.

## 3. Định nghĩa chỉ số

- **Precision@5** = số gợi ý trúng / 5 (danh sách ngắn hơn 5 vẫn chia cho 5).
- **Recall@5** = số gợi ý trúng / số đáp án của truy vấn.
- **Hit Rate@5** = tỷ lệ truy vấn có ít nhất một gợi ý trúng.
- **Coverage** = số sản phẩm khác nhau từng được gợi ý trên tập test / 41 sản phẩm.
- **Truy vấn có gợi ý từ luật** = tỷ lệ truy vấn có ít nhất một gợi ý `source = association-rule`.
- **Độ dài TB** = số gợi ý trung bình mỗi truy vấn.
- Khoảng tin cậy 95%: bootstrap 1000 lần theo cụm đơn hàng (seed 20261026), vì các truy vấn từ cùng một đơn không độc lập.

## 4. Chọn tham số trên validation

- Lưới: minSupport ∈ {0.002, 0.003, 0.005, 0.01, 0.015, 0.02, 0.03} × minConfidence ∈ {0, 0.05, 0.1, 0.2, 0.3, 0.4} (42 bộ).
- Mục tiêu: Recall@K của luật + fallback trên validation (hòa: HitRate, Precision, minSupport lớn, minConfidence lớn).
- **Chọn: minSupport = 0.003, minConfidence = 0.05.** Không nằm ở biên lưới.
- Validation chỉ có 130 truy vấn từ 54 đơn, nên việc chọn tham số còn nhiễu. 5 bộ tốt nhất:

| minSupport | minConfidence | Recall@5 | Hit Rate@5 | Precision@5 |
|---:|---:|---:|---:|---:|
| 0.003 | 0.05 | 81.8% | 85.4% | 26.8% |
| 0.003 | 0 | 81.8% | 85.4% | 26.8% |
| 0.002 | 0.05 | 81.8% | 85.4% | 26.8% |
| 0.002 | 0 | 81.8% | 85.4% | 26.8% |
| 0.003 | 0.1 | 80.8% | 84.6% | 26.5% |

Tham số mặc định của website (minSupport 0.01, minConfidence 0.2) được đánh giá **nguyên trạng**, không chỉnh theo test.

## 5. Kết quả trên tập test (281 truy vấn từ 114 đơn)

| Phương pháp | Precision@5 | Recall@5 | Hit Rate@5 | Coverage | Truy vấn có gợi ý từ luật | Độ dài TB |
|---|---:|---:|---:|---:|---:|---:|
| Random (seed 42) | 2.5% [1.8%; 3.3%] | 7.6% [5.4%; 10.4%] | 12.1% [8.6%; 15.9%] | 100.0% (41) | 0.0% | 5.00 |
| Most Popular | 11.7% [8.7%; 15.3%] | 36.3% [29.0%; 44.0%] | 43.8% [35.1%; 52.8%] | 14.6% (6) | 0.0% | 5.00 |
| Category-Based (cùng danh mục → bán chạy) | 7.0% [5.5%; 8.6%] | 22.8% [17.3%; 28.1%] | 33.1% [26.3%; 39.6%] | 95.1% (39) | 0.0% | 5.00 |
| Co-occurrence (logic cũ, sup ≥ 1%, conf ≥ 1%) | 20.5% [16.5%; 24.4%] | 57.4% [48.9%; 64.9%] | 63.3% [54.6%; 71.7%] | 53.7% (22) | 0.0% | 2.79 |
| Hệ thống hiện tại – chỉ luật (tham số website: sup 0.01, conf 0.2) | 18.5% [14.9%; 22.1%] | 52.6% [45.0%; 60.3%] | 58.4% [50.5%; 66.4%] | 51.2% (21) | 76.9% | 2.31 |
| Hệ thống hiện tại – luật + fallback (tham số website) | 19.3% [15.9%; 22.9%] | 54.4% [47.2%; 62.0%] | 61.6% [54.3%; 69.6%] | 97.6% (40) | 76.9% | 5.00 |
| Luật – chỉ luật (tham số chọn trên validation: sup 0.003, conf 0.05) | 24.8% [20.7%; 29.3%] | 70.1% [62.6%; 77.2%] | 73.0% [65.3%; 80.2%] | 65.9% (27) | 93.2% | 3.62 |
| Luật + fallback (tham số chọn trên validation) | 25.2% [21.2%; 29.8%] | 71.2% [63.9%; 78.0%] | 75.1% [67.8%; 82.0%] | 92.7% (38) | 93.2% | 5.00 |

Số trong ngoặc vuông là khoảng tin cậy 95%. Coverage kèm số sản phẩm khác nhau được gợi ý.

**“Chỉ luật” và “luật + fallback”:** dòng “chỉ luật” chỉ giữ gợi ý `association-rule` (danh sách có thể ngắn hơn 5); dòng “+ fallback” bổ sung cùng danh mục rồi bán chạy, đúng như website hiển thị.

### So sánh cặp trên cùng truy vấn (chênh lệch điểm phần trăm, KTC 95%)

| A | B | Δ Recall@5 | Δ Hit Rate@5 |
|---|---|---:|---:|
| Luật + fallback (tham số chọn trên validation) | Most Popular | +34.9 [+26.9; +43.3] | +31.3 [+22.5; +40.7] |
| Luật + fallback (tham số chọn trên validation) | Category-Based (cùng danh mục → bán chạy) | +48.3 [+40.8; +55.9] | +42.0 [+34.2; +49.7] |
| Luật + fallback (tham số chọn trên validation) | Co-occurrence (logic cũ, sup ≥ 1%, conf ≥ 1%) | +13.8 [+9.5; +19.2] | +11.7 [+7.3; +16.8] |
| Luật + fallback (tham số chọn trên validation) | Hệ thống hiện tại – luật + fallback (tham số website) | +16.8 [+11.7; +22.7] | +13.5 [+8.7; +18.9] |

Nếu khoảng tin cậy không chứa 0 thì chênh lệch phân biệt được trên *bộ dữ liệu giả lập này*; đây không phải kết luận cho dữ liệu thật.

## 6. Apriori và FP-Growth

| Tham số | Truy vấn so sánh | Gợi ý giống hệt | Số luật | Thời gian khai phá + dựng chỉ mục, trung vị (Apriori / FP-Growth) |
|---|---:|:---:|---:|---|
| sup 0.01, conf 0.2 | 411 | ✔ | 196 | 2.10 ms / 0.86 ms (5 lần) |
| sup 0.003, conf 0.05 | 411 | ✔ | 505 | 1.67 ms / 1.12 ms (5 lần) |

Hai thuật toán là thuật toán chính xác nên cho cùng tập luật và cùng gợi ý; **chất lượng gợi ý chỉ cần báo cáo một lần**. Với 800 đơn, thời gian chỉ vài mili-giây và đo trong cùng tiến trình, nên không dùng để so hiệu năng. So sánh thời gian và bộ nhớ có kiểm soát nằm ở `research-results/benchmark-mining.md` (Giai đoạn 1).

## 7. Giới hạn

- **Dữ liệu giả lập có luật cài sẵn**, do cùng nhóm tác giả thiết kế. Phương pháp dựa trên luật được lợi vì dữ liệu được sinh đúng theo dạng “sản phẩm ⇒ phụ kiện”. Không được suy ra kết luận cho khách hàng thật.
- **Cỡ mẫu nhỏ:** test chỉ có 281 truy vấn từ 114 đơn; validation 130 truy vấn. Khoảng tin cậy rộng, chỉ phân biệt được chênh lệch lớn.
- Bộ sinh dữ liệu không thay đổi theo thời gian, nên chia theo thời gian gần với chia ngẫu nhiên; chưa thử được hiện tượng xu hướng mua thay đổi.
- 86 đơn test chỉ có 1 sản phẩm không được chấm; giao thức chỉ đánh giá ngữ cảnh “đang xem một sản phẩm”.
- Mọi sản phẩm đều còn hàng trong dữ liệu demo, nên bộ lọc hết hàng chưa được thử trong thí nghiệm này (đã có unit test riêng).
- Co-occurrence tái hiện logic của controller cũ (ngưỡng 1%/1%, không chỉnh); nó không có fallback.

## 8. Chạy lại

```
cd Shop/Shop/backendapi
node scripts/evaluate-recommenders.js            # ghi research-results/phase4-step1-evaluation.{md,json}
node --test test/                                 # unit test (gồm test/evaluation)
```
Cùng seed và cùng code sẽ cho cùng checksum dữ liệu và cùng bảng kết quả (trừ cột thời gian).
