# TrungShop — Tổng kết nghiên cứu Chương 6–7 (Giai đoạn 1–4)

Tài liệu tham khảo: Han, Kamber, Pei, *Data Mining: Concepts and Techniques*, 3rd Ed. — Chương 6 (Apriori, FP-Growth, luật kết hợp, độ đo đánh giá mẫu), Chương 7 (7.2.1 luật đa mức, 7.3 khai phá có ràng buộc, 7.5.2 top-k ít dư thừa).

Ngày tổng kết: 2026-10-27. Mọi số liệu dưới đây được lấy trực tiếp từ các file JSON trong `research-results/`. Trên website chỉ có phần Chương 6 (Giai đoạn 3); **M1, M2, M3 chưa được tích hợp**.

---

## 1. Phạm vi đã làm

| Giai đoạn / bước | Nội dung | Kết quả chính (file) |
|---|---|---|
| 1 | Apriori (Hình 6.4), FP-Growth (Hình 6.9), sinh luật, độ đo lift / Kulc / IR — `src/apps/services/mining/` | `benchmark-mining.md` |
| 3 | API gợi ý + giao diện "Thường được mua cùng" dùng luật Chương 6 (đang chạy trên website, dữ liệu GR2 1.000 đơn) | — |
| 4.1 | Khung đánh giá offline: chia theo thời gian 70/10/20, che từng sản phẩm, Top-5, bootstrap theo đơn | `phase4-step1-evaluation.md` |
| 4.2 | Dữ liệu nghiên cứu R1 (5 seed) và R1b (5 seed), mỗi bộ 20.000 đơn; benchmark Apriori vs FP-Growth | `phase4-step2-*.md` |
| 4.3 | **M1** — luật đa mức (7.2.1) | `phase4-step3-m1-*.md` |
| 4.4 | **M2** — khai phá có ràng buộc (7.3): M2-A ràng buộc luật, M2-B cắt tỉa anti-monotone | `phase4-step4-m2-*.md` |
| 4.5 | **M3** — xếp hạng lại (Kulc/IR, phạt phổ biến) và đa dạng hóa Top-K | `phase4-step5-m3-evaluation.md` |

---

## 2. Kết quả KHÔNG phụ thuộc dữ liệu giả lập (tính đúng của cài đặt)

Đây là các khẳng định đã được kiểm chứng bằng test hoặc kiểm tra lúc chạy. Chúng đúng bất kể dữ liệu là gì.

- **Theo ví dụ của giáo trình:** test tái hiện Bảng 6.1 (L1–L3, thứ tự header FP-tree), Hình 7.2–7.4 (uniform/reduced support), Bảng 7.1, Ví dụ 7.2 (luật dư thừa), Bảng 7.2 (tính chất anti-monotone/monotone, kiểm trên mọi tập con), Ví dụ 7.8/7.9 và Bảng 6.9 (Kulc, IR, lift của D1–D6).
- **Apriori và FP-Growth cho kết quả giống hệt nhau** ở mọi cấu hình đã chạy: 30/30 cấu hình benchmark ở Bước 2, 3 và 4, và cả 10 bộ đánh giá.
- **M2-B cắt tỉa cho đúng cùng kết quả với hậu lọc**, cho cả tập mục lẫn danh sách gợi ý, ở 30/30 cấu hình và 10/10 bộ. Không bật ràng buộc thì bản cắt tỉa cho đúng kết quả của thuật toán gốc. `src/` không bị sửa.
- **M3 với thứ tự "native" cho đúng y hệt phương pháp nền** (website, M1, M2, M1 + M2). Nhờ vậy mọi khác biệt của M3 chỉ do cách xếp hạng.
- **Fallback không bị tính nhầm là gợi ý từ luật.** Mỗi lần chấm M3 đều kiểm tra: mục "luật" phải có luật nguồn và thuộc tập ứng viên; mục fallback không được thuộc tập ứng viên. Kết quả: 0 vi phạm trên toàn bộ 10 bộ.
- **Chống rò rỉ dữ liệu:**
  - Có test theo dõi dữ liệu của mọi lần học (`observeFit`). Khi chọn tham số chỉ học trên train; khi chấm test chỉ học trên train ∪ validation.
  - Ranh giới thời gian không tách hai đơn cùng thời điểm.
  - Nhóm "sản phẩm hiếm" được xác định chỉ từ lịch sử.
