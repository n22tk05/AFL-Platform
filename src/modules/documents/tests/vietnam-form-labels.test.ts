import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLine, extractFieldPairs } from '../json-content-classifier';

test('Vietnamese form labels retain longest names, indicator codes and original decomposed values', () => {
  const text = '[08] Địa chỉ chỗ ở hiện tại: ...  [11] Điện thoại: ...';
  assert.equal(extractFieldPairs(text)[0]?.label, '[08] Địa chỉ chỗ ở hiện tại');
  for (const label of ['Họ, chữ đệm và tên', 'Nội dung đề nghị', 'Lý do đề nghị', 'Nguồn gốc sử dụng đất', 'Ngày, tháng, năm sinh', 'Tên dự án', 'Số tài khoản']) {
    const source = `${label}: Giá trị thử`.normalize('NFD');
    assert.equal(classifyLine(source).type, 'field_label_value');
    assert.equal(extractFieldPairs(source)[0].label, label.normalize('NFD'));
    assert.equal(extractFieldPairs(source)[0].rawValue, ' Giá trị thử'.normalize('NFD'));
  }
});

test('a legal paragraph or title is not classified as an input simply because it mentions a field name', () => {
  assert.equal(classifyLine('TỜ KHAI THAY ĐỔI THÔNG TIN CƯ TRÚ').type, 'document_title');
  assert.equal(classifyLine('NGÀY THÁNG NĂM').type, 'date_line');
  assert.equal(extractFieldPairs('Bác cần kiểm tra Nội dung đề nghị: không tự điền căn cứ pháp luật').length, 0);
});
