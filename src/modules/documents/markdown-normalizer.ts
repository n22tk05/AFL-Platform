import type { OcrLine } from '@/shared/document-extraction.types';

/**
 * Escape OCR as literal content; never interpret source HTML, script, or Markdown links.
 */
export function escapeOcrText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]|#~+=-]/g, '\\$&');
}

/**
 * Escapes characters for value portions, preserving formatted markdown tags.
 */
function escapeValuePortion(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*[\]|#~]/g, '\\$&');
}

// Regex nhận diện Quốc hiệu & Tiêu ngữ Việt Nam
const NATIONAL_HEADER_REGEX = /^(?:CỘNG H[OÒ]A XÃ HỘI CHỦ NGHĨA VIỆT NAM)(?:\s*[-–—_]*\s*)?$/i;
const NATIONAL_MOTTO_REGEX = /^(?:Độc lập\s*[-–—]\s*Tự do\s*[-–—]\s*Hạnh phúc)(?:\s*[-–—_]*\s*)?$/i;

// Regex nhận diện tiêu đề văn bản hành chính chính thức (cỡ lớn, in hoa)
const DOCUMENT_MAIN_TITLE_REGEX = /^(?:CỘNG H[OÒ]A XÃ HỘI CHỦ NGHĨA VIỆT NAM|THÔNG BÁO|BIÊN BẢN|QUYẾT ĐỊNH|TỜ KHAI|ĐƠN ĐỀ NGHỊ|ĐƠN XIN|ĐƠN YÊU CẦU|GIẤY CHỨNG NHẬN|GIẤY XÁC NHẬN|GIẤY PHÉP|GIẤY|HỢP ĐỒNG|BÁO CÁO|BẢN CAM KẾT|BẢN KHAI|TRÍCH LỤC|PHIẾU LẤY Ý KIẾN)(?:\s|$)/;

// Regex nhận diện các mục La Mã hoặc phần lớn (Level 2 Heading)
const SECTION_ROMAN_REGEX = /^(?:PHẦN\s+[IVXLCDM]+|[IVXLCDM]+\.)\s+(.+)$/i;
const SECTION_LETTER_REGEX = /^[A-Z]\.\s+([A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ\s\d,._-]+)$/;
const SECTION_NUMBER_TITLE_REGEX = /^(?:Mục\s+\d+|\d+\.)\s+([A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ\s,._-]+:?)$/;

// Regex nhận diện dòng địa danh & ngày tháng năm
const DATE_LOCATION_REGEX = /^(?:(?:[A-ZÀ-Ỹa-ỹ\s]+,\s*)?ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}|ngày\s+\.{2,}\s+tháng\s+\.{2,}\s+năm\s+\.{2,})$/i;

// Regex nhận diện trường thông tin (Field label: value)
const FIELD_LABEL_REGEX = /^((?:(?:\d+|[a-z])\.\s*)?(?:Họ(?:\s+và)?\s+tên|Mã\s+số\s+thuế|Số\s+(?:CCCD|CMND|định\s+danh|điện\s+thoại|tiền|hóa\s+đơn|chứng\s+từ|xe|khung|máy|biên\s+bản|hồ\s+sơ)|Ngày\s+(?:sinh|cấp|hết\s+hạn|vi\s+phạm|lập)|Nơi\s+(?:sinh|cấp|đăng\s+ký|thường\s+trú|ở\s+hiện\s+tại|cư\s+trú)|Địa\s+chỉ|Giới\s+tính|Quốc\s+tịch|Dân\s+tộc|Tôn\s+giáo|Nghề\s+nghiệp|Cơ\s+quan|Chức\s+vụ|Biển\s+kiểm\s+soát|Hành\s+vi\s+vi\s+phạm|Hình\s+thức\s+xử\s+phạt|Biện\s+pháp|Lý\s+do|Nội\s+dung|Kính\s+gửi))\s*:\s*(.*)$/i;

