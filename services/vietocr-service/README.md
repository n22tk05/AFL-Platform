# VietOCR Microservice for AFL-Platform

Dịch vụ nhận diện chữ tiếng Việt phục vụ pipeline OCR dòng chữ (Line Segmentation + VietOCR) cho hệ thống AFL-Platform.

## Kiến trúc
```
[Client Image] -> [OpenCV Deskew / Line Segmentation] 
               -> [HTTP POST /predict] 
               -> [FastAPI VietOCR Microservice] 
               -> [Deterministic Assembler / Markdown Export]
```

## Yêu cầu môi trường
- Python 3.11 trên môi trường Windows đã kiểm thử
- PyTorch CPU 2.6.0 + torchvision 0.21.0 từ index chính thức
- NumPy 1.26.4, OpenCV 4.10.0.84, albumentations 1.4.2 cho VietOCR 0.3.13
- VietOCR
- FastAPI & Uvicorn

## Cấu trúc thư mục
- `app.py`: FastAPI server xử lý nhận diện dòng chữ theo format của `VietOcrAdapter`.
- `requirements.txt`: Danh sách các package Python cần thiết.
- `start.ps1`: Script PowerShell khởi chạy service trên cổng 8000.
- `start.bat`: File batch khởi chạy nhanh trên Windows.

## Cách chạy

Cài mới hoặc sửa môi trường dependency:

```powershell
powershell -File services/vietocr-service/setup.ps1
```

Script chỉ cài dependency trong `.venv` và chuẩn bị weights model local; không đổi
policy Windows. `inference.yml` chứa cấu hình inference từ repo VietOCR chính thức.
Service dùng `.cache/vgg_transformer.pth` hoặc weights đã có trong thư mục TEMP;
có thể chỉ định `VIETOCR_WEIGHTS_PATH`/`VIETOCR_CONFIG_PATH` cho model tin cậy khác.
Không tải config hay weights lúc service khởi động. Model khác cần config tương ứng,
không tự fallback sang model khác khi lỗi.

Endpoint dùng thống nhất `http://127.0.0.1:8000/predict` để tránh khác biệt IPv4/IPv6.
Từ thư mục gốc, `npm run dev:all` khởi động cả VietOCR và Web; `/health` phải trả
`status: ok`, `ready: true` trước khi sử dụng OCR.

### Cách 1: Qua npm (từ thư mục gốc của project AFL-Platform)
```bash
npm run vietocr:start
```

### Cách 2: Chạy trực tiếp từ thư mục `services/vietocr-service`
```powershell
# Chạy với PowerShell
.\start.ps1

# Hoặc kích đúp file start.bat
```

## Lỗi khởi động trên Windows

### `spawn EINVAL` khi launcher mở Next.js

Chạy `npm run dev:all` từ thư mục gốc. Launcher chạy Next.js bằng Node và CLI
JavaScript trực tiếp, không spawn `npm.cmd`. Nó xử lý lỗi/thoát của tiến trình con,
chỉ báo Web sẵn sàng sau HTTP health check và giữ trạng thái OCR riêng.

Kiểm thử launcher: `node --test scripts/tests/start-all.test.mjs`.

### PyTorch: `WinError 4551` / `Application Control policy`

Đây là lỗi Windows từ chối nạp `torch/lib/shm.dll` hoặc dependency, xảy ra trước
khi FastAPI/model được nạp. Có thể kiểm tra riêng mà không gửi ảnh:

```powershell
& services/vietocr-service/.venv/Scripts/python.exe -c "import torch; print(torch.__version__)"
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-CodeIntegrity/Operational'; Id=3077} -MaxEvents 5 |
    Select-Object TimeCreated, Id, Message
```

Event 3077 chỉ ra file và policy đã chặn. Người quản trị máy cần xem xét policy và
phê duyệt package/binary tin cậy phù hợp. Launcher không tắt Smart App Control,
thay đổi policy, bỏ chặn file hoặc tự cài lại PyTorch. Chạy administrator hay
`ExecutionPolicy Bypass` cho PowerShell không giải quyết quyền nạp DLL này.

Môi trường cũ tại máy này dùng torch 2.14.1 và bị chặn `shm.dll`. Đã thay bằng
wheel CPU 2.6.0 chính thức (SHA256 đối chiếu index PyTorch); import và nạp model local
thành công mà không đổi policy. Điều này không đảm bảo mọi policy/máy đều cho phép
package này. Nếu còn event chặn, cần quản trị viên xử lý policy theo quy định máy.

Khi VietOCR lỗi, launcher ngừng chờ ngay và vẫn mở Web với cảnh báo OCR chưa sẵn
sàng; không sinh OCR giả. Project chỉ dùng VietOCR cho OCR. Xem
[DOCUMENT-EXTRACTION.md](../../docs/DOCUMENT-EXTRACTION.md).

Launcher đọc `.env`/`.env.local` theo thứ tự của Next.js, không ghi lại cấu hình.
Health VietOCR phải có cả `status: ok` và `ready: true`. Ctrl+C chỉ dừng tiến trình
do launcher tạo, giữ dịch vụ có sẵn. Nếu cổng 3001 bị chiếm, launcher báo lỗi với
exit code khác 0, không tự dừng tiến trình đang chiếm cổng.

Tham khảo: [Node.js child processes](https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows),
[Microsoft Code Integrity events](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/viewing-code-integrity-events).

## API Endpoints
- **GET /**: Kiểm tra trạng thái service và thiết bị chạy (CPU / CUDA).
- **GET /health**: Health check (`status: ok`).
- **POST /predict**: Nhận mảng các dòng chữ dạng Base64 và trả về text + độ tin cậy.

Confidence thiếu hoặc không hữu hạn là `null`, điểm `0` giữ nguyên; không tự gán
0.95. Đây là điểm greedy character probability của model, không phải độ chính xác
đã hiệu chỉnh. Trang trắng/không tìm thấy vùng chữ trả `predictions: []` và cần kiểm
tra trong Web. Crop dòng dùng pixel ảnh gốc, chỉ detection dùng ảnh nhỏ. Giới hạn
8 MB/12 triệu pixel/70 vùng; quá số vùng bị từ chối rõ ràng thay vì bỏ nội dung.

Kiểm thử không gọi model/cloud:

```powershell
& services/vietocr-service/.venv/Scripts/python.exe -m unittest discover -s services/vietocr-service/tests -v
```

Sau khi launcher sẵn sàng, kiểm thử OCR local thật bằng chữ tổng hợp trong RAM:

```powershell
npx tsx scripts/test-vietocr-integration.ts
```

Harness chỉ gọi HTTP loopback, không dùng giấy tờ thật hoặc gửi ảnh sang cloud,
không log toàn văn OCR. Kết quả vẫn là bản nháp cần người dùng duyệt; ảnh tổng hợp
không chứng minh accuracy trên ảnh camera thật.

### Payload Request mẫu:
```json
{
  "lines": [
    {
      "lineId": "line_001",
      "image": "data:image/png;base64,iVBORw0KGgo...",
      "coordinates": [0.1, 0.1, 0.15, 0.9]
    }
  ]
}
```

### Payload Response mẫu:
```json
{
  "predictions": [
    {
      "text": "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "confidence": 0.985
    }
  ]
}
```