- **Tái lập:**
  - Chạy lại hai lần cho kết quả giống hệt, trừ các trường đo thời gian.
  - Checksum của cả 10 bộ dữ liệu trùng manifest Bước 2.
  - Checksum dữ liệu demo GR2 không đổi.
- **Kiểm thử:** backend 184 test, 183 pass, 1 skip (test cần MongoDB GR2, chỉ chạy khi đặt `RECO_DB_IT=1`), 0 fail.

---

## 3. Kết quả trên DỮ LIỆU GIẢ LẬP R1 / R1b

> Mọi con số trong mục này đến từ bộ sinh `trungshop-research-generator/1.0.0`, có các luật mua kèm được cài sẵn. Chúng chỉ cho biết phương pháp **nắm bắt được cấu trúc mà bộ sinh cài vào** đến mức nào, **không** phải bằng chứng về hiệu quả với khách hàng thật.
>
> - **R1:** giống dữ liệu demo, không có sản phẩm hiếm theo định nghĩa (< 0,5% số đơn lịch sử).
> - **R1b:** nhiều nhiễu hơn, thêm 7 sản phẩm hiếm (21–65 đơn), khoảng 62 truy vấn hiếm mỗi seed.

TB ± SD qua 5 seed, trên tập test. Tham số mọi phương pháp chọn trên validation, trừ "Hệ thống hiện tại" dùng tham số mặc định của website (sup 0,01, conf 0,2).

- "Đa dạng danh mục" = số danh mục khác nhau / độ dài danh sách.
- "SP hiếm được gợi ý" = tỷ lệ sản phẩm hiếm xuất hiện trong ít nhất một danh sách test.
- "Hợp lý nghiệp vụ" = tỷ lệ gợi ý thỏa ràng buộc A2–A4 của M2: không gợi ý điện thoại khi đang xem điện thoại, ốp/kính đúng dòng máy, còn hàng.

### R1

| Phương pháp | P@5 | R@5 | Hit@5 | Coverage | Đa dạng danh mục | Hợp lý nghiệp vụ |
|---|---|---|---|---|---|---|
| Hệ thống hiện tại (tham số website) | 22.6 ± 0.4 | 64.3 ± 0.8 | 70.3 ± 0.9 | 97.6 ± 0.0 | 57.1 ± 0.7 | 71.8 ± 0.7 |
| Luật một cấp (tham số validation) | 28.5 ± 0.4 | 81.8 ± 0.3 | 84.1 ± 0.4 | 89.8 ± 1.1 | 66.7 ± 1.0 | 83.0 ± 1.0 |
| M1 đa mức | 28.5 ± 0.4 | 82.0 ± 0.5 | 84.3 ± 0.5 | 83.4 ± 1.1 | 68.6 ± 1.1 | 86.0 ± 0.6 |
| M2 ràng buộc | 28.5 ± 0.4 | 81.7 ± 0.2 | 84.1 ± 0.4 | 73.2 ± 1.7 | 67.6 ± 0.7 | 100.0 ± 0.0 |
| M1 + M2 | 28.5 ± 0.4 | 81.9 ± 0.4 | 84.3 ± 0.3 | 73.2 ± 1.7 | 65.9 ± 1.4 | 100.0 ± 0.0 |
| M3-R (trên luật một cấp) | 28.2 ± 0.6 | 82.3 ± 0.4 | 86.3 ± 0.8 | 86.3 ± 4.4 | 70.3 ± 6.5 | 86.7 ± 4.5 |
| M3-C (trên luật một cấp) | 28.3 ± 0.5 | 82.3 ± 0.3 | 85.9 ± 1.3 | 90.2 ± 0.0 | 65.2 ± 1.6 | 83.0 ± 1.0 |
| M1 + M3-R | 28.5 ± 0.4 | 82.0 ± 0.5 | 84.3 ± 0.5 | 83.4 ± 1.1 | 68.6 ± 1.1 | 86.0 ± 0.6 |
| M2 + M3-C | 28.1 ± 0.4 | 82.2 ± 0.3 | 86.6 ± 0.4 | 79.0 ± 1.3 | 68.6 ± 2.1 | 100.0 ± 0.0 |
| M1 + M2 + M3-R | 28.5 ± 0.4 | 81.9 ± 0.4 | 84.3 ± 0.3 | 73.2 ± 1.7 | 65.9 ± 1.4 | 100.0 ± 0.0 |

