import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateManifest, validateWorkflow, validCoords } from '@/modules/forms/services/form-validation.service';
import { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
import { FormGeometricManifest, FormWorkflow, NormalizedBoundingBox } from '@/shared/contracts';

test('SUPERVISION GUARD 1: Khung ô OpenCV WASM luôn thỏa mãn 100% ràng buộc validateManifest của Backend Codex', () => {
  // Giả lập đầu ra từ runLineDetectionDebug của OpenCV WASM
  const width = 1200;
  const height = 1600;
  const mockCandidates = [
    { rect: { x: 120, y: 160, width: 960, height: 60 } },
    { rect: { x: 120, y: 280, width: 400, height: 50 } },
    { rect: { x: 560, y: 280, width: 520, height: 50 } },
    { rect: { x: 120, y: 400, width: 40, height: 40 } }, // Checkbox
  ];

  const manifestBoxes = mockCandidates.map((c, idx) => {
    const ymin = Math.max(0, Math.min(0.98, Number((c.rect.y / height).toFixed(4))));
    const xmin = Math.max(0, Math.min(0.98, Number((c.rect.x / width).toFixed(4))));
    const ymax = Math.max(ymin + 0.01, Math.min(1.0, Number(((c.rect.y + c.rect.height) / height).toFixed(4))));
    const xmax = Math.max(xmin + 0.01, Math.min(1.0, Number(((c.rect.x + c.rect.width) / width).toFixed(4))));

    return {
      boxId: `box_${String(idx + 1).padStart(2, '0')}`,
      normalizedCoords: [ymin, xmin, ymax, xmax] as NormalizedBoundingBox,
      rawText: `Ô kê khai số ${idx + 1}`,
      boxType: (c.rect.width / width < 0.08 ? 'checkbox' : 'text') as 'checkbox' | 'text',
      estimatedWidthRatio: Math.max(0.01, Math.min(1.0, Number((c.rect.width / width).toFixed(2)))),
    };
  });

  const rawFormCode = '01/LPTB (Đất Đai)';
  const sanitizedFormId = rawFormCode.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60);

  const manifest: FormGeometricManifest = {
    formId: sanitizedFormId,
    formTitle: 'Tờ khai lệ phí trước bạ nhà đất 2026',
    formCode: rawFormCode,
    imageDimensions: { width, height },
    boxes: manifestBoxes,
  };

  // Kiểm thực qua hàm validateManifest nghiêm ngặt của Codex
  const validated = validateManifest(manifest);
  assert.equal(validated.formId, sanitizedFormId);
  assert.equal(validated.boxes.length, 4);
  assert.equal(validCoords(validated.boxes[0].normalizedCoords), true);
});

test('SUPERVISION GUARD 2: Xác thực x-admin-key hoạt động chuẩn xác với key cấu hình', () => {
  const secretKey = 'afl_admin_secret_key_2026';
  const adminAuth = new AdminAuthorizationService(() => secretKey);

  // 1. Header x-admin-key
  assert.equal(adminAuth.authorize(null, secretKey), 200);

  // 2. Header Authorization: Bearer
  assert.equal(adminAuth.authorize(`Bearer ${secretKey}`), 200);

  // 3. Sai key
  assert.equal(adminAuth.authorize(null, 'wrong_key'), 401);

  // 4. Chưa cấu hình key
  const unconfiguredAuth = new AdminAuthorizationService(() => undefined);
  assert.equal(unconfiguredAuth.authorize(null, secretKey), 503);
});

test('SUPERVISION GUARD 3: Quy ước stepIndex 1-based được bảo toàn cho FormWorkflow', () => {
  const manifest: FormGeometricManifest = {
    formId: 'form_test_01',
    formTitle: 'Biểu mẫu kiểm thử',
    formCode: 'MẪU-TEST',
    imageDimensions: { width: 1000, height: 1000 },
    boxes: [
      {
        boxId: 'box_01',
        normalizedCoords: [0.1, 0.1, 0.2, 0.9],
        rawText: 'Ô họ và tên',
        boxType: 'text',
        estimatedWidthRatio: 0.8,
      },
      {
        boxId: 'box_02',
        normalizedCoords: [0.3, 0.1, 0.4, 0.9],
        rawText: 'Ô số CCCD',
        boxType: 'text',
        estimatedWidthRatio: 0.8,
      },
    ],
  };

  // Workflow với 1-based index (1, 2)
  const validWorkflow: FormWorkflow = {
    formId: 'form_test_01',
    formTitle: 'Biểu mẫu kiểm thử',
    formCode: 'MẪU-TEST',
    status: 'PENDING_REVIEW',
    steps: [
      {
        stepIndex: 1, // 1-based!
        boxId: 'box_01',
        sectionName: 'Mục I',
        label: 'Họ tên',
        voiceGuidance: 'Bác ghi họ tên nhé.',
        audioUrl: '',
        exampleRedText: 'NGUYỄN VĂN A',
        highlightCoords: [0.1, 0.1, 0.2, 0.9],
        faqs: [],
      },
      {
        stepIndex: 2, // 1-based!
        boxId: 'box_02',
        sectionName: 'Mục I',
        label: 'CCCD',
        voiceGuidance: 'Bác ghi số căn cước nhé.',
        audioUrl: '',
        exampleRedText: '001234567890',
        highlightCoords: [0.3, 0.1, 0.4, 0.9],
        faqs: [],
      },
    ],
  };

  // Phải vượt qua validateWorkflow không ném lỗi
  assert.doesNotThrow(() => validateWorkflow(manifest, validWorkflow));

  // Nếu là 0-based index (0, 1), validateWorkflow của Codex BẮT BUỘC ném lỗi INVALID_WORKFLOW
  const invalidZeroBasedWorkflow: FormWorkflow = {
    ...validWorkflow,
    steps: validWorkflow.steps.map((st, idx) => ({ ...st, stepIndex: idx })), // 0, 1
  };
  assert.throws(() => validateWorkflow(manifest, invalidZeroBasedWorkflow), /INVALID_WORKFLOW/);
});

test('SUPERVISION GUARD 4: Giám sát tuân thủ Nghị định 13/2023/NĐ-CP (Zero Citizen PII trên CSDL/Server)', () => {
  // Đọc nội dung schema Prisma và xác thực không có bảng nào lưu PII công dân
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  assert.equal(fs.existsSync(schemaPath), true);

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

  // Đảm bảo không có model lưu trữ bài nộp/CCCD/hồ sơ quét của công dân
  const forbiddenModels = [
    'CitizenSubmission',
    'CitizenProfile',
    'CitizenDocument',
    'UserPii',
    'ScannedTicketSubmission',
  ];

  for (const forbidden of forbiddenModels) {
    assert.equal(
      schemaContent.includes(`model ${forbidden}`),
      false,
      `VI PHẠM NGHỊ ĐỊNH 13: Phát hiện model ${forbidden} có thể lưu trữ PII công dân trên CSDL PostgreSQL!`
    );
  }

  // Đảm bảo chỉ lưu trữ siêu dữ liệu mẫu biểu hành chính
  assert.equal(schemaContent.includes('model FormTemplate'), true);
  assert.equal(schemaContent.includes('model FormGeometricManifest'), true);
  assert.equal(schemaContent.includes('model FormWorkflow'), true);
});
