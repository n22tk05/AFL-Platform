import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideController, createGuideStepView } from '../../../app/(citizen)/guide/guide-behavior';
import { DocumentSession } from '../session';
import type { StructuredDocumentResult } from '@/shared/document-extraction.types';
import type { WorkflowStep } from '@/shared/contracts';

const prerequisiteStep = {
  requiresPrerequisiteDoc: true,
  sourceFieldFromPrerequisite: 'so_tien_phat',
  exampleRedText: 'STATIC WORKFLOW EXAMPLE',
} as WorkflowStep;

function extraction(value: number): StructuredDocumentResult {
  return {
    fields: {
      fineAmount: { value, rawText: String(value), confidence: 1, evidenceText: String(value), sourceLineIds: [], status: 'accepted' },
    },
    documentType: 'traffic_violation_record',
    provider: 'test',
  } as unknown as StructuredDocumentResult;
}

test('guide prerequisite display follows reviewed session updates and fallback', () => {
  const session = new DocumentSession();
  let displayed = createGuideStepView(prerequisiteStep, session.read(), { nextStep() {} }).exampleText;
  const unsubscribe = session.subscribe(() => { displayed = createGuideStepView(prerequisiteStep, session.read(), { nextStep() {} }).exampleText; });

  assert.equal(displayed, 'CHƯA CÓ DỮ LIỆU CHỨNG TỪ ĐÃ DUYỆT');
  session.save(extraction(900000), {});
  assert.equal(displayed, '900.000 ĐỒNG');
  session.save(extraction(1250000), {});
  assert.equal(displayed, '1.250.000 ĐỒNG');
  unsubscribe();
  session.clear();
});

test('guide next-step action clears only on final completion and alerts', () => {
  const session = new DocumentSession();
  session.save(extraction(900000), {});
  let stepIndex = 0;
  const totalSteps = 2;
  let clears = 0;
  let alertMessage = '';
  const unsubscribe = session.subscribe(() => {
    if (session.read() === null) clears += 1;
  });
  const controller = createGuideController({
    getStepIndex: () => stepIndex,
    getTotalSteps: () => totalSteps,
    setStepIndex: update => { stepIndex = update(stepIndex); },
    clearSession: () => session.clear(),
    complete: () => { alertMessage = 'completed workflow'; },
  });

  createGuideStepView(prerequisiteStep, session.read(), controller).onNext();
  assert.equal(stepIndex, 1);
  assert.equal(clears, 0);
  assert.equal(alertMessage, '');
  createGuideStepView(prerequisiteStep, session.read(), controller).onNext();
  assert.equal(stepIndex, 1);
  assert.equal(clears, 1);
  assert.equal(alertMessage, 'completed workflow');
  unsubscribe();
});