// Regex nhận diện chức danh ký tên
const SIGNATURE_TITLE_REGEX = /^(?:NGƯỜI\s+(?:KÊ\s+KHAI|NỘP\s+THUẾ|LẬP\s+BIỂU|LÀM\s+ĐƠN|VI\s+PHẠM|CHỨNG\s+KIẾN)|CÁN\s+BỘ\s+TIẾP\s+NHẬN|CƠ\s+QUAN\s+THUẾ|THỦ\s+TRƯỞNG\s+CƠ\s+QUAN|TRƯỞNG\s+CÔNG\s+AN[A-ZÀ-Ỹ\s]*|CHỦ\s+TỊCH\s+UBND[A-ZÀ-Ỹ\s]*|NGƯỜI\s+CÓ\s+THẨM\s+QUYỀN)$/i;
const SIGNATURE_SUBTITLE_REGEX = /^\((?:Ký(?:[,\s]+ghi\s+rõ\s+họ\s+tên)?(?:[,\s]+(?:và\s+)?đóng\s+dấu)?|Ký[,\s]+đóng\s+dấu)\)$/i;

/**
 * Chuẩn hóa các ô tích (checkboxes) trong văn bản.
 */
function normalizeCheckboxes(text: string): string {
  return text
    .replace(/\[\s*\]/g, '☐')
    .replace(/\[[xX]\]/g, '☑');
}

/**
 * Chuẩn hóa một dòng văn bản đơn lẻ theo các quy tắc biểu mẫu hành chính Việt Nam.
 */
