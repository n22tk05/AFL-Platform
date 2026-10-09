# TRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN VÀ TRUYỀN THÔNG VIỆT - HÀN
## KHOA KHOA HỌC MÁY TÍNH

# BÁO CÁO ĐỀ TÀI DỰ THI: AI FOR LIFE
## DỰ ÁN: AFL PLATFORM — AI FORM LOCATOR & ASSISTANT FOR ELDERLY CITIZENS

* **Nhóm:** **KACA**
* **Sinh viên thực hiện:**
  1. **Nguyễn Tuấn Khánh** – 24ITE046 (*Tech Lead, System Architect*)
  2. **Nguyễn Thế Anh** – 24ITE006 (*AI Engineer / Computer Vision*)
  3. **Nguyễn Thanh Chiến** – 24ITE020 (*FullStack, Voice AI Lead*)
* **Địa điểm & Thời gian:** Đà Nẵng, tháng 9 năm 2026

---

## PHẦN I. TÓM TẮT Ý TƯỞNG

### 1. Tên ý tưởng

Nghiên cứu, thiết kế và phát triển nền tảng trợ lý thông minh hỗ trợ kê khai biểu mẫu hành chính công cho người cao tuổi dựa trên thị giác máy tính thích ứng (Adaptive Computer Vision) và Mô hình ngôn ngữ lớn (Large Language Model).

Tên sản phẩm thương mại & giải pháp: AFL Platform (AI Form Locator & Assistant for Elderly Citizens).

### 2. Bài toán cần giải quyết

Việt Nam hiện có gần 14,2 triệu người từ 60 tuổi trở lên [1]. Quá trình chuyển đổi số đang chuyển dịch 100% thủ tục hành chính công lên môi trường số [8][9][20], nhưng phần lớn người cao tuổi đang rơi vào tình trạng "3 không" (không thiết bị cấu hình cao, không tài khoản định danh/ngân hàng, không kỹ năng thao tác số). Họ đối mặt với 3 nỗi đau: suy giảm thị lực và vận động tinh (mắt mờ, run tay), rào cản thuật ngữ pháp lý cô đọng, và tâm lý mặc cảm sợ phiền hà khi hỏi đi hỏi lại cán bộ. Tại Bộ phận Một cửa, cán bộ tiếp dân phải mất 15–25 phút chỉ để ngồi cạnh chỉ tay từng dòng cho một cụ già, gây quá tải cục bộ khi tờ khai bị viết sai hoặc bôi xóa.

### 3. Giải pháp đề xuất

AFL Platform hoạt động như một lớp trợ năng số hóa thông minh (Accessibility Layer), giữ nguyên thói quen cầm bút viết tay trên giấy của người già nhưng bổ trợ bằng:

* Bản sao thị giác chụp 1 lần (Snapshot & Guide): Chụp 1 ảnh tờ khai đặt trên bàn Một cửa, hệ thống tự động nắn phẳng góc phối cảnh và phóng đại từng ô với khung viền nhấp nháy phát sáng mượt mà.
* Trợ lý âm thanh Bán song công & Phụ đề Karaoke (Half-Duplex Voice UX & Live Captions): Giọng đọc chuẩn ấm áp tốc độ chậm 0.90x, đồng bộ chữ chạy Karaoke sáng nổi bật (≥ 20pt), tương tác hỏi đáp bằng nút bấm giữ Mic (Push-to-Talk) kết hợp các nút chạm hỏi nhanh (Touch-to-Ask Chips), loại bỏ nguy cơ dội âm và tạp âm tại phòng Một cửa.
* Quét liên chứng từ thông minh (Smart Prerequisite Scan): Tự động bóc tách thông tin từ giấy tờ gốc (Sổ đỏ, Biên bản xử phạt) để gợi ý sẵn chữ mẫu màu đỏ tương phản cao ở các bước điền tương ứng.
* Cổng kiểm duyệt của Cán bộ (Review Gate): Kiểm soát 100% kịch bản điền ô do AI sinh ra trước khi công dân tiếp cận, bảo đảm tính chuẩn xác pháp lý tuyệt đối với chốt chặn cam kết trách nhiệm.
### 4. Giá trị mang lại

* Nâng cao tỷ lệ đúng ngay lần đầu (First-Time Right Rate): Đạt ≥ 90% (so với mức trung bình tự điền hiện nay chỉ khoảng 55%).
* Rút ngắn thời gian kê khai: Giảm từ mức trung bình 35 phút loay hoay điền tờ khai phức tạp xuống còn dưới 12 phút (10–12 phút).
* Thời gian xuất bản quy trình của Admin: Chuyên viên tạo, đối soát và xuất bản một quy trình biểu mẫu mới trong thời gian ≤ 5 phút (hoặc dưới 3 phút khi biểu mẫu có sẵn khung ô).
* Chỉ số phản nghịch an toàn pháp lý: Tỷ lệ sai lệch trường thông tin do AI hướng dẫn sai lệch tối thiểu, ở mức dưới 5%.
* Giải tỏa áp lực cho cơ quan hành chính: Giảm ít nhất 30% thời gian hướng dẫn trực tiếp của cán bộ Một cửa.
* Độ hài lòng người dùng: Điểm khả dụng trợ năng SUS đạt ≥ 85/100 điểm.
### 5. Công nghệ dự kiến

* Thị giác máy tính thích ứng: Google ML Kit Scanner Plugin kết hợp OpenCV WebAssembly trích xuất tọa độ Bounding Box chuẩn hóa với cơ chế Cloud Edge Function Fallback.
* Mô hình ngôn ngữ lớn: Google Gemini 3.6
* Hạ tầng âm thanh: Google Cloud TTS Neural2 vi-VN tốc độ 0.90x kèm bộ nhớ đệm MP3 và phụ đề chữ chạy Karaoke.
* Ngăn xếp phát triển: Next.js 14, TypeScript, Tailwind CSS, Prisma ORM, PostgreSQL.
## PHẦN II. MÔ TẢ BÀI TOÁN THỰC TIỄN

### 1. Bối cảnh

Tốc độ già hóa dân số nhanh bậc nhất thế giới: Theo số liệu công bố chính thức từ Thông cáo báo chí Điều tra dân số và nhà ở giữa kỳ năm 2024 của Tổng cục Thống kê (GSO), Việt Nam hiện có gần 14,2 triệu người từ 60 tuổi trở lên (chiếm ~14–15% tổng dân số cả nước), tăng 2,8 triệu người so với năm 2019 [1]. Dự báo đến năm 2030, con số này sẽ chạm mốc khoảng 18 triệu người (tăng thêm gần 4 triệu người chỉ trong 6 năm) và tiếp tục vượt ngưỡng 20% tổng dân số vào giữa thập niên 2030 [1].

Bối cảnh "Chưa giàu đã già": Các báo cáo nhân khẩu học của Quỹ Dân số Liên Hợp Quốc (UNFPA) [2][3][4] và Ngân hàng Thế giới (World Bank) [5][6] chỉ ra rằng: Việt Nam bước vào giai đoạn già hóa dân số từ năm 2011 và sẽ chính thức trở thành "xã hội già" (aged society - khi tỷ lệ người từ 65 tuổi trở lên chiếm 14%) vào khoảng năm 2035–2036 [3][5]. Thời gian chuyển đổi nhân khẩu học này của Việt Nam chỉ diễn ra trong vòng 20 năm, ngắn hơn rất nhiều so với các nước phát triển (Pháp 115 năm, Thụy Điển 85 năm, Mỹ 69 năm, Nhật Bản 26 năm). Đáng chú ý, Việt Nam già hóa ở mức thu nhập bình quân đầu người thấp hơn nhiều so với các quốc gia khác ở cùng giai đoạn [5].

Khoảng cách số (Digital Divide) tại khu vực dịch vụ công: Chính phủ Việt Nam đang triển khai quyết liệt “Chiến lược Chuyển đổi số Quốc gia” (Quyết định 942/QĐ-TTg) [7] và “Đề án phát triển ứng dụng dữ liệu dân cư, định danh điện tử” (Đề án 06/CP) [20], hướng tới mục tiêu đưa 100% thủ tục hành chính đủ điều kiện lên môi trường điện tử [8][9].

### 2. Vấn đề cụ thể

Khảo sát thực tế tại các địa phương cho thấy phần lớn người cao tuổi (đặc biệt tại nông thôn và ngoại thành) đang rơi vào tình trạng "3 không":

* Không có thiết bị di động cấu hình cao: Đa phần dùng điện thoại phổ thông hoặc smartphone đời cũ màn hình độ phân giải thấp.
* Không có tài khoản định danh/ngân hàng điện tử liên kết: E ngại các bước xác thực sinh trắc học phức tạp hoặc chưa được con cháu cài đặt giúp.
* Không có kỹ năng thao tác số: Khó khăn trong việc gõ bàn phím ảo tiếng Việt có dấu, sợ bấm nhầm dẫn đến mất tiền hoặc lộ lọt thông tin cá nhân.
Ba "nỗi đau" (Pain points) thể chất và tâm lý của công dân cao tuổi:

* Suy giảm thị giác và vận động tinh: Mắt mờ do viễn thị hoặc đục thủy tinh thể sinh lý khiến việc đọc chữ nhỏ (9–10pt) trên biểu mẫu in sẵn rất khó khăn; hiện tượng run tay (tremor) khiến người già khó viết nắn nót trong các ô nhỏ hẹp của tờ khai.
* Rào cản thuật ngữ pháp lý cô đọng: Các cụm từ như "nơi đăng ký hộ khẩu thường trú", "nguyên quán", "tổng hợp", "người được cấp trích lục"... dễ gây lúng túng, dẫn đến khai sai lệch bản chất.
* Tâm lý sợ phiền hà, mặc cảm: Người già rất sợ làm mất thời gian của người khác hoặc ngại bị cán bộ tiếp dân gắt gỏng khi hỏi đi hỏi lại nhiều lần, dẫn đến việc điền bừa, điền sai.
Gánh nặng quá tải cho cán bộ Bộ phận Một cửa: Một cán bộ tiếp nhận Một cửa cấp xã/phường phải xử lý 30–50 hồ sơ/ngày. Khi gặp công dân cao tuổi, cán bộ thường mất 15–25 phút chỉ để ngồi cạnh chỉ tay từng dòng. Khi tờ khai viết sai hoặc bôi xóa không hợp lệ, quy trình bắt buộc phải phát phôi giấy mới để người dân viết lại từ đầu, gây ùn tắc cục bộ (bottleneck) tại quầy tiếp đón.

### 3. Minh chứng

* Số liệu thống kê nhân khẩu học chính thống: GSO 2024 xác nhận 14,2 triệu người cao tuổi [1], dự báo vượt 20% tổng dân số vào giữa thập niên 2030 [1].
* Tốc độ già hóa kỷ lục: Báo cáo UNFPA và World Bank chứng minh thời gian chuyển đổi chỉ 20 năm, già hóa ở mức thu nhập trung bình thấp [2][3][5].
* Thực nghiệm tại chỗ (Theo khảo sát PRD): Thời gian trung bình công dân lớn tuổi loay hoay tự điền một tờ khai phức tạp lên tới 35 phút (cán bộ phải mất 15–25 phút ngồi kèm chỉ từng dòng); tỷ lệ tự kê khai đúng ngay từ lần đầu hiện chỉ đạt khoảng 55%, tỷ lệ viết sai phải phát lại phôi giấy lên tới 35–45%.
### 4. Phát biểu bài toán

"Làm thế nào để xây dựng một giải pháp công nghệ trợ năng thích ứng, tôn trọng thói quen viết tay truyền thống trên giấy của người cao tuổi, giúp họ tự tin hoàn thành chính xác các biểu mẫu hành chính phức tạp mà không đòi hỏi thiết bị đắt tiền, không yêu cầu kỹ năng gõ bàn phím số, đồng thời giải tỏa áp lực hướng dẫn thủ công cho cán bộ tại Bộ phận Một cửa?"

## PHẦN III. GIÁ TRỊ ỨNG DỤNG VÀ SỰ CẦN THIẾT

### 1. Tầm quan trọng

Cầu nối nhân văn (Accessibility Layer) cho chuyển đổi số: Nghị định số 45/2020/NĐ-CP [8] và Nghị định số 310/2026/NĐ-CP [9] khẳng định rõ: Việc hiện đại hóa thủ tục hành chính không đồng nghĩa với việc loại bỏ hoàn toàn biểu mẫu giấy, mà cần có cơ chế trợ giúp để bảo đảm quyền lợi tiếp cận bình đẳng của mọi tầng lớp nhân dân. AFL đóng vai trò là một lớp trợ năng số hóa thông minh, giữ nguyên thói quen cầm bút viết tay quen thuộc của người già nhưng bổ trợ bằng "mắt thần AI" và "giọng nói hướng dẫn".

### 2. Tính cấp thiết

Giải quyết bài toán thực tế bằng tiếp cận thực tế. Giải quyết triệt để nghịch lý công nghệ cho nhóm người "3 không" bằng giải pháp thuận tiện:

* Kênh quét thông minh: Quét mã QR dán tại bàn để mở Web App ngay lập tức (Zero-install) hoặc chụp nhận diện biểu mẫu trực tiếp từ camera.
* Kênh thiết bị tại quầy: Cơ quan trang bị sẵn giá đỡ điện thoại cố định (Phone Stand) hoặc 01 máy tính bảng dùng chung (Kiosk mini) tại bàn tiếp dân để người không có smartphone vẫn được phục vụ chu đáo.
### 3. Lợi ích kỳ vọng

* Đối với người cao tuổi: Tự chủ, tự tin khi đi làm thủ tục hành chính, không phải phụ thuộc con cháu; bảo đảm thông tin cá nhân chính xác, không bị gạch xóa mất thẩm mỹ.
* Đối với cán bộ Một cửa: Giảm 30% thời gian ngồi kèm hướng dẫn; giảm tải áp lực tâm lý và nguy cơ sai sót hồ sơ hành chính; nâng cao năng suất xử lý hồ sơ mỗi ngày.
* Đối với cơ quan nhà nước: Tối ưu hóa chi phí in ấn phôi giấy tờ; nâng cao chỉ số hài lòng của người dân đối với sự phục vụ của cơ quan hành chính nhà nước (Chỉ số SIPAS).
### 4. Tác động dự kiến

#### 4.1. Kinh tế

* Tiết kiệm đáng kể chi phí in ấn, phát lại phôi giấy tờ hành chính bị viết hỏng mỗi năm trên quy mô toàn quốc.
* Tiết kiệm chi phí đầu tư công: Không yêu cầu cơ quan hành chính đầu tư các hệ thống Kiosk phần cứng chuyên dụng đắt đỏ (hàng trăm triệu đồng/máy); chỉ cần in mã QR dán tại bàn Một cửa kèm một giá đỡ điện thoại là công dân có thể tự kích hoạt dịch vụ ngay trên điện thoại cá nhân.
* Tối ưu hóa năng suất lao động: Nâng cao số lượng hồ sơ được xử lý thành công trong một ngày làm việc của cán bộ tư pháp - hộ tịch.
#### 4.2. Xã hội

* Giá trị phụng sự an sinh xã hội: Giúp hàng triệu người cao tuổi tự tin thực hiện các quyền công dân căn bản, không bị lệ thuộc vào người khác, thu hẹp khoảng cách số và xóa bỏ rào cản tiếp cận dịch vụ công.
* Thực hiện đúng tinh thần "Không để ai bị bỏ lại phía sau" trong công cuộc Chuyển đổi số Quốc gia.
* Xây dựng văn hóa hành chính phục vụ thân thiện, ấm áp và kiên nhẫn đối với đối tượng yếu thế.
#### 4.3. Công nghệ

* Thiết lập bộ tiêu chuẩn kỹ thuật về giao diện trợ năng (Accessibility UX) chuyên biệt cho người cao tuổi Việt Nam dựa trên W3C WCAG 2.1 AAA [11][18].
* Đóng góp mô hình lai thích ứng (Adaptive Hybrid Architecture) xử lý thị giác máy tính biên kết hợp đám mây cho các ứng dụng chính phủ số.
* Tiên phong áp dụng mô hình Human-in-the-loop (Review Gate) triệt tiêu hoàn toàn rủi ro ảo giác AI trong lĩnh vực hành chính công.
## PHẦN IV. Ý TƯỞNG GIẢI PHÁP

### 1. Mô tả tổng quan

Hệ thống AFL Platform gồm hai phân hệ chính:

* Ứng dụng Web di động thông minh (Citizen Web App): Dành cho công dân cao tuổi sử dụng công nghệ Bản sao thị giác chụp 1 lần (Snapshot & Guide) và Trợ lý âm thanh tương tác Half-Duplex (Push-to-Talk & Touch Chips).
* Cổng thông tin Quản trị quy trình biểu mẫu (Admin Portal): Tích hợp Cổng kiểm duyệt của Cán bộ (Review Gate) giúp chuyên viên kiểm tra, chuẩn hóa tọa độ ô và phê duyệt kịch bản 100% trước khi ban hành.
### 2. Công nghệ và mục đích sử dụng

#### 2.1. Công nghệ Thị giác máy tính thích ứng (Adaptive Computer Vision)

