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
- Python >= 3.9 (đã cấu hình sẵn Python 3.11 trong thư mục `.venv`)
- PyTorch & Torchvision
- VietOCR
- FastAPI & Uvicorn

## Cấu trúc thư mục
- `app.py`: FastAPI server xử lý nhận diện dòng chữ theo format của `VietOcrAdapter`.
- `requirements.txt`: Danh sách các package Python cần thiết.
- `start.ps1`: Script PowerShell khởi chạy service trên cổng 8000.
- `start.bat`: File batch khởi chạy nhanh trên Windows.

## Cách chạy

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

## API Endpoints
- **GET /**: Kiểm tra trạng thái service và thiết bị chạy (CPU / CUDA).
- **GET /health**: Health check (`status: ok`).
- **POST /predict**: Nhận mảng các dòng chữ dạng Base64 và trả về text + độ tin cậy.

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
