# Nghiên cứu 20 biểu mẫu Việt Nam: nhận diện vùng thông tin, vùng nhập và trường nhiều dòng

Ngày khảo sát: **08/10/2026**. Phạm vi: nghiên cứu nguồn Internet và bố cục phục vụ AFL-Platform; không sửa thuật toán, không gọi Gemini/VietOCR, không ghi database.

## 1. Kết luận chính

1. **Một hình chữ nhật không đồng nghĩa một trường nhập.** Nó có thể là khung nhóm, tiêu đề bảng, ảnh, QR hoặc vùng xác nhận.
2. **Một dòng chữ không đồng nghĩa một trường.** Một dòng có thể chứa nhiều nhãn/giá trị; một trường có thể chiếm nhiều dòng và nhiều vùng hình học.
3. **Trường nhiều dòng được nhận bằng quan hệ nhãn–giá trị, cấu trúc và ranh giới**, không chỉ chiều cao bbox hay khoảng cách dòng.
4. Nên tách ba khái niệm: **nhãn**, **trường nghiệp vụ**, **vùng để viết/chọn**. Một trường có thể liên kết nhiều vùng; một nhóm/bảng có thể chứa nhiều trường.
5. Pipeline hiện tại cần lớp hiểu bố cục và gom trường trước khi sinh hướng dẫn. Gemini không nên tự đoán số trường hoặc tọa độ từ các contour chưa được kiểm tra.

## 2. Đã thực hiện và giới hạn

- Tìm nguồn chính thức, theo liên kết đính kèm, tải **20 PDF khác nhau**, trích text hỗ trợ và render bằng Poppler; đã xem **44 trang** liên quan.
- Khảo sát 20 chủ đề nghiệp vụ: khai sinh, kết hôn, chuyển trường, hỗ trợ nhà ở, khuyết tật, hưu trí xã hội, BHYT, văn bằng ghi công, di chuyển hồ sơ thờ cúng, mai táng, đăng ký đất đai, xây dựng, lệ phí trước bạ, thuế bất động sản, chuyển mục đích đất, hộ kinh doanh, giao dịch xe, ủy quyền, hộ chiếu và cư trú. Một số chủ đề thuộc cùng lĩnh vực quản lý.
- **18 mẫu** đến từ bộ hồ sơ do địa phương công bố, có dữ liệu đánh máy/viết tay minh họa; **2 mẫu** là bản scan phôi chưa điền. Không xác minh các giá trị điền sẵn là giả hay thật; không sao chép tên, số định danh, số điện thoại hoặc chữ ký vào báo cáo/catalogue.
- Mẫu hộ chiếu nghiên cứu là **TK01 theo bản 2021**, cư trú là **CT01 theo bản 2023**. Khảo sát hình thái, **không xác nhận hiệu lực hay lựa chọn biểu mẫu pháp lý hiện hành**. Không suy năm văn bản từ tên file.
- Mẫu chọn có chủ đích, tập trung nhiều ở Trảng Bom; không đại diện mọi cơ quan, mọi ngành hoặc mọi biểu mẫu Việt Nam. Cần bổ sung nguồn độc lập trước khi huấn luyện/đánh giá rộng.
- Ba trang trắng: F01 trang 2, F15 trang 2, F17 trang 3. Hai trang chỉ chú giải: F14 trang 5, F20 trang 2. Không tính chúng là trang có trường cần hướng dẫn.
- Đây là **phân tích bố cục thủ công**, chưa có ground truth tọa độ và chưa chạy benchmark OCR/detection. Không đưa ra phần trăm độ chính xác hay tuyên bố thuật toán hiện tại đã nhận được các mẫu.
- Catalogue đi kèm ghi URL, trang đã xem, SHA-256, kích thước tải và mã hóa đặc điểm; không chứa giá trị nhân thân.

Nguồn tuyển chọn chính: [Hộ tịch](https://trangbom.dongnai.gov.vn/vi/news/cai-cach-hanh-chinh/ho-so-mau-linh-vuc-ho-tich-224.html), [giáo dục–bảo trợ–người có công](https://trangbom.dongnai.gov.vn/vi/news/cai-cach-hanh-chinh/ho-so-mau-linh-vuc-giao-duc-bao-tro-xa-hoi-nguoi-co-cong-223.html), [đất đai–xây dựng](https://trangbom.dongnai.gov.vn/vi/news/cai-cach-hanh-chinh/ho-so-mau-linh-vuc-dat-dai-xay-dung-222.html), [kinh doanh](https://trangbom.dongnai.gov.vn/vi/news/cai-cach-hanh-chinh/ho-so-mau-linh-vuc-kinh-doanh-225.html), [hợp đồng](https://trangbom.dongnai.gov.vn/vi/news/cai-cach-hanh-chinh/ho-so-mau-linh-vuc-chung-thuc-hop-dong-221.html). Phân tích từng mẫu dựa trên PDF riêng ở mục 3, không chỉ danh mục trên trang web.

## 3. Phân tích từng biểu mẫu

### F01. Tờ khai đăng ký khai sinh

Chủ đề: Đăng ký khai sinh. Trang đã xem: 1, 2. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/mau-to-khai-dang-ky-khai-sinh.signed.pdf).

- **Thông tin/nhãn:** Chữ in đậm phân nhóm người yêu cầu, trẻ và cha/mẹ; quốc hiệu, tiêu đề, lời cam đoan và dấu ký số là thông tin cố định. Các nhãn nhân thân lặp lại nhưng thuộc những người khác nhau.
- **Vùng nhập:** Giá trị đứng sau nhãn, có nhiều trường cùng một hàng; không nhất thiết có đường chấm hay khung bao. Có lựa chọn nhận bản sao ở chân trang.
- **Nhiều dòng:** Giấy tờ nhân thân và ngày sinh viết bằng chữ có giá trị trải qua nhiều dòng. Phải giữ cùng chủ thể và cùng nhãn; đổi sang nhóm cha/mẹ là điểm dừng.
- **Bẫy nhận diện:** Không lấy toàn đoạn có chữ làm ô nhập; không gộp các trường cùng tên của nhiều người. Trang PDF thứ hai trắng, không tạo bước hướng dẫn.

### F02. Tờ khai đăng ký kết hôn

