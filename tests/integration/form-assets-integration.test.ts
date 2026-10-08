import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { FormArtifactStore } from '@/modules/forms/services/form-artifact-store';
import { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
import { handleFormAssetUpload } from '@/modules/forms/form-assets.api';
import { handleFormImage } from '@/modules/forms/form-image.api';
import { PrismaFormRepository } from '@/modules/forms/repositories/prisma-form.repository';
import { loadAdminTemplatePages } from '@/modules/forms/services/template-preview.client';
import { requestStepAudio } from '@/modules/voice-ai/services/tts.client';
import { audioIdentity, boundAudioUrlOrEmpty } from '@/modules/voice-ai/services/tts.service';
import { validateManifest } from '@/modules/forms/services/form-validation.service';
import { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';
import type { FormWorkflow, FormGeometricManifest } from '@/shared/contracts';

const auth = new AdminAuthorizationService(() => 'secret');
const workflow: FormWorkflow = { formId: 'FORM_A', formCode: 'FORM-A', formTitle: 'Form A', status: 'PENDING_REVIEW', circularInfo: 'Căn cứ đã kiểm tra',
  steps: [{ stepIndex: 1, boxId: 'box_001', pageNumber: 1, sectionName: 'I', label: 'Họ tên', voiceGuidance: 'Điền tên thật vào ô này.', audioUrl: '',
    highlightCoords: [0.2, 0.2, 0.3, 0.8], exampleRedText: 'VÍ DỤ', faqs: [{ question: 'Điền gì?', answer: 'Tên trên giấy tờ.' }] }] };

function tempStore(context: { after: (callback: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'afl-template-test-'));
  context.after(() => {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('afl-template-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, store: new FormArtifactStore(root) };
}
const image = () => sharp({ create: { width: 320, height: 240, channels: 3, background: 'white' } }).png().toBuffer();
const request = (body: unknown, key = 'secret') => new Request('http://local/api/admin/forms/assets', { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify(body) });

test('template metadata round-trips immutably; foreign frame, form and corrupt assets fail', async context => {
  const { store, root } = tempStore(context);
  const page = await store.saveImage(workflow.formCode, await image());
  const reference = await store.save({ ...workflow, pages: [page] });
  assert.equal(await store.save({ ...workflow, pages: [page] }), reference);
  const loaded = await new FormArtifactStore(root).read(reference, workflow.formCode);
  assert.deepEqual(loaded?.pages, [page]);
  assert.equal(loaded?.circularInfo, workflow.circularInfo);
  await assert.rejects(store.read(reference, 'FORM-B'), /UNAVAILABLE/);
  await assert.rejects(store.save({ ...workflow, pages: [{ ...page, width: 321 }] }), /INVALID_WORKFLOW/);
  await assert.rejects(store.save({ ...workflow, pages: [{ ...page, imageUrl: 'https://foreign/template.png' }] }), /INVALID_WORKFLOW/);
  assert.throws(() => store.readImage('../secret'), /INVALID_FORM_ASSET/);
  const asset = new URL(page.imageUrl, 'http://local').searchParams.get('asset')!;
  fs.writeFileSync(path.join(root, `${asset}.png`), Buffer.from('not an image'));
  await assert.rejects(store.read(reference, workflow.formCode), /UNAVAILABLE/);
});

test('template upload authorizes before body/storage, confirms privacy and keeps error status', async context => {
  const { store, root } = tempStore(context);
  assert.equal((await handleFormAssetUpload(request({}, 'wrong'), auth, store)).status, 401);
  assert.equal((await handleFormAssetUpload(request({}), new AdminAuthorizationService(() => undefined), store)).status, 503);
  assert.deepEqual(fs.readdirSync(root), []);
  const body = { formCode: workflow.formCode, blankTemplateConfirmed: true, imageBase64: `data:image/png;base64,${(await image()).toString('base64')}` };
  assert.equal((await handleFormAssetUpload(request({ ...body, blankTemplateConfirmed: false }), auth, store)).status, 400);
  assert.equal((await handleFormAssetUpload(request({ ...body, formCode: 'a\nsecret' }), auth, store)).status, 400);
  assert.equal((await handleFormAssetUpload(request({ ...body, imageBase64: 'data:image/gif;base64,YQ==' }), auth, store)).status, 415);
  assert.equal((await handleFormAssetUpload(request(body), auth, store)).status, 200);
  assert.equal((await handleFormAssetUpload(request(body), auth, { saveImage: async () => { throw Error('EACCES'); } } as never)).status, 503);
});

test('image routes do not expose drafts, foreign assets or unauthorized admin requests', async context => {
  const { store } = tempStore(context);
  const page = await store.saveImage(workflow.formCode, await image());
  const req = new Request(`http://local${page.imageUrl}`);
  let loads = 0;
  const denied = await handleFormImage(req, workflow.formCode, '1', { store, authorization: auth, load: async () => { loads++; return null; } });
  assert.equal(denied.status, 401); assert.equal(loads, 0);
  assert.equal((await handleFormImage(req, workflow.formCode, '1', { store, load: async () => null })).status, 404);
  assert.equal((await handleFormImage(req, workflow.formCode, '1', { store, load: async () => ({ ...workflow, pages: [page] }) })).status, 404);
  assert.equal((await handleFormImage(req, workflow.formCode, '1', { store, load: async () => { throw Error('DB offline'); } })).status, 503);
  assert.equal((await handleFormImage(req, 'FORM-B', '1', { store, load: async () => ({ ...workflow, pages: [page] }) })).status, 404);
  assert.equal((await handleFormImage(req, workflow.formCode, '../1', { store, load: async () => { loads++; return null; } })).status, 400);
  const published = { ...workflow, status: 'ACTIVE' as const, pages: [page] };
  const ok = await handleFormImage(req, workflow.formCode, '1', { store, load: async () => published });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.equal((await sharp(Buffer.from(await ok.arrayBuffer())).metadata()).width, 320);
});

test('authenticated preview preserves canonical metadata and never sends a key to a foreign URL', async () => {
  const page = { pageNumber: 1, width: 320, height: 240, imageUrl: `/api/forms/FORM-A/pages/1?asset=${'a'.repeat(64)}` };
  let calls = 0;
  const revoked: string[] = [];
  const options = { fetcher: async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++; assert.equal(String(url), page.imageUrl.replace('/api/forms/', '/api/admin/forms/'));
    assert.equal((init?.headers as Record<string, string>)['x-admin-key'], 'secret');
    return new Response('image bytes', { headers: { 'Content-Type': 'image/png' } });
  }, createUrl: () => 'blob:preview', revokeUrl: (url: string) => { revoked.push(url); } };
  const preview = await loadAdminTemplatePages('FORM-A', [page], 'secret', new AbortController().signal, options);
  assert.equal(preview.pages[0].imageUrl, 'blob:preview'); assert.ok(page.imageUrl.startsWith('/api/forms/'));
  preview.dispose(); assert.deepEqual(revoked, ['blob:preview']);
  await assert.rejects(loadAdminTemplatePages('FORM-A', [{ ...page, imageUrl: `https://attacker/?asset=${'a'.repeat(64)}` }], 'secret', new AbortController().signal, options), /INVALID_TEMPLATE_URL/);
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadAdminTemplatePages('FORM-A', [page], 'secret', controller.signal, options), /ABORTED/);
});

test('TTS envelope uses current text/region and stale or legacy audio cannot bind to another step', async () => {
  const north = `/audio/${audioIdentity(workflow.steps[0].voiceGuidance, 1, 'NORTH').fileName}`;
  const south = `/audio/${audioIdentity(workflow.steps[0].voiceGuidance, 1, 'SOUTH').fileName}`;
  assert.notEqual(north, south);
  assert.equal(boundAudioUrlOrEmpty(workflow.steps[0].voiceGuidance, 1, north), north);
  assert.equal(boundAudioUrlOrEmpty('Other form text', 1, north), '');
  assert.equal(boundAudioUrlOrEmpty(workflow.steps[0].voiceGuidance, 2, south), '');
  assert.equal(boundAudioUrlOrEmpty(workflow.steps[0].voiceGuidance, 1, '/audio/default.mp3'), '');
  const result = await requestStepAudio(workflow.steps[0].voiceGuidance, 1, 'SOUTH', 'secret', { fetcher: async (url, init) => {
    assert.equal(url, '/api/tts'); assert.equal((init?.headers as Record<string, string>)['x-admin-key'], 'secret');
    assert.deepEqual(JSON.parse(String(init?.body)), { text: workflow.steps[0].voiceGuidance, stepIndex: 1, region: 'SOUTH' });
    return Response.json({ success: true, data: { audioUrl: south } });
  } });
  assert.equal(result, south);
  await assert.rejects(requestStepAudio('text', 1, 'NORTH', 'secret', { fetcher: async () => Response.json({ success: true, data: { audioUrl: '/audio/default.mp3' } }) }), /TTS_HTTP/);
  await assert.rejects(requestStepAudio('text', '../outside' as never, 'NORTH', 'secret', { fetcher: async () => { throw Error('must not call'); } }), /INVALID_TTS/);
  await assert.rejects(requestStepAudio('text', 1, 'NORTH', 'secret', { timeoutMs: 5, fetcher: async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) }), /TTS_TIMEOUT/);
});

test('atomic draft persists an artifact reference and repository returns its pages after browser reload', async context => {
  const { store } = tempStore(context);
  const page = await store.saveImage(workflow.formCode, await image());
  const manifest: FormGeometricManifest = { formId: 'FORM_A', formCode: workflow.formCode, formTitle: workflow.formTitle,
    imageDimensions: { width: 320, height: 240 }, pages: [page], boxes: [{ boxId: 'box_001', rawText: 'Họ tên', boxType: 'text',
      estimatedWidthRatio: 0.6, normalizedCoords: workflow.steps[0].highlightCoords }] };
  let reference: string | null = null;
  let transactions = 0;
  const tx = {
    formTemplate: { findUnique: async () => null, upsert: async (input: { create: { originalPdfUrl: string | null } }) => { reference = input.create.originalPdfUrl; return { id: 'FORM_A' }; } },
    formGeometricManifest: { upsert: async () => ({ id: 'manifest' }) },
    formGeometricBox: { deleteMany: async () => {}, createMany: async () => {} },
    formWorkflow: { upsert: async () => ({ id: 'workflow' }) }, workflowStep: { deleteMany: async () => {}, create: async () => {} },
  };
  const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>, options: unknown) => {
    transactions++; assert.deepEqual(options, { isolationLevel: 'Serializable' }); return callback(tx);
  }, formTemplate: { findUnique: async () => ({ id: 'FORM_A', formCode: workflow.formCode, formTitle: workflow.formTitle, status: 'ACTIVE', version: 1,
    originalPdfUrl: reference, workflow: { status: 'ACTIVE', version: 1, steps: [{ ...workflow.steps[0], highlightYmin: 0.2, highlightXmin: 0.2,
      highlightYmax: 0.3, highlightXmax: 0.8, requiresPrerequisiteDoc: false, sourceFieldFromPrerequisite: null, legalWarningFlag: false }] } }) } };
  const repository = new PrismaFormRepository(db as never, store);
  await repository.saveDraft(manifest, { ...workflow, pages: [page] });
  assert.equal(transactions, 1); assert.match(reference!, /^afl-template-v1:[a-f0-9]{64}$/);
  const loaded = await repository.getWorkflowByFormCode(workflow.formCode);
  assert.deepEqual(loaded?.pages, [page]); assert.equal(loaded?.steps[0].pageNumber, 1); assert.equal(loaded?.circularInfo, workflow.circularInfo);
  assert.deepEqual((await repository.getWorkflowForReview(workflow.formCode))?.pages, [page]);
  assert.throws(() => validateManifest({ ...manifest, pages: [null] }), /INVALID_MANIFEST_PAGES/);
});

