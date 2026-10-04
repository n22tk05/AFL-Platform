import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOcrTextToMarkdown } from '../markdown-normalizer';
import { assembleMarkdown } from '../markdown-assembler';
import { validateMarkdown } from '../markdown-validator';
import type { DocumentOcrResult } from '@/shared/document-extraction.types';

const ocr = (fullText: string): DocumentOcrResult => ({
  fullText,
  provider: 'vietocr',
  lines: [],
  tokens: [],
  warnings: [],
  pageCount: 1,
});

test('chuẩn hóa quốc hiệu và tiêu ngữ chuẩn Nghị định 30/2020/NĐ-CP', () => {
  const source = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc';
  const md = assembleMarkdown(ocr(source)).markdown;
  assert.ok(md.includes('# CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'));
  assert.ok(md.includes('## Độc lập - Tự do - Hạnh phúc'));
  assert.ok(md.includes('---'));
  const validation = validateMarkdown(md);
  assert.equal(validation.valid, true);
});

test('chuẩn hóa tiêu đề văn bản hành chính và phụ đề trích yếu', () => {
  const source = 'TỜ KHAI LỆ PHÍ TRƯỚC BẠ\n(Dùng cho tài sản là nhà, đất)';
  const md = assembleMarkdown(ocr(source)).markdown;
  assert.ok(md.includes('# TỜ KHAI LỆ PHÍ TRƯỚC BẠ'));
  assert.ok(md.includes('*(Dùng cho tài sản là nhà, đất)*'));
  const validation = validateMarkdown(md);
  assert.equal(validation.valid, true);
});

test('chuẩn hóa phân cấp mục La Mã và chữ cái in hoa', () => {
  const source = 'I. THÔNG TIN NGƯỜI NỘP THUẾ\nA. PHẦN KÊ KHAI';
  const md = assembleMarkdown(ocr(source)).markdown;
  assert.ok(md.includes('## I. THÔNG TIN NGƯỜI NỘP THUẾ'));
  assert.ok(md.includes('## A. PHẦN KÊ KHAI'));
  const validation = validateMarkdown(md);
  assert.equal(validation.valid, true);
});

test('chuẩn hóa cặp nhãn - giá trị và dòng điền khuyết biểu mẫu', () => {
  const source = [
    'Họ và tên: NGUYỄN VĂN A',
    'Số CCCD: 012345678901',
    'Ngày cấp: 15/06/2021',
    'Nơi cấp: Cục Cảnh sát QLHC về TTXH',
    'Địa chỉ: Số 10 Tràng Thi, Hoàn Kiếm, Hà Nội',
    'Số tiền: 5.000.000 đồng',
    'Nơi thường trú: ............................................',
  ].join('\n');

  const md = assembleMarkdown(ocr(source)).markdown;
  assert.ok(md.includes('**Họ và tên:** NGUYỄN VĂN A'));
  assert.ok(md.includes('**Số CCCD:** 012345678901'));
  assert.ok(md.includes('**Ngày cấp:** 15/06/2021'));
  assert.ok(md.includes('**Nơi cấp:** Cục Cảnh sát QLHC về TTXH'));
  assert.ok(md.includes('**Địa chỉ:** Số 10 Tràng Thi, Hoàn Kiếm, Hà Nội'));
  assert.ok(md.includes('**Số tiền:** 5.000.000 đồng'));
  assert.ok(md.includes('**Nơi thường trú:** ............................................'));

  const validation = validateMarkdown(md);
  assert.equal(validation.valid, true);
});

test('chuẩn hóa dòng kính gửi và ngày tháng địa danh', () => {
  const source = 'Kính gửi: Chi cục Thuế Quận Hai Bà Trưng\nHà Nội, ngày 05 tháng 10 năm 2026';
  const md = assembleMarkdown(ocr(source)).markdown;
  assert.ok(md.includes('**Kính gửi:** Chi cục Thuế Quận Hai Bà Trưng'));
  assert.ok(md.includes('*Hà Nội, ngày 05 tháng 10 năm 2026*'));
  const validation = validateMarkdown(md);
  assert.equal(validation.valid, true);
});

test('ghép khối chữ ký 2 bên thành bảng Markdown 2 cột cân xứng', () => {
  const source = [
    'NGƯỜI KÊ KHAI',
    '(Ký, ghi rõ họ tên)',
    'CÁN BỘ TIẾP NHẬN',
    '(Ký, ghi rõ họ tên và đóng dấu)',
  ].join('\n');

  const md = assembleMarkdown(ocr(source)).markdown;
  assert.ok(md.includes('| **NGƯỜI KÊ KHAI** | **CÁN BỘ TIẾP NHẬN** |'));
  assert.ok(md.includes('| :---: | :---: |'));
  assert.ok(md.includes('| *(Ký, ghi rõ họ tên)* | *(Ký, ghi rõ họ tên và đóng dấu)* |'));

  const validation = validateMarkdown(md);
  assert.equal(validation.valid, true);
});

test('chuẩn hóa các ô tích (checkboxes) trong biểu mẫu', () => {
  const source = [
    'Hình thức: [x] Cá nhân    [ ] Tổ chức',
    '[x] Đất ở tại đô thị',
    '[ ] Đất nông nghiệp',
  ].join('\n');

  const md = assembleMarkdown(ocr(source)).markdown;
  assert.ok(md.includes('☑ Cá nhân'));
  assert.ok(md.includes('☐ Tổ chức'));
  assert.ok(md.includes('☑ Đất ở tại đô thị'));
  assert.ok(md.includes('☐ Đất nông nghiệp'));

  const validation = validateMarkdown(md);
  assert.equal(validation.valid, true);
});

test('toàn bộ văn bản mẫu hoàn chỉnh đạt chuẩn giao diện giống hình ảnh phôi', () => {
  const formFullText = [
    'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
    'Độc lập - Tự do - Hạnh phúc',
    '',
    'TỜ KHAI LỆ PHÍ TRƯỚC BẠ',
    '(Dùng cho tài sản là nhà, đất)',
    '',
    'Kính gửi: Chi cục Thuế Quận Ba Đình',
    '',
    'I. THÔNG TIN NGƯỜI NỘP THUẾ',
    'Họ và tên: NGUYỄN VĂN A',
    'Mã số thuế: 0102030405',
    'Số CCCD: 012345678901',
    'Ngày cấp: 15/06/2021',
    'Địa chỉ: Số 123 phố Kim Mã, Ba Đình, Hà Nội',
    '',
    'II. ĐẶC ĐIỂM TÀI SẢN',
    'Hình thức sở hữu: [x] Riêng    [ ] Chung',
    'Diện tích đất: 100 m2',
    '',
    'Hà Nội, ngày 04 tháng 10 năm 2026',
    'NGƯỜI KÊ KHAI',
    '(Ký, ghi rõ họ tên)',
    'CÁN BỘ TIẾP NHẬN',
    '(Ký, ghi rõ họ tên)',
  ].join('\n');

  const result = assembleMarkdown(ocr(formFullText));
  assert.equal(result.warnings.length, 0);

  const validation = validateMarkdown(result.markdown);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);

  // Đảm bảo không mất mát bất kỳ thông tin cốt lõi nào
  for (const field of ['NGUYỄN VĂN A', '0102030405', '012345678901', '15/06/2021', '100 m2']) {
    assert.ok(result.markdown.includes(field));
  }
});
