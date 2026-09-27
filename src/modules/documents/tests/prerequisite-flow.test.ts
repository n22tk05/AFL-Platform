import test from 'node:test';
import assert from 'node:assert/strict';
import { documentExtractionService } from '../services/document-extraction.service';

test('PREREQUISITE FLOW (FR-6): Trích xuất biên bản vi phạm và cấu trúc lưu Session RAM', () => {
  const startTime = Date.now();
  const extracted = documentExtractionService.generateFallbackExtraction(
    { imageBase64: 'mock_ticket', documentHint: 'traffic_ticket' },
    startTime
  );

  assert.equal(extracted.success, true);
  assert.equal(extracted.classification.documentType, 'Biên bản vi phạm hành chính');

  // Gói payload Session RAM
  const sessionPayload = {
    savedAt: new Date().toISOString(),
    documentType: extracted.classification.documentType,
    documentNumber: extracted.classification.documentNumber,
    fields: extracted.fields.reduce((acc, f) => {
      acc[f.fieldKey] = f.fieldValue;
      return acc;
    }, {} as Record<string, string>),
  };

  assert.ok(sessionPayload.fields.so_bien_ban, 'Phải có số biên bản trong Session RAM');
  assert.ok(sessionPayload.fields.so_tien_phat, 'Phải có số tiền phạt trong Session RAM');

  // Giả lập logic bơm vào chữ mẫu đỏ của biểu mẫu chính (box_05)
  const step = {
    stepIndex: 4,
    boxId: 'box_05',
    label: 'Số tiền nộp phạt vào Kho bạc',
    requiresPrerequisiteDoc: true,
    exampleRedText: 'CHƯA CÓ DỮ LIỆU',
  };

  let effectiveRedText = step.exampleRedText;
  if (step.requiresPrerequisiteDoc && sessionPayload.fields) {
    if (step.boxId === 'box_05' && sessionPayload.fields.so_tien_phat) {
      effectiveRedText = sessionPayload.fields.so_tien_phat.toUpperCase();
    }
  }

  assert.equal(effectiveRedText, '900.000 ĐỒNG', 'Chữ mẫu đỏ phải tự động điền số tiền phạt từ biên bản');
});