function normalizeSingleLine(line: string, _ocrLine?: OcrLine): string {
  const trimmed = line.trim();
  if (!trimmed) return line;

  // 1. Quốc hiệu Việt Nam
  if (NATIONAL_HEADER_REGEX.test(trimmed)) {
    return `\n# ${trimmed}\n`;
  }

  // 2. Tiêu ngữ Việt Nam
  if (NATIONAL_MOTTO_REGEX.test(trimmed)) {
    return `## ${trimmed}\n---`;
  }

  // 3. Tiêu đề văn bản chính (Cỡ lớn, in hoa)
  const isTitle = trimmed.length <= 160 &&
    trimmed === trimmed.toLocaleUpperCase('vi') &&
    DOCUMENT_MAIN_TITLE_REGEX.test(trimmed);

  if (isTitle) {
    return `\n# ${escapeOcrText(line)}\n`;
  }

  // 4. Phụ đề tiêu đề (thường nằm trong ngoặc ngay sau tiêu đề, ví dụ: (Dùng cho tài sản...))
  if (/^\([A-ZÀ-Ỹa-ỹ0-9\s,._/-]+\)$/.test(trimmed) && trimmed.length <= 120) {
    return `*${escapeValuePortion(trimmed)}*  `;
  }

  // 5. Mục La Mã: I. THÔNG TIN..., II. ...
  const romanMatch = SECTION_ROMAN_REGEX.exec(trimmed);
  if (romanMatch && trimmed.length <= 120) {
    const rawRoman = trimmed.split('.')[0] + '.';
    const titleText = trimmed.slice(rawRoman.length).trim();
    return `\n## ${escapeOcrText(rawRoman)} ${escapeOcrText(titleText)}\n`;
  }

  // 6. Mục chữ cái in hoa: A. THÔNG TIN...
  const letterMatch = SECTION_LETTER_REGEX.exec(trimmed);
  if (letterMatch && trimmed.length <= 100) {
    return `\n## ${escapeOcrText(trimmed)}\n`;
  }

  // 7. Tiêu đề mục số in hoa: 1. THÔNG TIN CHUNG...
  const numberTitleMatch = SECTION_NUMBER_TITLE_REGEX.exec(trimmed);
  if (numberTitleMatch && trimmed.length <= 100 && trimmed === trimmed.toLocaleUpperCase('vi')) {
    return `\n### ${escapeOcrText(trimmed)}\n`;
  }

  // 8. Kính gửi: ...
  if (/^Kính\s+gửi\s*:/i.test(trimmed)) {
    const colonIdx = trimmed.indexOf(':');
    const label = trimmed.slice(0, colonIdx + 1);
    const val = trimmed.slice(colonIdx + 1).trim();
    return `**${escapeOcrText(label)}** ${escapeValuePortion(val)}  `;
  }

  // 9. Cặp trường dữ liệu thông dụng (Label: Value)
  const fieldMatch = FIELD_LABEL_REGEX.exec(trimmed);
  if (fieldMatch) {
    const label = fieldMatch[1];
    const rawVal = fieldMatch[2];
    const valWithBox = normalizeCheckboxes(rawVal);
    return `**${escapeOcrText(label)}:** ${escapeValuePortion(valWithBox)}  `;
  }

  // 10. Dòng ngày tháng năm (in nghiêng trang trọng)
  if (DATE_LOCATION_REGEX.test(trimmed)) {
    return `*${escapeValuePortion(trimmed)}*  `;
  }

  // 11. Chức danh ký tên
  if (SIGNATURE_TITLE_REGEX.test(trimmed)) {
    return `\n**${escapeOcrText(trimmed)}**  `;
  }
  if (SIGNATURE_SUBTITLE_REGEX.test(trimmed)) {
    return `*${escapeValuePortion(trimmed)}*  `;
  }

  // 12. Dòng ô tích độc lập (Checkbox list item)
  if (/^(?:\[\s*\]|\[[xX]\]|☐|☑)\s+/.test(trimmed)) {
    const normalized = normalizeCheckboxes(trimmed);
    return `${escapeValuePortion(normalized)}  `;
  }

  // 13. Bullet point danh sách
  const bullet = /^( {0,3}[-+*] )(.+)$/.exec(line);
  if (bullet) {
    return `${bullet[1]}${escapeOcrText(bullet[2])}  `;
  }

  // 14. Dòng thông thường: bảo toàn nguyên vẹn số hiệu, dấu cách thụt đầu dòng, ký tự đặc biệt
  const normalizedLine = normalizeCheckboxes(line);
  return escapeOcrText(normalizedLine)
    .replace(/^( {0,3})([#=~+-])/, '$1\\$2')
    .replace(/^( {0,3}\d+)([.)])(?=\s)/, '$1\\$2')
    .replace(/^[ \t]+/, whitespace => whitespace.replace(/ /g, '&#32;').replace(/\t/g, '&#9;')) + '  ';
}

/**
 * Xử lý ghép các cặp khối ký tên song song (2 bên: Người lập vs Thủ trưởng)
 * thành bảng Markdown 2 cột cân đối.
 */
function pairSignatureBlocks(lines: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const curr = lines[i].trim();
    const next = i + 1 < lines.length ? lines[i + 1].trim() : '';

    if (SIGNATURE_TITLE_REGEX.test(curr) && i + 2 < lines.length) {
      const sub1 = next;
      const title2 = lines[i + 2].trim();
      const sub2 = i + 3 < lines.length ? lines[i + 3].trim() : '';

      if (SIGNATURE_SUBTITLE_REGEX.test(sub1) && SIGNATURE_TITLE_REGEX.test(title2) && SIGNATURE_SUBTITLE_REGEX.test(sub2)) {
        // Tạo bảng 2 cột cân xứng cho chữ ký
        result.push(
          `| **${escapeOcrText(curr)}** | **${escapeOcrText(title2)}** |`,
          `| :---: | :---: |`,
          `| *${escapeValuePortion(sub1)}* | *${escapeValuePortion(sub2)}* |`
        );
        i += 4;
        continue;
      }
    }

    result.push(lines[i]);
    i++;
  }

  return result;
}

/**
 * Chuẩn hóa toàn bộ văn bản OCR sang Markdown định dạng biểu mẫu hành chính.
 */
export function normalizeOcrTextToMarkdown(
  text: string,
  ocrLines?: OcrLine[]
): string {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');

  // Bước 1: Xử lý ghép các khối chữ ký nếu có cấu trúc liên tiếp
  const preprocessedLines = pairSignatureBlocks(rawLines);

  // Bước 2: Chuẩn hóa từng dòng theo cú pháp hành chính
  const processed = preprocessedLines.map((line, idx) => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      return trimmedLine;
    }
    const matchingOcrLine = ocrLines && ocrLines.length > idx ? ocrLines[idx] : undefined;
    return normalizeSingleLine(line, matchingOcrLine);
  });

  return processed.join('\n');
}