### R1b

| Phương pháp | P@5 | R@5 | Hit@5 | Coverage | Đa dạng danh mục | SP hiếm được gợi ý | Hợp lý nghiệp vụ | Recall@5 nhóm hiếm |
|---|---|---|---|---|---|---|---|---|
| Hệ thống hiện tại (tham số website) | 11.7 ± 0.3 | 36.8 ± 0.9 | 47.4 ± 0.7 | 89.6 ± 0.0 | 50.9 ± 0.6 | 42.9 ± 0.0 | 54.3 ± 0.2 | 0.0 ± 0.0 |
| Luật một cấp (tham số validation) | 17.2 ± 0.4 | 55.9 ± 1.0 | 63.1 ± 1.0 | 86.3 ± 2.4 | 62.2 ± 0.7 | 62.9 ± 19.2 | 72.6 ± 1.0 | 16.7 ± 18.0 |
| M1 đa mức | 17.4 ± 0.3 | 56.3 ± 0.9 | 63.8 ± 0.8 | 81.3 ± 4.2 | 65.8 ± 1.3 | 31.4 ± 23.5 | 74.1 ± 0.9 | 37.7 ± 18.3 |
| M2 ràng buộc | 17.5 ± 0.3 | 56.6 ± 0.7 | 64.1 ± 0.8 | 69.2 ± 3.4 | 66.0 ± 0.5 | 22.9 ± 23.9 | 100.0 ± 0.0 | 26.1 ± 16.4 |
| M1 + M2 | 17.6 ± 0.3 | 56.9 ± 0.9 | 64.5 ± 0.8 | 69.2 ± 3.4 | 61.7 ± 1.4 | 22.9 ± 23.9 | 100.0 ± 0.0 | 43.4 ± 18.9 |
| M3-R (trên luật một cấp) | 17.4 ± 0.3 | 56.2 ± 0.7 | 63.7 ± 0.3 | 72.5 ± 4.0 | 77.8 ± 7.1 | 22.9 ± 23.9 | 83.1 ± 4.4 | 22.9 ± 14.9 |
| M3-C (trên luật một cấp) | 17.4 ± 0.3 | 56.2 ± 0.7 | 63.7 ± 0.6 | 77.5 ± 9.0 | 72.1 ± 10.9 | 40.0 ± 37.0 | 79.3 ± 6.5 | 21.7 ± 14.8 |
| M1 + M3-R | 17.4 ± 0.4 | 56.2 ± 0.9 | 63.6 ± 0.8 | 81.3 ± 4.2 | 67.0 ± 2.8 | 31.4 ± 23.5 | 74.0 ± 1.1 | 38.1 ± 17.7 |
| M2 + M3-C | 17.5 ± 0.3 | 56.8 ± 1.0 | 64.2 ± 0.7 | 76.7 ± 1.7 | 72.4 ± 1.1 | 85.7 ± 0.0 | 100.0 ± 0.0 | 81.4 ± 5.8 |
| M1 + M2 + M3-R | 17.6 ± 0.3 | 56.9 ± 0.9 | 64.5 ± 0.8 | 69.2 ± 3.4 | 61.7 ± 1.4 | 22.9 ± 23.9 | 100.0 ± 0.0 | 43.4 ± 18.9 |

Khoảng tin cậy theo đơn và so sánh cặp có ở `phase4-step5-m3-evaluation.md`. Ví dụ, trên R1b, M1 + M2 so với luật một cấp: ΔRecall@5 = +1,05 ± 0,36 điểm, khoảng tin cậy theo đơn nằm trên 0 ở 5/5 seed; ở nhóm hiếm là +26,6 điểm (5/5 seed).

### 3.1 Điều gì thực sự cải thiện, điều gì chỉ là đánh đổi

