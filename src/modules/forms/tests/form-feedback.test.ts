import assert from 'node:assert/strict';
import test from 'node:test';
import { templateFileError, formErrorMessage, citizenWorkflowFeedback } from '../services/form-feedback.client';
import { AdminApiError, listAdminForms } from '../services/form-api.client';
import { WorkflowReadError, fetchWorkflow } from '../client';
import { loadCitizenWorkflow } from '../services/citizen-workflow.client';

test('template selection rejects unsupported, empty and oversized files, accepting the exact size boundary', () => {
  assert.equal(templateFileError(null), null);
  assert.equal(templateFileError({ type: 'image/png', size: 8 * 1024 * 1024 }), null);
  assert.equal(templateFileError({ type: 'image/jpeg', size: 100 }), null);
  assert.match(templateFileError({ type: 'image/svg+xml', size: 100 })!, /JPEG hoặc PNG/);
  assert.match(templateFileError({ type: 'image/png', size: 0 })!, /rỗng/);
  assert.match(templateFileError({ type: 'image/png', size: 8 * 1024 * 1024 + 1 })!, /vượt 8 MB/);
});

test('admin errors are localized by status/code and never expose unrecognized server details', () => {
  for (const error of [new AdminApiError(401, 'UNAUTHORIZED', 'UNAUTHORIZED'), new AdminApiError(401, 'unknown', 'credential detail')]) {
    assert.match(formErrorMessage(error, 'fallback'), /Khóa quản trị không đúng/);
  }
  assert.match(formErrorMessage(new AdminApiError(503, 'ADMIN_KEY_UNCONFIGURED', 'raw'), 'fallback'), /chưa cấu hình/);
  assert.match(formErrorMessage(new AdminApiError(503, 'DATABASE_UNAVAILABLE', 'raw'), 'fallback'), /Cơ sở dữ liệu/);
  assert.match(formErrorMessage(new AdminApiError(503, 'AI_UNAVAILABLE', 'raw'), 'fallback'), /sinh kịch bản/);
  assert.equal(formErrorMessage(new AdminApiError(500, 'INTERNAL_SECRET', 'private SQL detail'), 'Lỗi an toàn.'), 'Lỗi an toàn.');
  assert.equal(formErrorMessage(new AdminApiError(500, '__proto__', 'private detail'), 'Lỗi an toàn.'), 'Lỗi an toàn.');
  assert.match(formErrorMessage(new TypeError('Failed to fetch'), 'fallback'), /kết nối/);
  assert.match(formErrorMessage(new Error('FRAME_MISMATCH'), 'fallback'), /không khớp/);
});

test('public workflow client retains 404 and 503 without using browser storage or fixtures', async () => {
  for (const status of [404, 503]) {
    await assert.rejects(loadCitizenWorkflow('DEMO-FE', {
      fetcher: async () => Response.json({ success: false }, { status }),
    }), reason => {
      assert.ok(reason instanceof WorkflowReadError);
      assert.equal(reason.status, status);
      const feedback = citizenWorkflowFeedback(reason, true);
      assert.equal(feedback.retryable, status === 503);
      assert.match(feedback.title, status === 503 ? /Máy chủ/ : /Không tìm thấy/);
      return true;
    });
  }
});

test('shared admin client preserves status/code but localizes the message for all consumers', async () => {
  await assert.rejects(listAdminForms('test-only', async () => Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'raw credential details' } }, { status: 401 })), reason => {
    assert.ok(reason instanceof AdminApiError);
    assert.equal(reason.status, 401);
    assert.equal(reason.code, 'UNAUTHORIZED');
    assert.match(reason.message, /Khóa quản trị không đúng/);
    assert.ok(!reason.message.includes('credential'));
    return true;
  });
});

test('malformed JSON and transport failure are retryable, not mislabeled as an unpublished form', async () => {
  for (const fetcher of [async () => new Response('not json', { status: 200 }),
    async () => { throw new TypeError('Network lost'); },
    async () => Response.json({ success: true, data: { formCode: 'OTHER' } })]) {
    await assert.rejects(fetchWorkflow('DEMO-FE', { fetcher }), reason => {
      assert.ok(reason instanceof WorkflowReadError);
      assert.equal(citizenWorkflowFeedback(reason, true).retryable, true);
      assert.equal(citizenWorkflowFeedback(reason, true).title, 'Chưa tải được hướng dẫn');
      return true;
    });
  }
});

test('missing form code does not invite retries and abort remains an abort rather than a visible service failure', async () => {
  assert.equal(citizenWorkflowFeedback(null, false).title, 'Bác chưa chọn biểu mẫu');
  assert.equal(citizenWorkflowFeedback(null, false).retryable, false);
  const controller = new AbortController();
  let release!: () => void;
  const pending = loadCitizenWorkflow('DEMO-FE', { signal: controller.signal, fetcher: async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return Response.json({ success: false }, { status: 503 });
  } });
  controller.abort(); release();
  await assert.rejects(pending, { name: 'AbortError' });
});
