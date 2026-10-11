import assert from 'node:assert/strict';
import test from 'node:test';
import { FormGeometricManifest, FormWorkflow, WorkflowStep } from '@/shared/contracts';
import { slugifyBoxId } from '@/modules/forms/services/form-field-metadata';
import { splitTextField } from '@/modules/forms/services/form-region-editor';
import { validateManifest, validateWorkflow } from '@/modules/forms/services/form-validation.service';
import { computeDynamicFontSize } from '@/components/citizen/VisualTwin';

test('E2E Lifecycle: Manifest generation -> Field splitting & slugification -> Workflow binding', () => {
  // 1. Khởi tạo Manifest với các ô nhập đa dòng và ô inline
  const rawManifest: FormGeometricManifest = {
    formId: 'e2e_form_hdld',
    formCode: 'HDLD_2026',
    formTitle: 'Hợp Đồng Lao Động Chuẩn Hóa',
    imageDimensions: { width: 1200, height: 1600 },
    boxes: [
      {
        boxId: 'box_dia_diem_lam_viec',
        rawText: 'Địa điểm làm việc',
        boxType: 'text',
        estimatedWidthRatio: 0.65,
        normalizedCoords: [0.25, 0.2, 0.28, 0.85],
        inputKind: 'multiline_text',
        inputRegions: [
          { regionId: 'box_dia_diem_lam_viec_region_1', pageNumber: 1, normalizedCoords: [0.25, 0.2, 0.28, 0.85] },
          { regionId: 'box_dia_diem_lam_viec_region_2', pageNumber: 1, normalizedCoords: [0.29, 0.1, 0.32, 0.85] },
        ],
      },
      {
        boxId: 'box_ben_b_ky_ten',
        rawText: 'Người lao động ký và ghi rõ họ tên',
        boxType: 'text',
        estimatedWidthRatio: 0.35,
        normalizedCoords: [0.85, 0.55, 0.95, 0.9],
        inputKind: 'single_line_text',
        inputRegions: [
          { regionId: 'box_ben_b_ky_ten_region_1', pageNumber: 1, normalizedCoords: [0.85, 0.55, 0.95, 0.9] },
        ],
      },
    ],
  };

  validateManifest(rawManifest);

  // 2. Thử nghiệm splitTextField với nhãn tiếng Việt thô chưa chuẩn hóa
  const splitResult = splitTextField(rawManifest.boxes[0], ['Dòng phụ số 2: Địa điểm dự phòng!']);
  assert.equal(splitResult.length, 2);
  assert.equal(splitResult[0].boxId, 'box_dia_diem_lam_viec');
  assert.equal(splitResult[1].boxId, 'Dong_phu_so_2_Dia_diem_du_phong');
  assert.equal(splitResult[1].inputRegions![0].regionId, 'Dong_phu_so_2_Dia_diem_du_phong_region_1');

  // 3. Xây dựng kịch bản WorkflowStep hoàn chỉnh hỗ trợ TargetActor
  const steps: WorkflowStep[] = [
    {
      stepIndex: 1,
      boxId: 'box_dia_diem_lam_viec',
      pageNumber: 1,
      sectionName: 'II. ĐIỀU KHOẢN HỢP ĐỒNG',
      label: 'Mục 1: Địa điểm làm việc',
      voiceGuidance: 'Bác ghi rõ địa chỉ nơi làm việc chính thức tại công ty hoặc chi nhánh.',
      audioUrl: '/audio/' + 'a'.repeat(64) + '.mp3',
      exampleRedText: 'SỐ 123 ĐƯỜNG TRẦN HƯNG ĐẠO, QUẬN 1, TP. HỒ CHÍ MINH',
      highlightCoords: rawManifest.boxes[0].normalizedCoords,
      inputKind: 'multiline_text',
      highlightRegions: rawManifest.boxes[0].inputRegions,
      faqs: [{ question: 'Ghi địa chỉ nào?', answer: 'Ghi địa chỉ nơi làm việc thực tế hàng ngày.' }],
      targetActor: 'EMPLOYER',
    },
    {
      stepIndex: 2,
      boxId: 'box_ben_b_ky_ten',
      pageNumber: 1,
      sectionName: 'VI. KÝ KẾT VÀ XÁC NHẬN',
      label: 'Chữ ký Bên B',
      voiceGuidance: 'Bác ký tên và viết đầy đủ họ và tên của mình bằng bút mực xanh.',
      audioUrl: '/audio/' + 'b'.repeat(64) + '.mp3',
      exampleRedText: 'NGUYỄN VĂN AN',
      highlightCoords: rawManifest.boxes[1].normalizedCoords,
      inputKind: 'single_line_text',
      highlightRegions: rawManifest.boxes[1].inputRegions,
      faqs: [{ question: 'Có cần điểm chỉ không?', answer: 'Chỉ cần ký và ghi rõ họ tên nếu biết chữ.' }],
      targetActor: 'CITIZEN',
    },
  ];

  const fullWorkflow: FormWorkflow = {
    formId: rawManifest.formId,
    formCode: rawManifest.formCode,
    formTitle: rawManifest.formTitle,
    status: 'ACTIVE',
    version: 1,
    steps,
  };

  validateWorkflow(rawManifest, fullWorkflow);

  // 4. Kiểm thử tính năng lọc vai trò điền (Multi-party perspective filtering)
  const citizenSteps = fullWorkflow.steps.filter(s => !s.targetActor || s.targetActor === 'ALL' || s.targetActor === 'CITIZEN');
  const employerSteps = fullWorkflow.steps.filter(s => s.targetActor === 'EMPLOYER');
  assert.equal(citizenSteps.length, 1);
  assert.equal(citizenSteps[0].boxId, 'box_ben_b_ky_ten');
  assert.equal(employerSteps.length, 1);
  assert.equal(employerSteps[0].boxId, 'box_dia_diem_lam_viec');

  // 5. Kiểm thử tính toán font size tự động trên VisualTwin
  const dynamicSizeLong = computeDynamicFontSize(steps[0].exampleRedText, steps[0].highlightCoords);
  assert.ok(dynamicSizeLong >= 8 && dynamicSizeLong <= 15, `Font size must be in range [8, 15], got ${dynamicSizeLong}`);

  const dynamicSizeShort = computeDynamicFontSize(steps[1].exampleRedText, steps[1].highlightCoords);
  assert.ok(dynamicSizeShort >= 8 && dynamicSizeShort <= 15, `Font size must be in range [8, 15], got ${dynamicSizeShort}`);
  assert.ok(dynamicSizeShort >= dynamicSizeLong, 'Shorter text on adequate width should have >= font size than long text');
});

test('Stress testing slugifyBoxId with extreme Unicode inputs and length bounds', () => {
  const extremeVietnamese = 'Biểu mẫu Đề nghị Hưởng Trợ cấp Thất nghiệp (Mẫu số 01/TCNL-2026) - @#$%^&*()_+';
  const slugified = slugifyBoxId(extremeVietnamese);
  assert.match(slugified, /^[A-Za-z0-9_-]{1,64}$/);
  assert.ok(slugified.length <= 64);
  assert.ok(!slugified.includes(' '));
  assert.ok(!slugified.includes('@'));

  const thousandChars = 'a_very_long_custom_identifier_'.repeat(50);
  const clampedSlug = slugifyBoxId(thousandChars);
  assert.equal(clampedSlug.length, 64);
  assert.match(clampedSlug, /^[A-Za-z0-9_-]{1,64}$/);

  assert.equal(slugifyBoxId('     '), 'box_1');
  assert.equal(slugifyBoxId('___---___'), 'box_1');
  assert.equal(slugifyBoxId(null as unknown as string, 'custom_fallback'), 'custom_fallback_1');
});