| Thay đổi | Tác động (dữ liệu giả lập) | Đánh giá |
|---|---|---|
| **Chọn ngưỡng trên validation** (sup 0,002, conf 0) thay cho tham số website (0,01 / 0,2) | +17,5 (R1) / +19,0 (R1b) điểm Recall@5, 5/5 seed | **Cải thiện lớn nhất**. Đây không phải thuật toán mới mà là cách chọn tham số; ngưỡng tối ưu nằm ở giới hạn dưới mà API cho phép |
| **M1** đa mức | Toàn bộ: +0,2 / +0,4 điểm. Nhóm hiếm R1b: 16,7% → 37,7% | Cải thiện ở **nhóm hiếm nhờ luật danh mục** (vd. Galaxy S24 FE → sạc Samsung). Đổi lại: Coverage −6 điểm, và sản phẩm hiếm ít được gợi ý hơn khi là đáp án (63% → 31%) |
| **M2-A** ràng buộc nghiệp vụ | Hợp lý nghiệp vụ 73–83% → 100%. Recall không giảm (R1 −0,02; R1b +0,7). Coverage −13 đến −17 điểm | **Đánh đổi**: không còn gợi ý vô lý, nhưng độ phủ giảm. 100% là theo định nghĩa (dùng chính các ràng buộc) |
| **M2-B** cắt tỉa | Không đổi chất lượng (theo lý thuyết và kiểm chứng). Apriori trên giao dịch đa mức nhanh hơn ×1,7–3,6; **FP-Growth chậm hơn ×0,74–0,96** | Chỉ là **chi phí**. Có lợi rõ với Apriori trên dữ liệu đa mức, bất lợi với FP-Growth |
| **M1 + M2** | Recall R1b tốt nhất (56,9%), nhóm hiếm 43,4%, 100% hợp lý | Tốt nhất về Recall nhưng **Coverage thấp nhất** (69–73%) |
| **M3** Kulc / phạt phổ biến (không đa dạng hóa) | +0,4 đến +0,6 điểm Recall trên R1 (2–4/5 seed có ý nghĩa); gần 0 trên R1b | Cải thiện nhỏ, chủ yếu ở Hit@5 (+1,2 đến +2,2). Không đổi Coverage |
| **M3** đa dạng hóa danh mục | Đa dạng +8 (R1) / +16 (R1b) điểm; Recall ≈ 0; **Coverage −9 / −14 điểm** | **Đánh đổi**: danh sách đa dạng hơn nhưng phủ ít sản phẩm hơn, vì fallback "cùng danh mục" bị thay bằng vài sản phẩm bán chạy |
| **M3 trên M1 hoặc M1 + M2** | ≈ 0 (validation thường chọn lại thứ tự gốc) | Không cải thiện |
| **M2 + M3-C** | Nhóm hiếm R1b: 81,4% ± 5,8; Coverage 76,7% (cao hơn M2 và M1 + M2) | Xem cảnh báo ngay dưới |

> **Cảnh báo về con số 81,4% của M2 + M3-C ở nhóm hiếm.** Đã kiểm tra: không có rò rỉ dữ liệu, nhưng **toàn bộ** gợi ý cho máy hiếm đều là **fallback**, không có luật nào.
>
> - Fallback có ràng buộc được đa dạng hóa theo danh mục, nên lấy một sản phẩm từ danh mục ốp lưng.
> - Ràng buộc tương thích theo tên chỉ cho phép đúng ốp của máy đó (vd. "Ốp lưng Galaxy S24 FE"), và bộ sinh lại cài chính ốp này làm sản phẩm mua kèm (xác suất 0,7).
>
> Như vậy đây là gợi ý **dựa trên tri thức nghiệp vụ** (tương thích), không phải kết quả khai phá luật. Trên dữ liệu thật, hiệu quả phụ thuộc việc tên sản phẩm có ghi đúng dòng máy hay không.

### 3.2 Thời gian và bộ nhớ (máy i7-1255U, Node 20, 16.000 đơn lịch sử)