test('review updates manifest geometry transactionally, retains freshly bound audio and rejects altered frames', async context => {
  const { store } = tempStore(context);
  const page = await store.saveImage(workflow.formCode, await image());
  const reference = await store.save({ ...workflow, pages: [page] });
  const existing = { id: 'FORM_A', formCode: workflow.formCode, formTitle: workflow.formTitle, status: 'PENDING_REVIEW', originalPdfUrl: reference,
    manifest: { id: 'manifest', imageWidth: 320, imageHeight: 240, boxes: [{ boxId: 'box_001', rawText: 'Họ tên', boxType: 'TEXT', estimatedWidthRatio: 0.6, boxYmin: 0.2, boxXmin: 0.2, boxYmax: 0.3, boxXmax: 0.8 }] },
    workflow: { id: 'workflow', status: 'PENDING_REVIEW', steps: [{ ...workflow.steps[0], voiceGuidance: 'Old text' }] } };
  const created: { audioUrl: string | null }[] = []; let geometryWrites = 0; let mutations = 0;
  const tx = { formTemplate: { findUnique: async () => existing, updateMany: async () => { mutations++; return { count: 1 }; } },
    formWorkflow: { upsert: async () => ({ id: 'workflow' }) }, workflowStep: { deleteMany: async () => {}, create: async (input: { data: { audioUrl: string | null } }) => { created.push(input.data); } },
    formGeometricBox: { update: async () => { geometryWrites++; } } };
  const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) };
  const repository = new PrismaFormRepository(db as never, store);
  const audioUrl = `/audio/${audioIdentity(workflow.steps[0].voiceGuidance, 1, 'SOUTH').fileName}`;
  const changed = { ...workflow, pages: [page], steps: [{ ...workflow.steps[0], audioUrl, highlightCoords: [0.4, 0.2, 0.5, 0.8] as [number, number, number, number] }] };
  await repository.saveReviewWorkflow(workflow.formCode, changed);
  assert.equal(geometryWrites, 1); assert.equal(created[0].audioUrl, audioUrl);
  await repository.saveReviewWorkflow(workflow.formCode, { ...changed, steps: [{ ...changed.steps[0], voiceGuidance: 'Different text' }] });
  assert.equal(created[1].audioUrl, null);
  const before = mutations;
  await assert.rejects(repository.saveReviewWorkflow(workflow.formCode, { ...changed, pages: [{ ...page, width: 100 }] }), /INVALID_WORKFLOW/);
  assert.equal(mutations, before);
});

