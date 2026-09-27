import assert from 'node:assert/strict';
import { FormController } from '@/modules/forms/controllers/form.controller';
import { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
import { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';
import type { FormRepository } from '@/modules/forms/repositories/form.repository';
import type { FormWorkflow } from '@/shared/contracts';

const draft: FormWorkflow = {
  formId: 'form_1', formCode: '01/LPTB', formTitle: 'Draft form', status: 'draft', steps: [{
    stepIndex: 1, boxId: 'box_1', sectionName: 'I', label: 'Name', voiceGuidance: 'Say name',
    audioUrl: '', exampleRedText: 'NAME', highlightCoords: [0.1, 0.1, 0.9, 0.9], faqs: [{ question: 'What?', answer: 'This.' }],
  }],
};
let persisted = draft;
const repository = {
  listForms: async () => [{ formId: 'form_1', formCode: '01/LPTB', formTitle: 'Draft form', status: 'draft', version: 1, stepCount: 1, updatedAt: '2026-09-27T00:00:00.000Z' }],
  getWorkflowForReview: async () => persisted,
  saveReviewWorkflow: async (_code: string, value: FormWorkflow) => { persisted = value; return { workflowId: 'workflow_1', stepCount: value.steps.length }; },
} as unknown as FormRepository;
const service = new FormPersistenceService(repository, { check: async () => true, markOffline() {} });
const controller = new FormController(service, new AdminAuthorizationService(() => 'test-key'));
const auth = { authorization: 'Bearer test-key' };

async function run() {
  assert.equal((await controller.listForms({})).status, 401);
  const list = await controller.listForms(auth);
  assert.equal(list.status, 200);
  assert.equal((list.body as any).data.forms[0].status, 'draft');

  const review = await controller.getWorkflowForReview({ ...auth, rawFormCode: '01%2FLPTB' });
  assert.equal(review.status, 200, 'review endpoint includes draft workflows');
  assert.equal((review.body as any).data.steps.length, 1);

  const edited = { ...draft, formTitle: 'Edited draft' };
  const saved = await controller.saveReviewWorkflow({ ...auth, rawFormCode: '01%2FLPTB', body: edited });
  assert.equal(saved.status, 200);
  assert.equal(persisted.formTitle, 'Edited draft');

  assert.equal((await controller.saveReviewWorkflow({ ...auth, rawFormCode: '01%2FLPTB', body: { ...draft, formCode: 'other' } })).status, 400);
  assert.equal((await controller.listForms({ authorization: 'Bearer bad' })).status, 401);
  assert.equal((await new FormController(service, new AdminAuthorizationService(() => undefined)).listForms(auth)).status, 503);
  console.log('forms API controller tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