Chủ đề: Đăng ký kết hôn. Trang đã xem: 1. [Nguồn PDF](https://trangbom.dongnai.gov.vn/vi/news/cai-cach-hanh-chinh/ho-so-mau-linh-vuc-ho-tich-224.html?download=1&id=0).

- **Thông tin/nhãn:** Bảng ba cột: cột đầu là nhãn, hai cột sau thuộc hai người. Hàng tiêu đề và lời cam đoan không phải trường nhập.
- **Vùng nhập:** Mỗi giao điểm hàng thuộc tính với cột người là một giá trị riêng, kể cả ô đã có dữ liệu minh họa.
- **Nhiều dòng:** Địa chỉ và giấy tờ xuống nhiều dòng trong cùng ô, không có đường ngang nội bộ chia thành bản ghi mới. Đó là một trường nhiều dòng, không phải nhiều trường.
- **Bẫy nhận diện:** Khung ngoài là container; cột nhãn không được hướng dẫn điền. Cùng một hàng có hai ô giá trị độc lập, không gộp ngang.

### F03. Đơn xin chuyển trường

Chủ đề: Chuyển trường tiểu học. Trang đã xem: 1. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/don-xin-chuyen-truong.signed.pdf).

- **Thông tin/nhãn:** Tiêu đề, hướng dẫn áp dụng và phần ý kiến của hai trường có vai trò khác với phần phụ huynh kê khai.
- **Vùng nhập:** Vùng chấm xen trong câu; có trường người liên hệ, học sinh, trường đi/trường đến, lớp và lý do.
- **Nhiều dòng:** Một giá trị địa chỉ hoặc lý do có thể tiếp tục trên hàng chấm dưới. Tuy nhiên câu xin chuyển trường chứa nhiều nhãn con, không gom cả câu thành một trường.
- **Bẫy nhận diện:** Chữ viết tay có thể chạm đường chấm. Hai vùng nhận xét nhà trường không được mặc định giao phụ huynh nhập.

### F04. Đơn đề nghị hỗ trợ về nhà ở

Chủ đề: Hỗ trợ sửa chữa nhà ở. Trang đã xem: 1. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/de-nghi-ho-tro-nha-o-mau-01.signed.pdf).

- **Thông tin/nhãn:** Phần giới thiệu căn cứ hỗ trợ, tên cột vật liệu và lời xác nhận là văn bản in sẵn.
- **Vùng nhập:** Có thông tin người đề nghị, vùng mô tả hiện trạng, các khoản hỗ trợ và bảng vật liệu gồm tên, đơn vị, khối lượng, ghi chú.
- **Nhiều dòng:** Đoạn mô tả tình trạng nhà có một nhãn dẫn và nhiều dòng giá trị; kết thúc ở mục đánh số tiếp theo. Đây là nhóm nhiều dòng không cần khung đóng.
- **Bẫy nhận diện:** Mỗi hàng vật liệu là một bản ghi mới, không phải dòng tiếp của cùng trường. Ô xác nhận của cơ quan và chữ ký người khai là hai vai trò.

### F05. Đề nghị xác định mức độ khuyết tật

Chủ đề: Đánh giá khuyết tật. Trang đã xem: 1, 2, 3, 4, 5. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/xac-dinh-muc-do-khuyet-tat.signed.pdf).

- **Thông tin/nhãn:** Trang đầu có loại yêu cầu và thông tin người liên quan; các trang sau là ma trận mô tả biểu hiện và mức đánh giá. Mô tả dài ở cột trái là nhãn.
- **Vùng nhập:** Có checkbox loại yêu cầu, thông tin nhân thân và ô đánh dấu theo cột trả lời của từng hàng ma trận.
- **Nhiều dòng:** Nhãn ma trận xuống nhiều dòng làm hàng cao hơn, nhưng không biến nhãn thành vùng viết nhiều dòng. Một ô lựa chọn vẫn thuộc đúng hàng/cột.
- **Bẫy nhận diện:** Bảng tiếp nối qua trang không được gộp thành một trường lớn. Một hàng mô tả dài không sinh nhiều câu hỏi hoặc nhiều checkbox độc lập.

### F06. Văn bản đề nghị hưởng trợ cấp hưu trí xã hội

Chủ đề: Trợ cấp hưu trí xã hội. Trang đã xem: 1. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/tro-cap-huu-tri-xhmau-01.signed.pdf).

- **Thông tin/nhãn:** Biểu mẫu chia người đề nghị và người giám hộ/được ủy quyền; hướng dẫn, cam đoan và chức danh người tiếp nhận là vùng tĩnh.
- **Vùng nhập:** Nhóm lựa chọn yêu cầu, tình trạng hưởng chính sách, nhân thân và phương thức nhận qua tài khoản. Giá trị mức hưởng nằm cạnh lựa chọn tương ứng.
- **Nhiều dòng:** Dòng giá trị phụ hoặc thông tin thay đổi phải gắn nhãn riêng; các dòng lựa chọn lặp nhau là các option, không phải một đoạn trả lời nhiều dòng.
- **Bẫy nhận diện:** Checkbox và chỗ ghi số tiền có quan hệ điều kiện. Không bắt người khai điền mọi nhánh hoặc nhập chữ vào ô chọn.

### F07. Bản khai cá nhân đề nghị chế độ BHYT

Chủ đề: Bảo hiểm y tế theo chế độ người có công. Trang đã xem: 1. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/tk-bhyt-nd142-mau-1a.signed.pdf).

- **Thông tin/nhãn:** Thông tin quá trình tham gia, xác nhận và tài liệu chứng minh được chia thành các nhóm có nhãn dẫn.
- **Vùng nhập:** Nhân thân ngắn kết hợp các dãy dòng chấm dài cho phần trình bày và tài liệu.
- **Nhiều dòng:** Nhiều hàng chấm liên tiếp dưới cùng nhãn, không xuất hiện nhãn mới ở giữa, là dấu hiệu mạnh của một trường mô tả nhiều dòng.
- **Bẫy nhận diện:** Không gom qua nhãn kế tiếp chỉ vì các đường chấm giống nhau; danh sách giấy tờ có thể là một nhóm lặp, cần cán bộ quyết định cấu trúc.