test('missing image or mismatched step geometry blocks approval before ACTIVE and audit mutations', async context => {
  const { store, root } = tempStore(context);
  const page = await store.saveImage(workflow.formCode, await image());
  const reference = await store.save({ ...workflow, pages: [page] });
  const existing = { id: 'FORM_A', status: 'PENDING_REVIEW', originalPdfUrl: reference,
    manifest: { imageWidth: 320, imageHeight: 240, boxes: [{ boxId: 'box_001', boxYmin: 0.2, boxXmin: 0.2, boxYmax: 0.3, boxXmax: 0.8 }] },
    workflow: { id: 'workflow', status: 'PENDING_REVIEW', steps: [{ ...workflow.steps[0], highlightYmin: 0.2, highlightXmin: 0.2, highlightYmax: 0.3, highlightXmax: 0.8 }] } };
  let mutations = 0;
  const mutate = async () => { mutations++; return { count: 1 }; };
  const tx = { formTemplate: { findUnique: async () => existing, updateMany: mutate }, formWorkflow: { update: mutate }, formAuditLog: { create: mutate } };
  const repository = new PrismaFormRepository({ $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as never, store);
  existing.workflow.steps[0].highlightXmax = 0.7;
  await assert.rejects(repository.approveWorkflow(workflow.formCode, 'shared_admin_key'), /REVIEW_CONFLICT/);
  assert.equal(mutations, 0);
  existing.workflow.steps[0].highlightXmax = 0.8;
  const asset = new URL(page.imageUrl, 'http://local').searchParams.get('asset')!;
  fs.unlinkSync(path.join(root, `${asset}.png`));
  await assert.rejects(repository.approveWorkflow(workflow.formCode, 'shared_admin_key'), /UNAVAILABLE/);
  assert.equal(mutations, 0);
});

test('a corrupt template fails closed without disabling the database for unrelated forms', async () => {
  let offline = 0;
  const fail = async () => { throw Error('FORM_ASSET_UNAVAILABLE'); };
  const service = new FormPersistenceService({ getWorkflowByFormCode: fail, getWorkflowForReview: fail, approveWorkflow: fail } as never,
    { check: async () => true, markOffline: () => { offline++; } });
  await assert.rejects(service.getWorkflowByFormCode('FORM-A'), /FORM_ASSET_UNAVAILABLE/);
  await assert.rejects(service.getWorkflowForReview('FORM-A'), /FORM_ASSET_UNAVAILABLE/);
  assert.deepEqual(await service.approveWorkflow('FORM-A'), { success: false, newStatus: 'FORM_ASSET_UNAVAILABLE' });
  assert.equal(offline, 0);
});
