# Giai đoạn 4 – Bước 2: Benchmark Apriori vs FP-Growth trên R1/R1b

Tạo lúc: 2026-10-26T10:49:51.407Z · Node v20.20.2 · win32 x64 · 12th Gen Intel(R) Core(TM) i7-1255U

Khai phá trên train ∪ validation (16000 đơn) của mỗi bộ; tiến trình con riêng cho mỗi lượt; thời gian = trung vị 15 lần sau 1 lần chạy lạnh; RSS = mức tăng bộ nhớ đỉnh ở lần chạy lạnh (dữ liệu được sinh ở tiến trình cha, nên không tính vào). Không dùng API hay cache.

| Hồ sơ | min_sup | Itemsets | Candidate Apriori | Cây điều kiện FP | Apriori ms (TB ± SD) | FP-Growth ms (TB ± SD) | A/FP [min–max] | RSS đỉnh A / FP MB | Trùng |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| r1 | 0.01 | 92 | 842 | 68 | 15.3 ± 0.5 | 18.7 ± 0.3 | ×0.82 [0.80–0.84] | 2.3 / 8.9 | ✔ 5/5 |
| r1 | 0.005 | 130 | 870 | 97 | 15.6 ± 0.2 | 18.7 ± 0.3 | ×0.84 [0.83–0.85] | 3.0 / 9.5 | ✔ 5/5 |
| r1 | 0.002 | 169 | 888 | 120 | 16.5 ± 0.5 | 18.8 ± 0.6 | ×0.88 [0.83–0.94] | 3.3 / 9.5 | ✔ 5/5 |
| r1b | 0.01 | 61 | 823 | 55 | 18.2 ± 3.9 | 25.5 ± 3.8 | ×0.71 [0.62–0.88] | 1.9 / 10.8 | ✔ 5/5 |
| r1b | 0.005 | 88 | 840 | 71 | 17.8 ± 3.4 | 26.0 ± 6.3 | ×0.70 [0.48–0.91] | 1.9 / 11.5 | ✔ 5/5 |
| r1b | 0.002 | 140 | 1077 | 105 | 20.3 ± 2.2 | 26.8 ± 1.9 | ×0.76 [0.58–0.86] | 2.0 / 11.6 | ✔ 5/5 |

TB ± SD qua các seed; [min–max] của tỷ lệ thời gian Apriori/FP-Growth. Thời gian và bộ nhớ phụ thuộc máy, chỉ dùng để so tương đối hai thuật toán.

Bộ sinh `trungshop-research-generator/1.0.0` · checksum dữ liệu từng seed trong file JSON · tổng thời gian 31 s.
Giới hạn: mỗi lượt heap ≤ 2048 MB, dừng sau 300 s; min_sup ≥ 0.001; kiểm tra ngân sách khai phá trước mỗi lượt.

Tái lập: `node scripts/benchmark-research-datasets.js` (cùng tham số). Chạy riêng một bộ: `--profile r1 --seed 20261101`.
