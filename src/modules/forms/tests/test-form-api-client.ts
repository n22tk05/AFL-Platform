import assert from 'node:assert/strict';
import { fetchWorkflow, workflowStorageKey } from '@/modules/forms/client';
import type { FormWorkflow } from '@/shared/contracts';
import bundledLptb from '../../../../assets/mock-data/mock-workflow-tpl_01_lptb.json';
import { prepareWorkflowFixture } from '@/modules/forms/client';
import { AdminApiError, approveAdminWorkflow, createAdminReviewSession, listAdminForms, readAdminWorkflow, saveAdminWorkflow, type AdminApiFetch } from '@/modules/forms/services/form-api.client';

const workflow: FormWorkflow = {
  formCode: '01/LPTB', formTitle: 'Live', steps: [{
    stepIndex: 1, boxId: 'box_1', sectionName: 'I', label: 'Name', voiceGuidance: 'Say name',
    audioUrl: '', exampleRedText: 'NAME', highlightCoords: [0, 0, 1, 1], faqs: [],
  }],
};

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

async function run() {
  assert.equal(workflowStorageKey(' 01/lptb '), workflowStorageKey('01/LPTB'));
  const storage = new MemoryStorage();
  let requests = 0;
  const live = await fetchWorkflow('01/LPTB', {
    storage,
    fetcher: async () => { requests++; return Response.json({ success: true, data: workflow }); },
  });
  assert.equal(requests, 1);
  assert.equal(live.formTitle, 'Live');
  assert.equal(storage.getItem(workflowStorageKey('01/LPTB')), JSON.stringify(workflow));

  const fallback = { ...workflow, formTitle: 'Fixture' };
  const staleCached = { ...workflow, formTitle: 'Cached' };
  storage.setItem(workflowStorageKey('01/LPTB'), JSON.stringify(staleCached));
  const cached = await fetchWorkflow('01/LPTB', {
    storage, fallback,
    fetcher: async () => Response.json({ success: true, data: { ...workflow, steps: [] } }),
  });
  assert.equal(cached.formTitle, 'Cached', 'empty success responses are rejected and cache wins over fixture');

  storage.values.clear();
  const fixture = await fetchWorkflow('01/LPTB', {
    storage, fallback,
    fetcher: async () => Response.json({ success: true, data: { ...workflow, steps: [] } }),
  });
  assert.equal(fixture.formTitle, 'Fixture');

  for (const invalidSteps of [
    [{ ...workflow.steps[0], stepIndex: 2 }],
    [{ ...workflow.steps[0] }, { ...workflow.steps[0], stepIndex: 1, boxId: 'box_2' }],
    [{ ...workflow.steps[0] }, { ...workflow.steps[0], stepIndex: 3, boxId: 'box_3' }],
  ]) {
    const preserved = { ...workflow, formTitle: 'Preserved cache' };
    storage.setItem(workflowStorageKey('01/LPTB'), JSON.stringify(preserved));
    const result = await fetchWorkflow('01/LPTB', {
      storage, fallback,
      fetcher: async () => Response.json({ success: true, data: { ...workflow, steps: invalidSteps } }),
    });
    assert.equal(result.formTitle, 'Preserved cache', 'noncontiguous live steps fall back to the valid cache');
    assert.equal(storage.getItem(workflowStorageKey('01/LPTB')), JSON.stringify(preserved), 'malformed live data does not replace the valid cache');
  }

  storage.values.clear();
  const malformed = { ...workflow, steps: [{ stepIndex: 1, label: 'Missing required contract fields' }] } as unknown as FormWorkflow;
  const malformedFallback = await fetchWorkflow('01/LPTB', {
    storage, fallback,
    fetcher: async () => Response.json({ success: true, data: malformed }),
  });
  assert.equal(malformedFallback.formTitle, 'Fixture', 'malformed successful envelopes use the bundled fallback');
  assert.equal(storage.getItem(workflowStorageKey('01/LPTB')), null, 'malformed successful envelopes are never cached');

  storage.setItem(workflowStorageKey('01/LPTB'), JSON.stringify(malformed));
  const malformedCacheFallback = await fetchWorkflow('01/LPTB', {
    storage, fallback,
    fetcher: async () => { throw new Error('offline'); },
  });
  assert.equal(malformedCacheFallback.formTitle, 'Fixture', 'malformed cached workflows are rejected');

  const preparedFixture = prepareWorkflowFixture(bundledLptb as unknown as FormWorkflow, 'Mẫu số: 01/LPTB', ['01/LPTB']);
  assert.ok(preparedFixture, 'real LPTB bundled fixture matches its known alias');
  assert.equal(preparedFixture.steps[0].stepIndex, 1, 'fixture copy is converted to one-based indices');
  assert.equal(bundledLptb.steps[0].stepIndex, 0, 'imported fixture remains unchanged');
  assert.equal(prepareWorkflowFixture(bundledLptb as unknown as FormWorkflow, 'OTHER_FORM', ['OTHER_FORM']), null,
    'unrelated forms cannot consume LPTB fixture data');
  const offlineFixture = await fetchWorkflow('Mẫu số: 01/LPTB', {
    fallback: preparedFixture!, fetcher: async () => { throw new Error('offline'); },
  });
  assert.equal(offlineFixture.formCode, 'Mẫu số: 01/LPTB');
  assert.equal(offlineFixture.steps[0].stepIndex, 1, 'valid prepared bundled fixture works as offline fallback');

  await assert.rejects(fetchWorkflow('01/LPTB', {
    fetcher: async () => Response.json({ success: true, data: { ...workflow, steps: [] } }),
  }), /WORKFLOW_UNAVAILABLE/);
  console.log('forms client tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });

async function runAdminClientTests() {
  const calls: Array<{ url: string | URL | RequestInfo; init?: RequestInit }> = [];
  const fake = async (url: string | URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url, init });
    const data = init?.method === 'POST' ? { formCode: 'A/B', status: 'ACTIVE', approvedAt: 'now' }
      : init?.method === 'PUT' ? { formCode: 'A/B', workflowId: 'w1', stepCount: 1 }
        : String(url).endsWith('/workflow') ? workflow : { forms: [{ formId: 'f1', formCode: 'A/B', formTitle: 'Form', status: 'DRAFT', version: 1, stepCount: 1, updatedAt: 'now' }] };
    return Response.json({ success: true, data });
  };
  assert.equal((await listAdminForms('private-key', fake)).forms.length, 1);
  await readAdminWorkflow('A/B', 'private-key', fake);
  await saveAdminWorkflow('A/B', 'private-key', workflow, fake);
  assert.equal((await approveAdminWorkflow('A/B', 'private-key', { performedBy: '  Op\nName ', note: ' Note\ttext ' }, fake)).status, 'ACTIVE');
  assert.deepEqual(calls.map(call => [String(call.url), call.init?.method ?? 'GET']), [
    ['/api/admin/forms', 'GET'], ['/api/admin/forms/A%2FB/workflow', 'GET'],
    ['/api/admin/forms/A%2FB/workflow', 'PUT'], ['/api/admin/forms/A%2FB/approve', 'POST'],
  ]);
  assert.ok(calls.every(call => (call.init?.headers as Record<string, string>)['x-admin-key'] === 'private-key'));
  assert.deepEqual(JSON.parse(String(calls[3].init?.body)), { reviewConfirmed: true, performedBy: 'Op Name', note: 'Note text' });
  await assert.rejects(listAdminForms('bad', async () => Response.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })), (e: unknown) => e instanceof AdminApiError && e.status === 401 && e.isUnauthorized);
  await assert.rejects(listAdminForms('key', async () => Response.json({ success: false, error: { code: 'ADMIN_KEY_UNCONFIGURED' } }, { status: 503 })), (e: unknown) => e instanceof AdminApiError && e.status === 503 && e.isConfigurationError);
  let active = false;
  await assert.rejects(approveAdminWorkflow('A/B', 'key', { performedBy: 'Op', note: '' }, async () => Response.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE' } }, { status: 503 })), /DATABASE_UNAVAILABLE/);
  assert.equal(active, false, 'a rejected approve request produces no success value or ACTIVE state');
  console.log('admin forms API client tests passed');
}

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const ok = (data: unknown) => Response.json({ success: true, data });
const failure = (status: number, code: string) => Response.json({ success: false, error: { code } }, { status });

async function runReviewSessionTests() {
  const calls: string[] = [];
  let current = { ...workflow, status: 'DRAFT' } as FormWorkflow;
  const fetcher: AdminApiFetch = async (_url, init) => {
    const method = init?.method ?? 'GET'; calls.push(method);
    if (method === 'PUT') { current = JSON.parse(String(init?.body)); return ok({ workflowId: 'w' }); }
    if (method === 'POST') return ok({ formCode: '01/LPTB', status: 'ACTIVE', approvedAt: 'now' });
    return ok(current);
  };
  const session = createAdminReviewSession('01/LPTB', 'memory-key', fetcher);
  assert.equal((await session.load()).state.workflow?.status, 'DRAFT');
  session.setEditor(JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'Edited' }, null, 2));
  const beforeDirtyApprove = calls.length;
  const dirtyApproval = await session.approve({ performedBy: 'Op', note: '' });
  assert.equal(dirtyApproval.state.error, null);
  assert.deepEqual(calls.slice(beforeDirtyApprove), [], 'dirty editor blocks approval without POST');

  const failedFetch: AdminApiFetch = async (_url, init) => {
    calls.push(init?.method ?? 'GET');
    if (init?.method === 'PUT') return failure(503, 'DATABASE_UNAVAILABLE');
    return ok(current);
  };
  const failed = createAdminReviewSession('01/LPTB', 'key', failedFetch);
  await failed.load();
  const edited = JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'Keep my edit' }, null, 2);
  failed.setEditor(edited);
  const savedFailure = await failed.save();
  assert.equal(savedFailure.state.editor, edited, 'failed PUT preserves editor text');
  assert.equal(savedFailure.state.dirty, true);
  const callsBeforeBlocked = calls.length;
  await failed.approve({ performedBy: 'Op', note: '' });
  assert.deepEqual(calls.slice(callsBeforeBlocked), [], 'failed save remains dirty and blocks POST');

  const owned = createAdminReviewSession('01/LPTB', 'key', fetcher);
  await owned.load();
  const injected = JSON.stringify({ ...workflow, status: 'ACTIVE', formTitle: 'Injected' }, null, 2);
  owned.setEditor(injected);
  const callsBeforeOwnedSave = calls.length;
  const forged = await owned.save();
  assert.ok(forged.state.error instanceof Error, 'submitted server-owned ACTIVE status is rejected');
  assert.equal(forged.state.workflow?.status, 'DRAFT');
  assert.equal(calls.length, callsBeforeOwnedSave, 'invalid status never reaches PUT');
  owned.setEditor(JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'Normal' }, null, 2));
  const reconciled = await owned.save();
  assert.deepEqual(calls.slice(callsBeforeOwnedSave), ['PUT', 'GET'], 'successful PUT is followed by authoritative GET');
  assert.equal(reconciled.state.workflow?.formTitle, 'Normal');
  assert.equal(reconciled.state.dirty, false);
  const approved = await owned.approve({ performedBy: ' Op\nName ', note: ' note\ttext ' });
  assert.equal(approved.state.workflow?.status, 'ACTIVE');
  assert.deepEqual(calls.slice(-1), ['POST']);

  const getPending = deferred<Response>();
  const reconcileStarted = deferred<void>();
  const pendingCalls: string[] = [];
  const reconcileSession = createAdminReviewSession('01/LPTB', 'key', async (_url, init) => {
    pendingCalls.push(init?.method ?? 'GET');
    if (init?.method === 'PUT') return ok({ status: 'ACTIVE' });
    if (pendingCalls.length === 1) return ok({ ...workflow, status: 'DRAFT' });
    reconcileStarted.resolve();
    return getPending.promise;
  });
  await reconcileSession.load();
  reconcileSession.setEditor(JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'Reconciling' }, null, 2));
  const pendingSave = reconcileSession.save();
  await reconcileStarted.promise;
  assert.equal(reconcileSession.snapshot().busy, true);
  assert.equal(reconcileSession.snapshot().dirty, true, 'pending authoritative GET leaves submitted editor dirty');
  getPending.resolve(ok({ ...workflow, status: 'DRAFT', formTitle: 'Reconciling' }));
  assert.equal((await pendingSave).state.dirty, false);
  assert.deepEqual(pendingCalls, ['GET', 'PUT', 'GET']);

  // The PUT echo is not authoritative: the reconciled GET owns baseline and editor state.
  const authoritative = { ...workflow, status: 'PENDING_REVIEW', formTitle: 'Server normalized' } as FormWorkflow;
  const authoritativeCalls: Array<{ method: string; url: string; body?: unknown }> = [];
  let authoritativeReads = 0;
  const authoritativeSession = createAdminReviewSession('01/LPTB', 'key', async (url, init) => {
    const method = init?.method ?? 'GET';
    authoritativeCalls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'PUT') return ok({ workflowId: 'w-normalized' });
    authoritativeReads++;
    return ok(authoritativeReads === 1
      ? { ...workflow, status: 'DRAFT', formTitle: 'Original' }
      : authoritative);
  });
  await authoritativeSession.load();
  const submitted = { ...workflow, status: 'DRAFT', formTitle: 'Client submitted' } as FormWorkflow;
  authoritativeSession.setEditor(JSON.stringify(submitted, null, 2));
  const authoritativeResult = await authoritativeSession.save();
  assert.deepEqual(authoritativeCalls.map(call => call.method), ['GET', 'PUT', 'GET']);
  assert.deepEqual(authoritativeCalls[1].body, submitted);
  assert.deepEqual(authoritativeResult.state.workflow, authoritative);
  assert.equal(authoritativeResult.state.editor, JSON.stringify(authoritative, null, 2));
  assert.equal(authoritativeResult.state.workflow?.status, 'PENDING_REVIEW');
  assert.equal(authoritativeResult.state.dirty, false);

  for (const failedGet of [
    async () => { throw new Error('offline during reconciliation'); },
    async () => failure(401, 'UNAUTHORIZED'),
    async () => failure(503, 'ADMIN_KEY_UNCONFIGURED'),
  ]) {
    let gets = 0;
    const exactDraft = JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'Keep exact text' }, null, 2);
    const failedReconcile = createAdminReviewSession('01/LPTB', 'key', async (_url, init) => {
      if (init?.method === 'PUT') return ok({ workflowId: 'w' });
      if (++gets === 1) return ok({ ...workflow, status: 'DRAFT' });
      return failedGet();
    });
    await failedReconcile.load();
    failedReconcile.setEditor(exactDraft);
    const result = await failedReconcile.save();
    assert.equal(result.state.editor, exactDraft, 'failed reconciliation preserves exact edited text');
    assert.equal(result.state.dirty, true, 'failed reconciliation cannot clean the draft');
    const beforeApprove = gets;
    await failedReconcile.approve({ performedBy: 'Op', note: '' });
    assert.equal(gets, beforeApprove, 'dirty draft blocks approval POST after reconciliation failure');
  }
  let mismatchedGets = 0;
  const mismatchedReconcile = createAdminReviewSession('01/LPTB', 'key', async (_url, init) => {
    if (init?.method === 'PUT') return ok({ workflowId: 'w' });
    mismatchedGets++;
    return ok(mismatchedGets === 1 ? { ...workflow, status: 'DRAFT' } : { ...workflow, formCode: 'OTHER', status: 'DRAFT' });
  });
  await mismatchedReconcile.load();
  const mismatchedDraft = JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'Must survive identity mismatch' }, null, 2);
  mismatchedReconcile.setEditor(mismatchedDraft);
  const mismatchedResult = await mismatchedReconcile.save();
  assert.equal(mismatchedResult.state.editor, mismatchedDraft);
  assert.equal(mismatchedResult.state.dirty, true);
  assert.ok(mismatchedResult.state.error);
  const beforeMismatchApprove = mismatchedGets;
  await mismatchedReconcile.approve({ performedBy: 'Op', note: '' });
  assert.equal(mismatchedGets, beforeMismatchApprove, 'identity mismatch keeps approval blocked');

  const delayedReconcileGet = deferred<Response>();
  const staleReconcileStarted = deferred<void>();
  let staleARequests = 0;
  const staleA = createAdminReviewSession('01/LPTB', 'key-A', async (_url, init) => {
    staleARequests++;
    if (init?.method === 'PUT') return ok({ status: 'ACTIVE' });
    if (staleARequests === 1) return ok({ ...workflow, status: 'DRAFT' });
    staleReconcileStarted.resolve();
    return delayedReconcileGet.promise;
  });
  await staleA.load();
  staleA.setEditor(JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'A delayed reconcile' }, null, 2));
  const staleReconcilePromise = staleA.save();
  await staleReconcileStarted.promise;
  const frozenReconcileA = staleA.snapshot();
  staleA.invalidate();
  const reconcileB = createAdminReviewSession('OTHER', 'key-B', async () => ok({ ...workflow, formCode: 'OTHER', status: 'DRAFT', formTitle: 'B remains current' }));
  await reconcileB.load();
  delayedReconcileGet.resolve(ok({ ...workflow, status: 'DRAFT', formTitle: 'A result' }));
  const staleReconcileResult = await staleReconcilePromise;
  assert.equal(staleReconcileResult.stale, true, 'stale save reconciliation success is explicitly discarded');
  assert.deepEqual(staleReconcileResult.state, frozenReconcileA, 'late reconciliation success and finally preserve frozen A state');
  assert.equal(reconcileB.snapshot().workflow?.formTitle, 'B remains current');

  const delayedPut = deferred<Response>();
  const delayedA = createAdminReviewSession('01/LPTB', 'key-A', async (_url, init) => {
    if (init?.method === 'PUT') return delayedPut.promise;
    return ok({ ...workflow, status: 'DRAFT' });
  });
  await delayedA.load();
  delayedA.setEditor(JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'A edit' }, null, 2));
  const aSave = delayedA.save(); delayedA.invalidate();
  const sessionB = createAdminReviewSession('OTHER', 'key-B', async () => ok({ ...workflow, formCode: 'OTHER', status: 'DRAFT', formTitle: 'B' }));
  await sessionB.load();
  delayedPut.reject(new Error('late A failure'));
  const staleSave = await aSave;
  assert.equal(staleSave.stale, true);
  assert.equal(staleSave.state.error, null);
  assert.equal(sessionB.snapshot().workflow?.formTitle, 'B');

  const delayedLoad = deferred<Response>();
  const staleLoad = createAdminReviewSession('01/LPTB', 'key-A', async () => delayedLoad.promise);
  const staleLoadPromise = staleLoad.load(); staleLoad.invalidate();
  delayedLoad.reject(new Error('late A load failure'));
  assert.equal((await staleLoadPromise).stale, true, 'invalidated GET failure is explicitly stale');

  const delayedLoadSuccess = deferred<Response>();
  const staleLoadSuccess = createAdminReviewSession('01/LPTB', 'key-A', async () => delayedLoadSuccess.promise);
  const loadSuccessPromise = staleLoadSuccess.load();
  const frozenLoad = staleLoadSuccess.snapshot();
  staleLoadSuccess.invalidate();
  const loadB = createAdminReviewSession('OTHER', 'key-B', async () => ok({ ...workflow, formCode: 'OTHER', status: 'DRAFT', formTitle: 'B after late load' }));
  await loadB.load();
  const frozenLoadB = loadB.snapshot();
  delayedLoadSuccess.resolve(ok({ ...workflow, status: 'DRAFT', formTitle: 'late load' }));
  const staleLoaded = await loadSuccessPromise;
  assert.equal(staleLoaded.stale, true);
  assert.deepEqual(staleLoaded.state, frozenLoad, 'late load success and finally preserve the frozen A state');
  assert.deepEqual(loadB.snapshot(), frozenLoadB, 'late A load success cannot mutate replacement B');

  const delayedPost = deferred<Response>();
  const delayedApprovalSession = createAdminReviewSession('01/LPTB', 'key-A', async (_url, init) => init?.method === 'POST' ? delayedPost.promise : ok({ ...workflow, status: 'DRAFT' }));
  await delayedApprovalSession.load();
  const aApproval = delayedApprovalSession.approve({ performedBy: 'Op', note: '' });
  delayedApprovalSession.invalidate();
  const postB = createAdminReviewSession('OTHER', 'key-B', async () => ok({ ...workflow, formCode: 'OTHER', status: 'DRAFT', formTitle: 'B' }));
  await postB.load();
  delayedPost.reject(new Error('late A approval failure'));
  assert.equal((await aApproval).stale, true);
  assert.equal(postB.snapshot().workflow?.status, 'DRAFT');

  const delayedPutSuccess = deferred<Response>();
  const putSuccessCalls: string[] = [];
  const stalePutSuccess = createAdminReviewSession('01/LPTB', 'key-A', async (_url, init) => {
    const method = init?.method ?? 'GET'; putSuccessCalls.push(method);
    return method === 'PUT' ? delayedPutSuccess.promise : ok({ ...workflow, status: 'DRAFT' });
  });
  await stalePutSuccess.load();
  stalePutSuccess.setEditor(JSON.stringify({ ...workflow, status: 'DRAFT', formTitle: 'frozen A edit' }, null, 2));
  const putSuccessPromise = stalePutSuccess.save();
  const frozenPut = stalePutSuccess.snapshot();
  stalePutSuccess.invalidate();
  const successB = createAdminReviewSession('OTHER', 'key-B', async () => ok({ ...workflow, formCode: 'OTHER', status: 'DRAFT', formTitle: 'B unchanged' }));
  await successB.load();
  const frozenB = successB.snapshot();
  delayedPutSuccess.resolve(ok({ workflowId: 'w' }));
  const stalePutResult = await putSuccessPromise;
  assert.equal(stalePutResult.stale, true);
  assert.deepEqual(stalePutResult.state, frozenPut, 'late PUT success and finally preserve workflow, editor, error, message, and busy');
  assert.deepEqual(putSuccessCalls, ['GET', 'PUT'], 'stale PUT success does not start reconciliation GET');
  assert.deepEqual(successB.snapshot(), frozenB, 'late A PUT success cannot mutate replacement B');

  const delayedPostSuccess = deferred<Response>();
  const stalePostSuccess = createAdminReviewSession('01/LPTB', 'key-A', async (_url, init) => init?.method === 'POST'
    ? delayedPostSuccess.promise : ok({ ...workflow, status: 'DRAFT' }));
  await stalePostSuccess.load();
  const postSuccessPromise = stalePostSuccess.approve({ performedBy: 'Op', note: '' });
  const frozenPost = stalePostSuccess.snapshot();
  stalePostSuccess.invalidate();
  const postSuccessB = createAdminReviewSession('OTHER', 'key-B', async () => ok({ ...workflow, formCode: 'OTHER', status: 'DRAFT', formTitle: 'B after late approval' }));
  await postSuccessB.load();
  const frozenPostB = postSuccessB.snapshot();
  delayedPostSuccess.resolve(ok({ formCode: '01/LPTB', status: 'ACTIVE', approvedAt: 'now' }));
  const stalePostResult = await postSuccessPromise;
  assert.equal(stalePostResult.stale, true);
  assert.deepEqual(stalePostResult.state, frozenPost, 'late POST success and finally preserve the frozen A state');
  assert.deepEqual(postSuccessB.snapshot(), frozenPostB, 'late A POST success cannot mutate replacement B');

  const activeView = createAdminReviewSession('01/LPTB', 'key', async () => ok({ ...workflow, status: 'ACTIVE' }));
  await activeView.load();
  assert.equal(activeView.snapshot().workflow?.status, 'ACTIVE');
  const activeCalls: string[] = [];
  const viewOnly = createAdminReviewSession('01/LPTB', 'key', async (_url, init) => { activeCalls.push(init?.method ?? 'GET'); return ok({ ...workflow, status: 'ACTIVE' }); });
  await viewOnly.load(); await viewOnly.approve({ performedBy: 'Op', note: '' });
  assert.deepEqual(activeCalls, ['GET'], 'ACTIVE workflow remains view-only');

  await assert.rejects(createAdminReviewSession('A', 'key', async () => failure(503, 'ADMIN_KEY_UNCONFIGURED')).load().then(r => { throw r.state.error; }), (e: unknown) => e instanceof AdminApiError && e.isConfigurationError);
  await assert.rejects(createAdminReviewSession('A', 'key', async () => failure(401, 'UNAUTHORIZED')).load().then(r => { throw r.state.error; }), (e: unknown) => e instanceof AdminApiError && e.isUnauthorized);
  const nonActive = createAdminReviewSession('01/LPTB', 'key', async (_url, init) => init?.method === 'POST' ? ok({ formCode: '01/LPTB', status: 'PENDING_REVIEW' }) : ok({ ...workflow, status: 'DRAFT' }));
  await nonActive.load();
  const rejectedActive = await nonActive.approve({ performedBy: 'Op', note: '' });
  assert.equal(rejectedActive.state.workflow?.status, 'DRAFT', 'non-ACTIVE approval response does not produce ACTIVE state');
  assert.ok(rejectedActive.state.error);
  const wrongCodeApproval = createAdminReviewSession('01/LPTB', 'key', async (_url, init) => init?.method === 'POST'
    ? ok({ formCode: 'OTHER', status: 'ACTIVE', approvedAt: 'now' })
    : ok({ ...workflow, status: 'DRAFT' }));
  await wrongCodeApproval.load();
  const wrongCodeResult = await wrongCodeApproval.approve({ performedBy: 'Op', note: '' });
  assert.equal(wrongCodeResult.state.workflow?.status, 'DRAFT', 'mismatched approval identity is not admitted');
  assert.ok(wrongCodeResult.state.error);
}

runReviewSessionTests().catch(error => { console.error(error); process.exitCode = 1; });
runAdminClientTests().catch(error => { console.error(error); process.exitCode = 1; });