* Tiền xử lý: Chuyển ảnh xám (Grayscale), Lọc mờ Gaussian, Nhị phân hóa thích ứng (Adaptive Thresholding) để tách chữ khỏi bóng mờ.
* Căn chỉnh phối cảnh: Thuật toán tìm đường bao lớn nhất 4 đỉnh thực hiện phép biến đổi phối cảnh 4 để duỗi phẳng tờ giấy.
* Trích xuất ô: Áp dụng phép biến đổi hình thái học (Morphological Operations) với kernel ngang và dọc để trích xuất hệ thống khung lưới, chuẩn hóa thành tọa độ dạng số thực 0.0 → 1.0.
* Cơ chế can thiệp thủ công (Manual Box Override): Cho phép chuyên viên click & drag trực tiếp trên giao diện để bổ sung ô bị thiếu, xóa ô thừa hoặc chỉnh kích thước box độc lập.
* Cơ chế thích ứng (Fallback): Nếu trình duyệt thiết bị không tải được WASM hoặc máy yếu, hệ thống tự động chuyển ảnh nén nhẹ về Cloud Edge Function để xử lý trong ≤ 200ms.
#### 2.2. Mô hình ngôn ngữ lớn (Gemini 3.6 Pure-Text) & Công nghệ âm thanh tương tác (Voice UX Half-Duplex)

* Động cơ ngôn ngữ & Diễn giải kịch bản: Google Gemini 3.6 API (chế độ Pure Text LLM với Structured JSON Schema). Tiếp nhận danh sách trường văn bản đã bóc tách (hoàn toàn không gửi ảnh gốc, tiết kiệm 95% token) để tự động sinh câu thoại hướng dẫn bình dân và ví dụ chữ mẫu in hoa màu đỏ đậm tương phản cao. Trạng thái mặc định mang cờ.
* Hạ tầng âm thanh tương tác & Trợ năng nghe nhìn (Voice UX & Live Captions):
* Google Cloud TTS Neural2 vi-VN (kèm cơ chế Cache file MP3 cục bộ để tải tức thì không tốn quota API) phát giọng đọc chuẩn tốc độ 0.90x.
* Phụ đề Chữ chạy Đồng bộ (Karaoke Live Captions): Từng từ phát ra từ loa đồng thời sáng nổi bật trên màn hình bằng chữ in hoa đậm ≥ 20pt (WCAG 2.1 AAA), giúp người già lãng tai vẫn theo dõi chính xác. Kèm nút lớn [Nghe Lại Dòng Này].
* Tương tác hỏi đáp bằng nút bấm giữ Mic (Push-to-Talk) kết hợp Touch-to-Ask Chips (3 nút chạm hỏi nhanh):
* [Xem ví dụ chữ mẫu ô này]
* [Lấy thông tin này ở đâu trên Sổ đỏ/Biên bản?]
* [Không có thông tin thì để trống được không?]
* Cơ chế Bán song công (Half-Duplex Safeguard): Khóa cứng Micro khi loa đang đọc, áp dụng khoảng trễ an toàn 300ms (Echo-guard) triệt tiêu hoàn toàn nguy cơ dội âm tại sảnh Một cửa.
* Kích hoạt Web Wake Lock API: Giữ sáng màn hình liên tục trong suốt phiên kê khai, ngăn chặn điện thoại tự khóa màn hình khi công dân đang cặm cụi viết tay.
* Nút Thoát Nhanh (Quick Exit & Flush): 1 chạm xóa sạch bộ nhớ tạm RAM/Session Storage khi người dân kê khai xong hoặc mượn máy người khác.
### 3. Quy trình xử lý (Pipeline chi tiết)

.

Hình 1. Quy trình xử lý

#### 3.1. Thu thập dữ liệu

Thu thập phôi in biểu mẫu thực tế từ các đơn vị hành chính địa phương. Xây dựng tập dữ liệu ảnh chụp thử nghiệm gồm 500+ ảnh chụp ở nhiều điều kiện thách thức: góc chụp nghiêng từ 15° đến 45°, điều kiện ánh sáng yếu hoặc đèn tuýp phòng họp gây chói lóa, giấy bị gấp nếp, bóng tay người cầm máy.

#### 3.2. Tiền xử lý dữ liệu

* Quy trình gán nhãn dữ liệu hình học chuẩn hóa (Normalized Bounding Box): Số hóa từng biểu mẫu thành tệp cấu trúc JSON bắt buộc sử dụng Hệ tọa độ chuẩn hóa tỉ lệ dạng số thực từ 0.0 đến 1.0 (tính theo tỷ lệ chiều cao/rộng của ảnh gốc). Tuyệt đối không dùng pixel tuyệt đối để đảm bảo hiển thị chính xác 100% trên mọi kích thước màn hình điện thoại mà không bị lệch khung highlight.
* Quy tắc sắp xếp hình học (Geometric Sort): Áp dụng thuật toán sắp xếp các ô nhận diện được theo thứ tự từ trên xuống dưới (ymin tăng dần) và từ trái qua phải (xmin tăng dần) trước khi bàn giao cho mô hình ngôn ngữ sinh kịch bản, triệt tiêu hoàn toàn lỗi đảo lộn thứ tự điền ô.
* Ẩn danh hóa và Làm sạch dữ liệu cá nhân (Data Anonymization): Áp dụng nguyên tắc Privacy-by-Design theo Điều 13 Nghị định 13/2023/NĐ-CP [10]. Mọi ảnh chụp thực tế có chứa dữ liệu định danh cá nhân (PII) đều được thuật toán tự động bôi đen các trường nhạy cảm (số CCCD, số điện thoại, địa chỉ chi tiết) trước khi đưa vào tập kiểm thử.
#### 3.3. Xây dựng và tích hợp mô hình ngôn ngữ lớn (Gemini 3.6)

* Tích hợp Gemini 3.6 Prompting: Thiết kế bộ System Instruction chuyên biệt ép khuôn đầu ra theo JSON Schema có cấu trúc, bắt buộc sinh: câu chào hỏi bình dân (xưng "cháu", gọi "bác"), giải nghĩa thuật ngữ pháp lý cô đọng, và tạo ví dụ chữ in hoa màu đỏ tương phản cao. Mọi kịch bản sinh ra đều mặc định mang trạng thái cảnh báo pháp lý.
* Xây dựng Cổng kiểm duyệt (Review Gate): Cán bộ Một cửa sử dụng Admin Portal để đối soát kịch bản do AI đề xuất với mẫu văn bản chuẩn; có công cụ vẽ/chỉnh Bounding Box thủ công (Manual Box Override) và chốt chặn Cam kết Trách nhiệm Pháp lý (Legal Checkbox Gate) bắt buộc tích chọn trước khi bấm phê duyệt xuất bản mã QR.
### 3.4. Kiểm thử và triển khai

Hệ thống được kiểm thử đa tầng dựa trên bảng chỉ số kỹ thuật và thực nghiệm khắt khe theo chuẩn PRD:

| Nhóm tiêu chí | Tên chỉ số đo lường | Công thức / Phương pháp đo | Mục tiêu kỹ thuật |
| :--- | :--- | :--- | :--- |
| Thị giác máy tính (Computer Vision) | Độ chính xác phát hiện góc mép giấy (IoU) | IoU = Area of Overlap / Area of Union | ≥ 0.90 |
| Thị giác máy tính (Computer Vision) | Độ chính xác tọa độ ô (Accuracy) | Tỷ lệ ô phát hiện đúng tọa độ trên tổng số ô chuẩn | ≥ 98% |
| Thị giác máy tính (Computer Vision) | Độ trễ xử lý ảnh trên Edge (Latency) | Thời gian từ lúc chụp đến khi hiển thị bản sao thị giác | ≤ 100ms (Client) / ≤ 200ms (Cloud Fallback) |
| Kiểm soát AI & Ngôn ngữ (Guardrails) | Độ tin cậy kịch bản luồng chính (Main Flow Reliability) | Xác thực tính chuẩn xác pháp lý qua Cổng kiểm duyệt cán bộ | 100% Deterministic (đã qua Review Gate) |
| Kiểm soát AI & Ngôn ngữ (Guardrails) | Tỷ lệ cảnh báo pháp lý khi hỏi đáp mở (Q&A Guardrails) | Tỷ lệ gắn cờ và khuyến cáo đối chiếu cán bộ | 100% các câu hỏi nhạy cảm |
| Kiểm soát AI & Ngôn ngữ (Guardrails) | Thời gian phản hồi câu hỏi ngữ cảnh (Voice Q&A) | Thời gian từ lúc thả nút Mic đến khi trợ lý cất giọng trả lời | ≤ 1.5s |
| Hiệu quả thực tế (UX & Success Metrics) | Tỷ lệ đúng ngay lần đầu | Số hồ sơ hợp lệ lần đầu / Tổng hồ sơ nộp * 100 | ≥ 90% (so với hiện trạng tự điền ~55%) |
| Hiệu quả thực tế (UX & Success Metrics) | Thời gian hoàn thành biểu mẫu | Bấm giờ từ lúc lấy giấy đến khi ký tên xong | Dưới 12 phút (10–12 phút so với hiện trạng ~35 phút) |
| Hiệu quả thực tế (UX & Success Metrics) | Thời gian xuất bản của Admin | Thời gian từ lúc kéo thả PDF đến khi xuất bản mã QR | ≤ 5 phút (dưới 3p khi có sẵn khung ô) |
| Hiệu quả thực tế (UX & Success Metrics) | Chỉ số an toàn pháp lý | Tỷ lệ sai lệch trường thông tin do AI hướng dẫn sai | Duy trì hạn chế sai lệch tối thiểu, ở mức dưới 5% |
| Hiệu quả thực tế (UX & Success Metrics) | Mức độ giảm tải cho cán bộ tiếp dân | Đo bằng số lượt người già cần cán bộ ngồi kèm | Giảm ≥ 30% |
| Hiệu quả thực tế (UX & Success Metrics) | Điểm khả dụng trợ năng (SUS Score) | Đánh giá qua thang đo System Usability Scale | ≥ 85 / 100 điểm |

