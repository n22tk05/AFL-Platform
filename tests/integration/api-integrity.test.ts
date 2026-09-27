import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
import { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';
import { PrismaFormRepository } from '@/modules/forms/repositories/prisma-form.repository';
import { FormController } from '@/modules/forms/controllers/form.controller';
import { validateManifest } from '@/modules/forms/services/form-validation.service';
import { PromptController } from '@/modules/voice-ai/controllers/prompt.controller';
import { VoiceQAController } from '@/modules/voice-ai/controllers/voice-qa.controller';
import { GeminiPromptService } from '@/modules/voice-ai/services/gemini-prompt.service';
import { TTSController } from '@/modules/voice-ai/controllers/tts.controller';
import { VoiceQAService } from '@/modules/voice-ai/services/voice-qa.service';
import { audioIdentity, isValidMp3, TTSService } from '@/modules/voice-ai/services/tts.service';
import { readLimitedJson } from '@/modules/shared/services/request-body.service';
import { FormWorkflow } from '@/shared/contracts';

async function main() {
  process.env.GOOGLE_TTS_API_KEY = '';
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '';
  process.env.GEMINI_API_KEY = '';
  const manifest = validateManifest(JSON.parse(fs.readFileSync('assets/mock-data/mock-manifest.json', 'utf8')));
  const fixture: FormWorkflow = JSON.parse(fs.readFileSync('assets/mock-data/mock-workflow.json', 'utf8'));
  const workflow = { ...fixture, formCode: manifest.formCode, formTitle: manifest.formTitle, status: 'pending_review' as const };
  const cache = { get: () => null, set: () => {}, generateKey: () => 'test' } as any;
  const adminAuth = new AdminAuthorizationService(() => 'secret');
  assert.equal(adminAuth.authorize('Bearer secret'), 200);
  assert.equal(adminAuth.authorize(null, 'secret'), 200);
  await assert.rejects(readLimitedJson(new Request('http://local', { method: 'POST', body: 'x'.repeat(20) }), 10), /REQUEST_TOO_LARGE/);
  let aiCalls = 0;
  let saveCalls = 0;
  const prompt = new PromptController(
    { generateWorkflow: async () => { aiCalls++; return workflow; } } as any,
    { saveDraft: async () => { saveCalls++; return { workflowId: 'id' }; } } as any,
    new AdminAuthorizationService(() => 'secret')
  );
  assert.equal((await prompt.generate({ manifest })).status, 401);
  assert.equal((await prompt.generate({ manifest, adminKey: 'wrong' })).status, 401);
  assert.equal(aiCalls, 0);
  assert.equal(saveCalls, 0);
  assert.equal((await new PromptController({ generateWorkflow: async () => { throw Error('called'); } } as any,
    {} as any, new AdminAuthorizationService(() => undefined)).generate({ manifest, adminKey: 'secret' })).status, 503);
  const invalidManifest = { ...manifest, boxes: [manifest.boxes[0], manifest.boxes[0]] };
  assert.equal((await prompt.generate({ manifest: invalidManifest, adminKey: 'secret' })).status, 400);
  assert.throws(() => validateManifest({ ...manifest, boxes: [{ ...manifest.boxes[0], normalizedCoords: [0.8, 0.1, 0.2, 0.9] }] }));
  assert.throws(() => validateManifest({ ...manifest, boxes: [{ ...manifest.boxes[0], normalizedCoords: [0, 0, Number.POSITIVE_INFINITY, 1] }] }));
  assert.throws(() => validateManifest({ ...manifest, boxes: [{ ...manifest.boxes[0], boxId: '../escape' }] }));

  let ttsCalls = 0;
  const tts = new TTSController({ synthesizeSpeech: async () => { ttsCalls++; throw Error('called'); } } as any,
    new AdminAuthorizationService(() => 'secret'));
  assert.equal((await tts.synthesize({ text: 'xin chào', stepIndex: 1, adminKey: 'wrong' })).status, 401);
  assert.equal((await tts.synthesize({ text: 'xin chào', stepIndex: '../outside', adminKey: 'secret' })).status, 400);
  assert.equal(ttsCalls, 0);
  assert.equal((await new TTSController({ synthesizeSpeech: async () => { throw Error('called'); } } as any,
    new AdminAuthorizationService(() => undefined)).synthesize({ text: 'xin chào', stepIndex: 1, adminKey: 'secret' })).status, 503);

  const first = audioIdentity('Form A', 1, 'NORTH').fileName;
  const second = audioIdentity('Form B', 1, 'NORTH').fileName;
  const south = audioIdentity('Form A', 1, 'SOUTH').fileName;
  assert.equal(new Set([first, second, south]).size, 3);
  assert.match(first, /^[a-f0-9]{64}\.mp3$/);
  assert.throws(() => audioIdentity('Form A', '../escape' as unknown as number, 'NORTH'));
  assert.equal(path.dirname(path.join('public/audio', first)), path.join('public', 'audio'));
  assert.equal(isValidMp3(Buffer.from('MOCK_MP3_AUDIO_CONTENT')), false);
  assert.equal(isValidMp3(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(1500)])), false);
  assert.equal(isValidMp3(Buffer.concat([Buffer.from([0xff, 0xf3, 0x84, 0xc4]), Buffer.alloc(1500)])), false);
  const noCloud = new TTSService(cache, { save: async () => {}, getByCacheKey: async () => null } as any);
  await assert.rejects(noCloud.synthesizeSpeech('No fake audio', 999, 'NORTH'), /TTS_UNAVAILABLE/);
  assert.equal(fs.existsSync(path.join('public', 'audio', audioIdentity('No fake audio', 999, 'NORTH').fileName)), false);
  const singleBox = { ...manifest, formId: 'other_form', formCode: 'OTHER', boxes: [manifest.boxes[0]] };
  await assert.rejects(new GeminiPromptService(cache).generateWorkflow(singleBox), /AI_UNAVAILABLE/);
  const sampleFallback = await new GeminiPromptService(cache).generateWorkflow(manifest);
  assert.equal(sampleFallback.status, 'pending_review');
  assert.equal(sampleFallback.steps.length, manifest.boxes.length);
  const invalidGemini = new GeminiPromptService(cache) as any;
  invalidGemini.apiKey = 'fake';
  invalidGemini.getClient = () => ({ models: { generateContent: async () => ({ text: JSON.stringify([{ boxId: 'wrong_box' }]) }) } });
  await assert.rejects(invalidGemini.generateWorkflow(singleBox), /AI_UNAVAILABLE/);

  let draftWrites = 0;
  const activeDb = { $transaction: async (callback: any) => callback({
    formTemplate: { findUnique: async () => ({ status: 'ACTIVE' }), upsert: async () => { draftWrites++; } },
  }) } as any;
  await assert.rejects(new PrismaFormRepository(activeDb).saveDraft(manifest, workflow), /FORM_ACTIVE/);
  assert.equal(draftWrites, 0);

  const offline = new FormPersistenceService({ approveWorkflow: async () => { throw Error('DB called'); } } as any,
    { check: async () => false, markOffline: () => {} });
  assert.deepEqual(await offline.approveWorkflow(manifest.formCode), { success: false, newStatus: 'DATABASE_UNAVAILABLE' });
  await assert.rejects(offline.getWorkflowByFormCode(manifest.formCode), /DATABASE_UNAVAILABLE/);
  const auth = new AdminAuthorizationService(() => 'secret');
  const formController = new FormController(offline, auth);
  assert.equal((await formController.approveWorkflow({ rawFormCode: manifest.formCode, adminKey: 'wrong', body: { reviewConfirmed: true } })).status, 401);
  assert.equal((await new FormController(offline, new AdminAuthorizationService(() => undefined)).approveWorkflow({
    rawFormCode: manifest.formCode, adminKey: 'secret', body: { reviewConfirmed: true },
  })).status, 503);
  assert.equal((await formController.approveWorkflow({ rawFormCode: manifest.formCode, adminKey: 'secret', body: {} })).status, 409);
  assert.equal((await formController.approveWorkflow({ rawFormCode: manifest.formCode, adminKey: 'secret', body: { reviewConfirmed: true } })).status, 503);

  for (const status of ['DRAFT', 'PENDING_REVIEW', 'ARCHIVED']) {
    const db = { formTemplate: { findUnique: async () => ({ status, workflow: { status, steps: [{ stepIndex: 1 }] } }) } } as any;
    assert.equal(await new PrismaFormRepository(db).getWorkflowByFormCode(manifest.formCode), null);
  }
  const activeReadDb = { formTemplate: { findUnique: async () => ({
    id: 'form', formTitle: manifest.formTitle, formCode: manifest.formCode, status: 'ACTIVE',
    workflow: { status: 'ACTIVE', steps: [{ ...workflow.steps[0], audioUrl: '',
      highlightYmin: 0.1, highlightXmin: 0.1, highlightYmax: 0.2, highlightXmax: 0.2,
      requiresPrerequisiteDoc: false, sourceFieldFromPrerequisite: null, legalWarningFlag: false,
      faqs: [{ question: 'Q?', answer: 'A' }] }] },
  }) } } as any;
  assert.equal((await new PrismaFormRepository(activeReadDb).getWorkflowByFormCode(manifest.formCode))?.steps[0].audioUrl, '');

  for (const boxId of [undefined, 'wrong_box']) {
    let updates = 0;
    let audits = 0;
    const steps = boxId ? workflow.steps.map((step, index) => index === 0 ? { ...step, boxId } : step) : [];
    const db = { $transaction: async (callback: any) => callback({
      formTemplate: { findUnique: async () => ({ id: 'form', status: 'PENDING_REVIEW',
        manifest: { boxes: manifest.boxes.map(box => ({ boxId: box.boxId, boxYmin: box.normalizedCoords[0], boxXmin: box.normalizedCoords[1], boxYmax: box.normalizedCoords[2], boxXmax: box.normalizedCoords[3] })) },
        workflow: { id: 'workflow', status: 'PENDING_REVIEW', steps } }),
        updateMany: async () => { updates++; return { count: 1 }; } },
      formWorkflow: { update: async () => { updates++; } },
      formAuditLog: { create: async () => { audits++; } },
    }) } as any;
    await assert.rejects(new PrismaFormRepository(db).approveWorkflow(manifest.formCode, 'shared_admin_key'), /REVIEW_CONFLICT/);
    assert.equal(updates, 0);
    assert.equal(audits, 0);
  }

  const qa = new VoiceQAService();
  const question = 'Thông tin mẫu cần ghi gì?';
  const fromA = await qa.answerQuestion({ formCode: 'A', currentStep: { ...workflow.steps[0], faqs: [], exampleRedText: 'FORM A' }, userQuestion: question });
  const fromB = await qa.answerQuestion({ formCode: 'B', currentStep: { ...workflow.steps[0], faqs: [], exampleRedText: 'FORM B' }, userQuestion: question });
  assert.notEqual(fromA.answerText, fromB.answerText);
  const qaController = new VoiceQAController(qa, { getWorkflowByFormCode: async (formCode: string) =>
    formCode === 'DRAFT' ? null : { steps: [{ ...workflow.steps[0], faqs: [], exampleRedText: formCode }] } } as any);
  assert.equal((await qaController.answer({ formCode: 'DRAFT', stepIndex: 1, userQuestion: question })).status, 404);
  const qaA = await qaController.answer({ formCode: 'A', stepIndex: 1, userQuestion: question, currentStep: { exampleRedText: 'FORGED' } } as any);
  const qaB = await qaController.answer({ formCode: 'B', stepIndex: 1, userQuestion: question });
  assert.equal((qaA.body as any).data.answerText.includes('A'), true);
  assert.equal((qaB.body as any).data.answerText.includes('B'), true);
  console.log('PASS: admin, manifest, approval, public reads, audio identity/validity, QA isolation');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
