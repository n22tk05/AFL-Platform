# Tối ưu thời gian OpenCV WASM + VietOCR

Ngày: 10/10/2026. Máy đo: AMD Ryzen 5 7535HS (6 nhân/12 luồng), RAM khoảng 8 GB, PyTorch 2.6.0 CPU. Máy có RTX 2050 nhưng môi trường đang cài chưa có CUDA, nên số liệu dưới đây là **CPU**.

## Kết quả tại service

Ba lượt ghép cặp trước/sau trên mỗi ảnh tổng hợp: **30/30 lượt sau tối ưu dưới 5 giây**, chậm nhất **4,30 giây**. Đây là `processingTimeMs` của service đã nạp model, chưa gồm trình duyệt, HTTP, hàng đợi hay adaptive retry.

| Ảnh | Trung vị trước | Trung vị sau | Chậm nhất sau (3 lượt) |
| --- | ---: | ---: | ---: |
| TC01 | 9,52 s | **4,20 s** | 4,30 s |
| TC02 | 5,21 s | **2,51 s** | 2,52 s |
| TC03 | 6,68 s | **3,17 s** | 3,31 s |
| TC04 — bảng | 3,18 s | **1,96 s** | 1,99 s |
| TC05 | 5,81 s | **2,56 s** | 2,61 s |
| TC06 | 5,74 s | **2,57 s** | 2,71 s |
| TC07 — nghiêng | 6,15 s | **2,65 s** | 2,89 s |
| TC08 | 3,76 s | **1,73 s** | 1,85 s |
| TC09 | 8,29 s | **3,52 s** | 3,87 s |
| TC10 — trắng | 0,057 s | 0,063 s | 0,067 s |

Dữ liệu đầy đủ: [latency-paired.json](latency-paired.json). Thứ tự trước/sau được đảo qua các lượt để hạn chế sai lệch theo thứ tự; không chạy đồng thời với build hay benchmark khác. Ba lượt là kiểm chứng lặp lại trên bộ mẫu nhỏ, **không phải SLA hoặc ước lượng p95 có độ tin cậy thống kê**.

Chữ, bảng, warnings và tọa độ trước/sau khớp trong cả bộ ghép cặp. Sai khác confidence lớn nhất khoảng `2,44e-7`, do số học dấu phẩy động. So với bản đã tối ưu độ chính xác, nội dung và CER/WER của cả 10 ảnh giữ nguyên; CER trung bình của 8 ảnh được chấm vẫn **1,09%**. Xem [latency-quality.json](latency-quality.json).

## Thời gian thực tế trong trình duyệt

Chrome → OpenCV WASM → Next production HTTP API → VietOCR local → JSON hiển thị. Đo từ thao tác bấm nút đến vùng review được render, không mock OCR. Trước lượt đo dùng trang trắng để tải WASM và route; không tính tải trang, chọn file hoặc khởi động model. Một lần quét mỗi ảnh, trong cùng phiên:

| Ảnh | Button → JSON hiển thị |
| --- | ---: |
| TC01 | **5,61 s** |
| TC02 | 2,97 s |
| TC03 | 3,32 s |
| TC04 | 2,13 s |
| TC05 | 3,11 s |
| TC06 | 3,17 s |
| TC07 | 3,69 s |
| TC08 | 2,99 s |
| TC09 | 4,51 s |

**8/9 ảnh có nội dung dưới 5 giây; TC01 đầu tiên vẫn vượt mốc.** Mỗi ảnh chỉ cần một lần OCR, chữ đầu ra khớp benchmark service sau tối ưu. Không có page error. [Dữ liệu lượt toàn bộ](latency-browser.json).

Đo tiếp TC01 ba lượt trên service đã xử lý bộ ảnh trên, dùng phiên Chrome mới: **4,50 s / 4,49 s / 4,22 s**. Trong đó tiền xử lý 88–132 ms, phần OCR/API 4,04–4,34 giây theo waterfall của ứng dụng. [Dữ liệu đo lặp TC01](latency-browser-tc01.json). Các phép đo này cho thấy có thể đạt dưới 5 giây trên ảnh mẫu ở trạng thái đã dùng, nhưng không chứng minh mọi lần quét đầu hoặc mọi tải hệ thống đều đạt mốc.

## Điểm nghẽn và thay đổi

Đo tách recognition khỏi toàn request cho thấy VietOCR chiếm khoảng **97%** thời gian ở TC01 (9,33/9,55 giây), còn phân vùng/giải mã ảnh khoảng 0,22 giây. Giảm độ phân giải ảnh sẽ tác động ít tới điểm nghẽn và có thể mất chữ nhỏ. Xem [profile CPU gốc](latency-profile.json).

