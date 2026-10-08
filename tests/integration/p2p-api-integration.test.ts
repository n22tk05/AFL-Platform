import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { APP_ROUTES } from '@/shared/routes';
import { loadCitizenWorkflow, listCitizenForms } from '@/modules/forms/services/citizen-workflow.client';
import type { FormWorkflow } from '@/shared/contracts';
import { parseReviewWorkflowEditor } from '@/modules/forms/services/form-api.client';

const workflow: FormWorkflow = {
  formId: 'server-id', formCode: 'TEST/A', formTitle: 'Actual template', status: 'ACTIVE',
  steps: [{ stepIndex: 1, boxId: 'box_1', sectionName: 'I', label: 'Full name', voiceGuidance: 'Enter your full name.',
    exampleRedText: 'FULL NAME', audioUrl: '', highlightCoords: [0.1, 0.2, 0.3, 0.8], faqs: [] }],
};
const values = new Map<string, string>([['afl_workflow_published_local', JSON.stringify({ ...workflow, templateId: 'local' })]]);
const storage = {
  get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); },
};

test('route helpers address real explicit route directories and encode form codes', () => {
  assert.equal(APP_ROUTES.library, '/admin/library');
  assert.equal(APP_ROUTES.guide, '/citizen/guide');
  assert.equal(APP_ROUTES.review('TEST/A'), '/admin/review/TEST%2FA');
});

test('an incomplete review JSON cannot crash step/image editors', () => {
  assert.deepEqual(parseReviewWorkflowEditor(JSON.stringify(workflow)), workflow);
  for (const value of [null, 12, { steps: [null] }, { ...workflow, steps: [{ ...workflow.steps[0], sectionName: 5 }] },
    { ...workflow, steps: [{ ...workflow.steps[0], highlightCoords: [1, 0, 0, 1] }] }]) {
    assert.equal(parseReviewWorkflowEditor(JSON.stringify(value)), undefined);
  }
  assert.equal(parseReviewWorkflowEditor('{'), undefined);
});

test('public failures never resurrect an ACTIVE browser publication', async () => {
  for (const status of [404, 503]) {
    await assert.rejects(loadCitizenWorkflow(workflow.formCode, {
      storage, fetcher: async () => Response.json({ success: false }, { status }),
    }), /WORKFLOW_UNAVAILABLE/);
  }
});

test('citizen list does not publish local forms after a successful empty server list', async () => {
  const result = await listCitizenForms({ storage, fetcher: async () => Response.json({ success: true, data: { forms: [] } }) });
  assert.deepEqual(result.forms, []);
});

test('live form is resolved by formCode without sending browser workflow data', async () => {
  const result = await loadCitizenWorkflow(workflow.formCode, { fetcher: async input => {
    assert.equal(input, '/api/forms/TEST%2FA/workflow');
    return Response.json({ success: true, data: workflow });
  } });
  assert.equal(result.workflow.formId, 'server-id');
  assert.equal(result.source, 'live');
  await assert.rejects(loadCitizenWorkflow(workflow.formCode, {
    fetcher: async () => Response.json({ success: true, data: { ...workflow, status: 'PENDING_REVIEW' } }),
  }));
});

test('actual review and citizen entry points use the API clients, not legacy publishers', () => {
  const review = fs.readFileSync('src/app/admin/review/[id]/page.tsx', 'utf8');
  const guide = fs.readFileSync('src/app/citizen/guide/page.tsx', 'utf8');
  assert.ok(review.includes('createAdminReviewSession'));
  assert.ok(!review.includes('/api/admin/publish'));
  assert.ok(!review.includes('FormStorageService.publish'));
  assert.ok(!/['"]x-admin-key['"]\s*:\s*['"][^'"]+['"]/.test(review));
  assert.ok(guide.includes('loadCitizenWorkflow'));
  assert.ok(!guide.includes('getCitizenWorkflow'));
});