- **Chương 6, giao dịch một cấp:** Apriori 15–20 ms, FP-Growth 19–27 ms. Apriori nhanh hơn trên dữ liệu thưa này.
- **Dữ liệu dày (benchmark Giai đoạn 1):** FP-Growth nhanh hơn tới ×3,2.
- **M1:** giao dịch dài gấp khoảng 1,9 lần, số tập phổ biến gấp 5–10 lần. Apriori chậm đi ×4–7 lần (khoảng 130 ms), FP-Growth chỉ ×1,4–1,9 lần (khoảng 41–53 ms).
- **M2-B:** Apriori đa mức có cắt tỉa giảm từ 104 xuống 34 ms (số candidate được đếm 3.790 → 639).
- **M3:** chỉ sắp xếp lại vài ứng viên mỗi danh sách, không khai phá lại.
- Bộ nhớ đỉnh mọi cấu hình dưới khoảng 15 MB. Tất cả số đo phụ thuộc máy, chỉ nên so tương đối.

---

## 4. Xác nhận chọn tham số

- Mọi tham số được chọn **chỉ bằng validation**, trên mô hình học từ train. Các tham số này gồm ngưỡng support và confidence, ngưỡng danh mục và policy của M1, ngưỡng của M2, cùng chiến lược, β, γ và λ của M3.
- Sau đó mô hình được học lại trên train ∪ validation và chấm test **một lần**.
- Có test chứng minh (`observeFit`).
- Bảng "đánh đổi theo λ" trong báo cáo M3 có cột test chỉ để **mô tả**, không dùng để chọn.
- Tiêu chí M3-C được khai báo **trước khi chạy**: Coverage cao nhất trong các cấu hình có Recall validation kém Recall tốt nhất không quá 0,5 điểm. Như vậy Coverage không được tăng bằng mọi giá.

---

## 5. Đề xuất cấu hình cho TrungShop (CHƯA tích hợp)

Thứ tự ưu tiên, từ ít rủi ro đến nhiều rủi ro:

1. **Bước đầu, nên làm khi có dữ liệu thật:**
   - Giữ luật một cấp của Chương 6, nhưng **chọn lại ngưỡng trên validation theo thời gian** từ đơn hàng thật, thay cho mặc định 0,01 / 0,2.
   - Trên dữ liệu giả lập, ngưỡng tốt nhất nằm ở giới hạn dưới của API (0,002), nên cần cho phép thử thấp hơn và kiểm tra lại với dữ liệu thật.
   - Đây là thay đổi đem lại lợi ích lớn nhất trong nghiên cứu và gần như không thêm độ phức tạp.
2. **Thêm ràng buộc nghiệp vụ M2-A cho luật và cho fallback:**
   - Không gợi ý điện thoại khi đang xem điện thoại.
   - Ốp lưng và kính cường lực phải đúng dòng máy.
   - Sản phẩm gợi ý phải còn hàng.

   Ràng buộc này loại hết gợi ý vô lý mà không làm giảm Recall. Đổi lại Coverage giảm, cần theo dõi khi chạy thật. Nên dùng thêm M2-B (cắt tỉa) chỉ khi dùng Apriori.
3. **Xếp hạng (M3):**
   - Dùng **Kulczynski** (β = 0), là độ đo null-invariant mà giáo trình khuyến nghị và được validation chọn nhiều nhất; có thể kèm đa dạng hóa nhẹ (λ ≈ 0,75).
   - λ phải chọn lại trên dữ liệu thật, vì đa dạng hóa làm giảm Coverage toàn danh mục.
   - Mỗi gợi ý hiển thị được luật nguồn và các chỉ số support, confidence, lift, Kulc, IR.
4. **M1 (luật đa mức):** chỉ nên thêm nếu dữ liệu thật có nhiều sản phẩm ít bán. M1 thêm độ phức tạp, chi phí khai phá gấp khoảng 3–4 lần, và lợi ích trên toàn bộ truy vấn rất nhỏ (+0,2 đến +0,4 điểm).

Trước khi đưa lên website cần: đánh giá offline trên đơn hàng thật, A/B test hoặc theo dõi tỷ lệ bấm và mua, rà soát tri thức tương thích (danh mục điện thoại, dòng máy), và giữ chế độ `?research=1` để so sánh.

---

## 6. Hạn chế nghiên cứu

