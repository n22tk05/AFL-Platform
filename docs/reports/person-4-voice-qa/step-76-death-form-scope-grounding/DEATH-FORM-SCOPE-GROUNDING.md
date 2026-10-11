# Step 76 — Grounding the person named in a death-registration form

## Phát hiện

Trang trắng P89 của tờ khai đăng ký lại khai tử chưa có trong fixture/benchmark trước đó. Chạy lần đầu qua `/admin/upload` phát hiện nhãn “Họ, chữ đệm, tên” sau câu “Đề nghị cơ quan đăng ký lại khai tử cho người có tên dưới đây” bị kế thừa scope “người yêu cầu”. Một số trường tiếp theo cũng thiếu đối tượng, dù OCR nhận được câu tiêu đề và nhãn trường.

## Thay đổi

- Nhận diện đúng câu khai tử như một ranh giới scope tường minh; các nhãn chung sau đó được gắn với “người đã chết”, không tiếp tục mượn scope “người yêu cầu”.
- Dùng reason `ACTOR_SCOPE_GROUNDED` chỉ cho scope có căn cứ trực tiếp trong câu “cho người có tên dưới đây”. Các scope ngầm/không đầy đủ tiếp tục dùng `ACTOR_SCOPE_INFERRED` và vẫn ưu tiên review.
- Trường grounded chỉ chuyển thành `suggested`; không thay đổi điều kiện xác nhận review hay API xuất bản.
- Thêm unit regression cho tên người yêu cầu và người đã chết cùng biểu mẫu; thêm browser regression chạy ảnh trang P89 thực tế qua upload.

## Đo kiểm

- P89 upload draft: 30 trường phát hiện, 21 nhãn không rỗng, 56 vùng loại trừ.
- 6 trường cho người đã chết được gắn `ACTOR_SCOPE_GROUNDED` và chuyển sang `suggested`; tên người yêu cầu vẫn giữ scope riêng.
- Mục ưu tiên review: 17 ở lần chạy đầu; 21 ở biến thể scope đã sửa nhãn nhưng còn bị đánh dấu suy luận; còn **15** sau khi phân biệt scope tường minh (giảm 6 so với biến thể trung gian; giảm 2 so với lần đầu).
- Đây là đo số mục ưu tiên từ máy, không phải số lần admin sửa hoặc thời gian review. Chưa có ground-truth hoàn chỉnh cho trang P89 nên không công bố precision/recall hay IoU.

## Kiểm thử

- Unit test scope khai tử: passed; trường được gắn đối tượng đúng nhưng không bị tự duyệt.
- Browser `/admin/upload` P89: passed; đã gửi ảnh qua pipeline nhận diện, chặn lưu asset/gọi Gemini, không ghi DB.
- Browser regression P20 và P70: **2/2 passed** sau thay đổi scope khai tử.
- Nhận diện form/manifest/assets/đa trang: **118/118 passed**.
- OpenCV: **57/57 passed**; TypeScript: passed; production build: passed.
- Còn cảnh báo lint sẵn có về `<img>` và dependency `useMemo`.

## Giới hạn và bước tiếp

- P89 vẫn có 9 trường thiếu nhãn và 15 trường ưu tiên review. Các trường ngày/giờ, checkbox, số đăng ký và nhãn tọa độ ước lượng chưa được nới rule.
- Bổ sung ground truth thủ công cho P89 (nhãn, vùng nhập, continuation, checkbox và tọa độ) trước khi tuyên bố cải thiện chính xác; bổ sung thêm holdout chưa dùng để tune.
- P59/P61 vẫn là điểm yếu về nhãn/geometry theo báo cáo step 75; cần xử lý OCR/text layout và phân đoạn inline bằng chứng riêng, không hạ review theo tỷ lệ tổng hợp.
- Cần đo thời gian và số lần sửa của admin trên cùng các biểu mẫu trước/sau. Mục tiêu giảm tải chưa được nghiệm thu.

## An toàn dữ liệu

Chỉ dùng biểu mẫu trắng tại local. Test chặn ghi asset và sinh kịch bản; không dùng dữ liệu công dân, không ghi DB, không gọi Gemini và không tự phê duyệt.