### F08. Đơn cấp đổi/cấp lại bằng Tổ quốc ghi công

Chủ đề: Cấp lại giấy ghi công. Trang đã xem: 1, 2. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/cap-lai-bang-to-quoc-ghi-cong-mau-16.signed.pdf).

- **Thông tin/nhãn:** Thông tin người yêu cầu và người được ghi công là hai nhóm; trang sau có bảng thân nhân và chú giải.
- **Vùng nhập:** Các giá trị nhân thân, thông tin văn bằng, đề nghị và các ô trong bảng thân nhân.
- **Nhiều dòng:** Thông tin quyết định có thể xuống dòng mà vẫn cùng giá trị. Trong bảng, xuống dòng trong một ô khác với chuyển sang hàng thân nhân tiếp theo.
- **Bẫy nhận diện:** Không nhận các số chú thích là chỉ tiêu mới; không gộp toàn bảng thân nhân thành một trường. Phần ký/xác nhận có actor riêng.

### F09. Đơn di chuyển hồ sơ thờ cúng liệt sỹ

Chủ đề: Di chuyển hồ sơ thờ cúng. Trang đã xem: 1. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/don-di-chuyen-tho-cung-mau-27.signed.pdf).

- **Thông tin/nhãn:** Phần đầu là thông tin người đề nghị; tên thủ tục và chữ ký là vùng cấu trúc. Nhãn liên quan hồ sơ/chế độ ở phần giữa xác định ngữ cảnh.
- **Vùng nhập:** Giá trị nhân thân và nội dung yêu cầu di chuyển nằm sau nhãn hoặc trong câu dẫn.
- **Nhiều dòng:** Thông tin giấy tờ hoặc nội dung yêu cầu có thể quấn sang dòng dưới; chỉ nối khi không có nhãn mới và vẫn cùng phạm vi ngữ nghĩa.
- **Bẫy nhận diện:** Không tự xem đoạn điền sẵn là lời hướng dẫn tĩnh; cũng không lấy mọi đoạn cuối đơn làm trường mô tả. Thiếu phôi trống cần review vùng viết.

### F10. Tờ khai đề nghị hỗ trợ chi phí mai táng

Chủ đề: Hỗ trợ mai táng. Trang đã xem: 1, 2. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/mai-tang-phi-huu-tri-xh.signed.pdf).

- **Thông tin/nhãn:** Phân biệt người khai, người đã mất và người/tổ chức lo mai táng; các tiêu đề đánh số là ranh giới nhóm.
- **Vùng nhập:** Thông tin nhân thân, tổ chức hoặc cá nhân, phương thức nhận và thông tin tài khoản có nhánh điều kiện.
- **Nhiều dòng:** Nhóm nhân thân của người tổ chức tiếp tục ở trang hai, nhưng các nhãn họ tên/ngày sinh/địa chỉ vẫn là những trường riêng.
- **Bẫy nhận diện:** Giữ ID nhóm qua trang; không gộp cả nhóm thành một giá trị. Chọn tiền mặt không buộc nhập các trường tài khoản.

### F11. Đơn đăng ký đất đai, tài sản gắn liền với đất

Chủ đề: Đăng ký đất đai. Trang đã xem: 1, 2. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/mau-so-15-cap-moi.signed.pdf).

- **Thông tin/nhãn:** Nhóm người sử dụng đất, thửa đất, nhà/công trình và yêu cầu; các đoạn hướng dẫn in nghiêng là thông tin tĩnh.
- **Vùng nhập:** Có nhãn con, giá trị số kèm đơn vị, checkbox đề nghị, mô tả và các mục giấy tờ kèm theo.
- **Nhiều dòng:** Giá trị lịch sử hình thành đất được trình bày thành đoạn nhiều dòng. Nhãn con tiếp theo kết thúc đoạn; phần nhà ở tiếp trang không có nghĩa mọi trường cùng một ID.
- **Bẫy nhận diện:** Dãy giấy tờ có số mục là danh sách, không mặc định một trường nhiều dòng. Không lấy hướng dẫn dài làm vùng nhập.

### F12. Đơn đề nghị cấp giấy phép xây dựng

Chủ đề: Cấp phép xây dựng. Trang đã xem: 1, 2, 3, 4. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/don-xin-cap-giay-phep-xay-dung-theo-nghi-dinh-175-2025.signed.pdf).

- **Thông tin/nhãn:** Biểu mẫu dài, có các nhánh theo loại công trình. Chú thích trong ngoặc và căn cứ hồ sơ là văn bản hướng dẫn.
- **Vùng nhập:** Nhiều giá trị ngắn chung một dòng, đơn vị đo, tên tổ chức và thông tin dự án; chỉ nhánh phù hợp được dùng.
- **Nhiều dòng:** Ở cuối trang ba, nhãn lô đất/diện tích xuất hiện, phần chấm của địa chỉ tiếp ở trang bốn. Cần phân biệt tiếp nối nhãn/trường với mở một trường mới.
- **Bẫy nhận diện:** Không gom các mục loại/cấp/diện tích do gần nhau. Tên file ghi năm không được dùng để tự khẳng định hiệu lực pháp lý của mẫu.

### F13. Tờ khai lệ phí trước bạ nhà, đất

Chủ đề: Lệ phí trước bạ. Trang đã xem: 1, 2. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/tk-01.lptb.signed.pdf).

- **Thông tin/nhãn:** Mã chỉ tiêu, các nhóm tài sản và tiêu đề bảng là neo cấu trúc. Chữ ký đại lý và người nộp có vai trò khác nhau.
- **Vùng nhập:** Trường số, địa chỉ chia nhỏ, checkbox, lý do miễn và bảng người đồng sở hữu.
- **Nhiều dòng:** Phần lý do miễn có một nhãn và nhiều dòng chấm; giữ một field cùng nhiều vùng dòng. Địa chỉ có nhãn đơn vị hành chính mới thì tách subfield.
- **Bẫy nhận diện:** Mỗi hàng đồng sở hữu là bản ghi riêng; bảng không phải một textarea. Không đồng nhất mã chỉ tiêu với số trang/chú thích.

### F14. Tờ khai thuế thu nhập cá nhân bất động sản

