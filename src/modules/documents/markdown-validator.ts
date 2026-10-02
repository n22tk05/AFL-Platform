import { DOCUMENT_LIMITS } from './config';
import { MARKDOWN_LIMITS, type MarkdownIssue, type MarkdownValidation } from './markdown.types';

/** Conservative lint, not a text rewriter or a claim about OCR accuracy. */
export function validateMarkdown(source: string): MarkdownValidation {
  // Keep significant whitespace, Vietnamese diacritics, math, and all source words.
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const markdown = normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  const issues: MarkdownIssue[] = [];
  let hasErrors = false;
  const add = (code: string, severity: MarkdownIssue['severity'], message: string, line?: number) => {
    if (severity === 'error') hasErrors = true;
    if (issues.length < 100) issues.push({ code, severity, message, ...(line ? { line } : {}) });
  };
  const text = markdown.replace(/data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+/g, 'embedded-image');
  const lines = text.split('\n');
  if (!text.trim()) add('EMPTY_MARKDOWN', 'error', 'Chưa có nội dung để xuất.');
  if (markdown.length > MARKDOWN_LIMITS.markdownCharacters || lines.length > DOCUMENT_LIMITS.ocrLines * 3) {
    return { markdown, valid: false, issues: [{ code: 'MARKDOWN_TOO_LARGE', severity: 'error', message: 'Nội dung vượt giới hạn của một trang. Hãy chia nhỏ tài liệu.' }] };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) add('CONTROL_CHARACTERS', 'error', 'Có ký tự điều khiển không hợp lệ. Hãy xóa ký tự này trong bản nháp.');
  if (text.includes('\uFFFD')) add('REPLACEMENT_CHARACTER', 'warning', 'Có ký tự không đọc được (�). Hãy đối chiếu ảnh gốc.');
  let fence: { character: string; length: number; line: number } | null = null;
  let heading = 0;
  const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length, line: i + 1 };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const title = /^ {0,3}(#{1,6})\s+\S/.exec(line);
    if (title) {
      if (heading && title[1].length > heading + 1) add('HEADING_JUMP', 'warning', 'Cấp tiêu đề bị nhảy; kiểm tra lại bố cục.', i + 1);
      heading = title[1].length;
    }
    if (/(?<!\\)<(?:script|iframe|object|embed)\b|(?<!\\)\]\(\s*(?:javascript|vbscript):/i.test(line)) add('ACTIVE_CONTENT', 'error', 'Có mã hoặc liên kết thực thi. Hãy chuyển thành văn bản hoặc khối mã trước khi xuất.', i + 1);
    if (line.includes('|') && cells(line).every(cell => /^\s*:?-{3,}:?\s*$/.test(cell))) {
      const width = cells(line).length;
      if (i === 0 || cells(lines[i - 1]).length !== width) add('TABLE_COLUMNS', 'error', 'Số cột tiêu đề và dòng phân cách của bảng không khớp.', i + 1);
      for (let row = i + 1; row < lines.length && lines[row].trim() && lines[row].includes('|'); row++) {
        if (cells(lines[row]).length !== width) add('TABLE_COLUMNS', 'error', 'Số cột của hàng không khớp bảng; kiểm tra ô bị thiếu hoặc dấu | cần escape.', row + 1);
      }
    }
  }
  if (fence) add('UNCLOSED_FENCE', 'error', 'Khối mã chưa có dấu đóng tương ứng.', fence.line);
  return { markdown, valid: !hasErrors, issues };
}
