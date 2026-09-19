/**
 * HỢP ĐỒNG KẾT NỐI DỮ LIỆU CHUẨN (INTERFACE CONTRACTS) - DỰ ÁN AFL
 * Quy định chuẩn giao tiếp giữa 4 thành viên.
 * QUY TẮC BẤT BIẾN: Bắt buộc dùng Normalized Coordinates [0.0 - 1.0] để không bị lệch màn hình!
 */

/** Tọa độ chuẩn hóa theo tỷ lệ phần trăm từ 0.0 đến 1.0: [ymin, xmin, ymax, xmax] */
export type NormalizedBoundingBox = [number, number, number, number];

// ============================================================================
// 1. ĐẦU RA CỦA NGƯỜI 3 (OpenCV WASM) -> ĐẦU VÀO CỦA NGƯỜI 4 (Gemini Text LLM)
// ============================================================================
export interface FormGeometricBox {
  boxId: string;                     // Mã định danh duy nhất: "box_01", "box_02"...
  normalizedCoords: NormalizedBoundingBox; // [ymin, xmin, ymax, xmax] trong khoảng [0.0 - 1.0]
  rawText: string;                   // Chữ thô bóc tách được từ cụm nhãn bên cạnh ô
  boxType: 'text' | 'checkbox' | 'table_cell'; // Loại ô
  estimatedWidthRatio: number;       // Tỉ lệ chiều rộng ô so với trang giấy (0.0 - 1.0)
}

export interface FormGeometricManifest {
  formId: string;                    // Mã định danh form, ví dụ: "form_01_lptb"
  formTitle: string;                 // Tiêu đề form nhận diện được
  formCode: string;                  // Ký hiệu mẫu: "Mẫu 01/LPTB"
  imageDimensions: {
    width: number;                   // Chiều rộng ảnh gốc (pixel)
    height: number;                  // Chiều cao ảnh gốc (pixel)
  };
  boxes: FormGeometricBox[];         // Danh sách các ô đã được sắp xếp từ TRÊN XUỐNG DƯỚI
}

// ============================================================================
// 2. ĐẦU RA CỦA NGƯỜI 4 (Gemini + TTS) -> ĐẦU VÀO CỦA NGƯỜI 2 (Frontend Mobile/Admin)
// ============================================================================
export interface StepFaqItem {
  question: string;                  // Câu hỏi người già hay thắc mắc tại ô này
  answer: string;                    // Câu trả lời ngắn gọn (2-3 câu)
}

export interface WorkflowStep {
  stepIndex: number;                 // Thứ tự bước: 1, 2, 3...
  boxId: string;                     // Khớp với boxId của OpenCV
  sectionName: string;               // Phân mục hành chính: "Mục I - Thông tin người nộp thuế"
  label: string;                     // Nhãn trường chuẩn: "Họ và tên người nộp thuế"
  voiceGuidance: string;             // Lời thoại bình dân ấm áp đọc cho người già
  audioUrl: string;                  // Đường dẫn file MP3 (tốc độ đọc chậm 0.9x)
  exampleRedText: string;            // Chữ mẫu màu đỏ đậm in hoa rõ nét (WCAG AAA)
  highlightCoords: NormalizedBoundingBox; // Tọa độ để vẽ viền nhấp nháy trên màn hình
  requiresPrerequisiteDoc?: boolean; // Ô này có cần lấy thông tin từ Sổ đỏ/Biên bản phạt không?
  sourceFieldFromPrerequisite?: string; // Tên trường nguồn (ví dụ: "so_do.dien_tich")
  legalWarningFlag?: boolean;        // Cờ cảnh báo ô nhạy cảm tài chính/pháp lý cần cán bộ đối soát kỹ (FR-8)
  faqs: StepFaqItem[];               // Nút bấm gợi ý câu hỏi khi quầy tiếp dân bị ồn (Fallback)
}

export interface FormWorkflow {
  formId: string;
  formTitle: string;
  formCode: string;
  status: 'draft' | 'pending_review' | 'active' | 'archived';
  steps: WorkflowStep[];
}
