import type { ContentType, Evidence } from '@/shared/document-export.types';

export const NATIONAL_HEADER_REGEX = /^CỘNG H[OÒ]A XÃ HỘI CHỦ NGHĨA VIỆT NAM(?:\s*[-–—_]*\s*)?$/iu;
export const NATIONAL_MOTTO_REGEX = /^Độc lập\s*[-–—]\s*Tự do\s*[-–—]\s*Hạnh phúc(?:\s*[-–—_]*\s*)?$/iu;
export const DOCUMENT_MAIN_TITLE_REGEX = /^(?:THÔNG BÁO|BIÊN BẢN|QUYẾT ĐỊNH|TỜ KHAI|ĐƠN ĐỀ NGHỊ|ĐƠN XIN|ĐƠN YÊU CẦU|GIẤY CHỨNG NHẬN|GIẤY XÁC NHẬN|GIẤY PHÉP|HỢP ĐỒNG|BÁO CÁO|BẢN CAM KẾT|BẢN KHAI|TRÍCH LỤC|PHIẾU LẤY Ý KIẾN|PHIẾU ĐĂNG KÝ|PHIẾU TIẾP NHẬN|BẢNG KÊ KHAI)(?:\s|$)/u;
export const SECTION_ROMAN_REGEX = /^(?:PHẦN\s+[IVXLCDM]+|[IVXLCDM]+\.)\s+(.+)$/iu;
export const SECTION_LETTER_REGEX = /^[A-Z]\.\s+(.+)$/u;
export const SECTION_NUMBER_TITLE_REGEX = /^(?:Mục\s+\d+|\d+\.)\s+(.+)$/iu;
export const DATE_LOCATION_REGEX = /^(?:[\p{L}\s]+,\s*)?ngày\s+(?:\d{1,2}|\.{2,})\s+tháng\s+(?:\d{1,2}|\.{2,})\s+năm\s+(?:\d{4}|\.{2,})$/iu;
// The label vocabulary supplies evidence; values are neither parsed nor corrected.
const LABEL = String.raw`(?:(?:\d+|[a-z])\.\s*)?(?:Họ(?:\s+và)?\s+tên(?:\s+người\s+vi\s+phạm)?|Mã\s+số\s+thuế|Số\s+(?:CCCD(?:\s*/\s*Mã\s+định\s+danh)?|CMND|định\s+danh|điện\s+thoại|tiền(?:\s+phạt)?|hóa\s+đơn|chứng\s+từ|xe|khung|máy|biên\s+bản|hồ\s+sơ|quyết\s+định(?:\s+xử\s+phạt)?)|Ngày\s+(?:sinh|cấp|hết\s+hạn|vi\s+phạm|lập(?:\s+biên\s+bản)?)|Nơi\s+(?:sinh|cấp|đăng\s+ký|thường\s+trú|ở\s+hiện\s+tại|cư\s+trú)|Địa\s+chỉ(?:\s+thường\s+trú)?|Giới\s+tính|Quốc\s+tịch|Dân\s+tộc|Tôn\s+giáo|Nghề\s+nghiệp|Cơ\s+quan|Chức\s+vụ|Biển\s+kiểm\s+soát|Hành\s+vi\s+vi\s+phạm|Hình\s+thức\s+xử\s+phạt|Biện\s+pháp|Lý\s+do|Nội\s+dung|Kính\s+gửi|Tình\s+trạng\s+hôn\s+nhân|Mục\s+đích\s+sử\s+dụng|Giấy\s+phép\s+lái\s+xe\s+số|Hạng|Lý\s+do\s+đề\s+nghị|Số\s+định\s+danh\s+cá\s+nhân|Nơi\s+đăng\s+ký\s+thường\s+trú|Nơi\s+ở\s+hiện\s+nay|Nơi\s+tạm\s+trú|Quan\s+hệ|Biển\s+số\s+xe|Hạn\s+nộp\s+phạt|Số\s+tài\s+khoản\s+Kho\s+bạc|Mã\s+hồ\s+sơ|Người\s+nộp\s+thuế|Số\s+tiền\s+phải\s+nộp|Thời\s+hạn\s+nộp|Cơ\s+quan\s+thuế|Đơn\s+vị\s+tiếp\s+nhận|Người\s+tiếp\s+nhận)`;
export const FIELD_LABEL_REGEX = new RegExp(`(${LABEL})\\s*:`, 'giu');
export const SIGNATURE_TITLE_REGEX = /^(?:NGƯỜI\s+(?:KÊ\s+KHAI|NỘP\s+THUẾ|LẬP\s+(?:BIỂU|BIÊN\s+BẢN)|LÀM\s+ĐƠN|VI\s+PHẠM|CHỨNG\s+KIẾN)|CÁN\s+BỘ\s+TIẾP\s+NHẬN|CƠ\s+QUAN\s+THUẾ|THỦ\s+TRƯỞNG\s+CƠ\s+QUAN|TRƯỞNG\s+CÔNG\s+AN[\p{L}\s]*|CHỦ\s+TỊCH\s+UBND[\p{L}\s]*|NGƯỜI\s+CÓ\s+THẨM\s+QUYỀN)$/iu;
export const SIGNATURE_SUBTITLE_REGEX = /^\(Ký(?:[,\s]+ghi\s+rõ\s+họ(?:\s+và)?\s+tên)?(?:[,\s]+(?:và\s+)?đóng\s+dấu)?\)$/iu;
export const CHECKBOX_REGEX = /(?:\[\s*[xX?]?\s*\]|[☐☑☒□])/u;
export const BLANK_INPUT_REGEX = /^(?:\.{2,}|_{2,}|…+)$/u;
export interface Classification { type: ContentType; evidence: Evidence }
const upper = (s: string) => /\p{L}/u.test(s) && s === s.toLocaleUpperCase('vi');