Chủ đề: Thuế thu nhập từ bất động sản. Trang đã xem: 1, 2, 3, 4, 5. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/tk-03.bds-tncn.signed.pdf).

- **Thông tin/nhãn:** Mã chỉ tiêu lồng nhau, nhóm bên chuyển/bên nhận và các công thức in sẵn; trang cuối chỉ hướng dẫn.
- **Vùng nhập:** Thông tin chủ thể, tài sản, hợp đồng, giá trị tiền và bảng đồng sở hữu; vùng tính toán cần phân loại riêng.
- **Nhiều dòng:** Mô tả nguồn gốc tài sản có thể quấn dòng dưới một chỉ tiêu. Nhãn và nhóm hợp đồng/chỉ tiêu cũng có thể bị ngắt qua trang.
- **Bẫy nhận diện:** Cột tiêu đề dài không phải giá trị nhiều dòng; không tự yêu cầu nhập công thức hoặc tạo trường từ trang chú giải.

### F15. Đơn đề nghị chuyển mục đích sử dụng đất

Chủ đề: Chuyển mục đích sử dụng đất. Trang đã xem: 1, 2. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/mau-so-01-chuyen-muc-dich.signed.pdf).

- **Thông tin/nhãn:** Hai người đề nghị xuất hiện trong nhóm người sử dụng; nhiều mô tả điều kiện có nhãn dài.
- **Vùng nhập:** Nhân thân, địa chỉ thửa đất, diện tích, mục đích và tài liệu kèm theo.
- **Nhiều dòng:** Một nhãn diễn giải có thể chiếm hai dòng nhưng vùng giá trị chỉ nằm ở cuối. Địa chỉ điền sẵn xuống dòng là trường hợp khác.
- **Bẫy nhận diện:** Không dùng chiều cao cụm chữ để kết luận textarea. Trang hai trắng; không sinh trường hay yêu cầu người dùng chờ đọc ở trang này.

### F16. Giấy đề nghị đăng ký hộ kinh doanh

Chủ đề: Đăng ký hộ kinh doanh. Trang đã xem: 1, 2, 3, 4. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/hs-dang-ky-mau.signed.pdf).

- **Thông tin/nhãn:** Khung nhóm thông tin bổ sung, bảng ngành nghề, bảng thành viên và đoạn cam kết có bản chất khác nhau.
- **Vùng nhập:** Địa chỉ chia thành các thuộc tính, tên kinh doanh, ngành nghề, vốn, phương pháp tính thuế và thành viên gia đình.
- **Nhiều dòng:** Mô tả ngành trong một ô có thể nhiều dòng; các hàng ngành và thành viên là nhóm lặp. Khung địa chỉ chứa nhiều nhãn, không phải một trường duy nhất.
- **Bẫy nhận diện:** Nhãn nhóm ở trang ba nhưng bảng bắt đầu trang bốn là tiếp nối cấu trúc bảng. Không áp dụng một lời hướng dẫn cho toàn container.

### F17. Hợp đồng mua bán, cho tặng xe

Chủ đề: Giao dịch xe. Trang đã xem: 1, 2, 3. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/hd-mua-ban-xe.signed.pdf).

- **Thông tin/nhãn:** Phần các bên và thuộc tính xe có giá trị tùy biến; nhiều điều khoản phía sau là văn bản hợp đồng cố định.
- **Vùng nhập:** Thông tin hai bên, đặc điểm xe, giá/phương thức giao dịch và chữ ký; tính sửa được của điều khoản phải xác nhận với chủ mẫu.
- **Nhiều dòng:** Thông tin giấy tờ và mô tả giao dịch có thể thành đoạn. Không được lấy mọi đoạn nhiều dòng trong hợp đồng làm textarea.
- **Bẫy nhận diện:** Ưu tiên phôi gốc để biết slot nào được điền; mẫu minh họa không cho phép suy ra chắc chắn toàn bộ slot. Trang ba trắng.

### F18. Hợp đồng ủy quyền