### 4. Vai trò AI mang lại

Hệ thống không ứng dụng AI theo phong trào, mà tích hợp AI vào đúng 3 bài toán nghẽ cổ chai không thể giải quyết bằng thuật toán tĩnh:

* Mắt xích 1 – Thị giác thích ứng (Adaptive Computer Vision – OpenCV WASM):
* Vai trò: Tự động định vị 4 góc giấy trong điều kiện chụp xiên 15−45 độ, bóng đổ mờ và nếp gấp giấy; nắn phẳng phối cảnh (Perspective Transform) và phân đoạn lưới ô hình học.
* Giá trị: Tự động hóa 100% quá trình tạo Bản sao thị giác với độ trễ ≤100ms và độ chính xác ≥98%, loại bỏ hoàn toàn việc công dân phải chỉnh sửa ảnh thủ công.
* Mắt xích 2 — Ngôn ngữ tạo sinh có cấu trúc (Gemini 3.6 Pure-Text + Structured JSON):
* Vai trò: Đóng vai trò là "Bộ chuyển ngữ Plain Language" tự động phân tích nhãn trường hành chính, dịch thuật ngữ khô khan thành câu thoại bình dân xưng "cháu - bác" và sinh chữ mẫu in hoa màu đỏ đạt chuẩn WCAG AAA (7:1).
* Giá trị: Tiết kiệm hàng trăm giờ biên soạn thủ công cho cán bộ hành chính; chuẩn hóa cấu trúc dữ liệu theo khuôn mẫu JSON Schema an toàn tuyệt đối.
* Mắt xích 3 — Giọng nói Neural & Lắng nghe thông minh (Google Cloud TTS Neural2 0.9x & Voice Q&A):
* Vai trò: Tái tạo giọng đọc ấm áp tự nhiên tốc độ chậm 0.90x, xuất mốc thời gian (timepoints) cho phụ đề ≥20pt và lắng nghe câu hỏi qua Touch-to-Talk.
* Giá trị: Vượt qua rào cản mù chữ/mắt mờ; người già tiếp nhận thông tin trực giác qua thính giác mà không cần căng mắt đọc màn hình.
### 5. Kế hoạch thử nghiệm và phương pháp đánh giá giải pháp dự kiến

Để kiểm chứng tính đúng đắn và hiệu quả thực tế của giải pháp theo Tiêu chí 3 (30%), nhóm thiết lập kế hoạch thử nghiệm 3 pha đồng bộ giữa kỹ thuật và người dùng:

* Pha 1: Thử nghiệm kỹ thuật tự động (Automated Benchmarking & Stress Testing):
* Mục tiêu: Kiểm chứng tính ổn định, độ trễ và độ chính xác của các thuật toán xử lý.
* Nội dung: Chạy kiểm thử tự động trên tập dữ liệu 500+ ảnh chụp đa góc nghiêng và ánh sáng phức tạp. Đo lường chỉ số phát hiện mép giấy IoU ≥ 0.90, độ chính xác tọa độ ô ≥98%, và độ trễ xử lý Client-side WASM ≤100ms.
* Kiểm soát an toàn AI: Kiểm thử tự động tính xác thực của kịch bản qua cổng Review Gate (đạt 100% Deterministic) và tỷ lệ kích hoạt cờ cảnh báo pháp lý legalWarningFlag khi người dùng hỏi các câu ngoài phạm vi.
* Pha 2: Thử nghiệm khả dụng người dùng trực tiếp (Lab Usability Testing):
* Mục tiêu: Đánh giá khả năng tiếp cận và mức độ thân thiện của giao diện đối với nhóm người dùng mục tiêu.
* Phương pháp: Mời 20 người dùng thuộc nhóm cao tuổi (trên 60 tuổi) và người yếu thế công nghệ tham gia thực nghiệm với giá đỡ điện thoại Phone Stand và tờ khai giấy in thực tế.
* Chỉ số thu thập:
* Bấm giờ thời gian hoàn thành tác vụ (Task Completion Time - mục tiêu giảm từ ~35 phút xuống dưới 12 phút).
* Đếm số lần viết sai/phải gạch xóa để đo tỷ lệ đúng ngay lần đầu (First-Time Right - mục tiêu ≥90%).
* Đánh giá thang đo độ khả dụng hệ thống chuẩn quốc tế SUS (System Usability Scale - mục tiêu ≥85/100 điểm).
* Pha 3: Thử nghiệm mô phỏng quy trình tiếp dân thực tế (Simulated Citizen Journey):
* Mục tiêu: Kiểm chứng độ bền vững của giải pháp trong điều kiện môi trường thực địa.
* Phương pháp: Thiết lập phòng thí nghiệm mô phỏng bàn tiếp dân với đầy đủ tạp âm nền phòng làm việc (tiếng nói chuyện, quạt gió, tiếng mở cửa).
* Đánh giá: Kiểm tra độ nhạy và tính lọc ồn của tính năng Touch-to-Talk; kiểm thử quy trình cán bộ tải lên và phê duyệt biểu mẫu mới trên Admin Portal.
### 6. Kết quả đầu ra dự kiến

* Ứng dụng Web Citizen (Client Web App):
* Chạy mượt mà trên trình duyệt di động qua cơ chế quét mã QR tại bàn tiếp dân hoặc chụp nhận diện biểu mẫu (Zero-install).
* Tự động nắn phẳng tờ khai giấy đã chụp một lần, hiển thị "Bản sao thị giác" phóng đại từng ô với khung sáng nhấp nháy CSS mượt mà.
* Trợ lý giọng nói tiếng Việt đọc rõ ràng hướng dẫn từng bước và chữ mẫu màu đỏ; hỗ trợ phụ đề chữ chạy Karaoke ≥ 20pt, nút bấm giữ Mic (Push-to-Talk) và các nút chạm hỏi nhanh Touch-to-Ask Chips.
* Cổng thông tin Quản trị viên (Admin Portal):
* Ứng dụng Web trên máy tính dành cho cán bộ hành chính: kéo thả tải lên biểu mẫu PDF mới, thuật toán tự động nhận diện khung ô, cán bộ đối soát chia đôi màn hình và bấm phê duyệt xuất bản chỉ trong ≤ 5 phút (hoặc dưới 3 phút khi có sẵn khung ô).
## PHẦN V. DỮ LIỆU DỰ KIẾN

### 1. Nguồn dữ liệu

#### 1.1. Danh mục biểu mẫu hành chính chuẩn hóa:

