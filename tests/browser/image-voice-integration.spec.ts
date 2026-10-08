import { expect, test, type Page } from '@playwright/test';
import type { FormWorkflow } from '../../src/shared/contracts';
import sharp from 'sharp';

function form(code: string, status: FormWorkflow['status'] = 'ACTIVE'): FormWorkflow {
  return { formId: code, formCode: code, formTitle: `Biểu mẫu ${code}`, status, version: 1,
    steps: [1, 2].map(stepIndex => ({ stepIndex, boxId: `box_${stepIndex}`, sectionName: 'Thông tin', label: `Ô ${stepIndex}`,
      voiceGuidance: `Hướng dẫn riêng ${code} bước ${stepIndex}.`, audioUrl: '', exampleRedText: `VÍ DỤ ${stepIndex}`,
      highlightCoords: [0.2, 0.1, 0.3, 0.7], faqs: [{ question: 'Cần ghi gì?', answer: `Câu trả lời riêng ${code}.` }] })) };
}

async function mockSpeech(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as { spoken: string[]; SpeechRecognition: unknown };
    state.spoken = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak: (utterance: SpeechSynthesisUtterance) => { state.spoken.push(utterance.text); queueMicrotask(() => utterance.onend?.({} as SpeechSynthesisEvent)); }, cancel: () => {},
    } });
    state.SpeechRecognition = class {
      onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void;
      start() { this.onstart?.(); }
      stop() { this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'Bác điền gì vào đây?' }, isFinal: true }] }); this.onend?.(); }
      abort() { this.onend?.(); }
    };
  });
}
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken);

test('citizen reads different text per step/form and submits one authoritative-context Q&A per mic turn', async ({ page }) => {
  await mockSpeech(page);
  const questions: unknown[] = [];
  await page.route('**/api/forms/*/workflow', route => {
    const code = route.request().url().includes('FORM-B') ? 'FORM-B' : 'FORM-A';
    return route.fulfill({ json: { success: true, data: form(code) } });
  });
  await page.route('**/api/llm/qa', route => {
    questions.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, data: { answerText: 'Đây là câu trả lời đúng ngữ cảnh.' } } });
  });
  await page.goto('/citizen/guide?formCode=FORM-A');
  await expect.poll(() => spoken(page)).toContain('Hướng dẫn riêng FORM-A bước 1.');
  await page.getByRole('button', { name: 'Sang dòng kế tiếp' }).click();
  await expect.poll(() => spoken(page)).toContain('Hướng dẫn riêng FORM-A bước 2.');
  await page.goto('/citizen/guide?formCode=FORM-B');
  await expect.poll(() => spoken(page)).toContain('Hướng dẫn riêng FORM-B bước 1.');
  const microphone = page.getByRole('button', { name: 'Nhấn giữ để nói' });
  await expect(microphone).toBeEnabled();
  await microphone.focus(); await page.keyboard.down('Space');
  await expect(page.getByRole('button', { name: 'Đang nghe — nhả để gửi câu hỏi' })).toBeVisible();
  await page.keyboard.up('Space');
  await expect.poll(() => questions.length).toBe(1);
  expect(questions[0]).toEqual({ formCode: 'FORM-B', stepIndex: 1, userQuestion: 'Bác điền gì vào đây?' });
  await expect.poll(() => spoken(page)).toContain('Đây là câu trả lời đúng ngữ cảnh.');
  await expect(page.getByText('Chưa có ảnh phôi cho trang 1', { exact: false })).toBeVisible();
  await expect(page.locator('img[src*="01-lptb"]')).toHaveCount(0);
});

