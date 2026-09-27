/**
 * Hợp đồng dữ liệu bóc tách văn bản toàn diện (Universal Document Extraction Contracts)
 * Phục vụ phân hệ Thị giác máy tính (OpenCV WASM) kết hợp Gemini Multimodal Vision.
 * Tuân thủ quy định bảo vệ dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.
 */

export type DocumentCategory = 
  | 'identity'        // Thông tin nhân thân (Họ tên, CCCD, ngày sinh, quê quán...)
  | 'legal_event'     // Sự việc pháp lý / Hành vi vi phạm (Lỗi, thời gian, địa điểm vi phạm...)
  | 'financial'       // Thông tin tiền tệ / Tài chính (Số tiền phạt, tiền thuế, số tài khoản kho bạc...)
  | 'property'        // Thông tin tài sản / Đất đai (Thửa đất số, tờ bản đồ, diện tích, biển số xe...)
  | 'administrative'  // Thủ tục / Quy định (Cơ quan thụ lý, cán bộ lập, thời hạn nộp...)
  | 'general';        // Thông tin chung khác

export interface ExtractedField {
  fieldKey: string;           // Mã định danh chuẩn hóa (vd: 'so_bien_ban', 'ho_va_ten', 'so_tien_phat')
  fieldLabel: string;         // Nhãn tiếng Việt hiển thị trên văn bản (vd: 'Họ và tên người vi phạm')
  fieldValue: string;         // Giá trị trích xuất thực tế (giữ nguyên tiếng Việt có dấu)
  category: DocumentCategory; // Phân nhóm nghiệp vụ
  confidence: number;         // Độ tin cậy từ 0.0 đến 1.0 (ví dụ 0.95 = 95%)
  isSensitive: boolean;       // Cờ cảnh báo thông tin cá nhân/tài chính nhạy cảm (PII)
  boundingBox?: [number, number, number, number]; // Tọa độ chuẩn hóa [ymin, xmin, ymax, xmax] trong khoảng [0.0 - 1.0]
}

export interface ExtractedTable {
  tableName?: string;         // Tên bảng (nếu có)
  headers: string[];          // Danh sách tiêu đề cột
  rows: string[][];           // Dữ liệu từng dòng
}

export interface DocumentClassification {
  documentType: string;       // Loại văn bản (vd: "Biên bản vi phạm hành chính", "Tờ khai lệ phí trước bạ")
  documentTitle: string;      // Tiêu đề chính xác trên văn bản
  formCode?: string;          // Số hiệu / Ký hiệu mẫu biểu (vd: "Mẫu số 01/LPTB", "Mẫu 02/BB-VPHC")
  issuingAuthority?: string;  // Cơ quan ban hành / Đơn vị lập văn bản
  issuedDate?: string;        // Ngày lập/ký văn bản (định dạng DD/MM/YYYY hoặc chuỗi gốc)
  documentNumber?: string;    // Số hiệu văn bản / Số biên bản
}

export interface DocumentExtractionResult {
  success: boolean;
  classification: DocumentClassification;
  fields: ExtractedField[];
  tables: ExtractedTable[];
  fullText: string;           // Toàn văn tài liệu dạng Markdown có cấu trúc
  processingTimeMs: number;
  warnings?: string[];
  deskewApplied?: boolean;
}
