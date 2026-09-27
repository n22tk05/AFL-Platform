import assert from 'node:assert/strict';
import { FormController } from '@/modules/forms/controllers/form.controller';
import { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
import { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';
import type { FormRepository } from '@/modules/forms/repositories/form.repository';
import { PrismaFormRepository } from '@/modules/forms/repositories/prisma-form.repository';
import { PUT as reviewWorkflowPut } from '@/app/api/admin/forms/[formCode]/workflow/route';
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

function makePrismaFake(status = 'DRAFT', mutateActiveBeforeGuard = false, exists = true) {
  const effects = { guardedWrites: 0, stepDeletes: 0, stepCreates: 0, upserts: 0 };
  const existing: any = {
    id: 'form_1', formCode: '01/LPTB', formTitle: 'Draft form', status, version: 1,
    manifest: { imageWidth: 100, imageHeight: 100, boxes: [
      { boxId: 'box_1', rawText: 'Name', boxType: 'TEXT', estimatedWidthRatio: 0.5, boxYmin: 0.1, boxXmin: 0.1, boxYmax: 0.9, boxXmax: 0.9 },
      { boxId: 'box_2', rawText: 'Address', boxType: 'TEXT', estimatedWidthRatio: 0.5, boxYmin: 0.1, boxXmin: 0.1, boxYmax: 0.9, boxXmax: 0.9 },
    ] }, workflow: null,
  };
  const tx: any = {
    formTemplate: {
      findUnique: async () => existing,
      updateMany: async (args: any) => {
        effects.guardedWrites++;
        assert.deepEqual(args.where.status.in, ['DRAFT', 'PENDING_REVIEW']);
        if (mutateActiveBeforeGuard) existing.status = 'ACTIVE';
        if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_REVIEW') return { count: 0 };
        existing.status = args.data.status;
        return { count: 1 };
      },
    },
    formWorkflow: { upsert: async () => { effects.upserts++; return { id: 'workflow_1' }; } },
    workflowStep: {
      deleteMany: async () => { effects.stepDeletes++; },
      create: async () => { effects.stepCreates++; },
    },
  };
  const database: any = {
    formTemplate: { findUnique: async () => exists ? existing : null },
    $transaction: async (callback: (transaction: any) => unknown) => callback(tx),
  };
  return { repository: new PrismaFormRepository(database), effects, existing };
}

const twoStepDraft: FormWorkflow = {
  ...draft,
  steps: [draft.steps[0], { ...draft.steps[0], stepIndex: 2, boxId: 'box_2', label: 'Address' }],
};

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

  let healthChecksForInvalid = 0;
  let repositoryWritesForInvalid = 0;
  const invalidSaveRepository = {
    ...repository,
    saveReviewWorkflow: async (code: string, value: FormWorkflow) => {
      repositoryWritesForInvalid++;
      return repository.saveReviewWorkflow(code, value);
    },
  } as FormRepository;
  const invalidSaveService = new FormPersistenceService(invalidSaveRepository, {
    check: async () => { healthChecksForInvalid++; return true; }, markOffline() {},
  });
  const invalidSaveController = new FormController(invalidSaveService, new AdminAuthorizationService(() => 'test-key'));
  const malformedWorkflows = [
    { ...draft, formTitle: '' },
    { ...draft, formTitle: 12 },
    { ...draft, steps: [{ ...draft.steps[0], label: 42 }] },
    { ...draft, steps: [{ ...draft.steps[0], audioUrl: 7 }] },
    { ...draft, steps: [{ ...draft.steps[0], legalWarningFlag: 'yes' }] },
    { ...draft, steps: [{ ...draft.steps[0], pageNumber: Number.NaN }] },
    { ...draft, steps: [{ ...draft.steps[0], faqs: [null] }] },
    { ...draft, pages: [{ pageNumber: 1, imageUrl: '/page.png', width: 100, height: '100' }] },
    { ...draft, totalPages: '1' },
  ];
  for (const body of malformedWorkflows) {
    const invalid = await invalidSaveController.saveReviewWorkflow({
      ...auth, rawFormCode: '01%2FLPTB', body,
    });
    assert.equal(invalid.status, 400, 'malformed review contract fields return HTTP 400');
    assert.equal((invalid.body as any).error.code, 'INVALID_WORKFLOW');
    assert.equal(healthChecksForInvalid, 0, 'invalid review fields stop before database health checks');
    assert.equal(repositoryWritesForInvalid, 0, 'invalid review fields stop before repository writes');
  }

  const omittedOptionals = { ...draft, formTitleVi: undefined, steps: [{ ...draft.steps[0], faqs: undefined }] };
  const validOptionalSave = await invalidSaveController.saveReviewWorkflow({
    ...auth, rawFormCode: '01%2FLPTB', body: omittedOptionals,
  });
  assert.equal(validOptionalSave.status, 200, 'contract optional fields may be omitted');
  assert.equal(healthChecksForInvalid, 1);
  assert.equal(repositoryWritesForInvalid, 1);

  assert.equal((await controller.saveReviewWorkflow({ ...auth, rawFormCode: '01%2FLPTB', body: { ...draft, formCode: 'other' } })).status, 400);
  assert.equal((await controller.listForms({ authorization: 'Bearer bad' })).status, 401);
  assert.equal((await new FormController(service, new AdminAuthorizationService(() => undefined)).listForms(auth)).status, 503);

  const draftWithoutWorkflow = makePrismaFake();
  draftWithoutWorkflow.existing.manifest = null;
  assert.equal((await draftWithoutWorkflow.repository.getWorkflowForReview('01/LPTB'))?.steps.length, 0,
    'existing draft without a workflow returns an editable empty draft context');
  const unknownDraft = makePrismaFake('DRAFT', false, false);
  assert.equal(await unknownDraft.repository.getWorkflowForReview('unknown'), null, 'unknown forms remain not found');
  const missingWorkflowService = new FormPersistenceService({
    ...repository, getWorkflowForReview: async () => null,
  } as FormRepository, { check: async () => true, markOffline() {} });
  assert.equal((await new FormController(missingWorkflowService, new AdminAuthorizationService(() => 'test-key'))
    .getWorkflowForReview({ ...auth, rawFormCode: 'unknown' })).status, 404);

  for (const invalid of [
    { ...twoStepDraft, steps: [{ ...twoStepDraft.steps[0], boxId: 'not-in-manifest' }, twoStepDraft.steps[1]] },
    { ...twoStepDraft, steps: [{ ...twoStepDraft.steps[0] }, { ...twoStepDraft.steps[1], boxId: 'box_1' }] },
    { ...twoStepDraft, steps: [{ ...twoStepDraft.steps[0], faqs: [] }, twoStepDraft.steps[1]] },
  ]) {
    const fake = makePrismaFake();
    await assert.rejects(fake.repository.saveReviewWorkflow('01/LPTB', invalid), /INVALID_WORKFLOW/);
    assert.deepEqual(fake.effects, { guardedWrites: 0, stepDeletes: 0, stepCreates: 0, upserts: 0 },
      'invalid edits are rejected before persistence writes');
  }

  for (const formTitle of ['', ' \t ']) {
    const fake = makePrismaFake();
    await assert.rejects(fake.repository.saveReviewWorkflow('01/LPTB', { ...twoStepDraft, formTitle }), /INVALID_WORKFLOW/);
    assert.deepEqual(fake.effects, { guardedWrites: 0, stepDeletes: 0, stepCreates: 0, upserts: 0 },
      'blank form titles are rejected before any persistence writes');
  }

  const racedApproval = makePrismaFake('DRAFT', true);
  await assert.rejects(racedApproval.repository.saveReviewWorkflow('01/LPTB', twoStepDraft), /REVIEW_CONFLICT/);
  assert.equal(racedApproval.effects.stepDeletes, 0, 'concurrent activation prevents workflow replacement');
  assert.equal(racedApproval.effects.upserts, 0);
  const alreadyActive = makePrismaFake('ACTIVE');
  await assert.rejects(alreadyActive.repository.saveReviewWorkflow('01/LPTB', twoStepDraft), /FORM_ACTIVE/);
  assert.equal(alreadyActive.effects.guardedWrites, 0, 'active forms are rejected before any write');

  const malformedUnauthenticated = new Request('http://localhost/api/admin/forms/01%2FLPTB/workflow', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{',
  });
  const malformedResponse = await reviewWorkflowPut(malformedUnauthenticated as any, { params: { formCode: '01/LPTB' } });
  assert.ok([401, 503].includes(malformedResponse.status), 'authorization precedes malformed JSON parsing');
  assert.ok(![400, 413].includes(malformedResponse.status));
  const malformedEnvelope = await malformedResponse.json();
  assert.ok(['UNAUTHORIZED', 'ADMIN_KEY_UNCONFIGURED'].includes(malformedEnvelope.error.code));
  const oversizedUnauthenticated = new Request('http://localhost/api/admin/forms/01%2FLPTB/workflow', {
    method: 'PUT', headers: { 'content-type': 'application/json', 'content-length': '131073' }, body: '{}',
  });
  const oversizedResponse = await reviewWorkflowPut(oversizedUnauthenticated as any, { params: { formCode: '01/LPTB' } });
  assert.ok([401, 503].includes(oversizedResponse.status), 'authorization precedes oversized body rejection');
  const oversizedEnvelope = await oversizedResponse.json();
  assert.ok(['UNAUTHORIZED', 'ADMIN_KEY_UNCONFIGURED'].includes(oversizedEnvelope.error.code));
  console.log('forms API controller tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
