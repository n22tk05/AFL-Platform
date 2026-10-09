/**
 * Script sinh bộ ảnh kiểm thử tổng hợp (Synthetic Fixtures) cho OCR -> JSON evaluation
 * AFL-Platform — Độc lập, tất định, không chứa PII thật.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = __dirname;

async function renderSvgToPng(svgString, outputPath, options = {}) {
  let pipeline = sharp(Buffer.from(svgString));
  if (options.rotate) {
    pipeline = pipeline.rotate(options.rotate, { background: options.rotateBg || '#777777' });
  }
  if (options.blur) {
    pipeline = pipeline.blur(options.blur);
  }
  if (options.modulate) {
    pipeline = pipeline.modulate(options.modulate);
  }
  await pipeline.png().toFile(outputPath);
  console.log(`Rendered: ${outputPath}`);
}

// 1. TC01: Văn bản tiếng Việt rõ nét, đầy đủ dấu
function generateSvgTc01() {
  return `<svg width="850" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="850" height="1100" fill="#FFFFFF"/>
    <style>
      .hdr { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-anchor: middle; fill: #111; }
      .subhdr { font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; text-anchor: middle; fill: #111; }
      .title { font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; text-anchor: middle; fill: #111; }
      .date { font-family: Arial, sans-serif; font-size: 14px; font-style: italic; text-anchor: end; fill: #222; }
      .sec { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #111; }
      .txt { font-family: Arial, sans-serif; font-size: 15px; fill: #222; }
    </style>
    <!-- Quốc hiệu & Tiêu ngữ -->
    <text x="425" y="60" class="hdr">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text>
    <text x="425" y="85" class="subhdr">Độc lập - Tự do - Hạnh phúc</text>
    <line x1="330" y1="95" x2="520" y2="95" stroke="#111" stroke-width="1.5"/>

    <!-- Tiêu đề -->
    <text x="425" y="160" class="title">GIẤY XÁC NHẬN TÌNH TRẠNG HÔN NHÂN</text>

    <!-- Địa danh, ngày tháng -->
    <text x="780" y="210" class="date">Hà Nội, ngày 18 tháng 05 năm 2026</text>

    <!-- Kính gửi -->
    <text x="70" y="260" class="sec">Kính gửi: Ủy ban nhân dân phường Khương Mai, quận Thanh Xuân</text>

    <!-- Nội dung với đầy đủ nguyên âm và thanh điệu tiếng Việt -->
    <text x="70" y="320" class="txt">1. Họ và tên: TRẦN ĐĂNG QUANG</text>
    <text x="70" y="365" class="txt">2. Ngày sinh: 25 tháng 10 năm 1978</text>
    <text x="70" y="410" class="txt">3. Nơi sinh: Bệnh viện Phụ sản Trung ương, thành phố Hà Nội</text>
    <text x="70" y="455" class="txt">4. Dân tộc: Kinh               Quốc tịch: Việt Nam</text>
    <text x="70" y="500" class="txt">5. Nơi cư trú: Số 45 ngõ 12 đường Giải Phóng, phường Đồng Tâm, quận Hai Bà Trưng</text>
    <text x="70" y="545" class="txt">6. Nghề nghiệp: Kỹ sư xây dựng công trình giao thông thủy lợi</text>
    <text x="70" y="590" class="txt">7. Tình trạng hôn nhân: Hiện tại chưa đăng ký kết hôn với ai</text>
    <text x="70" y="635" class="txt">8. Mục đích sử dụng: Để làm thủ tục vay vốn thế chấp tại ngân hàng thương mại</text>

    <!-- Ký tên 2 bên -->
    <text x="200" y="750" class="sec" text-anchor="middle">NGƯỜI LÀM ĐƠN</text>
    <text x="200" y="775" class="date" text-anchor="middle">(Ký, ghi rõ họ tên)</text>
    <text x="200" y="860" class="txt" font-weight="bold" text-anchor="middle">Trần Đăng Quang</text>

    <text x="650" y="750" class="sec" text-anchor="middle">CHỦ TỊCH UBND PHƯỜNG</text>
    <text x="650" y="775" class="date" text-anchor="middle">(Ký, đóng dấu)</text>
    <text x="650" y="860" class="txt" font-weight="bold" text-anchor="middle">Nguyễn Văn Bình</text>
  </svg>`;
}

// 2. TC02: Biểu mẫu có nhãn và dòng chấm để điền (có trường điền và trường để trống)
function generateSvgTc02() {
  return `<svg width="850" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="850" height="1100" fill="#FFFFFF"/>
    <style>
      .hdr { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-anchor: middle; fill: #111; }
      .subhdr { font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; text-anchor: middle; fill: #111; }
      .title { font-family: Arial, sans-serif; font-size: 20px; font-weight: bold; text-anchor: middle; fill: #111; }
      .txt { font-family: Arial, sans-serif; font-size: 15px; fill: #111; }
      .dot { font-family: Courier, monospace; font-size: 14px; fill: #666; }
    </style>
    <text x="425" y="60" class="hdr">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text>
    <text x="425" y="85" class="subhdr">Độc lập - Tự do - Hạnh phúc</text>
    <line x1="330" y1="95" x2="520" y2="95" stroke="#111" stroke-width="1.5"/>

    <text x="425" y="160" class="title">ĐƠN ĐỀ NGHỊ CẤP ĐỔI GIẤY PHÉP LÁI XE</text>

    <!-- Trường đã điền giá trị kèm đuôi chấm -->
    <text x="70" y="240" class="txt">Họ và tên: <tspan font-weight="bold">NGUYỄN VĂN AN</tspan><tspan class="dot">..........................................................</tspan></text>
    
    <!-- Trường hoàn toàn để trống (chỉ có dòng chấm) -->
    <text x="70" y="295" class="txt">Ngày sinh: <tspan class="dot">...........................................................................................</tspan></text>
    
    <!-- Trường ghép có giá trị -->
    <text x="70" y="350" class="txt">Số CCCD: <tspan font-weight="bold">001085012345</tspan><tspan class="dot">...........</tspan> Ngày cấp: <tspan font-weight="bold">12/03/2021</tspan><tspan class="dot">..........</tspan></text>
    
    <!-- Trường có giá trị text dài -->
    <text x="70" y="405" class="txt">Nơi cấp: <tspan font-weight="bold">Cục Cảnh sát quản lý hành chính về trật tự xã hội</tspan><tspan class="dot">........</tspan></text>
    
    <!-- Trường địa chỉ hoàn toàn để trống -->
    <text x="70" y="460" class="txt">Nơi đăng ký thường trú: <tspan class="dot">.....................................................................</tspan></text>
    <text x="70" y="505" class="txt">Nơi ở hiện nay: <tspan class="dot">...................................................................................</tspan></text>

    <!-- Trường số GPLX cũ có giá trị -->
    <text x="70" y="560" class="txt">Giấy phép lái xe số: <tspan font-weight="bold">790154823901</tspan><tspan class="dot">.................</tspan> Hạng: <tspan font-weight="bold">B2</tspan><tspan class="dot">..............</tspan></text>

    <!-- Trường lý do hoàn toàn để trống -->
    <text x="70" y="615" class="txt">Lý do đề nghị: <tspan class="dot">.....................................................................................</tspan></text>
    <text x="70" y="660" class="dot">....................................................................................................................</text>
  </svg>`;
}

// 3. TC03: Nhiều trường nằm trên cùng một dòng
function generateSvgTc03() {
  return `<svg width="850" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="850" height="1100" fill="#FFFFFF"/>
    <style>
      .hdr { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-anchor: middle; fill: #111; }
      .subhdr { font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; text-anchor: middle; fill: #111; }
      .title { font-family: Arial, sans-serif; font-size: 20px; font-weight: bold; text-anchor: middle; fill: #111; }
      .txt { font-family: Arial, sans-serif; font-size: 15px; fill: #111; }
      .bold { font-weight: bold; }
    </style>
    <text x="425" y="60" class="hdr">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text>
    <text x="425" y="85" class="subhdr">Độc lập - Tự do - Hạnh phúc</text>
    <line x1="330" y1="95" x2="520" y2="95" stroke="#111" stroke-width="1.5"/>

    <text x="425" y="150" class="title">TỜ KHAI THAY ĐỔI THÔNG TIN CƯ TRÚ</text>

    <!-- Hàng 1: Họ tên + Giới tính -->
    <text x="70" y="230" class="txt">1. Họ và tên: <tspan class="bold">LÊ THỊ MAI</tspan></text>
    <text x="520" y="230" class="txt">2. Giới tính: <tspan class="bold">Nữ</tspan></text>

    <!-- Hàng 2: Ngày sinh + Dân tộc + Quốc tịch -->
    <text x="70" y="290" class="txt">3. Ngày sinh: <tspan class="bold">20/11/1965</tspan></text>
    <text x="360" y="290" class="txt">4. Dân tộc: <tspan class="bold">Kinh</tspan></text>
    <text x="580" y="290" class="txt">5. Quốc tịch: <tspan class="bold">Việt Nam</tspan></text>

    <!-- Hàng 3: Số CCCD + Số điện thoại -->
    <text x="70" y="350" class="txt">6. Số định danh cá nhân: <tspan class="bold">036165004321</tspan></text>
    <text x="480" y="350" class="txt">7. Số điện thoại: <tspan class="bold">0912345678</tspan></text>

    <!-- Hàng 4: Nơi thường trú (dài) -->
    <text x="70" y="410" class="txt">8. Nơi thường trú: <tspan class="bold">Số 12 phố Huế, phường Hàng Bài, quận Hoàn Kiếm, Hà Nội</tspan></text>

    <!-- Hàng 5: Nơi ở hiện tại + Quan hệ với chủ hộ -->
    <text x="70" y="470" class="txt">9. Nơi tạm trú: <tspan class="bold">Xã Kim Chung, huyện Đông Anh</tspan></text>
    <text x="520" y="470" class="txt">10. Quan hệ: <tspan class="bold">Chủ hộ</tspan></text>
  </svg>`;
}

// 4. TC04: Bảng có nhiều hàng/cột, có ô trống
function generateSvgTc04() {
  return `<svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="900" height="1100" fill="#FFFFFF"/>
    <style>
      .title { font-family: Arial, sans-serif; font-size: 20px; font-weight: bold; text-anchor: middle; fill: #111; }
      .th { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-anchor: middle; fill: #111; }
      .td { font-family: Arial, sans-serif; font-size: 14px; fill: #222; }
      .td-center { font-family: Arial, sans-serif; font-size: 14px; text-anchor: middle; fill: #222; }
      .td-right { font-family: Arial, sans-serif; font-size: 14px; text-anchor: end; fill: #222; }
    </style>
    <text x="450" y="60" class="title">BẢNG KÊ KHAI TÀI SẢN VÀ THU NHẬP</text>

    <!-- Khung bảng 5 cột: STT (50), Loại tài sản (260), Diện tích (110), Giá trị (200), Ghi chú (160) -->
    <!-- Tổng width = 780, X bắt đầu từ 60 đến 840 -->
    <!-- Header -->
    <rect x="60" y="110" width="780" height="45" fill="#EEEEEE" stroke="#333" stroke-width="1.5"/>
    <line x1="110" y1="110" x2="110" y2="155" stroke="#333" stroke-width="1.5"/>
    <line x1="370" y1="110" x2="370" y2="155" stroke="#333" stroke-width="1.5"/>
    <line x1="480" y1="110" x2="480" y2="155" stroke="#333" stroke-width="1.5"/>
    <line x1="680" y1="110" x2="680" y2="155" stroke="#333" stroke-width="1.5"/>

    <text x="85" y="138" class="th">STT</text>
    <text x="240" y="138" class="th">Loại tài sản</text>
    <text x="425" y="138" class="th">Diện tích (m2)</text>
    <text x="580" y="138" class="th">Giá trị ước tính</text>
    <text x="760" y="138" class="th">Ghi chú</text>

    <!-- Hàng 1: Đầy đủ dữ liệu -->
    <rect x="60" y="155" width="780" height="50" fill="#FFFFFF" stroke="#333" stroke-width="1"/>
    <line x1="110" y1="155" x2="110" y2="205" stroke="#333" stroke-width="1"/>
    <line x1="370" y1="155" x2="370" y2="205" stroke="#333" stroke-width="1"/>
    <line x1="480" y1="155" x2="480" y2="205" stroke="#333" stroke-width="1"/>
    <line x1="680" y1="155" x2="680" y2="205" stroke="#333" stroke-width="1"/>
    <text x="85" y="186" class="td-center">1</text>
    <text x="120" y="186" class="td">Nhà ở tại Hà Nội</text>
    <text x="425" y="186" class="td-center">120.5</text>
    <text x="660" y="186" class="td-right">4.500.000.000 đ</text>
    <text x="695" y="186" class="td">Nhà cấp 3</text>

    <!-- Hàng 2: Ô Ghi chú ĐỂ TRỐNG -->
    <rect x="60" y="205" width="780" height="50" fill="#FFFFFF" stroke="#333" stroke-width="1"/>
    <line x1="110" y1="205" x2="110" y2="255" stroke="#333" stroke-width="1"/>
    <line x1="370" y1="205" x2="370" y2="255" stroke="#333" stroke-width="1"/>
    <line x1="480" y1="205" x2="480" y2="255" stroke="#333" stroke-width="1"/>
    <line x1="680" y1="205" x2="680" y2="255" stroke="#333" stroke-width="1"/>
    <text x="85" y="236" class="td-center">2</text>
    <text x="120" y="236" class="td">Đất nông nghiệp</text>
    <text x="425" y="236" class="td-center">500.0</text>
    <text x="660" y="236" class="td-right">800.000.000 đ</text>
    <!-- Ghi chú rỗng -->

    <!-- Hàng 3: Ô Diện tích ĐỂ TRỐNG -->
    <rect x="60" y="255" width="780" height="50" fill="#FFFFFF" stroke="#333" stroke-width="1"/>
    <line x1="110" y1="255" x2="110" y2="305" stroke="#333" stroke-width="1"/>
    <line x1="370" y1="255" x2="370" y2="305" stroke="#333" stroke-width="1"/>
    <line x1="480" y1="255" x2="480" y2="305" stroke="#333" stroke-width="1"/>
    <line x1="680" y1="255" x2="680" y2="305" stroke="#333" stroke-width="1"/>
    <text x="85" y="286" class="td-center">3</text>
    <text x="120" y="286" class="td">Xe ô tô con 5 chỗ</text>
    <!-- Diện tích rỗng -->
    <text x="660" y="286" class="td-right">650.000.000 đ</text>
    <text x="695" y="286" class="td">Đứng tên cá nhân</text>

    <!-- Hàng 4: CẢ Diện tích VÀ Ghi chú ĐỂ TRỐNG -->
    <rect x="60" y="305" width="780" height="50" fill="#FFFFFF" stroke="#333" stroke-width="1"/>
    <line x1="110" y1="305" x2="110" y2="355" stroke="#333" stroke-width="1"/>
    <line x1="370" y1="305" x2="370" y2="355" stroke="#333" stroke-width="1"/>
    <line x1="480" y1="305" x2="480" y2="355" stroke="#333" stroke-width="1"/>
    <line x1="680" y1="305" x2="680" y2="355" stroke="#333" stroke-width="1"/>
    <text x="85" y="336" class="td-center">4</text>
    <text x="120" y="336" class="td">Tiền tiết kiệm gửi ngân hàng</text>
    <!-- Diện tích rỗng -->
    <text x="660" y="336" class="td-right">300.000.000 đ</text>
    <!-- Ghi chú rỗng -->
  </svg>`;
}

// 5. TC05: Checkbox được chọn và không được chọn
function generateSvgTc05() {
  return `<svg width="850" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="850" height="1100" fill="#FFFFFF"/>
    <style>
      .hdr { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-anchor: middle; fill: #111; }
      .subhdr { font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; text-anchor: middle; fill: #111; }
      .title { font-family: Arial, sans-serif; font-size: 20px; font-weight: bold; text-anchor: middle; fill: #111; }
      .sec { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: #111; }
      .txt { font-family: Arial, sans-serif; font-size: 15px; fill: #111; }
    </style>
    <text x="425" y="60" class="hdr">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text>
    <text x="425" y="85" class="subhdr">Độc lập - Tự do - Hạnh phúc</text>
    <line x1="330" y1="95" x2="520" y2="95" stroke="#111" stroke-width="1.5"/>

    <text x="425" y="150" class="title">PHIẾU ĐĂNG KÝ PHƯƠNG THỨC TRẢ KẾT QUẢ</text>

    <!-- Mục 1: Dạng ký hiệu unicode ☑ và ☐ -->
    <text x="70" y="230" class="sec">I. Phương thức nhận kết quả giải quyết:</text>
    <text x="100" y="275" class="txt">☑ Nhận kết quả trực tiếp tại Bộ phận Một cửa</text>
    <text x="100" y="320" class="txt">☐ Nhận kết quả qua dịch vụ bưu chính công ích</text>

    <!-- Mục 2: Dạng ngoặc vuông [x] và [ ] -->
    <text x="70" y="390" class="sec">II. Hình thức thanh toán phí, lệ phí:</text>
    <text x="100" y="435" class="txt">[x] Thanh toán trực tuyến qua Cổng dịch vụ công</text>
    <text x="100" y="480" class="txt">[ ] Nộp tiền mặt trực tiếp tại quầy thu ngân</text>

    <!-- Mục 3: Checkbox song song trên cùng một hàng -->
    <text x="70" y="550" class="sec">III. Loại hồ sơ yêu cầu:</text>
    <text x="100" y="595" class="txt">☑ Cấp mới</text>
    <text x="320" y="595" class="txt">☐ Cấp đổi</text>
    <text x="540" y="595" class="txt">☐ Cấp lại</text>
  </svg>`;
}

// 6. TC06: Số tiền, ngày tháng, mã hồ sơ và chuỗi số bắt đầu bằng 0
function generateSvgTc06() {
  return `<svg width="850" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="850" height="1100" fill="#FFFFFF"/>
    <style>
      .hdr { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-anchor: middle; fill: #111; }
      .subhdr { font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; text-anchor: middle; fill: #111; }
      .title { font-family: Arial, sans-serif; font-size: 20px; font-weight: bold; text-anchor: middle; fill: #111; }
      .txt { font-family: Arial, sans-serif; font-size: 15px; fill: #111; }
      .bold { font-weight: bold; }
    </style>
    <text x="425" y="60" class="hdr">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text>
    <text x="425" y="85" class="subhdr">Độc lập - Tự do - Hạnh phúc</text>
    <line x1="330" y1="95" x2="520" y2="95" stroke="#111" stroke-width="1.5"/>

    <text x="425" y="150" class="title">BIÊN BẢN VI PHẠM HÀNH CHÍNH</text>

    <!-- Số biên bản có số 0 đứng đầu -->
    <text x="70" y="210" class="txt">Số biên bản: <tspan class="bold">001248/BB-VPHC</tspan></text>
    <text x="70" y="255" class="txt">Ngày lập biên bản: <tspan class="bold">05/09/2026</tspan></text>
    
    <!-- CCCD có số 0 đứng đầu (12 chữ số) -->
    <text x="70" y="300" class="txt">Họ và tên: <tspan class="bold">HOÀNG VĂN THẮNG</tspan></text>
    <text x="70" y="345" class="txt">Số CCCD: <tspan class="bold">038092008765</tspan></text>
    <text x="70" y="390" class="txt">Biển số xe: <tspan class="bold">29B1-045.89</tspan></text>

    <text x="70" y="445" class="txt">Hành vi vi phạm: <tspan class="bold">Chạy quá tốc độ quy định từ 10 km/h đến 20 km/h</tspan></text>
    
    <!-- Số tiền phạt có dấu chấm phân cách hàng nghìn -->
    <text x="70" y="500" class="txt">Số tiền phạt: <tspan class="bold">2.500.000 đồng</tspan></text>
    <text x="70" y="545" class="txt">Hạn nộp phạt: <tspan class="bold">15/09/2026</tspan></text>
    <text x="70" y="590" class="txt">Số tài khoản Kho bạc: <tspan class="bold">7111.0102.3456</tspan> tại Agribank Chi nhánh Hà Tây</text>
    <text x="70" y="635" class="txt">Số quyết định: <tspan class="bold">00892/QĐ-XPHC</tspan></text>
  </svg>`;
}

// 7. TC07: Ảnh nghiêng xoay ~7 độ (dùng sharp transform từ TC06)
// (Được sinh từ SVG TC06 và xoay góc trong pipeline)

// 8. TC08: Ảnh tương phản thấp (contrast thấp, chữ xám #777 trên nền xám #DDD)
function generateSvgTc08() {
  return `<svg width="850" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="850" height="1100" fill="#E2E2E2"/>
    <style>
      .hdr { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-anchor: middle; fill: #888888; }
      .subhdr { font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; text-anchor: middle; fill: #888888; }
      .title { font-family: Arial, sans-serif; font-size: 20px; font-weight: bold; text-anchor: middle; fill: #777777; }
      .txt { font-family: Arial, sans-serif; font-size: 15px; fill: #808080; }
    </style>
    <text x="425" y="60" class="hdr">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</text>
    <text x="425" y="85" class="subhdr">Độc lập - Tự do - Hạnh phúc</text>
    <line x1="330" y1="95" x2="520" y2="95" stroke="#999" stroke-width="1.5"/>

    <text x="425" y="160" class="title">THÔNG BÁO NỘP LỆ PHÍ TRƯỚC BẠ</text>

    <text x="70" y="240" class="txt">Mã hồ sơ: 0192837465</text>
    <text x="70" y="295" class="txt">Người nộp thuế: VŨ THỊ HƯƠNG</text>
    <text x="70" y="350" class="txt">Số tiền phải nộp: 1.250.000 đồng</text>
    <text x="70" y="405" class="txt">Thời hạn nộp: 30/10/2026</text>
    <text x="70" y="460" class="txt">Cơ quan thuế: Chi cục Thuế khu vực Thanh Xuân</text>
  </svg>`;
}

// 9. TC09: Nội dung khó phân loại / tự do (cần giữ nguyên dạng unknown / free_text)
function generateSvgTc09() {
  return `<svg width="850" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="850" height="1100" fill="#FFFFFF"/>
    <style>
      .title { font-family: Arial, sans-serif; font-size: 20px; font-weight: bold; text-anchor: middle; fill: #111; }
      .txt { font-family: Arial, sans-serif; font-size: 15px; fill: #222; }
      .small { font-family: Arial, sans-serif; font-size: 12px; fill: #555; }
      .code { font-family: Courier, monospace; font-size: 14px; fill: #111; }
    </style>
    <text x="425" y="70" class="title">PHIẾU TIẾP NHẬN VÀ HẸN TRẢ KẾT QUẢ</text>

    <text x="70" y="140" class="txt">Đơn vị tiếp nhận: Bộ phận Một cửa Ủy ban nhân dân thị xã Sơn Tây</text>
    <text x="70" y="180" class="txt">Người tiếp nhận: Chuyên viên Đỗ Tuấn Anh</text>

    <!-- Khối văn bản tự do không theo cặp label: value chuẩn -->
    <text x="70" y="250" class="txt" font-weight="bold">Danh mục tài liệu kèm theo:</text>
    <text x="70" y="290" class="txt">- 01 bản chính Đơn xin xác nhận đất không có tranh chấp</text>
    <text x="70" y="330" class="txt">- 02 bản sao công chứng Căn cước công dân của hai vợ chồng</text>
    <text x="70" y="370" class="txt">- 01 bản trích lục bản đồ địa chính thửa đất số 42 tờ bản đồ số 08</text>

    <!-- Ghi chú tự do của cán bộ -->
    <text x="70" y="440" class="txt" font-weight="bold">Ý kiến của cán bộ tiếp nhận:</text>
    <text x="70" y="480" class="txt">Hồ sơ đầy đủ điều kiện tiếp nhận. Đương sự cần bổ sung biên lai thuế</text>
    <text x="70" y="515" class="txt">đất phi nông nghiệp năm 2025 trước ngày trả kết quả theo quy định.</text>

    <!-- Mã vạch / chuỗi kiểm soát -->
    <text x="70" y="600" class="code">MÃ TRA CỨU HỒ SƠ: STY-2026-09872-TNMC</text>

    <!-- Dòng in chân trang -->
    <text x="425" y="1020" class="small" text-anchor="middle">In tại Trung tâm Công nghệ Thông tin Sở Nội vụ - Phiên bản phần mềm 2.4.1 - 2026</text>
  </svg>`;
}

// 10. TC10: Trang trống (Blank)
function generateSvgTc10() {
  return `<svg width="850" height="1100" xmlns="http://www.w3.org/2000/svg">
    <rect width="850" height="1100" fill="#FFFFFF"/>
    <!-- Không có văn bản nào -->
  </svg>`;
}

async function main() {
  await mkdir(FIXTURES_DIR, { recursive: true });

  console.log('Generating fixtures into:', FIXTURES_DIR);

  // TC01: Sắc nét, đầy đủ dấu tiếng Việt
  await renderSvgToPng(generateSvgTc01(), resolve(FIXTURES_DIR, 'tc01_clean_accents.png'));

  // TC02: Biểu mẫu có nhãn và dòng chấm
  await renderSvgToPng(generateSvgTc02(), resolve(FIXTURES_DIR, 'tc02_dotted_form.png'));

  // TC03: Nhiều trường trên cùng 1 dòng
  await renderSvgToPng(generateSvgTc03(), resolve(FIXTURES_DIR, 'tc03_multi_field_line.png'));

  // TC04: Bảng nhiều hàng/cột, có ô trống
  await renderSvgToPng(generateSvgTc04(), resolve(FIXTURES_DIR, 'tc04_table_empty_cells.png'));

  // TC05: Checkbox chọn và không chọn
  await renderSvgToPng(generateSvgTc05(), resolve(FIXTURES_DIR, 'tc05_checkboxes.png'));

  // TC06: Số tiền, ngày tháng, mã bắt đầu bằng 0
  await renderSvgToPng(generateSvgTc06(), resolve(FIXTURES_DIR, 'tc06_numbers_dates_money.png'));

  // TC07: Ảnh nghiêng phối cảnh xoay 7 độ từ TC06
  await renderSvgToPng(generateSvgTc06(), resolve(FIXTURES_DIR, 'tc07_skewed_perspective.png'), {
    rotate: 7,
    rotateBg: '#888888',
  });

  // TC08: Tương phản thấp
  await renderSvgToPng(generateSvgTc08(), resolve(FIXTURES_DIR, 'tc08_low_contrast.png'), {
    blur: 0.8,
  });

  // TC09: Nội dung khó phân loại / tự do
  await renderSvgToPng(generateSvgTc09(), resolve(FIXTURES_DIR, 'tc09_ambiguous_freetext.png'));

  // TC10: Trang trống
  await renderSvgToPng(generateSvgTc10(), resolve(FIXTURES_DIR, 'tc10_blank_page.png'));

  console.log('All 10 fixture images generated successfully!');
}

main().catch(err => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