/** Match NFC without changing source. First match wins; confidence is not
 * inferred from regex. No table, footer, emblem or signature identity guesses. */
export function classifyLine(text: string): Classification {
  const t = text.trim().normalize('NFC');
  const rules: [ContentType, string, boolean][] = [
    ['blank_line', 'empty', t.length === 0],
    ['blank_input', 'blank-input', BLANK_INPUT_REGEX.test(t)],
    ['national_heading', 'national-heading', NATIONAL_HEADER_REGEX.test(t)],
    ['motto', 'motto', NATIONAL_MOTTO_REGEX.test(t)],
    ['date_line', 'date-line', DATE_LOCATION_REGEX.test(t)],
    ['checkbox_item', 'checkbox-symbol', CHECKBOX_REGEX.test(t)],
    ['field_label_value', 'known-label-colon', extractFieldPairs(text).length > 0],
    ['signature_title', 'signature-title', SIGNATURE_TITLE_REGEX.test(t)],
    ['field_label', 'known-label-only', new RegExp(`^${LABEL}$`, 'iu').test(t)],
    ['signature_instruction', 'signature-instruction', SIGNATURE_SUBTITLE_REGEX.test(t)],
    ['document_title', 'administrative-title', t.length <= 160 && upper(t) && DOCUMENT_MAIN_TITLE_REGEX.test(t)],
    ['section_heading', 'roman-section', t.length <= 120 && SECTION_ROMAN_REGEX.test(t)],
    ['section_heading', 'letter-section', t.length <= 100 && upper(t) && SECTION_LETTER_REGEX.test(t)],
    ['section_heading', 'number-section', t.length <= 100 && upper(t) && SECTION_NUMBER_TITLE_REGEX.test(t)],
    ['document_code', 'document-code', /^(?:Mẫu\s+số|Số|Ký\s+hiệu)\s*:\s*\S+/iu.test(t)],
    ['bullet_item', 'bullet', /^[-+*]\s+\S/u.test(t)],
    ['legal_reference', 'legal-reference', /^(?:Căn\s+cứ|Theo|Thực\s+hiện)\s+(?:Nghị\s+định|Luật|Thông\s+tư|Quyết\s+định|Điều)/iu.test(t)],
  ];
  const match = rules.find(([, , matched]) => matched);
  return { type: match?.[0] ?? 'unknown', evidence: { method: match ? 'regex' : 'none', rule: match?.[1] ?? null, verified: false } };
}

export function extractFieldPairs(text: string): { label: string; rawValue: string | null; valueState: 'observed' | 'blank' | 'unreadable' }[] {
  // Map composed matches back to original UTF-16 offsets; support mixed NFC/NFD
  // labels without composing or rewriting any source value.
  let composed = '';
  const offsets: number[] = [];
  for (const part of text.matchAll(/(?:\P{M}\p{M}*|\p{M}+)/gu)) {
    const normalized = part[0].normalize('NFC');
    for (let i = 0; i < normalized.length; i++) offsets[composed.length + i] = part.index!;
    composed += normalized; offsets[composed.length] = part.index! + part[0].length;
  }
  const matches = [...composed.matchAll(new RegExp(FIELD_LABEL_REGEX.source, 'giu'))].filter(m => m.index === 0 || /\s/u.test(composed[m.index! - 1]));
  if (!matches.length || composed.slice(0, matches[0].index).trim()) return [];
  return matches.map((m, i) => {
    const raw = text.slice(offsets[m.index! + m[0].length], matches[i + 1] ? offsets[matches[i + 1].index!] : text.length);
    const blank = !raw.trim() || BLANK_INPUT_REGEX.test(raw.trim());
    return { label: text.slice(offsets[m.index!], offsets[m.index! + m[1].length]), rawValue: blank ? null : raw, valueState: blank ? 'blank' : /\uFFFD/u.test(raw) ? 'unreadable' : 'observed' };
  });
}
