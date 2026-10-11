import assert from 'node:assert/strict';
import test from 'node:test';
import { validFieldMetadata, bindFieldMetadata, slugifyBoxId } from '../services/form-field-metadata';
import { editBoxRegion, editBoxRegions, mergeTextFields, splitTextField } from '../services/form-region-editor';
import { validateManifest, validateWorkflow } from '../services/form-validation.service';
import type { FormGeometricManifest, FormWorkflow } from '@/shared/contracts';

const manifest: FormGeometricManifest = { formId: 'TEST', formCode: 'TEST', formTitle: 'Thử', imageDimensions: { width: 1000, height: 1000 },
  boxes: [{ boxId: 'box_001', rawText: 'Nội dung', boxType: 'text', estimatedWidthRatio: 0.6, normalizedCoords: [0.2, 0.2, 0.23, 0.8],
    inputKind: 'multiline_text', inputRegions: [
      { regionId: 'region_1', pageNumber: 1, normalizedCoords: [0.2, 0.2, 0.23, 0.8] },
      { regionId: 'region_2', pageNumber: 1, normalizedCoords: [0.25, 0.1, 0.28, 0.8] }] }] };
const workflow: FormWorkflow = { formId: 'TEST', formCode: 'TEST', formTitle: 'Thử', status: 'PENDING_REVIEW', steps: [{ stepIndex: 1, boxId: 'box_001',
  sectionName: 'I', label: 'Nội dung', voiceGuidance: 'Viết nội dung trên các dòng.', exampleRedText: 'VÍ DỤ', audioUrl: '',
  highlightCoords: manifest.boxes[0].normalizedCoords, inputKind: 'multiline_text', highlightRegions: manifest.boxes[0].inputRegions,
  faqs: [{ question: 'Viết đâu?', answer: 'Trên các dòng.' }] }] };

test('region contract rejects duplicate IDs, invalid page, NaN, changed primary, missing kind and excessive region count', () => {
  const box = manifest.boxes[0], regions = box.inputRegions!;
  assert.ok(validFieldMetadata(box.inputKind, regions, box.normalizedCoords));
  for (const invalid of [[regions[0], regions[0]], [{ ...regions[0], pageNumber: 2 }], [{ ...regions[0], normalizedCoords: [0, 0, NaN, 1] }],
    [{ ...regions[0], normalizedCoords: [0.4, 0.1, 0.5, 0.8] }], Array.from({ length: 65 }, (_, index) => ({ ...regions[0], regionId: `r_${index}` }))]) {
    assert.equal(validFieldMetadata(box.inputKind, invalid, box.normalizedCoords), false);
  }
  assert.equal(validFieldMetadata(undefined, regions, box.normalizedCoords), false);
  assert.throws(() => validateManifest({ ...manifest, boxes: [{ ...box, boxType: 'checkbox' }] }), /INVALID_MANIFEST/);
});

test('workflow cannot alter, omit or inject regions from the reviewed manifest', () => {
  validateWorkflow(manifest, workflow);
  validateWorkflow(manifest, { ...workflow, steps: [{ ...workflow.steps[0], highlightRegions: workflow.steps[0].highlightRegions!.map(region => ({
    normalizedCoords: region.normalizedCoords, pageNumber: region.pageNumber, regionId: region.regionId })) }] });
  for (const changed of [{ ...workflow.steps[0], highlightRegions: undefined }, { ...workflow.steps[0], inputKind: 'checkbox' },
    { ...workflow.steps[0], highlightRegions: [workflow.steps[0].highlightRegions![0]] }, { ...workflow.steps[0], highlightCoords: [0.1, 0.1, 0.2, 0.2] }]) {
    assert.throws(() => validateWorkflow(manifest, { ...workflow, steps: [changed] } as FormWorkflow), /INVALID_WORKFLOW/);
  }
});