Chủ đề: Ủy quyền dân sự. Trang đã xem: 1, 2. [Nguồn PDF](https://trangbom.dongnai.gov.vn/uploads/trangbom/news/2025_09/hd-uy-quyen.signed.pdf).

- **Thông tin/nhãn:** Thông tin bên giao/bên nhận quyền và các điều khoản. Phần nghĩa vụ, giải quyết tranh chấp chủ yếu là văn bản cấu trúc.
- **Vùng nhập:** Nhân thân hai bên, phạm vi/thời hạn/thù lao tùy mẫu và chữ ký; không có hệ thống đường chấm rõ cho toàn bộ phần tùy biến.
- **Nhiều dòng:** Phạm vi ủy quyền thể hiện bằng đoạn nhiều dòng, nhưng bản đã điền không chứng minh cả đoạn là vùng nhập của phôi gốc.
- **Bẫy nhận diện:** Đây là ca cần review: đối chiếu mẫu trống, phân biệt nội dung đã tùy biến với điều khoản cố định; không tự suy luận vùng nhập chỉ từ tiêu đề điều.

### F19. Tờ khai đề nghị cấp hộ chiếu TK01 — bản 2021

Chủ đề: Cấp hộ chiếu. Trang đã xem: 5 trong PDF 11 trang. [Nguồn PDF](https://datafiles.chinhphu.vn/cpp/files/vbpq/2021/07/tt-73.pdf).

- **Thông tin/nhãn:** QR, khung ảnh, tiêu đề, chú giải và phần xác nhận tách khỏi vùng nhân thân.
- **Vùng nhập:** Ô ký tự định danh, checkbox lựa chọn, giá trị văn bản/ngày và địa chỉ.
- **Nhiều dòng:** Địa chỉ có hàng chấm tiếp nối không nhãn; một vùng tên/địa chỉ cơ quan bắt đầu bên phải rồi tiếp trên dòng rộng bên dưới. Một bbox lớn dễ phủ sang trường bên trái.
- **Bẫy nhận diện:** Không đọc chữ vào khung ảnh; không coi từng ô định danh là checkbox. Bản 2021 chỉ dùng nghiên cứu bố cục, không khẳng định còn dùng cho thủ tục hiện tại.

### F20. Tờ khai thay đổi thông tin cư trú CT01 — bản 2023

Chủ đề: Thay đổi thông tin cư trú. Trang đã xem: 1, 2. [Nguồn PDF](https://long-an-admin-api.vts-paht.com//Upload/ThuTucHanhChinhCong/404/file/6387486664649443368238.pdf); [trang công bố của Công an Tây Ninh](https://congan.tayninh.gov.vn/vi/thu-tuc-hanh-chinh/chi-tiet-404).

- **Thông tin/nhãn:** Tiêu đề, dấu cơ quan, tiêu đề bảng và chú giải trang sau là vùng tĩnh.
- **Vùng nhập:** Ô ký tự định danh, các giá trị liên hệ, nội dung yêu cầu, bảng thành viên và các vùng ý kiến/chữ ký.
- **Nhiều dòng:** Mục nội dung yêu cầu gồm hàng đầu có nhãn và hàng chấm tiếp không nhãn: một trường, hai vùng. Bảng thành viên là các bản ghi, không cùng một field.
- **Bẫy nhận diện:** Không sinh câu hỏi từ chú thích trang hai; không nhầm dãy ô số với lựa chọn. Vùng ý kiến phải phân actor trước khi hướng dẫn người kê khai.

## 4. Các đặc điểm phổ biến trong tập khảo sát

Quy ước: tính một mẫu có đặc điểm nếu xuất hiện ít nhất một lần trên các trang đã xem; đếm theo mẫu, không theo số ô. Các trường chưa chắc chắn không tự gán thành trường nhiều dòng.

| Đặc điểm đã mã hóa | Số mẫu | Mã mẫu | Ý nghĩa |
|---|---:|---|---|
| Bảng có vùng giá trị/trả lời | 8/20 | F02, F04, F05, F08, F13, F14, F16, F20 | Cần hiểu hàng, cột, header và chủ thể; không lấy mọi cell làm vùng nhập |
| Có ô vuông lựa chọn, kể cả ở chân trang | 10/20 | F01, F02, F05, F06, F10, F11, F13, F14, F16, F19 | Phân nhóm option và điều kiện; hình vuông không đủ để kết luận |
| Dãy ô ký tự định danh | 2/20 | F19, F20 | Một trường mã, nhiều slot ký tự; khác checkbox |
| Dãy dòng chấm cho giá trị tiếp nối không nhãn mới | 5/20 | F03, F07, F13, F19, F20 | Tín hiệu hình học mạnh cho multiline; vẫn phải kiểm ranh giới ngữ nghĩa |
| Đoạn giá trị điền sẵn quấn dòng | Có ở nhiều mẫu, chưa đếm định lượng | Ví dụ F01, F02, F11, F16 | Blankness không phải tiêu chí nhận diện loại vùng |
| Khung nhóm, chú thích, chữ ký/xác nhận | Xuất hiện lặp lại | Xem mục 3 | Cần lớp vai trò vùng và actor, không chỉ loại contour |

Các tỷ lệ trên chỉ mô tả **20 mẫu đã chọn**, không phải tỷ lệ phổ biến toàn quốc hoặc kết quả kiểm thử model. Cùng một mẫu có thể thuộc nhiều hàng.

### 4.1. “Ô thông tin” cần phân loại rõ

| Loại vùng | Dấu hiệu kết hợp | Cách xử lý |
|---|---|---|
| Nội dung cố định | Quốc hiệu, tên thủ tục, đề mục, đoạn hướng dẫn/cam đoan; vị trí và kiểu chữ ổn định | Không tạo field nhập; có thể dùng làm ngữ cảnh |
| Nhãn trường | Tên thuộc tính, mã chỉ tiêu, dấu hai chấm, nằm trước/bên trên vùng giá trị; có thể quấn dòng | Giữ text và labelRegions, nối với field |
| Vùng nhập text | Khoảng sau nhãn, dòng chấm/gạch, ô giá trị trong bảng hoặc vùng đoạn; có thể đã có chữ | Tạo inputRegion; xác định riêng trạng thái trống/đã có dữ liệu |
| Lựa chọn | Ô vuông kèm option, chỉ dẫn chọn, cùng nhóm câu hỏi/hàng ma trận | Tạo option/choiceGroup, không yêu cầu đọc/viết text vào ô |
| Mã theo ký tự | Dãy cell đồng kích thước, nhãn mã định danh, không có nhãn option cho từng cell | Một field, danh sách characterSlots |
| Nhóm/bảng | Bao nhiều nhãn hoặc nhiều hàng/cột | Container chứa field/repeatingGroup; không tạo một field bao toàn nhóm |
| Chữ ký/xác nhận | Chức danh người ký, hướng dẫn ký/đóng dấu, khoảng trống dưới chức danh | Loại tương tác và actor riêng; không đồng nhất với textarea |
| Ảnh/QR/dấu | Hình ảnh, mô-đun QR, nhãn ảnh, con dấu, chữ ký số sát biên | Không tạo field text; ảnh là thao tác đính/dán ảnh nếu nghiệp vụ cần |
| Giá trị tự tính/điền sẵn | Công thức, đơn vị, dữ liệu nguồn hoặc phần dành cơ quan | Phân biệt nguồn/actor; không tự kết luận người dân phải điền |

**Nội dung đã có chữ có thể là giá trị của vùng nhập, không nhất thiết là thông tin tĩnh.** Ngược lại vùng trắng có thể chỉ là lề, ảnh, khoảng ký hoặc layout spacer, không nhất thiết là ô nhập.

## 5. Nhận diện một trường có nhiều dòng

### 5.1. Dấu hiệu nên kết hợp

Một ứng viên multiline có sức thuyết phục khi thỏa các nhóm bằng chứng:

1. **Sở hữu nhãn:** các dòng cùng trả lời một nhãn; không có nhãn/mã chỉ tiêu mới giữa chúng.
2. **Sở hữu cấu trúc:** cùng chủ thể, section, cột hoặc cell; không băng qua đường chia cột/hàng mang nghĩa bản ghi mới.
3. **Hình học tiếp nối:** dòng sau nằm ngay dưới, có nhịp dòng tương thích và vùng viết chồng theo chiều ngang hợp lý. Dòng đầu có thể ngắn hơn vì nhãn chiếm bên trái; dòng sau có thể bắt đầu từ lề cột.
4. **Ngữ nghĩa:** địa chỉ dài, lý do, mô tả, nguồn gốc hoặc nội dung yêu cầu có khả năng cần diễn giải; ngày/tháng/số tiền và đơn vị đo thường là slot ngắn.
5. **Dấu kết thúc:** nhãn kế tiếp, section mới, actor mới, cạnh cell, chân trang hoặc khoảng cách lớn kết thúc nhóm.
6. **Bằng chứng phản chứng:** checkbox kèm option, số thứ tự bản ghi và nhãn con mới làm giảm khả năng gộp.

Không dùng một dấu hiệu đơn lẻ. Thiếu bằng chứng hoặc có hai cách nhóm hợp lý: **đánh dấu review**, không tự ghép.

### 5.2. Sáu trường hợp phải phân biệt

| Trường hợp | Kết luận | Ví dụ |
|---|---|---|
| Một nhãn + nhiều hàng chấm không nhãn mới | Một field, nhiều inputRegions | Nội dung yêu cầu CT01; địa chỉ TK01 |
| Một ô bảng chứa đoạn quấn nhiều dòng | Một field trong cell đó | Địa chỉ/giấy tờ ở mẫu kết hôn |
| Nhãn dài quấn nhiều dòng + một slot giá trị | Một label nhiều vùng, không mặc định multiline input | Mô tả chỉ tiêu đất; chú thích số đo xây dựng |
| Nhiều nhãn con trong một câu/địa chỉ | Nhiều subfield cùng nhóm | Số nhà, đường, xã/tỉnh; nhiều giá trị trên hàng |
| Nhiều hàng bảng cùng bộ cột | RepeatingGroup, mỗi hàng một bản ghi | Thân nhân, vật liệu, ngành nghề |
| Một đoạn điều khoản dài không chỉ rõ slot | Chưa đủ bằng chứng là field | Mẫu hợp đồng ủy quyền đã điền |

**Một trường nhiều dòng không nhất thiết có một bbox lớn.** Ví dụ nhãn ở nửa phải dòng đầu rồi giá trị tiếp trên dòng rộng: bbox bao chung sẽ phủ cả trường khác. Nên giữ từng vùng dòng/cell và chỉ dùng union bbox để điều hướng tổng quan, không làm vùng nhập chuẩn.

### 5.3. Qua trang khác

- Mỗi region luôn mang pageNumber và hệ tọa độ của đúng trang; không cộng tọa độ trang sau vào chiều cao trang trước.
- Nhãn/nhóm ở cuối trang và vùng giá trị ở đầu trang sau có thể nối nếu nhận diện được cùng nhóm, thứ tự trang và không có section/actor mới.
- Bảng tiếp trang: tái sử dụng định nghĩa cột; vẫn giữ rowId riêng. Bỏ header lặp, số trang, chú giải khi xác định dòng dữ liệu.
- Field text xuyên trang chỉ gộp khi có bằng chứng tiếp nối rõ. Trong tập này có nhóm/bảng/nhãn nối qua trang; **chưa chứng minh có textarea trống xuyên trang**, không suy rộng.
- Trường hợp không chắc chắn phải có thao tác nối/tách trong admin review, kèm trang nguồn.

## 6. Hướng thuật toán đề xuất cho AFL

Đây là **thiết kế đề xuất**, chưa được implement hoặc benchmark trên các mẫu.

### 6.1. Luồng xử lý

```text
Ảnh/PDF theo từng trang → chuẩn hóa ảnh và tọa độ
     ├─ cấu trúc hình học: dòng chấm, đường liền, bảng, cell, checkbox, ảnh/QR
     └─ text detector + OCR: dòng/token, bbox, độ tin cậy, provenance
                    ↓
phân loại vùng: static / label / value / choice / signature / container
                    ↓
đồ thị quan hệ: nhãn–giá trị, dòng tiếp nối, hàng/cột, chủ thể, section
                    ↓
fieldGroups + inputRegions + điều kiện + các ca cần review
                    ↓
admin sửa/duyệt → manifest đã xác nhận → sinh hướng dẫn
                    ↓
workflow giữ fieldId/regionId/pageNumber → FE highlight nhiều vùng
```

### 6.2. Tách hình học và ngữ nghĩa

- Dùng morphology theo hướng để lấy đường ngang/dọc và giao điểm, suy bảng/cell; giữ mask đường kẻ riêng với mask chữ. Đường chấm cần detector chuỗi thành phần nhỏ cùng baseline, không chỉ kernel đường liền.
- Không dilation toàn trang để tạo một ô lớn: chữ in, dòng chấm và chữ viết tay có thể bị nối cùng nhau.
- Phát hiện QR/ảnh và khung nhóm trước khi xếp loại vùng nhập; không dùng kích thước hình vuông làm quyết định cuối.
- Đọc nhãn và giá trị ở các crop khác nhau; kết quả OCR cần giữ bbox nguồn. Không dùng độ dài chuỗi OCR để suy vùng nhập.
- Xác định trống/không trống trên tín hiệu mực sau khi phân biệt nét khung, chấm, nhãn và nhiễu. Kiểm tra “ảnh hoàn toàn phẳng” không đủ cho ô trắng có viền.
- Có thể làm bản ảnh phụ giảm đường kẻ để OCR; giữ bản gốc và transform, tránh xóa nét chữ viết tay giao đường kẻ. Nếu model sinh chữ nhưng không có bằng chứng mực chữ tương ứng: bỏ giá trị đoán hoặc yêu cầu review, không điền nhãn giả.

Morphology là công cụ tìm nét hình học, không tự hiểu vai trò trường. [Tài liệu OpenCV về trích đường ngang/dọc](https://docs.opencv.org/4.12.0/dd/dd7/tutorial_morph_lines_detection.html).

### 6.3. Gom dòng bằng đồ thị có ràng buộc

Node gồm dòng OCR, nhãn, vùng viết, cell, choice, section và actor. Edge biểu diễn belongsTo, valueOf, continues, nextRow và optionOf.

Một cách chấm điểm ban đầu:

```text
score(continues) =
  bằng chứng cùng nhãn/chủ thể
  + tương thích cột hoặc cell
  + nhịp dòng và độ chồng ngang
  + phù hợp ngữ nghĩa trường
  - nhãn/chỉ tiêu mới
  - chuyển section/actor
  - đường biên cột/bản ghi
  - cạnh tranh với một field khác
```

- Chuẩn hóa khoảng cách theo chiều cao chữ/nhịp dòng trong cột, không cố định pixel hay chỉ theo % chiều cao toàn trang.
- Nhãn có thể quấn dòng; gom nhãn trước, rồi mới liên kết vùng giá trị.
- Ràng buộc cứng: không gộp xuyên cột/chủ thể/bản ghi; riêng bảng có cell span phải được xác định rõ.
- Hai cách gán gần điểm nhau: lưu ứng viên và lý do, bắt review. Không luôn chọn nhãn gần nhất.
- Các ngưỡng phải hiệu chỉnh từ ground truth; báo cáo không đề xuất con số “chuẩn” khi chưa đo.

Nếu heuristics không đủ, có thể nghiên cứu model dùng đồng thời text, ảnh và layout. LayoutLMv3 là một ví dụ kiến trúc đa phương thức; DocLayNet gợi ý cách chú giải lớp bố cục. Hai nguồn này **không chứng minh sẵn hiệu quả với biểu mẫu Việt Nam hoặc khả năng gom field của dự án**. [LayoutLMv3](https://arxiv.org/abs/2204.08387), [DocLayNet](https://arxiv.org/abs/2206.01062).

## 7. Kiểu dữ liệu cần hướng tới

Ví dụ sau **là dữ liệu minh họa tự tạo**, không phải tọa độ đo từ một mẫu khảo sát; không phải API hiện đã hỗ trợ.

```json
{
  "schemaVersion": 2,
  "formCode": "DEMO-MULTILINE",
  "coordinateSystem": "normalized-yxyx",
  "pages": [
    { "pageNumber": 1, "width": 1200, "height": 1700, "frame": "processed-primary" }
  ],
  "fields": [
    {
      "fieldId": "field_reason",
      "label": "Lý do đề nghị",
      "actor": "citizen",
      "inputType": "multiline_text",
      "valueState": "blank",
      "labelRegions": [
        { "pageNumber": 1, "bbox": [0.25, 0.08, 0.28, 0.27] }
      ],
      "inputRegions": [
        { "regionId": "reason_line_1", "pageNumber": 1, "lineIndex": 0, "bbox": [0.25, 0.28, 0.28, 0.91] },
        { "regionId": "reason_line_2", "pageNumber": 1, "lineIndex": 1, "bbox": [0.29, 0.08, 0.32, 0.91] }
      ],
      "reviewStatus": "required",
      "sourceBlockIds": ["block_reason_label"]
    }
  ]
}
```

Cần thêm khi triển khai thật: groupId/parentFieldId, rowId/columnId cho bảng, characterSlots, options và selectionMode cho lựa chọn, điều kiện hiển thị, provenance/hình học cho cả vùng không có chữ. Không áp cùng một kiểu “text” cho mọi trường.

Không thay đổi schema dữ liệu trong lượt này; migration và tương thích phiên bản phải được Tech Lead chốt.

## 8. Khoảng thiếu trong code hiện tại và khớp OCR–Voice–FE

Đối chiếu working tree ngày khảo sát:

| Thành phần | Hiện trạng đã đọc | Hướng cần sửa |
|---|---|---|
| Manifest assembler | Chỉ nhận OCR cùng ảnh chuẩn một trang; bỏ container/phrase_cluster; gán nhãn theo khoảng cách | Giữ pageNumber, nhóm nhãn, quan hệ bảng/actor và multi-region |
| Gán nhãn trùng | Một nhãn ghép nhiều candidate bị xóa text, chờ sửa | Phân biệt ghép nhầm với nhiều dòng hợp lệ của cùng field |
| Manifest | Mỗi box có một normalizedCoords | Tách logical field khỏi inputRegions; version hóa hợp đồng |
| Sinh Voice workflow | Lấy tọa độ từ matchingBox; pageNumber đang được đặt 1 | Server đối soát field/region/page, không để AI đoán tọa độ; chọn lời đọc theo inputType |
| Citizen VisualTwin | Chọn trang bằng currentPageNumber nhưng nhận một highlightCoords | Hỗ trợ danh sách vùng trên trang, đọc một field một lần; không đọc lại mỗi dòng |
| Admin review | Nối thủ công nhãn–ô chưa thể biểu đạt đủ grouping đa dòng | Cần nối/tách field, sửa actor, bảng/option, trường bắt buộc và quan hệ điều kiện |

Mã đối chiếu: `D:/Users/BT/N3_K1/AFL/AFL-Platform/src/modules/forms/services/form-manifest-assembler.ts:17`, `D:/Users/BT/N3_K1/AFL/AFL-Platform/src/shared/contracts.ts:59`, `D:/Users/BT/N3_K1/AFL/AFL-Platform/src/modules/voice-ai/services/gemini-prompt.service.ts:153`, `D:/Users/BT/N3_K1/AFL/AFL-Platform/src/components/citizen/VisualTwin.tsx:25`. Bảng này phản ánh mã local hiện tại, không khẳng định nội dung đã merge/push.

Một field nhiều dòng nên tạo **một đơn vị hướng dẫn ngữ nghĩa**; bước có thể highlight nhiều region hoặc chuyển trang theo thứ tự. Dãy ô định danh cũng là một field, nhưng hướng dẫn nhập từng ký tự; checkbox là thao tác chọn. Không sinh một lời đọc giống nhau cho từng contour.

## 9. Bộ ca kiểm thử cần xây dựng

Đây là **đề xuất test**, chưa chạy trên sản phẩm. Danh sách kiểm chứng nghiên cứu đã thực hiện nằm ở mục 10.

| Ca | Mẫu tham chiếu | Kết quả mong đợi |
|---|---|---|
| Hai chủ thể chung một hàng bảng | F02 | Hai field riêng, đúng cột; nhãn cột đầu không thành input |
| Giá trị hai dòng trong một cell | F02 | Một field, không hai bước đọc |
| Một nhãn + hai dòng chấm | F19, F20 | Một field có hai region; không gộp sang nhãn kế |
| Field bắt đầu bên phải, tiếp dòng rộng bên dưới | F19 | Không highlight phần nghề nghiệp nằm bên trái |
| Nhãn dài nhưng giá trị một slot | F15 | Label đa dòng; không tự sinh textarea |
| Lý do/hiện trạng không có khung đóng | F03, F04 | Gom theo neo và ranh giới mục, không bỏ chỉ vì thiếu contour |
| Nhiều hàng bảng lặp | F04, F08, F16 | Giữ rowId và field riêng, không gộp toàn bảng |
| Ma trận lựa chọn có nhãn dài | F05 | Gán ô trả lời theo hàng/cột; không nhận nhãn là giá trị |
| Dãy ô mã so với checkbox | F19, F20 | Một field mã với characterSlots; option chỉ tại nhóm lựa chọn |
| Nhóm/nhãn/bảng nối qua trang | F10, F12, F14, F16 | Page ID đúng, không mất nhãn; không mặc định một textarea xuyên trang |
| Phôi có trang trắng/chú giải | F01, F14, F15, F17, F20 | Không có field/voice step giả |
| QR, ảnh, dấu, chữ ký số | F19, F20 và bộ mẫu địa phương | Không thành text input |
| Ô trắng có viền/chấm | Phôi trống tự tạo dựa bố cục | OCR không phát sinh giá trị dù có nét khung |
| Nhãn lặp của nhiều người | F01, F10, F18 | Gắn đúng actor; không lẫn ngữ cảnh Q&A |
| Chọn nhánh có điều kiện | F06, F10, F12, F16 | Chỉ hướng dẫn phần phù hợp, review điều kiện chưa xác định |
| Nhiều đoạn hợp đồng | F17, F18 | Không tự lấy toàn điều khoản làm input |
| Resize/nắn phối cảnh | Bản biến đổi có transform đã biết | Regions vẫn khớp ảnh FE; thứ tự XYXY/YXYX được đối soát |

### 9.1. Cách đo khi thực hiện

- Hai người chú giải độc lập: loại vùng, nhãn, inputRegions, grouping, actor, bảng/option và thứ tự đọc; đối soát bất đồng.
- Tạo phôi trống/giá trị tổng hợp để tránh dùng dữ liệu nhân thân trên bản mẫu công khai cho cloud hoặc tập huấn luyện.
- Chia tập theo **biểu mẫu/nhà phát hành**, không chia ngẫu nhiên các trang của cùng form. Bổ sung nguồn ngoài bộ địa phương để giảm leakage bố cục.
- Đo detection precision/recall, IoU hoặc sai lệch biên; đối sánh từng region, không chỉ union bbox.
- Đo đúng quan hệ label–field, pairwise grouping F1, số over-merge/under-split, loại input và actor. CER/WER OCR không thay thế độ đúng field.
- Đo blank hallucination, false field từ header/QR/ảnh, sai trang và số field bị đọc lặp trên FE.
- Mục tiêu demo: không có lỗi nghiêm trọng trong các ca bắt buộc; mọi vùng mơ hồ chặn tự duyệt. Ngưỡng chấp nhận định lượng cần chốt sau baseline, không đặt tỷ lệ đạt giả.

## 10. Kiểm chứng nghiên cứu đã hoàn thành

- Đủ 20 URL PDF khác nhau và 20 chủ đề được định danh.
- Đã xem 44 trang render, không chỉ đọc search snippet.
- Mỗi mẫu có phân tích vùng tĩnh/nhãn, vùng nhập, trường nhiều dòng và bẫy riêng.
- Catalogue có 20 SHA-256 khác nhau, trang liên quan và trang không chứa field; thống kê feature được tính lại từ catalogue.
- Đã chạy validator local: PASS cho số lượng/URL/chủ đề/hash, số trang PDF, 44 ảnh render, 20 mục phân tích và tổng feature. Test âm phát hiện URL trùng, trang không tồn tại và tổng feature sai đều PASS. Đây là test bằng chứng nghiên cứu, không phải test thuật toán hay nghiệm thu sản phẩm.
- Không sửa code sản phẩm, báo cáo cũ, schema hoặc dữ liệu thật; không chạy cloud OCR/LLM.
- Nguồn tải và render dùng làm bằng chứng local ở `private-documents/form-research-20/`, đã được gitignore. Catalogue/báo cáo không nhúng ảnh hay text chứa giá trị nhân thân.
- Không coi các file tải/render là fixture đã được ẩn danh. Nếu chuyển cho nhóm hoặc đưa vào Git/cloud, phải làm sạch dữ liệu và kiểm quyền sử dụng trước.

## 11. Ưu tiên triển khai và phân công

| Chặng | Người chính | Đầu ra | Điều kiện hoàn thành |
|---|---|---|---|
| 1. Chuẩn bị tập chuẩn | OCR + QA | Phôi đã làm sạch, annotation field/region/actor, bộ test từ mục 9 | Có đối soát độc lập; không chứa dữ liệu người thật |
| 2. Tách loại vùng | OCR/OpenCV | Table/cell, dòng chấm, choice, digit slots, static/label/input | Có baseline và test âm cho header, QR, khung nhóm |
| 3. Gom trường nhiều dòng/đa trang | OCR + Tech Lead | Field graph, multi-region, provenance, schema v2 và compatibility | Không over-merge bảng/chủ thể; page/coordinate nhất quán |
| 4. Review và tích hợp | FE admin + backend | Nối/tách field, điều kiện/actor, xác nhận manifest | Mọi ambiguity hiện rõ và không được tự publish |
| 5. Voice/citizen | Vai trò Voice AI & QA của bạn + FE citizen | Workflow theo field; một lời đọc, nhiều highlight; Q&A đúng field | Không đọc lặp theo dòng, không hướng dẫn vùng cơ quan |
| 6. Benchmark/demo | QA + cả nhóm | Báo cáo số đo và log ca E2E | Chạy trên mẫu giữ lại, không nhầm hợp đồng fixture với nghiệm thu |

**Khuyến nghị:** trước hết thêm khái niệm field–region và ranh giới nhóm vào hợp đồng dữ liệu, đồng thời tạo ground truth. Chỉ tăng kernel morphology hoặc thêm từ khóa sẽ không giải quyết được nhãn quấn dòng, bảng nhiều chủ thể và một field gồm nhiều vùng.
