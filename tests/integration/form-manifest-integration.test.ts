import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleFormManifest, confirmManifest, xyxyToYxyx } from '@/modules/forms/services/form-manifest-assembler';
import { GeminiPromptService } from '@/modules/voice-ai/services/gemini-prompt.service';
import type { DocumentJsonExport } from '@/shared/document-export.types';
import type { FieldCandidate } from '@/modules/opencv/field-types';

const candidate: FieldCandidate = { candidateId: 'c1', rect: { x: 200, y: 200, width: 500, height: 100 }, source: 'field_row',
  areaRatio: 0.05, aspectRatio: 5, contourArea: 50000, rectangularity: 1, parentIndex: -1, childIndex: -1 };
const document = {
  status: 'success', source: { frame: 'processed-primary', pageCount: 1 },
  pages: [{ page: 1, width: 1000, height: 1000, coordinateSystem: 'normalized-xyxy' }],
  blocks: [{ id: 'label', page: 1, bbox: [0.01, 0.2, 0.18, 0.28], text: 'Họ tên' }],
  structure: { fields: [{ label: 'Họ tên', sourceBlockIds: ['label'] }], checkboxes: [] },
} as unknown as DocumentJsonExport;
const input = { formId: 'FORM_A', formCode: 'FORM-A', formTitle: 'Form A', width: 1000, height: 1000, candidates: [candidate], document };

test('OCR XYXY converts explicitly but highlight stays on the input, not the label', () => {
  assert.deepEqual(xyxyToYxyx([0.1, 0.2, 0.4, 0.3]), [0.2, 0.1, 0.3, 0.4]);
  const result = assembleFormManifest(input);
  assert.equal(result.manifest.boxes[0].rawText, 'Họ tên');
  assert.deepEqual(result.manifest.boxes[0].normalizedCoords, [0.2, 0.2, 0.3, 0.7]);
  assert.throws(() => confirmManifest(result.manifest, false), /REVIEW_REQUIRED/);
  assert.equal(confirmManifest(result.manifest, true).boxes.length, 1);
});

test('checkbox type comes from detector evidence, not a narrow field width', () => {
  assert.equal(assembleFormManifest({ ...input, candidates: [{ ...candidate, source: 'checkbox' }] }).manifest.boxes[0].boxType, 'checkbox');
  assert.equal(assembleFormManifest({ ...input, candidates: [{ ...candidate, rect: { ...candidate.rect, width: 20 } }] }).manifest.boxes[0].boxType, 'text');
});

test('containers and text clusters are not form steps; ambiguous labels cannot be generated', () => {
  assert.equal(assembleFormManifest({ ...input, candidates: [{ ...candidate, isContainer: true }, { ...candidate, source: 'phrase_cluster' }] }).manifest.boxes.length, 0);
  const ambiguous = { ...document, structure: { ...document.structure, fields: [document.structure.fields[0], { ...document.structure.fields[0], label: 'Ngày sinh' }] } };
  const result = assembleFormManifest({ ...input, document: ambiguous });
  assert.equal(result.manifest.boxes[0].rawText, '');
  assert.throws(() => confirmManifest(result.manifest, true), /INVALID_MANIFEST/);
});

test('one OCR label cannot silently become two input instructions', () => {
  const result = assembleFormManifest({ ...input, candidates: [candidate, { ...candidate, candidateId: 'c2' }] });
  assert.ok(result.manifest.boxes.every(box => box.rawText === ''));
});

test('frame mismatch, out-of-page geometry and excessive candidates fail explicitly', () => {
  assert.throws(() => assembleFormManifest({ ...input, width: 800 }), /FRAME_MISMATCH/);
  assert.throws(() => assembleFormManifest({ ...input, candidates: [{ ...candidate, rect: { ...candidate.rect, x: -1 } }] }), /GEOMETRY/);
  assert.throws(() => assembleFormManifest({ ...input, candidates: Array.from({ length: 201 }, () => candidate) }), /TOO_MANY/);
});

test('Gemini cannot reorder boxes or substitute its own geometry', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-not-a-real-key';
  try {
    const manifest = assembleFormManifest(input).manifest;
    manifest.boxes.push({ ...manifest.boxes[0], boxId: 'box_002', rawText: 'Ngày sinh', normalizedCoords: [0.4, 0.2, 0.5, 0.7] });
    const generated = manifest.boxes.map(box => ({ boxId: box.boxId, label: box.rawText, sectionName: 'I', voiceGuidance: `Điền ${box.rawText}`,
      exampleRedText: 'VÍ DỤ', highlightCoords: [0, 0, 1, 1], faqs: [{ question: 'Hỏi?', answer: 'Đáp.' }] })).reverse();
    const service = new GeminiPromptService({ get: () => null, set: () => {} } as never);
    service.getClient = () => ({ models: { generateContent: async () => ({ text: JSON.stringify(generated) }) } }) as never;
    const workflow = await service.generateWorkflow(manifest);
    assert.deepEqual(workflow.steps.map(step => step.boxId), manifest.boxes.map(box => box.boxId));
    assert.deepEqual(workflow.steps[0].highlightCoords, manifest.boxes[0].normalizedCoords);
    assert.equal(workflow.status, 'PENDING_REVIEW');
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});
