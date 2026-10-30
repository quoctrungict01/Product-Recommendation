# Giai đoạn 4 – Bước 3: Benchmark M1 (giao dịch đa mức) trên R1/R1b

Tạo lúc: 2026-10-27T02:00:23.082Z · Node v20.20.2 · win32 x64 · 12th Gen Intel(R) Core(TM) i7-1255U · tổng 196 s

Lịch sử train ∪ validation (16000 đơn) của mỗi bộ; ngưỡng uniform giống nhau cho mọi cấp; trung vị 15 lần sau 1 lần chạy lạnh; RSS = mức tăng đỉnh ở lần chạy lạnh; mỗi lượt một tiến trình con riêng. Không dùng API/cache.

| Hồ sơ | min_sup | Độ dài GD một cấp → đa mức | Itemsets | Apriori ms | FP-Growth ms | Chậm hơn A / FP | RSS đỉnh MB (A, FP) một cấp → đa mức | Toàn bộ ms: mine() → fitMultilevel() | A = FP |
|---|---:|---|---|---|---|---|---|---|:---:|
| r1 | 0.01 | 1.82 → 3.43 | 92 → 556 | 19.3 → 105.8 | 26.0 → 37.1 | ×5.5 / ×1.4 | (2.6, 8.9) → (5.5, 7.1) | 24.9 → 83.9 (×3.4) | ✔ 5/5 |
| r1 | 0.005 | 1.82 → 3.43 | 130 → 985 | 21.1 → 122.2 | 25.1 → 41.4 | ×5.8 / ×1.7 | (3.2, 9.5) → (7.2, 7.4) | 24.0 → 84.4 (×3.5) | ✔ 5/5 |
| r1 | 0.002 | 1.82 → 3.43 | 169 → 1770 | 20.8 → 134.6 | 24.8 → 41.0 | ×6.5 / ×1.7 | (3.5, 9.3) → (6.5, 7.9) | 24.9 → 90.3 (×3.6) | ✔ 5/5 |
| r1b | 0.01 | 1.78 → 3.41 | 61 → 288 | 17.3 → 73.9 | 26.2 → 50.2 | ×4.3 / ×1.9 | (1.7, 11.2) → (6.0, 8.5) | 29.8 → 91.4 (×3.1) | ✔ 5/5 |
| r1b | 0.005 | 1.78 → 3.41 | 88 → 600 | 18.3 → 97.7 | 26.1 → 49.0 | ×5.3 / ×1.9 | (1.9, 11.5) → (7.0, 8.8) | 26.4 → 91.5 (×3.5) | ✔ 5/5 |
| r1b | 0.002 | 1.78 → 3.41 | 140 → 1453 | 19.7 → 129.4 | 28.9 → 53.0 | ×6.6 / ×1.8 | (2.3, 11.6) → (7.1, 12.3) | 28.1 → 116.4 (×4.1) | ✔ 5/5 |

Giá trị là trung bình qua các seed của trung vị từng seed. "A = FP": Apriori và FP-Growth cho cùng tập phổ biến (checksum) trên cả giao dịch một cấp và đa mức.
"Toàn bộ": mine() của website sinh mọi luật từ mọi tập; fitMultilevel() chỉ sinh luật 1 ⇒ 1 (đủ cho gợi ý) nhưng thêm bước mở rộng giao dịch, bỏ tập tầm thường và lọc theo cấp.

Giới hạn: heap ≤ 2048 MB, 300 s mỗi lượt; min_sup ≥ 0.001; kiểm tra ngân sách khai phá trước mỗi lượt. Tái lập: `node scripts/benchmark-multilevel.js`; một bộ: `--profile r1b --seed 20261101`.
