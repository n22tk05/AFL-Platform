import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentExtractionService } from '../services/document-extraction.service';

test('DocumentExtractionService initializes correctly', () => {
  const service = new DocumentExtractionService();
  assert.ok(service, 'Service instance should be defined');
});

test('Fallback extraction returns valid DocumentExtractionResult for land tax form (default)', () => {
  const service = new DocumentExtractionService();
  const startTime = Date.now();
  const result = service.generateFallbackExtraction(
    { imageBase64: 'data:image/jpeg;base64,sample', documentHint: 'land_tax' },
    startTime
  );

  assert.equal(result.success, true);
  assert.equal(result.classification.documentType, 'Tờ khai lệ phí trước bạ');
  assert.equal(result.classification.formCode, 'Mẫu số: 01/LPTB');
  assert.ok(result.fields.length >= 5, 'Should have at least 5 fields');

  // Kiểm tra cấu trúc từng trường
  for (const field of result.fields) {
    assert.ok(field.fieldKey, 'Field key must be non-empty');
    assert.ok(field.fieldLabel, 'Field label must be non-empty');
    assert.ok(field.fieldValue, 'Field value must be non-empty');
    assert.ok(field.confidence >= 0 && field.confidence <= 1, 'Confidence must be between 0 and 1');
  }

  // Kiểm tra cờ PII trên CCCD
  const cccdField = result.fields.find(f => f.fieldKey === 'so_cccd');
  assert.ok(cccdField, 'Must extract so_cccd');
  assert.equal(cccdField.isSensitive, true, 'CCCD must be flagged as sensitive (PII)');
});

test('Fallback extraction handles traffic violation ticket (FR-6 prerequisite)', () => {
  const service = new DocumentExtractionService();
  const startTime = Date.now();
  const result = service.generateFallbackExtraction(
    { imageBase64: 'sampleBase64', documentHint: 'traffic_ticket' },
    startTime
  );

  assert.equal(result.success, true);
  assert.equal(result.classification.documentType, 'Biên bản vi phạm hành chính');
  assert.ok(result.classification.documentNumber?.includes('BB-VPHC'), 'Document number should contain BB-VPHC');

  // Kiểm tra các trường cốt lõi của FR-6
  const soBienBan = result.fields.find(f => f.fieldKey === 'so_bien_ban');
  const soTienPhat = result.fields.find(f => f.fieldKey === 'so_tien_phat');
  const loiViPham = result.fields.find(f => f.fieldKey === 'loi_vi_pham');

  assert.ok(soBienBan, 'Phải có số biên bản');
  assert.ok(soTienPhat, 'Phải có số tiền phạt');
  assert.ok(loiViPham, 'Phải có lỗi vi phạm');
  assert.equal(soTienPhat.category, 'financial');
  assert.equal(loiViPham.category, 'legal_event');
});

test('Fallback extraction handles birth certificate registration form', () => {
  const service = new DocumentExtractionService();
  const startTime = Date.now();
  const result = service.generateFallbackExtraction(
    { imageBase64: 'sampleBase64', documentHint: 'birth_cert' },
    startTime
  );

  assert.equal(result.success, true);
  assert.equal(result.classification.documentType, 'Tờ khai đăng ký lại khai sinh');
  const hoTenNguoiKhai = result.fields.find(f => f.fieldKey === 'ho_ten_nguoi_yeu_cau');
  assert.ok(hoTenNguoiKhai, 'Phải có trường họ tên người yêu cầu');
  assert.equal(hoTenNguoiKhai.category, 'identity');
});