test('metadata binds only to the same box and primary geometry, with legacy steps unchanged', () => {
  const legacy = { ...workflow.steps[0], inputKind: undefined, highlightRegions: undefined };
  const metadata = [{ boxId: legacy.boxId, inputKind: 'multiline_text' as const, highlightRegions: manifest.boxes[0].inputRegions! }];
  assert.deepEqual(bindFieldMetadata([legacy], metadata)[0].highlightRegions, metadata[0].highlightRegions);
  assert.deepEqual(bindFieldMetadata([legacy]), [legacy]);
  assert.throws(() => bindFieldMetadata([legacy], [{ ...metadata[0], boxId: 'foreign' }]), /UNAVAILABLE/);
  assert.throws(() => bindFieldMetadata([{ ...legacy, highlightCoords: [0.4, 0.1, 0.5, 0.8] }], metadata), /UNAVAILABLE/);
});

test('metadata survives PostgreSQL float rounding without accepting a moved field', () => {
  const persistedCoords: [number, number, number, number] = [0.186126038104543, 0.323427781617139, 0.196873473375672, 0.78092605390463];
  const artifactCoords: [number, number, number, number] = [0.18612603810454323, 0.3234277816171389, 0.1968734733756717, 0.7809260539046303];
  const step = { ...workflow.steps[0], highlightCoords: persistedCoords, inputKind: undefined, highlightRegions: undefined };
  const field = { boxId: step.boxId, inputKind: 'single_line_text' as const,
    highlightRegions: [{ regionId: 'region_1', pageNumber: 1, normalizedCoords: artifactCoords }] };
  assert.deepEqual(bindFieldMetadata([step], [field])[0].highlightRegions, field.highlightRegions);
  assert.throws(() => bindFieldMetadata([{ ...step, highlightCoords: [persistedCoords[0] + 1e-6, ...persistedCoords.slice(1)] as typeof persistedCoords }], [field]), /UNAVAILABLE/);
});

test('manual region edits preserve primary geometry and merge creates one field without a union highlight', () => {
  const box = manifest.boxes[0];
  const edited = editBoxRegion(box, 1, [0.3, 0.1, 0.33, 0.8]);
  assert.deepEqual(edited.normalizedCoords, box.normalizedCoords);
  assert.deepEqual(edited.inputRegions![1].normalizedCoords, [0.3, 0.1, 0.33, 0.8]);
  assert.equal(edited.recognition?.status, 'needs_review');
  const merged = mergeTextFields(box, { ...box, boxId: 'box_002' });
  assert.equal(merged.inputRegions!.length, 4);
  assert.equal(new Set(merged.inputRegions!.map(region => region.regionId)).size, 4);
  assert.deepEqual(merged.normalizedCoords, box.normalizedCoords);
  assert.throws(() => editBoxRegions(box, []), /EMPTY/);
  assert.throws(() => mergeTextFields(box, { ...box, boxType: 'checkbox' }), /ONLY_TEXT/);
  const split = splitTextField(box, ['box_002']);
  assert.equal(split.length, 2);
  assert.deepEqual(split[1].normalizedCoords, box.inputRegions![1].normalizedCoords);
  assert.equal(split[1].rawText, '');
  assert.throws(() => validateManifest({ ...manifest, boxes: split }), /INVALID_MANIFEST/);
});

test('slugifyBoxId sanitizes accented text, punctuation and clamps length to 64 chars', () => {
  assert.equal(slugifyBoxId('Mục [04]: Tên người nộp thuế!'), 'Muc_04_Ten_nguoi_nop_thue');
  assert.equal(slugifyBoxId('Người sử dụng lao động (Bên A)'), 'Nguoi_su_dung_lao_dong_Ben_A');
  assert.equal(slugifyBoxId(''), 'box_1');
  assert.equal(slugifyBoxId('   ---   '), 'box_1');
  assert.equal(slugifyBoxId('a'.repeat(100)).length, 64);
  const splitDirty = splitTextField(manifest.boxes[0], ['Ô số 2: Họ và tên']);
  assert.equal(splitDirty[1].boxId, 'O_so_2_Ho_va_ten');
  assert.equal(splitDirty[1].inputRegions![0].regionId, 'O_so_2_Ho_va_ten_region_1');
});