Được công bố, đối chiếu chuẩn hóa từ Cổng dịch vụ công Quốc gia (https://dichvucong.gov.vn/) và tra cứu phôi mẫu, phụ lục từ Thư viện Pháp Luật (https://thuvienphapluat.vn/):

* Hệ thống các biểu mẫu thủ tục hành chính công trực tuyến và tại chỗ phục vụ công dân (thuế, đất đai, tư pháp – hộ tịch, giao thông, bảo trợ xã hội).
* Các biểu mẫu có quan hệ liên chứng từ (đối soát thông tin từ căn cước công dân, giấy chứng nhận quyền sử dụng đất, biên bản xử phạt, hồ sơ chứng từ liên quan).
* Quy chuẩn mã thủ tục, tên biểu mẫu, thẩm quyền ban hành và văn bản quy phạm pháp luật đính kèm được đồng bộ theo cơ sở dữ liệu quốc gia về thủ tục hành chính
#### 1.2. Dữ liệu hình ảnh phôi khai và bộ nhãn hình học

Bộ dữ liệu gồm 500+ ảnh chụp phôi tờ khai thực tế thu thập từ Bộ phận Một cửa địa phương, chụp trong nhiều điều kiện ánh sáng, góc nghiêng và bề mặt bàn khác nhau; toàn bộ được gán nhãn chuẩn hóa tọa độ.

### 2. Quy mô dữ liệu

* Danh mục biểu mẫu & Trường thông tin chuẩn hóa: Hệ thống chuẩn hóa danh mục các biểu mẫu thủ tục hành chính công cấp thiết tại Bộ phận Một cửa (thuế, đất đai, tư pháp - hộ tịch, xác nhận dân sự...) với cấu trúc lưới hình học và hơn 100+ trường thông tin được gán nhãn chuẩn hóa tọa độ [0.0 - 1.0].
* Tập dữ liệu hình ảnh: 500+ mẫu ảnh chụp phôi tờ khai và tài liệu thực tế thu thập từ Bộ phận Một cửa địa phương, chụp trong đa dạng điều kiện thực tế (ánh sáng phức tạp, chụp xiên, bóng đổ mờ, bề mặt bàn Một cửa).
* Kho ngữ liệu đàm thoại & Trợ năng giọng nói: 200+ thuật ngữ hành chính công được biên soạn song ngữ hành chính chuyên ngành thành đàm thoại bình dân (dành riêng cho người cao tuổi) kèm bộ câu hỏi thường gặp FAQ ngữ cảnh cho từng ô khai.
### 3. Tính hợp pháp, Quyền sử dụng, Bảo vệ dữ liệu cá nhân

* Căn cứ quyền sử dụng biểu mẫu hành chính công: Căn cứ theo khoản 2 Điều 19 Luật Sở hữu trí tuệ và Luật Tiếp cận thông tin 2026, các văn bản quy phạm pháp luật, văn bản hành chính và biểu mẫu thủ tục hành chính nhà nước thuộc danh mục thông tin công khai, không thuộc đối tượng bảo hộ quyền tác giả. Đội thi được quyền tự do tiếp cận, trích xuất, số hóa và sử dụng hợp pháp nhằm mục đích nghiên cứu khoa học và phục vụ lợi ích cộng đồng.
* Quyền sử dụng công nghệ và giấy phép mã nguồn mở: Toàn bộ công nghệ nền tang và thư viện sử dụng đều tuân thủ giấy phép phần mềm tự do nguồn mở thương mại
* Tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dự liệu các nhân:
* Chính sách không lưu vết: Không lưu ảnh chụp của người dân lên ở cứng máy chủ, xử lý tạm thời trên RAM và huye hủy phiên ngay lập tức khi hoàn thành hoặc sau 15 phút không tương tác
* Giới hạn pháp lý: Hệ thông đống vai trò trợ lý hướng dẫn thị giác và giọng nói, không thay thế chữ ký của công dân và không can thiệp và thẩm quyền xét duyệt của cán bộ nhà nước.
## PHẦN VI. TÍNH SÁNG TẠO VÀ KHÁC BIỆT

### 1. Các giải pháp hiện có trên thị trường

* Cổng Dịch vụ công Quốc gia & Ứng dụng VNeID [8][20]: Bắt buộc công dân số hóa 100% qua thao tác bàn phím ảo, nhận diện khuôn mặt, OTP; rào cản quá lớn với người run tay và mắt kém.
* Biểu mẫu giấy truyền thống kèm bảng mẫu mica: Chữ in mẫu quá nhỏ dưới kính bàn Một cửa; nội dung mẫu tĩnh, không thể giải đáp ngữ cảnh riêng của từng người dân; không có giọng nói hướng dẫn.
* Các ứng dụng trợ năng thị giác quốc tế (Google Lookout [12], Seeing AI [13][19], Be My AI [15]): Thiết kế tổng quát cho người khiếm thị toàn phần (đọc biển báo, nhận diện đồ vật, đếm tiền); hoàn toàn không có quy trình nghiệp vụ biểu mẫu hành chính; không thể bóc tách tọa độ ô giấy thật để dẫn hướng bút viết; không hiểu hệ thống pháp luật Việt Nam.
* Ứng dụng quét tài liệu OCR di động (Adobe Scan [16][17], CamScanner): Chỉ phục vụ quét tĩnh lưu trữ PDF sau khi viết xong; không hỗ trợ người dùng trong quá trình đang đặt bút viết.
### 2. Điểm mới cải thiện

#### 2.1. Điểm mới 1: Cơ chế “Snapshot and Guide” – Giải quyết nổi đâu suy giảm thị giác, run tay và mỏi tay khi giơ điện thoại

* Cơ sở nỗi đau: Người cao tuổi bị mắt mờ do viễn thị/đục thủy tinh thể sinh lý rất khó đọc chữ in mẫu nhỏ (9–10pt) dưới lớp mica; hiện tượng run tay (tremor) khiến việc viết vào ô nhỏ hẹp rất dễ chệch dòng. Đặc biệt, nếu áp dụng công nghệ AR/Camera liên tục, người già cầm điện thoại lơ lửng trên không trung sẽ bị mỏi tay, run giật chỉ sau 1 phút và không còn tay nào để cầm bút viết nắn nót.
* Điểm mới cải thiện:
* Thay vì công dân giơ mát, AI Form Locator áp dụng cơ chế Bản sao thị giác chụp 1 lần: Công dân chỉ cần chụp 1 lần rồi đặt máy lên giá đỡ cố định tại bàn
* Thuật toán OpenCV WebAssembly tự động nắn phảng phối cảnh góc nghiêng, phóng đại từng ô khai với khung viến phát sat không tốn RAM đồ họa, giúp amwst mờ nhìn rõ vị trí ô giấy thật tương ứng.
* Chữ mẫu điền minh họa được viết in hoa đỏ đậm đạt chuẩn tương phản cao WCAG AAA (7:1) trên nền trắng, giúp người già dễ dàng đối chiếu và chép lại chính xác vào tờ khai giấy
#### 2,2, Điểm mới 2: Bộ chuyển ngữ đàm thoại bình dân và Voice UX Half-Duplex – Giải quyết nỗi đau rào cản thuật ngữ pháp lý

* Cơ sở nỗi đau: Các thuật ngữ hành chính cố động (như “nơi thường trú”, “nguyên quán”, “chủ sở hữu hưởng dụng”, “mã số thuế cá nhân”) khiến người già hoang mang không biết ghi thông tin gì, dẫn đến tâm lý e ngại, điền bừa.
* Điểm mới cải thiện
* Mô hình Google Gemini 3.6 Pure-Text kết hợp từ điển 200+ thuật ngữ hành chính đóng vai trò "Bộ chuyển ngữ Plain Language", tự động biên dịch nhãn trường khô khan thành câu thoại chỉ dẫn mộc mạc (tối đa 2–3 câu đơn), tuân thủ nghiêm ngặt quy tắc xưng hô "cháu - bác".
* Hạ tầng giọng nói Google Cloud TTS Neural2 0.90x phát âm ấm áp, tốc độ chậm rãi, kết hợp phụ đề chữ đồng bộ dành riêng cho người lãng tai.
* Tương tác âm thanh Half-Duplex qua nút bấm Mic và các nút chạm hỏi nhanh Touch-to-Ask Chips, loại bỏ hoàn toàn hiện tượng dội âm và tạp âm ồn ào tại sảnh Một cửa.
#### 2.3. Điểm mới 3: Cổng kiểm duyệt Cán bộ (Review Gate) — Giải quyết nỗi đau mặc cảm sợ phiền hà & Gánh nặng quá tải Một cửa

* Cơ sở nghiên cứu nỗi đau: Người cao tuổi mặc cảm sợ bị cán bộ gắt gỏng khi hỏi đi hỏi lại nhiều lần; trong khi cán bộ Một cửa phải xử lý 30–50 hồ sơ/ngày và mất 15–25 phút chỉ để ngồi cạnh chỉ tay từng dòng. Khi viết sai hoặc bôi xóa lem nhem, quy trình buộc phải hủy phôi phát lại từ đầu, gây ùn tắc quầy nghiêm trọng.
* Điểm mới cải thiện:
* Cổng Quản trị Human-in-the-loop (Review Gate): Cán bộ chỉ cần thao tác 1 lần duy nhất trên máy tính trong ≤3 phút để đối soát chia đôi màn hình và bấm phê duyệt kịch bản kèm cam kết trách nhiệm pháp lý.
* Sau khi phê duyệt, mã QR của biểu mẫu trở thành "trợ lý số tự động", đồng hành hướng dẫn độc lập cho hàng trăm công dân cao tuổi, nâng tỷ lệ tự kê khai đúng ngay lần đầu lên ≥90%, giảm ít nhất 30% thời gian hướng dẫn thủ công của cán bộ và triệt tiêu tình trạng lãng phí phôi in.
#### 2.4. Điểm mới 4: Trải nghiệm Zero-Install & Tương thích máy cũ — Tháo gỡ thực trạng "3 không"

* Cơ sở nghiên cứu nỗi đau: Đa số người cao tuổi dùng smartphone đời cũ (RAM ≤2GB≤2GB), không có tài khoản VNeID mức 2 hoặc không biết thao tác cài app trên Google Play/App Store.
* Điểm mới cải thiện:
* Hoạt động 100% trên nền tảng Web di động thông qua quét mã QR dán tại bàn Một cửa (Zero-install), không đòi hỏi tải app, không yêu cầu đăng nhập tài khoản.
* Tích hợp Web Wake Lock API giữ màn hình luôn sáng trong suốt buổi kê khai, loại bỏ tình trạng điện thoại tự động khóa màn hình sau 30 giây khi người già đang tập trung viết bút trên giấy; kèm Nút Thoát nhanh (Quick Exit & Flush) để công dân yên tâm xóa sạch bộ nhớ tạm chỉ với 1 chạm.
### 3. Cách tiếp cận: Mô hình “Cầu nối Nhân văn”

Tại sao AI Form Locator Platform lại chọn cách tiếp cận này thay vì các hướng đi công nghệ khác? Có 3 lý do cốt lõi xuất phát từ thực tiễn Việt Nam:

* Tại sao không số hóa 100% (bắt công dân thao tác trên app/web-form điện tử như VneID)?
* Lý do: Thao tác trên màn hình cảm ứng nhỏ hẹp với bàn phím ảo đòi hỏi vận động tinh rất cao. Đối với người cao tuổi run tay, mắt mờ, trí nhớ suy giảm, việc bắt họ gõ phím ảo, nhận diện khuôn mặt và nhập OTP vô tình tạo ra một "bức tường ngăn cách số", đẩy nhóm người dễ bị tổn thương nhất ra rìa xã hội.
* Giải pháp của AFL: Tôn trọng và bảo tồn cây bút mực cùng tờ giấy truyền thống  vật bất ly thân quen thuộc hàng chục năm của người già. Công nghệ chỉ đóng vai trò là "kính lúp thông minh và người cháu hướng dẫn ngồi bên cạnh".
* Tại sao không đầu tư hiện thống Kiosk cảm ứng chuyên dụng tại quầy Một cửa
* Giải pháp của AFL: Tôn trọng và bảo tồn cây bút mực cùng tờ giấy truyền thống  vật bất ly thân quen thuộc hàng chục năm của người già. Công nghệ chỉ đóng vai trò là "kính lúp thông minh và người cháu hướng dẫn ngồi bên cạnh".
* Giải pháp AFL: Mô hình Frugal Innovation (Đổi mới sáng tạo tiết kiệm): Tận dụng smartphone của công dân (BYOD) kết hợp với tấm mica in mã QR, giúp mọi UBND xã/phường trên toàn quốc đều có thể kích hoạt dịch vụ ngay lập tức mà không tốn ngân sách
* Tại sao không sử dụng AI tạo sinh tự do?
* Lý do: Lĩnh vực hành chính công đòi hỏi tính chuẩn xác pháp lý tuyệt đối (Zero Tolerance for Error). Một câu hướng dẫn sai của AI có thể khiến hồ sơ của công dân bị từ chối hoặc sai lệch tài sản pháp lý.
* Giải pháp của AFL: Thiết lập mô hình Human-in-the-loop chặt chẽ (AI đề xuất — Cán bộ chốt duyệt). AI chỉ đóng vai trò trợ lý sơ bộ hóa kịch bản, cán bộ hành chính giữ quyền phê duyệt cuối cùng, triệt tiêu 100% rủi ro ảo giác thông tin và bảo đảm an toàn pháp lý cao nhất.
### 4. Yếu tố AI độc đáo

#### 4.1. Điểm nổi bật trong yếu tố AI

* Adaptive Computer Vision: Kết hợp linh hoạt OpenCV WebAssembly xử lý tức thì trên máy và Cloud Fallback, đảm bảo máy nào cũng chạy được dưới 200ms.
* Pure-Text Structured Prompting: Bóc tách chữ thành dạng text rồi mới đưa vào Gemini 3.6 sinh kịch bản JSON, triệt tiêu 95% chi phí token và đảm bảo an toàn PII tuyệt đối.
* Voice UX Half-Duplex & Karaoke Captions: Loại bỏ cơ chế Barge-in dễ gây dội âm, dùng Push-to-Talk, phụ đề Karaoke chạy chữ đồng bộ ≥ 20pt và Touch-to-Ask Chips chuyên biệt cho môi trường đông người tại sảnh hành chính.
#### 4.2. Điểm khác biệt của dự án

* Cơ chế Cán bộ Phê duyệt (Review Gate): Triệt tiêu 100% nguy cơ ảo giác thông tin hành chính công bằng quy trình Human-in-the-loop kết hợp chốt chặn Cam kết Trách nhiệm Pháp lý (Legal Checkbox Gate).
* Chuẩn trợ năng tối thượng WCAG AAA & Wake Lock: Touch target ≥ 56 × 56 dp chống bấm nhầm cho tay run; độ tương phản chữ mẫu đạt chuẩn 7:1; nhấp nháy phát sáng bằng CSS Keyframes mượt mà; tích hợp Web Wake Lock API chống tắt màn hình và nút Thoát nhanh Quick Exit & Flush.
## PHẦN VII. KẾ HOẠCH PHÁT TRIỂN PROTOTYPE

### 1. Giai đoạn 1 - Khảo sát và thu thập dữ liệu

* Tuần 1: Khảo sát thực tế tại Bộ phận Một cửa cấp phường/xã; phỏng vấn chuyên sâu 10 người cao tuổi và 05 cán bộ tiếp dân; thu thập mẫu phôi scan chuẩn của 02 nhóm biểu mẫu MVP phức tạp: Lệ phí trước bạ (kèm Sổ đỏ/Hợp đồng) và Nộp phạt VPHC (kèm Biên bản xử phạt).
* Tuần 2: Hoàn thiện Tài liệu Yêu cầu Sản phẩm và Kiến trúc Hệ thống chi tiết; thiết lập khung pháp lý bảo vệ dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP (DPIA Draft).
* Tuần 3: Tiến hành chụp 500+ ảnh biểu mẫu trong các điều kiện thực tế (chụp xiên, rung, bóng mờ); sử dụng công cụ gán nhãn tọa độ bounding box chuẩn hóa cho từng ô khai; xây dựng kho ngữ liệu giải nghĩa thuật ngữ pháp lý.
### 2. Giai đoạn 2 - Xây dựng mô hình

* Tuần 4: Chuẩn bị môi trường phát triển (Next.js 14, TypeScript, Prisma, PostgreSQL); thiết lập pipeline biên dịch C++ sang WebAssembly kèm Cloud Edge Fallback.
* Tuần 5: Lập trình thuật toán tìm 4 góc giấy và biến đổi phối cảnh (Perspective Transform) ≤ 100ms; xây dựng giải thuật phân vùng lưới ô và sắp xếp hình học (Geometric Sort) đạt độ chính xác ≥ 98%.
* Tuần 6: Kết nối Google Gemini 3.6 API (Pure Text LLM với JSON Schema) sinh kịch bản hướng dẫn theo ô và chữ mẫu đỏ; tích hợp Google Cloud TTS Neural2 0.9x có cache MP3, phụ đề Karaoke và Module hỏi đáp Push-to-Talk kèm Touch-to-Ask Chips.
### 3. Giai đoạn 3 - Phát triển prototype

* Tuần 7: Lập trình giao diện Citizen Web App: Hiện thực hóa Bản sao thị giác chụp 1 lần (Snapshot & Guide), tối ưu hóa chụp một lần trên mặt phẳng bàn; áp dụng chuẩn WCAG 2.1 AAA (Touch Target ≥ 56dp, Contrast 7:1, Web Wake Lock API và CSS Keyframes Pulse).
* Tuần 8: Lập trình Cổng Quản trị (Admin Portal) cho cán bộ kéo thả biểu mẫu PDF và đối soát chia đôi màn hình (Review Gate); tích hợp bảo mật In-Memory: Xóa sạch dữ liệu trên RAM sau 15 phút không tương tác theo Nghị định 13 (NFR-3).
### 4. Giai đoạn 4 - Kiểm thử và hoàn thiện

* Tuần 9: Triển khai **Kiểm thử Khả dụng trực tiếp (Lab Usability Testing)**: Mời 20+ người dùng thuộc nhóm cao tuổi và người yếu thế công nghệ tham gia thử nghiệm; cung cấp giá đỡ điện thoại Phone Stand và tờ khai giấy in để người dùng trực tiếp trải nghiệm tính năng chụp, nghe hướng dẫn giọng nói và viết theo chữ mẫu đỏ.
* Tuần 10: Thu thập và phân tích dữ liệu vận hành: Bấm giờ hoàn thành biểu mẫu (Task Completion Time), ghi nhận số lần viết sai/gạch xóa, đo tỷ lệ đúng ngay lần đầu (First-Time Right); khảo sát mức độ hài lòng theo thang đo chuẩn quốc tế SUS (System Usability Scale).
* Tuần 11: Triển khai **Kiểm thử Mô phỏng quy trình tiếp dân thực tế (Simulated Citizen Journey)**: Tái hiện không gian tiếp nhận hồ sơ với đầy đủ tạp âm nền phòng làm việc, kiểm thử luồng đối soát Cổng kiểm duyệt (Review Gate) với dữ liệu giả định; tinh chỉnh bộ lọc bóng đổ và độ nhạy của micro tương tác giọng nói.
* Tuần 12: Viết Báo cáo tổng kết đề tài nghiên cứu khoa học chi tiết; đóng gói mã nguồn, quay video demo quy trình vận hành và chuẩn bị bảo vệ nghiệm thu đề tài.
### 5. Phân bổ nguồn lực và dự toán kinh phí thực hiện

#### 5.1 Phân công nhân sự

| Thành viên | Vai trò | Phân công |
| :--- | :--- | :--- |
| Nguyễn Tuấn Khánh | Tech Lead, System Architect | Thiết kế kiến trúc tổng thể.<br>Thiết kế CSDL PostgreSQL/Prisma, Service Persistence và cơ chế In-Memory Zero-retention tuân thủ Nghị định 13/2023/NĐ-CP.<br>Phụ trách bộ test suite tích hợp, giám sát kiểm thử và triển khai hệ thống. |
| Nguyễn Thế Anh | AI Engineer | Phát triển lõi xử lý ảnh OpenCV WebAssembly: Tìm 4 góc giấy và nắn góc phối cảnh Perspective Transform.<br>Thuật toán phân vùng lưới ô, bóc tách dòng/checkbox và sắp xếp hình học Geometric Sort đạt độ chính xác ≥98%.<br>Tích hợp pipeline VietOCR bóc tách chữ từ phôi biểu mẫu. |
| Nguyễn Thanh Chiến | FullStack, Voice AI Lead | Thiết kế & lập trình Citizen Web App theo chuẩn trợ năng W3C WCAG AAA. <br>Lập trình Cổng Quản trị Admin Portal đối soát chia đôi màn hình (Review Gate).<br>Tích hợp phân hệ Voice AI: Kết nối Google Gemini 3.6 Pure-Text sinh kịch bản bình dân, tích hợp Google Cloud TTS Neural2 0.9x, phụ đề và module tương tác giọng nói Touch-to-Talk / Touch-to-Ask. |

#### 5.2 Dự toán kinh phí thực hiện

* Chi phí máy chủ hạ tầng: 0 đồng trong giai đoạn thử nghiệm MVP nhờ khiến trúc phi máy chủ (Client-side WASM xử lý hình ảnh trực tiếp trên trình duyệt thiết bị công dân, giảm 90% tải trọng server) kết hợp hạ tầng Cloud miễn phí
* Chi phí AI API (Gemini, Google TTS): 0 đồng nhwof tối ưu hóa Pure-text kết hợp cơ chế cache âm thanh cục bộ, nằm trong hoàn toàn trong hạn mức tài trợ miện phí (Free Tier)
* Trang thiết bị thử nghiệm thực địa: Tận dụng thiết bị sẵn có của nhóm đội thi
## PHẦN VIII. SẢN PHẨM DỰ KIẾN

### 1. Ứng dụng Web Citizen (Client Web App)

Ứng dụng Web trên di động hoạt động không cần cài đặt (Zero-install) qua quét mã QR dán tại bàn Một cửa; cung cấp Bản sao thị giác Visual Twin và trợ lý âm thanh tương tác Half-Duplex cho người cao tuổi.

### 2. Cổng thông tin Quản trị viên (Admin Portal)

Ứng dụng Web cho cán bộ tải biểu mẫu PDF, đối soát chia đôi màn hình và phê duyệt kịch bản 100% trước khi xuất bản mã QR.

### 3. Báo cáo khoa học & Bộ hồ sơ kỹ thuật:

* 01 Báo cáo nghiên cứu khoa học tổng kết đề tài hoàn chỉnh (kèm đầy đủ cơ sở toán học, lược đồ kiến trúc và số liệu thực nghiệm).
* Toàn bộ mã nguồn (Source code) hệ thống được đóng gói bài bản trên Git với đầy đủ tài liệu hướng dẫn triển khai.
* Bộ tài liệu hướng dẫn sử dụng và cẩm nang đào tạo cán bộ Bộ phận Một cửa.
* Hồ sơ Đánh giá tác động xử lý dữ liệu cá nhân (DPIA) theo mẫu chuẩn của Bộ Công an quy định tại Nghị định 13/2023/NĐ-CP [10].
## PHẦN IX. HƯỚNG PHÁT TRIỂN TƯƠNG LAI VÀ MỞ RỘNG ĐỀ TÀI

Sau khi hoàn thành và bảo vệ thành công phiên bản MVP cốt lõi (tập trung 100% vào phần mềm trợ năng di động linh hoạt theo mô hình BYOD và Cổng quản trị Admin), đội thi định hướng nghiên cứu và mở rộng hệ thống sang giai đoạn 2 với các trọng tâm ứng dụng đời thực chuyên sâu:

### 1. Nghiên cứu & Chuyển giao Trạm Trợ năng IoT Một cửa:

Khả năng hiện thực hóa phần cứng chi phí thấp (Frugal Engineering): Đối với các cơ quan hành chính có điều kiện trang bị tại bàn tiếp dân cố định, AFL Platform sẵn sàng cung cấp bản thiết kế phần cứng mở của Module Trạm trợ năng gắn bàn (chi phí linh kiện dưới 2–3 triệu đồng/bàn, thay thế hoàn toàn các hệ thống Kiosk đắt đỏ hàng trăm triệu):

Camera tài liệu góc trên cao (Overhead Scanner): Cố định góc vuông 90° và khoảng cách tiêu cự chuẩn 35cm kèm dải đèn LED vòng chống bóng mờ. Người già chỉ cần đặt tờ giấy xuống bàn là hệ thống tự động nhận diện và nắn phẳng, không cần cầm điện thoại giơ lên cao gây mỏi và rung tay.

Cụm phím bấm cơ học trợ năng siêu lớn (≥ 50 mm): 03 nút cơ công nghiệp nảy êm với màu sắc tương phản cao ([ĐỌC LẠI] - [TIẾP THEO] - [GỌI CÁN BỘ]) kết nối qua chuẩn WebHID/WebUSB, giúp công dân bị run tay nặng hoặc sợ thao tác chạm cảm ứng vẫn điều khiển trợ lý âm thanh dễ dàng.

Đầu đọc thẻ CCCD gắn chip (NFC Reader): Tích hợp sâu theo tinh thần Đề án 06/CP; chạm thẻ CCCD để tự động trích xuất họ tên, ngày sinh, số định danh cá nhân và quê quán điền sẵn vào bản mẫu hướng dẫn.

Loa định hướng (Directional Audio) & Giắc cắm tai nghe 3.5mm: Tập trung chùm sóng âm thanh hẹp 30° trước mặt người ngồi, vừa đảm bảo công dân lãng tai nghe rõ, vừa giữ yên tĩnh và bảo mật thông tin cá nhân tại sảnh Một cửa.

### 2. Định hướng liên thông Hệ thống cấp số thứ tự Một cửa (Smart Queuing):

Kết nối thông qua giao thức nhẹ MQTT / RESTful Webhooks với hệ thống máy chủ cấp số xếp hàng tại Bộ phận Một cửa.

Ngay khi công dân cao tuổi hoàn thành tờ khai tại bàn AFL với tỷ lệ tự kiểm tra đúng ≥90%, hệ thống tự động kích hoạt máy in vé ưu tiên hoặc đẩy tín hiệu sang quầy cán bộ: "Bàn số 2: Hồ sơ đã hoàn tất hợp lệ, mời vào quầy nhận hồ sơ", giảm thiểu tối đa thời gian chờ đợi.

### 3. Mở rộng ứng dụng vào các cơ quan đời thực khác:

Mô hình trợ năng thông minh của AFL Platform có tính khái quát hóa cao, sẵn sàng nhân rộng vào mạng lưới các dịch vụ công ích đời thường:

* Cơ sở khám chữa bệnh & Trạm Y tế cơ sở: Hỗ trợ người cao tuổi tự điền Phiếu thông tin bệnh nhân ban đầu, Phiếu kê khai tiền sử bệnh/dị ứng, Đơn cấp lại thẻ Bảo hiểm Y tế (BHYT).
* Mạng lưới Bưu điện Văn hóa Xã & Chi nhánh Ngân hàng Chính sách Xã hội: Hỗ trợ người già tự tin kê khai Giấy lĩnh lương hưu, Giấy nhận tiền trợ cấp bảo trợ xã hội, Hồ sơ vay vốn chính sách ưu đãi.
* Điểm sinh hoạt Tổ Công nghệ số cộng đồng / Nhà văn hóa thôn bản: Đóng vai trò là trạm tập huấn số cộng đồng để thanh niên tình nguyện hướng dẫn người cao tuổi tập dượt kê khai biểu mẫu trước khi đến cơ quan công quyền.
## PHẦN X. CAM KẾT

* Cam kết tính trung thực khoa học: Đội thi AFL Team cam kết toàn bộ ý tưởng, mã nguồn, kiến trúc hệ thống và số liệu thực nghiệm trong đề cương này là công trình nghiên cứu độc lập của nhóm, không sao chép trái phép.
* Cam kết bảo vệ dữ liệu cá nhân: Cam kết tuân thủ tuyệt đối quy định của Nghị định 13/2023/NĐ-CP. Không thu thập, không lưu trữ và không thương mại hóa dữ liệu hình ảnh, thông tin cá nhân của công dân dưới mọi hình thức (Zero-retention).
* Cam kết phụng sự xã hội: Sản phẩm được định hướng phi lợi nhuận cho các dịch vụ công ích, sẵn sàng chuyển giao công nghệ và hỗ trợ kỹ thuật miễn phí cho các cơ quan hành chính nhà nước, Hội Người cao tuổi trên cả nước.
* Cam kết hoàn thành mục tiêu: Đội thi cam kết bảo đảm tiến độ thực hiện prototype đúng lộ trình 12 tuần và tham gia đầy đủ các vòng thi của chương trình AI FOR LIFE.
## PHẦN XI. PHỤ LỤC

### Phụ lục A. Nguồn dữ liệu & Căn cứ kiểm chứng


1. Danh mục biểu mẫu hành chính chuẩn hóa:

Được công bố và trích xuất chuẩn hóa từ Cổng dịch vụ công Quốc Gia (https://dichvucong.gov.vn/):

* Hệ thống các biểu mẫu thủ tục hành chính công trực tuyến và tại chỗ phục vụ công dân (thuế, đất đai, tư pháp - hộ tịch, giao thông, bảo trợ xã hội...).
* Các biểu mẫu có quan hệ liên chứng từ (đối soát thông tin từ căn cước công dân, giấy chứng nhận quyền sử dụng đất, biên bản xử phạt, hồ sơ chứng từ liên quan).
* Quy chuẩn mã thủ tục, tên mẫu biểu, thẩm quyền ban hành và văn bản quy phạm pháp luật đính kèm được đồng bộ theo cơ sở dữ liệu quốc gia về thủ tục hành chính.

2. Quy chuẩn Vòng đời Biểu mẫu & Bảng Hướng Dẫn Vật Lý:

* Cơ chế Hạn Hiệu Lực Văn Bản (`valid_until`): Mỗi biểu mẫu được gắn hạn hiệu lực theo quy định pháp luật. Khi văn bản bị sửa đổi/thay thế, hệ thống tự động cảnh báo công dân trên Web di động để tránh nộp nhầm phôi cũ.
* Quy chuẩn Bảng Mica Chống Tráo Mã QR (QR Phishing): Khung mica cố định đóng khung A5/A4 tại bàn Một cửa, in kèm tên miền cổng dịch vụ công chính thống để bảo vệ người già khỏi nguy cơ bị dán đè mã QR độc hại.

3. Bảng đối chiếu năng lực trợ năng W3C WCAG AAA:

* Tương phản màu sắc: Tỷ lệ ≥ 7:1 (vượt chuẩn AA 4.5:1, đạt AAA).
* Vùng chạm cảm ứng (Target Size): 56 × 56dp (vượt khuyến nghị tối thiểu 44px của WCAG 2.1 AAA theo chuẩn thiết kế dành riêng cho người cao tuổi suy giảm vận động tinh).
* Cỡ chữ hiển thị: Tối thiểu 18px đối với văn bản thường, 24px đối với tiêu đề và chữ mẫu in hoa.
### Phụ lục B. Tài liệu tham khảo (Bibliography)


1. Tổng cục Thống kê (GSO). Thông cáo báo chí Kết quả Điều tra dân số và nhà ở giữa kỳ năm 2024. Cổng thông tin điện tử Tổng cục Thống kê, Bộ Kế hoạch và Đầu tư (công bố 01/2025).

Truy cập tại: https://www.gso.gov.vn/du-lieu-va-so-lieu-thong-ke/2025/01/thong-cao-bao-chi-ket-qua-dieu-tra-dan-so-va-nha-o-giua-ky-nam-2024/


2. UNFPA Vietnam. Population Projections for Viet Nam 2019 – 2069 (Factsheet on Population Projections). United Nations Population Fund in Viet Nam.

Truy cập tại: https://vietnam.unfpa.org/sites/default/files/resource-pdf/factsheet_on_pop_projections_en_final_for_posting_1.pdf


3. UNFPA Vietnam. Ageing Report from Census 2019: Dynamics of Population Ageing in Viet Nam. United Nations Population Fund in Viet Nam (2021).

Truy cập tại: https://vietnam.unfpa.org/sites/default/files/pub-pdf/ageing_report_from_census_2019_eng_final27082021.pdf


4. UNFPA Vietnam. Population Ageing in Viet Nam: From Demographic Transition to Development Opportunity. United Nations Population Fund in Viet Nam (Cập nhật 2026).

Truy cập tại: https://vietnam.unfpa.org/en/news/population-ageing-viet-nam-demographic-transition-development-opportunity


5. World Bank. Vietnam: Adapting to an Aging Society. World Bank Group Flagship Report, Washington, D.C. (2021).

Truy cập tại: https://www.worldbank.org/en/country/vietnam/publication/vietnam-adapting-to-an-aging-society


6. World Bank. Reforms Could Ensure Higher Growth Rates as Vietnam’s Population Ages. Press Release, World Bank Vietnam (2021).

Truy cập tại: https://www.worldbank.org/en/news/press-release/2021/09/30/reforms-could-ensure-higher-growth-rates-as-vietnam-s-population-ages


7. Thủ tướng Chính phủ. Quyết định số 942/QĐ-TTg ngày 15/06/2021: Phê duyệt Chiến lược phát triển Chính phủ điện tử hướng tới Chính phủ số giai đoạn 2021 - 2025, định hướng đến năm 2030. Cổng thông tin điện tử Chính phủ nước CHXHCN Việt Nam.

Truy cập tại: https://vanban.chinhphu.vn/?docid=203403&pageid=27160


8. Chính phủ. Nghị định số 45/2020/NĐ-CP ngày 08/04/2020: Về thực hiện thủ tục hành chính trên môi trường điện tử. Cổng thông tin điện tử Chính phủ nước CHXHCN Việt Nam.

Truy cập tại: https://vanban.chinhphu.vn/?docid=199753&pageid=27160


9. Chính phủ. Nghị định số 310/2026/NĐ-CP: Sửa đổi, bổ sung một số điều của Nghị định số 45/2020/NĐ-CP về thực hiện thủ tục hành chính trên môi trường điện tử. Cổng thông tin điện tử Chính phủ nước CHXHCN Việt Nam.

Truy cập tại: https://vanban.chinhphu.vn/?classid=1&docid=219101&pageid=27160


10. Chính phủ. Nghị định số 13/2023/NĐ-CP ngày 17/04/2023: Về bảo vệ dữ liệu cá nhân. Cổng thông tin điện tử Chính phủ nước CHXHCN Việt Nam.

Truy cập tại: https://vanban.chinhphu.vn/default.aspx?docid=207759&pageid=27160


11. W3C (World Wide Web Consortium). Web Content Accessibility Guidelines (WCAG) 2.2. W3C Recommendation (2023).

Truy cập tại: https://www.w3.org/TR/WCAG22/


12. Google Accessibility. Use Lookout to explore your surroundings - Android Accessibility Help. Google Support Documentation (2024).

Truy cập tại: https://support.google.com/accessibility/android/answer/9031274?hl=en


13. Microsoft Accessibility Blog. What’s new with Seeing AI. Official Microsoft Blog (2023).

Truy cập tại: https://blogs.microsoft.com/accessibility/seeing-ai-2/


14. Be My Eyes. Getting started with Be My Eyes. Be My Eyes Help Center & Documentation (2024).

Truy cập tại: https://support.bemyeyes.com/hc/en-us/articles/360005528557-Getting-started-with-Be-My-Eyes


15. Be My Eyes. Be My AI: Next-generation visual assistance powered by OpenAI. Official Product Specification (2024).

Truy cập tại: https://www.bemyeyes.com/bme-ai/


16. Adobe Acrobat. Quét thành PDF: Quét tài liệu với ứng dụng quét miễn phí Adobe Scan. Adobe Official Portal (2024).

Truy cập tại: https://www.adobe.com/vn_vi/acrobat/mobile/scanner-app.html


17. Adobe Experience League. Paper to PDF: Scan and OCR Documentation & Workflow. Adobe Learning Resources (2024).

Truy cập tại: https://experienceleague.adobe.com/en/docs/document-cloud-learn/acrobat-learning/get-started/create/scan-and-ocr


18. W3C WAI. Understanding Success Criterion 2.5.8: Target Size (Minimum). Web Accessibility Initiative (WAI) (2023).

Truy cập tại: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum


19. Microsoft Accessibility Blog. Seeing AI App Launches on Android – Including new and updated features and new languages. Official Microsoft Blog (2023).

Truy cập tại: https://blogs.microsoft.com/accessibility/seeing-ai-app-launches-on-android-including-new-and-updated-features-and-new-languages/


20. Thủ tướng Chính phủ. Quyết định số 06/QĐ-TTg ngày 06/01/2022: Phê duyệt Đề án phát triển ứng dụng dữ liệu về dân cư, định danh và xác thực điện tử phục vụ chuyển đổi số quốc gia giai đoạn 2022 - 2025, tầm nhìn đến năm 2030 (Đề án 06/CP). Cổng thông tin điện tử Chính phủ nước CHXHCN Việt Nam (2022).

Truy cập tại: https://vanban.chinhphu.vn/?docid=205213&pageid=27160