1. **Dữ liệu giả lập.** Luật mua kèm do bộ sinh cài sẵn, hành vi mua không đổi theo thời gian, và không có thông tin khách hàng, giá thay đổi hay hết hàng thật. 5 seed chỉ đo dao động ngẫu nhiên của cùng một bộ sinh, không đo sự khác biệt giữa các cửa hàng.
2. **Nhóm hiếm nhỏ:** 7 sản phẩm, khoảng 62 truy vấn mỗi seed, nên khoảng tin cậy rộng (SD qua seed tới ±18–24 điểm). R1 không có nhóm hiếm.
3. **Một phần tri thức nghiệp vụ trùng với cách bộ sinh tạo dữ liệu.** Ví dụ, ốp lưng của máy hiếm vừa được bộ sinh cài làm sản phẩm mua kèm, vừa được ràng buộc tương thích chọn ra. Vì vậy các con số của M2 và M3-C ở nhóm hiếm có thể lạc quan hơn thực tế.
4. **Chỉ số "hợp lý nghiệp vụ" dùng chính các ràng buộc của M2**, nên M2 đạt 100% theo định nghĩa.
5. **Tương thích chỉ suy từ tên sản phẩm.** Giả định "sạc, cáp, tai nghe, pin hợp với mọi máy" chưa được kiểm chứng.
6. **Hệ phân cấp chỉ có 2 cấp** (danh mục → sản phẩm), vì DB không có danh mục cha.
7. **Chỉ số chưa xét thứ hạng.** Chỉ dùng Precision, Recall, Hit Rate, Coverage và độ đa dạng, chưa dùng MRR hay NDCG. Xếp hạng lại chủ yếu đổi thứ tự trong Top-5, nên các chỉ số này ít nhạy.
8. **Chọn tham số theo hai giai đoạn** (nền rồi xếp hạng) có thể bỏ lỡ tổ hợp tốt hơn. Tham số tốt nhất nhiều khi nằm ở biên lưới.
9. **Thời gian và bộ nhớ đo trên một máy**, chỉ nên so tương đối.
10. **Công thức gộp** Kulc × (1 − β·IR), phạt phổ biến và đa dạng hóa danh mục là lựa chọn của đồ án. Giáo trình chỉ khuyến nghị Kulc cùng IR (6.3.3) và trình bày top-k ít dư thừa cho việc chọn **mẫu** (7.5.2).

---

## 7. Trạng thái mã nguồn

- **Chưa có gì được commit** kể từ commit `97df095`. Đang chờ commit: phần sửa bảo mật (`config/env.js`, `src/libs/jwt.js`, `config/mail.js`, `auth.js`, `www.js`, `src/libs/mail.js`, `.env.example`) và toàn bộ Giai đoạn 4 (`research/`, `scripts/*research*|*multilevel*|*constraints*|*ranking*|evaluate-recommenders.js`, `test/{config,evaluation,multilevel,constraints,ranking}/`, `research-results/phase4-*`).
- **Đã quét secret** trong các file chưa commit: không có chuỗi kết nối kèm mật khẩu, khóa riêng hay token thật. Các chỗ khớp mẫu chỉ là giá trị giả trong `.env.example` và trong file test. `JWT_SECRET` thật không xuất hiện trong file nào ngoài `.env`, và `.env` được gitignore.
- **Còn tồn tại:** mật khẩu Gmail cũ nằm trong commit đã push `f62ab63`. Cần thu hồi App Password trong tài khoản Google; nếu muốn, làm sạch lịch sử Git theo hướng dẫn ở bước bảo mật.

## 8. Tái lập

```
cd Shop/Shop/backendapi
node scripts/benchmark-research-datasets.js
node scripts/evaluate-research-datasets.js
node scripts/benchmark-multilevel.js   && node scripts/evaluate-multilevel.js
node scripts/benchmark-constraints.js  && node scripts/evaluate-constraints.js
node scripts/evaluate-ranking.js
node --test test/
```

Mỗi script nhận `--profile r1b --seed 20261103` để chạy riêng một bộ. Mỗi bộ chạy trong tiến trình con có giới hạn heap và thời gian. Không script nào đọc `.env` hay kết nối MongoDB.