1. **Cache attention theo batch.** Decoder cũ đưa toàn bộ prefix qua sáu layer ở mỗi bước. Decoder mới chỉ xử lý token mới, giữ key/value của prefix và tính key/value của encoder memory một lần. Giữ weights FP32, positional encoding, greedy decoding và giới hạn token; softmax chỉ chạy trên logits của bước mới. Cache thuộc từng batch, không giữ ảnh hoặc văn bản giữa request. Model khác không tương thích dùng decoder upstream.
2. **Gộp CNN Conv/BatchNorm ở eval.** Fold 16 cặp của VGG thành convolution tương đương, giảm phép toán trung gian. Không quantize hoặc thay weights bằng model khác; kiểm thử so output trước/sau bằng sai số số học nhỏ.
3. **Hai batch CPU song song, ba luồng/worker trên máy đo.** Vẫn gom đúng chiều rộng crop, không padding thêm. Tối đa hai batch nhận tensor tại một thời điểm; GPU chạy tuần tự. Lock ngoài request giữ service không xử lý nhiều trang nặng đồng thời. Khi lỗi, đợi worker kết thúc trước khi đóng crop.
4. **Warmup đúng đường suy luận mới.** Service chỉ báo ready sau warmup cả predictor và đường batch/cached decoder.
5. **Tải WASM nền.** Hai trang quét khởi tạo runtime dùng chung ngay khi mở; lỗi nền không chặn trang và lần quét thật vẫn báo lỗi hoặc thử lại. Điều này đưa một phần tải đầu ra trước thao tác bấm quét, không làm biến mất chi phí khởi tạo.
6. **Sửa đường dẫn menu.** Kiểm thử production phát hiện Next prefetch các route cũ `/scan` và `/library` gây 404/request thừa. Đã dùng `/citizen/scan`, `/citizen/guide` và `/admin/library` trong route map chung.

## Phạm vi mốc 5 giây

Kết quả service không đảm bảo mọi ảnh hoặc mọi điều kiện dưới 5 giây. Trang hàng trăm vùng, lần tải WASM/model đầu, tải CPU khác, thời gian mạng, hàng đợi hoặc OCR retry đều có thể tăng thời gian. Bước trích xuất trường qua Gemini có thêm thời gian cloud và không nằm trong benchmark này. Bộ ảnh là tổng hợp, chưa có hồ sơ thực tế đã gán nhãn.

Muốn có thêm dư địa cho trang dài hoặc nhiều lượt đọc, có thể nghiên cứu môi trường PyTorch CUDA riêng cho RTX 2050 hiện có. Chưa cài/thay môi trường hiện tại và chưa có số liệu GPU, nên không dự đoán một mốc thời gian cụ thể cho GPU.

## Kiểm chứng và chạy lại

31 kiểm thử Python đã qua, gồm logits incremental so với full-prefix ở cả hai norm order, token/confidence, EOS, giới hạn độ dài, cache độc lập, fallback upstream, CNN fusion và warmup thất bại. OpenCV/documents và build production được kiểm tra lại. Cả 18 kịch bản giao diện chạy xanh trên production sau khi sửa menu gây prefetch 404. Xem [latency-verification.json](latency-verification.json).

```powershell
npm run test:vietocr
npm run benchmark:vietocr:latency
```

Chạy ứng dụng bình thường bằng `npm run dev:all`; **khởi động lại service đang chạy** để nhận decoder mới. `/health` phải có `decoder: cached`, `inferenceWorkers: 2`, `threads: 3` trên máy đo. Không ghi hoặc thay các file `.env` của người dùng. Các server cũ đang chạy khi bắt đầu công việc được giữ nguyên.

Để đo button → JSON trên production local riêng, build bằng `AFL_BUILD_DIR=.next-document-json-build`, chạy service mới ở cổng 8002 và `node scripts/start-document-latency-server.mjs`; rồi chạy `node scripts/benchmark-vietocr-browser.mjs`. Server harness chỉ bind loopback và chỉ chấp nhận endpoint OCR loopback. Không chạy song song với các kiểm thử nặng.

## Nguồn kỹ thuật

- [VietOCR translate upstream](https://github.com/pbcquoc/vietocr/blob/master/vietocr/tool/translate.py): đối chiếu greedy loop và xử lý confidence với package đang cài.
- [PyTorch 2.6 scaled dot product attention](https://docs.pytorch.org/docs/2.6/generated/torch.nn.functional.scaled_dot_product_attention.html): cơ sở kernel attention; dropout đặt 0 cho inference, query mới chỉ nhận prefix đã có.
- [PyTorch Conv/BatchNorm fusion](https://docs.pytorch.org/docs/stable/generated/torch.nn.utils.fuse_conv_bn_eval.html): dùng fusion ở eval với running statistics.
- [Các bản cài PyTorch chính thức](https://pytorch.org/get-started/previous-versions/): phân biệt wheel CPU với CUDA; việc có card NVIDIA không tự làm wheel CPU chạy trên GPU.