test('public 404/503 cannot display a local ACTIVE workflow or speak a fixture', async ({ page }) => {
  await mockSpeech(page);
  await page.addInitScript(() => localStorage.setItem('afl:forms:workflow:FORM-A', JSON.stringify({ formCode: 'FORM-A', status: 'ACTIVE', steps: [{ voiceGuidance: 'Sai từ cache' }] })));
  for (const status of [404, 503]) {
    await page.route('**/api/forms/*/workflow', route => route.fulfill({ status, json: { success: false } }));
    await page.goto('/citizen/guide?formCode=FORM-A');
    await expect(page.getByRole('heading', { name: status === 404 ? 'Không tìm thấy biểu mẫu đã ban hành' : 'Máy chủ tạm thời không khả dụng' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toHaveCount(status === 503 ? 1 : 0);
    expect(await spoken(page)).toEqual([]);
    await page.unroute('**/api/forms/*/workflow');
  }
});

test('admin review saves TTS metadata before confirming approval, using the shared key and real API envelope', async ({ page }) => {
  let draft = form('FORM-A', 'PENDING_REVIEW');
  const writes: FormWorkflow[] = [];
  let approvals = 0;
  await page.route('**/api/admin/forms/FORM-A/workflow', async route => {
    expect(route.request().headers()['x-admin-key']).toBe('secret');
    if (route.request().method() === 'PUT') { draft = route.request().postDataJSON(); writes.push(draft); }
    await route.fulfill({ json: { success: true, data: draft } });
  });
  await page.route('**/api/tts', route => {
    expect(route.request().headers()['x-admin-key']).toBe('secret');
    expect(route.request().postDataJSON()).toEqual({ text: draft.steps[0].voiceGuidance, stepIndex: 1, region: 'SOUTH' });
    return route.fulfill({ json: { success: true, data: { audioUrl: `/audio/${'a'.repeat(64)}.mp3`, wordTimestamps: [] } } });
  });
  await page.route('**/api/admin/forms/FORM-A/approve', route => {
    expect(route.request().headers()['x-admin-key']).toBe('secret');
    expect(route.request().postDataJSON().reviewConfirmed).toBe(true); approvals++;
    return route.fulfill({ json: { success: true, data: { formCode: 'FORM-A', status: 'ACTIVE', approvedAt: new Date().toISOString() } } });
  });
  await page.goto('/admin/review/FORM-A');
  await page.getByLabel('Khóa quản trị').fill('secret');
  await expect(page.getByText('Trạng thái máy chủ: PENDING_REVIEW')).toBeVisible();
  await page.getByText('Kiểm tra JSON workflow', { exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Workflow JSON' });
  const original = await editor.inputValue();
  await editor.fill(JSON.stringify({ ...draft, steps: [null] }));
  await expect(page.getByText('JSON workflow chưa có cấu trúc hợp lệ', { exact: false })).toBeVisible();
  await editor.fill(original);
  await page.getByRole('combobox', { name: 'Giọng đọc cho bước đang chọn' }).selectOption('SOUTH');
  await page.getByRole('button', { name: 'Tạo MP3 theo nội dung hiện tại' }).click();
  const approve = page.getByRole('button', { name: 'Phê duyệt qua API' });
  await expect(approve).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Lưu thay đổi trên máy chủ' })).toBeEnabled();
  await page.getByRole('button', { name: 'Lưu thay đổi trên máy chủ' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].steps[0].audioUrl).toBe(`/audio/${'a'.repeat(64)}.mp3`);
  await page.getByRole('checkbox', { name: 'Tôi đã đối soát toàn bộ' }).check();
  await approve.click();
  await expect(page.getByText('Trạng thái máy chủ: ACTIVE')).toBeVisible();
  expect(approvals).toBe(1);
});

test('actual OpenCV upload connects processed OCR pixels, reviewed manifest, server image and prompt', async ({ page }) => {
  test.setTimeout(90_000);
  let width = 0, height = 0;
  let promptManifest: { formCode: string; boxes: { rawText: string; normalizedCoords: number[] }[]; pages: unknown[] } | undefined;
  let assetCalls = 0;
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.route('**/api/documents/json', async route => {
    const contentType = route.request().headers()['content-type'];
    const multipart = await new Response(new Uint8Array(route.request().postDataBuffer()!), { headers: { 'Content-Type': contentType } }).formData();
    const file = multipart.get('file') as File;
    const dimensions = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    width = dimensions.width!; height = dimensions.height!;
    await route.fulfill({ json: { success: true, data: { status: 'success', source: { frame: 'processed-primary', pageCount: 1 },
      pages: [{ page: 1, width, height, coordinateSystem: 'normalized-xyxy' }], rawText: 'Họ tên', warnings: [],
      blocks: [{ id: 'label', page: 1, text: 'Họ tên', bbox: [0.02, 0.27, 0.25, 0.33] }],
      structure: { fields: [{ label: 'Họ tên', sourceBlockIds: ['label'] }], checkboxes: [] } } } });
  });
  await page.route('**/api/admin/forms/assets', async route => {
    expect(route.request().headers()['x-admin-key']).toBe('secret');
    const body = route.request().postDataJSON(); assetCalls++;
    expect(body.blankTemplateConfirmed).toBe(true);
    const dimensions = await sharp(Buffer.from(body.imageBase64.split(',')[1], 'base64')).metadata();
    expect([dimensions.width, dimensions.height]).toEqual([width, height]);
    await route.fulfill({ json: { success: true, data: { pageNumber: 1, width, height, imageUrl: `/api/forms/FORM-C/pages/1?asset=${'b'.repeat(64)}` } } });
  });
  await page.route('**/api/llm/prompt', async route => {
    expect(route.request().headers()['x-admin-key']).toBe('secret');
    promptManifest = route.request().postDataJSON().manifest;
    await route.fulfill({ json: { success: true, data: { formId: 'db-form-c' }, meta: { persisted: true } } });
  });
  await page.route('**/api/admin/forms/FORM-C/workflow', route => route.fulfill({ json: { success: true, data: form('FORM-C', 'PENDING_REVIEW') } }));
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('secret');
  await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill('FORM-C');
  await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill('Biểu mẫu C');
  const buffer = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 480;
    const context = canvas.getContext('2d')!; context.fillStyle = 'white'; context.fillRect(0, 0, 320, 480);
    context.fillStyle = 'black'; context.font = '14px Arial'; context.fillText('Họ tên', 10, 150);
    context.lineWidth = 2; context.strokeRect(120, 130, 180, 35);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles({ name: 'blank-template.png', mimeType: 'image/png', buffer });
  await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  const boxes = dialog.getByRole('combobox', { name: 'Ô cần đối soát' });
  await expect(boxes).toBeVisible({ timeout: 60_000 });
  while (await boxes.locator('option').count() > 1) await dialog.getByRole('button', { name: 'Loại ô không cần kê khai' }).click();
  await dialog.getByLabel('Nhãn thực trên phôi', { exact: true }).fill('Họ tên');
  await dialog.getByRole('checkbox', { name: 'Đã đối chiếu từng nhãn' }).check();
  await dialog.getByRole('button', { name: 'Lưu phôi và sinh kịch bản chờ duyệt' }).click();
  await expect(page).toHaveURL(/\/admin\/review\/FORM-C$/);
  expect(assetCalls).toBe(1); expect(promptManifest?.formCode).toBe('FORM-C');
  expect(promptManifest?.boxes).toHaveLength(1); expect(promptManifest?.boxes[0].rawText).toBe('Họ tên');
  expect(promptManifest?.pages).toHaveLength(1);
});
