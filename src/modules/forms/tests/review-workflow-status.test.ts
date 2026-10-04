import assert from 'node:assert/strict';
import test from 'node:test';
import type { FormRepository } from '@/modules/forms/repositories/form.repository';
import { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';
import type { FormWorkflow } from '@/shared/contracts';

test('saveReviewWorkflow accepts canonical PENDING_REVIEW and reaches repository save', async () => {
  let saved = false;
  const workflow: FormWorkflow = {
    formCode: 'TEST-REVIEW',
    formTitle: 'Review workflow',
    status: 'PENDING_REVIEW',
    steps: [{
      stepIndex: 1,
      boxId: 'box-1',
      sectionName: 'Applicant',
      label: 'Full name',
      voiceGuidance: 'Enter your full name',
      audioUrl: '',
      exampleRedText: 'FULL NAME',
      highlightCoords: [0.1, 0.1, 0.5, 0.2],
      faqs: [{ question: 'What should I enter?', answer: 'Your full name.' }],
    }],
  };
  const repository = {
    saveReviewWorkflow: async (formCode: string, savedWorkflow: FormWorkflow) => {
      saved = formCode === workflow.formCode && savedWorkflow === workflow;
      return { workflowId: 'workflow-1', stepCount: savedWorkflow.steps.length };
    },
  } as FormRepository;
  const service = new FormPersistenceService(repository, {
    check: async () => true,
    markOffline: () => assert.fail('database should remain online'),
  });

  const result = await service.saveReviewWorkflow(workflow.formCode, workflow);

  assert.equal(saved, true);
  assert.deepEqual(result, { workflowId: 'workflow-1', stepCount: 1 });
});