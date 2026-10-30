Thời gian: trung vị của 7 lần. RSS đỉnh: mức tăng bộ nhớ tiến trình trong lần chạy đầu. Heap giữ lại: bộ nhớ của kết quả sau GC.

### A. Thay đổi min_sup (N = 10.000, giỏ TB 4)

| N | min_sup (count) | Itemsets (dài nhất) | Candidate Apriori | Cây điều kiện FP | Thời gian Apriori (ms) | Thời gian FP-Growth (ms) | Nhanh hơn | RSS đỉnh Apriori (MB) | RSS đỉnh FP (MB) | Heap giữ lại A / FP (MB) | Kết quả trùng |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| 10000 | 5% (500) | 30 (3) | 125 | 23 | 17.3 | 15.7 | ×1.1 | 4.6 | 7.2 | 0.07 / 0.07 | ✔ |
| 10000 | 2% (200) | 114 (3) | 1050 | 89 | 24.3 | 27.1 | ×0.9 | 4.0 | 13.2 | 0.09 / 0.09 | ✔ |
| 10000 | 1% (100) | 337 (5) | 3297 | 271 | 35.0 | 38.2 | ×0.9 | 13.0 | 15.6 | 0.18 / 0.17 | ✔ |
| 10000 | 0.5% (50) | 699 (6) | 10804 | 545 | 59.5 | 43.7 | ×1.4 | 16.6 | 16.5 | 0.28 / 0.22 | ✔ |
| 10000 | 0.25% (25) | 1579 (6) | 22585 | 1235 | 79.6 | 46.3 | ×1.7 | 34.0 | 20.6 | 0.47 / 0.47 | ✔ |

### B. Thay đổi số giao dịch (min_sup = 1%)

| N | min_sup (count) | Itemsets (dài nhất) | Candidate Apriori | Cây điều kiện FP | Thời gian Apriori (ms) | Thời gian FP-Growth (ms) | Nhanh hơn | RSS đỉnh Apriori (MB) | RSS đỉnh FP (MB) | Heap giữ lại A / FP (MB) | Kết quả trùng |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| 1000 | 1% (10) | 377 (5) | 4120 | 274 | 8.1 | 7.6 | ×1.1 | 6.1 | 3.2 | 0.17 / 0.15 | ✔ |
| 5000 | 1% (50) | 332 (5) | 3506 | 260 | 20.0 | 14.4 | ×1.4 | 6.6 | 9.0 | 0.16 / 0.13 | ✔ |
| 20000 | 1% (200) | 338 (5) | 3363 | 269 | 72.0 | 49.1 | ×1.5 | 11.8 | 34.2 | 0.16 / 0.14 | ✔ |
| 50000 | 1% (500) | 335 (5) | 3284 | 269 | 163.9 | 121.1 | ×1.4 | 23.1 | 66.8 | 0.16 / 0.14 | ✔ |

### C. Dữ liệu dày (N = 5.000, 100 item, giỏ TB 10)

| N | min_sup (count) | Itemsets (dài nhất) | Candidate Apriori | Cây điều kiện FP | Thời gian Apriori (ms) | Thời gian FP-Growth (ms) | Nhanh hơn | RSS đỉnh Apriori (MB) | RSS đỉnh FP (MB) | Heap giữ lại A / FP (MB) | Kết quả trùng |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| 5000 | 5% (250) | 329 (5) | 1411 | 234 | 63.6 | 33.2 | ×1.9 | 6.5 | 18.0 | 0.16 / 0.15 | ✔ |
| 5000 | 3% (150) | 807 (6) | 3677 | 593 | 115.5 | 44.4 | ×2.6 | 7.2 | 19.6 | 0.28 / 0.25 | ✔ |
| 5000 | 2% (100) | 1636 (6) | 6819 | 1202 | 196.3 | 60.7 | ×3.2 | 16.4 | 29.1 | 0.51 / 0.50 | ✔ |