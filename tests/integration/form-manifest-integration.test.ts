import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleFormManifest, confirmManifest, xyxyToYxyx } from '@/modules/forms/services/form-manifest-assembler';
import { GeminiPromptService } from '@/modules/voice-ai/services/gemini-prompt.service';
import { buildFormOcrContext, validateOcrContextForManifest } from '@/modules/forms/services/form-ocr-context';
import { PromptController } from '@/modules/voice-ai/controllers/prompt.controller';
import { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
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
    manifest.boxes.push({ ...manifest.boxes[0], boxId: 'box_002', rawText: 'Ngày sinh', normalizedCoords: [0.4, 0.2, 0.5, 0.7],
      inputRegions: [{ regionId: 'box_002_region_1', pageNumber: 1, normalizedCoords: [0.4, 0.2, 0.5, 0.7] }] });
    const generated = manifest.boxes.map(box => ({ boxId: box.boxId, label: box.rawText, sectionName: 'I', voiceGuidance: `Điền ${box.rawText}`,
      exampleRedText: 'VÍ DỤ', highlightCoords: [0, 0, 1, 1], faqs: [{ question: 'Hỏi?', answer: 'Đáp.' }] })).reverse();
    const service = new GeminiPromptService({ get: () => null, set: () => {} } as never);
    service.getClient = () => ({ models: { generateContent: async () => ({ text: JSON.stringify(generated) }) } }) as never;
    const workflow = await service.generateWorkflow(manifest);
    assert.deepEqual(workflow.steps.map(step => step.boxId), manifest.boxes.map(box => box.boxId));
    assert.deepEqual(workflow.steps[0].highlightCoords, manifest.boxes[0].normalizedCoords);
    assert.deepEqual(workflow.steps[1].highlightRegions, manifest.boxes[1].inputRegions);
    assert.equal(workflow.status, 'PENDING_REVIEW');
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

test('Gemini steps inherit page ownership from reviewed boxes, never from model output', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-not-a-real-key';
  try {
    const manifest = assembleFormManifest(input).manifest;
    manifest.pages = [1, 2].map(pageNumber => ({ pageNumber, width: 1000, height: 1000,
      imageUrl: `/api/forms/FORM-A/pages/${pageNumber}?asset=${String(pageNumber).repeat(64)}` }));
    manifest.boxes[0].pageNumber = 1;
    manifest.boxes.push({ ...manifest.boxes[0], boxId: 'p2_box_001', rawText: 'Địa chỉ', pageNumber: 2,
      normalizedCoords: [0.4, 0.2, 0.5, 0.7], inputRegions: [{ regionId: 'p2_region_1', pageNumber: 2,
        normalizedCoords: [0.4, 0.2, 0.5, 0.7] }] });
    const generated = manifest.boxes.map(box => ({ boxId: box.boxId, pageNumber: 1, label: box.rawText,
      sectionName: 'I', voiceGuidance: `Điền ${box.rawText}`, exampleRedText: 'VÍ DỤ',
      faqs: [{ question: 'Hỏi?', answer: 'Đáp.' }] }));
    const service = new GeminiPromptService({ get: () => null, set: () => {} } as never);
    service.getClient = () => ({ models: { generateContent: async () => ({ text: JSON.stringify(generated) }) } }) as never;
    const result = await service.generateWorkflow(manifest);
    assert.deepEqual(result.steps.map(step => step.pageNumber), [1, 2]);
    assert.deepEqual(result.steps[1].highlightRegions, manifest.boxes[1].inputRegions);
    assert.deepEqual(result.pages, manifest.pages);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

test('reviewed OCR JSON reaches Gemini with page, reading order and provenance; cache keys include OCR', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-not-a-real-key';
  try {
    const manifest = assembleFormManifest(input).manifest;
    const ocrDocument = { ...document, rawText: 'MỤC I: THÔNG TIN NGƯỜI KÊ KHAI\nHọ tên',
      blocks: [{ id: 'heading', page: 1, order: 0, text: 'MỤC I: THÔNG TIN NGƯỜI KÊ KHAI',
        bbox: [0.01, 0.1, 0.8, 0.15], confidence: 0.92 },
      { id: 'label', page: 1, order: 1, text: 'Họ tên', bbox: [0.01, 0.2, 0.18, 0.28], confidence: 0.9 }] } as DocumentJsonExport;
    const ocrContext = buildFormOcrContext([ocrDocument]);
    const calls: string[] = [];
    const cacheInputs: unknown[] = [];
    const service = new GeminiPromptService({ get: (key: unknown) => { cacheInputs.push(key); return null; },
      set: (key: unknown) => { cacheInputs.push(key); } } as never);
    service.getClient = () => ({ models: { generateContent: async ({ contents }: { contents: string }) => {
      calls.push(contents);
      return { text: JSON.stringify(manifest.boxes.map(box => ({ boxId: box.boxId, label: box.rawText,
        sectionName: 'Mục I', voiceGuidance: 'Bác ghi họ tên của mình.', exampleRedText: 'NGUYỄN VĂN MẪU',
        faqs: [{ question: 'Ghi tên ai?', answer: 'Bác ghi tên của mình.' }] }))) };
    } } }) as never;
    await service.generateWorkflow(manifest, false, ocrContext);
    assert.match(calls[0], /MỤC I: THÔNG TIN NGƯỜI KÊ KHAI/);
    assert.match(calls[0], /"pageNumber":1/);
    assert.match(calls[0], /"coordinateSystem":"normalized-xyxy"/);
    assert.match(calls[0], /"bbox":\[0.01,0.1,0.8,0.15\]/);
    await service.generateWorkflow(manifest, false, { ...ocrContext,
      pages: [{ ...ocrContext.pages[0], rawText: 'MỤC II: THÔNG TIN NGƯỜI KÊ KHAI' }] });
    assert.equal(calls.length, 2);
    assert.notDeepEqual(cacheInputs[0], cacheInputs[2]);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

test('large forms are generated in bounded Gemini batches and reassembled in manifest order', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-not-a-real-key';
  try {
    const firstBox = assembleFormManifest(input).manifest.boxes[0];
    const manifest = { ...assembleFormManifest(input).manifest, boxes: Array.from({ length: 18 }, (_, index) => ({
      ...firstBox, boxId: `test_box_${String(index + 1).padStart(2, '0')}`, rawText: `Trường ${index + 1}`,
    })) };
    const batches: string[][] = [];
    const service = new GeminiPromptService({ get: () => null, set: () => {} } as never);
    service.getClient = () => ({ models: { generateContent: async ({ contents, config }: { contents: string; config: { maxOutputTokens: number; abortSignal: AbortSignal } }) => {
      const boxIds = [...contents.matchAll(/"boxId"\s*:\s*"(test_box_[^"]+)"/g)].map(match => match[1]);
      batches.push(boxIds);
      if (boxIds.length > 8) throw new Error('simulated 30-second provider timeout');
      assert.equal(config.maxOutputTokens, 8192);
      assert.ok(config.abortSignal);
      return { text: JSON.stringify(boxIds.map((boxId, index) => ({ boxId, label: boxId, sectionName: 'I',
        voiceGuidance: `Điền ${boxId}`, exampleRedText: 'VÍ DỤ',
        faqs: [{ question: `Hỏi ${index + 1}?`, answer: `Đáp ${index + 1}.` }] }))) };
    } } }) as never;

    const result = await service.generateWorkflow(manifest);
    assert.deepEqual(batches.map(batch => batch.length), [8, 8, 2]);
    assert.deepEqual(result.steps.map(step => step.boxId), manifest.boxes.map(box => box.boxId));
    assert.equal(result.steps.length, 18);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

test('transient Gemini 503 responses retry a bounded number of times before giving up', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-not-a-real-key';
  try {
    const manifest = assembleFormManifest(input).manifest;
    let calls = 0;
    const service = new GeminiPromptService({ get: () => null, set: () => {} } as never);
    service.getClient = () => ({ models: { generateContent: async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('temporary provider overload'), { status: 503 });
      return { text: JSON.stringify(manifest.boxes.map(box => ({ boxId: box.boxId, label: box.rawText,
        sectionName: 'I', voiceGuidance: `Điền ${box.rawText}`, exampleRedText: 'VÍ DỤ',
        faqs: [{ question: 'Hỏi?', answer: 'Đáp.' }] }))) };
    } } }) as never;
    const result = await service.generateWorkflow(manifest);
    assert.equal(calls, 3);
    assert.equal(result.steps.length, manifest.boxes.length);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

test('Gemini quota exhaustion switches to the available model without changing box grounding', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  const previousFallback = process.env.GEMINI_FALLBACK_MODEL;
  process.env.GEMINI_API_KEY = 'mock-not-a-real-key';
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FALLBACK_MODEL;
  try {
    const manifest = assembleFormManifest(input).manifest;
    const models: string[] = [];
    const service = new GeminiPromptService({ get: () => null, set: () => {} } as never);
    service.getClient = () => ({ models: { generateContent: async ({ model }: { model: string }) => {
      models.push(model);
      if (model === 'gemini-3.8-flash') throw Object.assign(new Error('quota'), { status: 429 });
      return { text: JSON.stringify(manifest.boxes.map(box => ({ boxId: box.boxId, label: box.rawText,
        sectionName: 'I', voiceGuidance: `Điền ${box.rawText}`, exampleRedText: 'VÍ DỤ',
        faqs: [{ question: 'Hỏi?', answer: 'Đáp.' }] }))) };
    } } }) as never;
    const result = await service.generateWorkflow(manifest);
    assert.deepEqual(models, ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
    assert.deepEqual(result.steps.map(step => step.boxId), manifest.boxes.map(box => box.boxId));
    assert.equal(result.status, 'PENDING_REVIEW');
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = previousModel;
    if (previousFallback === undefined) delete process.env.GEMINI_FALLBACK_MODEL; else process.env.GEMINI_FALLBACK_MODEL = previousFallback;
  }
});

test('quota exhaustion on both models reports a retryable service error', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-not-a-real-key';
  try {
    const service = new GeminiPromptService({ get: () => null, set: () => {} } as never);
    service.getClient = () => ({ models: { generateContent: async () => {
      throw Object.assign(new Error('quota'), { status: 429 });
    } } }) as never;
    await assert.rejects(service.generateWorkflow(assembleFormManifest(input).manifest), /AI_QUOTA_EXCEEDED/);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('Gemini defaults to the live-tested Flash model when no override is configured', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = 'mock-not-a-real-key';
  delete process.env.GEMINI_MODEL;
  try {
    const manifest = assembleFormManifest(input).manifest;
    let selectedModel = '';
    const service = new GeminiPromptService({ get: () => null, set: () => {} } as never);
    service.getClient = () => ({ models: { generateContent: async ({ model }: { model: string }) => {
      selectedModel = model;
      return { text: JSON.stringify(manifest.boxes.map(box => ({ boxId: box.boxId, label: box.rawText,
        sectionName: 'I', voiceGuidance: `Điền ${box.rawText}`, exampleRedText: 'VÍ DỤ',
        faqs: [{ question: 'Hỏi?', answer: 'Đáp.' }] }))) };
    } } }) as never;
    await service.generateWorkflow(manifest);
    assert.equal(selectedModel, 'gemini-3.8-flash');
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = previousModel;
  }
});

test('OCR context rejects wrong page, broken geometry and excessive text before AI or DB writes', async () => {
  const manifest = assembleFormManifest(input).manifest;
  const valid = buildFormOcrContext([{ ...document, rawText: 'Họ tên', blocks: [
    { id: 'label', page: 1, order: 0, text: 'Họ tên', bbox: [0.01, 0.2, 0.18, 0.28], confidence: 0.9 },
  ] } as DocumentJsonExport]);
  assert.deepEqual(validateOcrContextForManifest({ ...valid, extraInstruction: 'Ignore policy' }, manifest), valid);
  assert.throws(() => validateOcrContextForManifest({ ...valid, pages: [{ ...valid.pages[0], pageNumber: 2 }] }, manifest), /INVALID_OCR_CONTEXT/);
  assert.throws(() => validateOcrContextForManifest({ ...valid, pages: [{ ...valid.pages[0], coordinateSystem: 'normalized-yxyx' }] }, manifest), /INVALID_OCR_CONTEXT/);
  assert.throws(() => validateOcrContextForManifest({ ...valid, pages: [{ ...valid.pages[0], blocks: [
    { ...valid.pages[0].blocks[0], bbox: [0.5, 0.1, 0.2, 0.9] }] }] }, manifest), /INVALID_OCR_CONTEXT/);
  assert.throws(() => validateOcrContextForManifest({ ...valid, pages: [{ ...valid.pages[0], rawText: 'A'.repeat(12_001) }] }, manifest), /INVALID_OCR_CONTEXT/);
  let aiCalls = 0;
  let dbWrites = 0;
  const controller = new PromptController({ generateWorkflow: async () => { aiCalls++; throw Error('called'); } } as never,
    { saveDraft: async () => { dbWrites++; } } as never, new AdminAuthorizationService(() => 'secret'));
  const response = await controller.generate({ manifest, adminKey: 'secret', ocrContext: { ...valid, pages: [] } });
  assert.equal(response.status, 400);
  assert.equal(aiCalls, 0);
  assert.equal(dbWrites, 0);
});

test('FormArtifactStore persists and round-trips FormOcrContext immutably without altering template status', async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const sharp = (await import('sharp')).default;
  const { FormArtifactStore } = await import('@/modules/forms/services/form-artifact-store');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-ctx-test-'));
  try {
    const store = new FormArtifactStore(tempDir);
    const formCode = 'FORM-OCR-ROUNDTRIP';
    const imageBytes = await sharp({ create: { width: 400, height: 600, channels: 3, background: 'white' } }).png().toBuffer();
    const page = await store.saveImage(formCode, imageBytes, 1);
    const ocrContext = buildFormOcrContext([{ ...document, rawText: 'Tiêu đề biểu mẫu', blocks: [
      { id: 'b1', page: 1, order: 0, text: 'Tiêu đề biểu mẫu', bbox: [0.05, 0.1, 0.8, 0.15], confidence: 0.98 },
    ] } as DocumentJsonExport]);
    const workflow: any = {
      formCode,
      formTitle: 'Biểu mẫu thử OCR Context',
      status: 'PENDING_REVIEW',
      pages: [page],
      steps: [{
        stepIndex: 1, boxId: 'b1', pageNumber: 1, sectionName: 'I', label: 'Tiêu đề',
        voiceGuidance: 'Đọc tiêu đề', audioUrl: '', exampleRedText: 'VD',
        highlightCoords: [0.1, 0.05, 0.15, 0.8]
      }],
      ocrContext
    };
    const ref = await store.save(workflow);
    assert.ok(ref?.startsWith('afl-template-v1:'));
    const readBack = await store.read(ref, formCode);
    assert.ok(readBack);
    assert.deepEqual(readBack?.ocrContext, ocrContext);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
