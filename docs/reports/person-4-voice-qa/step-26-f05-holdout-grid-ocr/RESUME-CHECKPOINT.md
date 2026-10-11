# Checkpoint F05 — 09/10/2026

- Workspace `D:\Users\BT\N3_K1\AFL\AFL-Platform`, nhánh `codex/form-recognition-and-multiline`; các thay đổi từ step-14 đến step-26 chưa commit/push. Giữ mọi thay đổi hiện có, không reset/clean/stash. Không dùng Dely theo yêu cầu trước của người dùng.
- Đọc `F05-HOLDOUT-RESULTS.md` và checkpoint step-25 trước khi tiếp tục. Thay đổi chặng này: `services/vietocr-service/text_layout.py`, test Python tương ứng, `src/modules/forms/services/form-region-recognition.ts`, test TS tương ứng, test browser opt-in F05.
- OCR F05 p2/p3 trước 22/1 dòng, sau 35/29; bản đối soát trước 88+67 ô, 0 nhãn; sau 66+67 ô, 15+1 nhãn. F05 vẫn cần sửa tay nhiều, chưa đạt nghiệm thu nhận diện. Browser hiện chạy qua Next port 3001 và VietOCR port 8000 bản mới; port 8001 thử nghiệm đã dừng.
- Local tests: Python 26/26; recognition PASS; typecheck PASS; build PASS; browser F05 và CT01 PASS; diff check PASS. Không ghi cloud/DB/asset. Bằng chứng JSON ở thư mục ignored `private-documents/recognition-evaluation/`.
- Việc kế tiếp: annotation F05 theo ô và đo precision/recall; truyền header bảng qua trang có điều kiện hình học; loại ô STT/mô tả dư; giữ `needsReview` cho OCR/nhãn không chắc. Về triển khai rộng còn staging commit/API/Voice và quyền DB từ step-25.
