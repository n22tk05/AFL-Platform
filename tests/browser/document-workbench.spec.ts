import { test, expect, type Page } from '@playwright/test';
import { assembleJson } from '../../src/modules/documents/json-assembler';

test.beforeEach(async ({ page }) => {
  // Browser fixtures never reach a real OCR provider or Gemini.
  await page.route('**/api/documents/**', route => route.fulfill({ status: 503, json: { success: false, error: { message_vi: 'Test provider not intercepted' } } }));
});

async function fixture(page: Page, blank = false) {
  return Buffer.from(await page.evaluate(blank => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 640;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, 480, 640);
    if (!blank) { ctx.font = '18px Arial'; ctx.fillStyle = '#cccccc'; for (let i = 0; i < 20; i++) ctx.fillText(`OCR FIXTURE ${i} 123456`, 20, 30 + i * 28); }
    return canvas.toDataURL('image/png').split(',')[1];
  }, blank), 'base64');
}
const extraction = {
  contractVersion: 2, status: 'extracted', documentType: 'traffic_violation_record', fullText: 'TEST/BB 900.000 dong',
  overallConfidence: 0.7, requiresReview: true, warnings: [], processingTimeMs: 1, deskewApplied: false,
  fields: { fineAmount: { key: 'fineAmount', label: 'Số tiền phạt', value: 900000, rawText: '900.000 dong',
    confidence: 0.5, evidenceText: '900.000 dong', sourceLineIds: ['l1'], sourceBoundingBoxes: [[0.2, 0.1, 0.3, 0.8]],
    status: 'needs_review', validationErrors: [] } },
};
const jsonDraft = (rawText = 'OCR FIXTURE 123456') => assembleJson({ provider: 'fixed-browser', fullText: rawText, lines: [], tokens: [], pageCount: 1, warnings: [] }, { documentId: 'browser-' + rawText, mimeType: 'image/png' });
async function choose(page: Page, blank = false) {
  await page.getByLabel('Chế Độ Nắn Phối Cảnh (OpenCV)').selectOption('clean-scan');
  await page.getByLabel('Hoặc Chọn File Ảnh Tùy Ý').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: await fixture(page, blank) });
}

test('workbench sends adaptive variants with geometry metadata, retains previews for three runs and releases URLs', async ({ page }) => {
  await page.addInitScript(() => {
    const live = new Set<string>(), create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); live.add(url); return url; };
    URL.revokeObjectURL = url => { live.delete(url); revoke(url); };
    Object.defineProperty(window, 'workbenchUrls', { get: () => live.size });
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let calls = 0;
  await page.route('**/api/documents/json', async route => {
    calls++; const bytes = route.request().postDataBuffer()!, body = bytes.toString('latin1');
    expect(body).toContain('name="contrast"'); expect(body).toContain('name="documentDetectionFailed"');
    expect(body).toContain('name="imageWarnings"'); expect(body).toContain('name="deskewApplied"');
    const offset = bytes.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([bytes.readUInt32BE(offset + 16), bytes.readUInt32BE(offset + 20)]).toEqual([480, 640]);
    await route.fulfill({ json: { success: true, data: jsonDraft() } });
  });
  await page.goto('/document-test');
  for (let i = 0; i < 3; i++) {
    await choose(page); await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Duyệt JSON', exact: true })).toBeVisible({ timeout: 60_000 });
    const image = page.getByTestId('workbench-evidence-image').locator('img'), primary = await image.getAttribute('src');
    await expect(page.getByText('Ảnh primary chưa nắn phối cảnh', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Bản tăng tương phản', exact: true }).click(); expect(await image.getAttribute('src')).not.toBe(primary);
    await page.getByRole('button', { name: 'Ảnh màu primary', exact: true }).click(); await expect(image).toHaveAttribute('src', primary!);
    expect(await page.evaluate(() => Reflect.get(window, 'workbenchUrls'))).toBeLessThanOrEqual(4);
  }
  expect(calls).toBe(3);
  await page.getByLabel('Chế Độ Nắn Phối Cảnh (OpenCV)').selectOption('upload-photo');
  await expect(page.getByRole('region', { name: 'Duyệt JSON', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xóa phiên và ảnh', exact: true }).click();
  await expect(page.getByTestId('workbench-evidence-image')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'workbenchUrls'))).toBe(0); expect(errors).toEqual([]);
});

test('JSON requires cloud text consent and field edits revoke confirmation and saved Session RAM', async ({ page }) => {
  await page.route('**/api/documents/extract', route => route.fulfill({ json: { success: true, data: extraction } }));
  await page.goto('/document-test'); await choose(page);
  const json = page.getByRole('button', { name: 'Trích Xuất JSON', exact: true });
  await expect(json).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check();
  await json.click();
  const save = page.getByRole('button', { name: 'Lưu Vào Session RAM', exact: true });
  await expect(save).toBeVisible({ timeout: 60_000 }); await expect(save).toBeDisabled();
  await page.getByLabel('Giá trị Số tiền phạt').fill('800000');
  await page.getByRole('button', { name: 'Xác nhận Số tiền phạt', exact: true }).click(); await save.click();
  await page.getByRole('button', { name: 'Chẩn Đoán & RAM' }).click();
  await expect(page.getByText('800.000 đồng', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dữ Liệu Cấu Trúc' }).click();
  await page.getByLabel('Giá trị Số tiền phạt').fill('700000'); await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Chẩn Đoán & RAM' }).click();
  await expect(page.getByText('Session RAM trống.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('afl_prerequisite_document_data'))).toBeNull();
  await page.getByLabel('Chế Độ Nắn Phối Cảnh (OpenCV)').selectOption('upload-photo');
  await page.getByRole('button', { name: 'Dữ Liệu Cấu Trúc' }).click(); await expect(save).toHaveCount(0);
});

test('offline demo is explicit, never saved to guide, and rejects arbitrary uploaded images', async ({ page }) => {
  let calls = 0; await page.route('**/api/documents/**', route => { calls++; return route.abort(); });
  await page.goto('/document-test');
  await page.getByRole('button', { name: 'Mô Phỏng Offline', exact: true }).click();
  await page.getByRole('button', { name: 'Biên Bản CSGT' }).click();
  await page.getByRole('button', { name: 'Trích Xuất JSON', exact: true }).click();
  await expect(page.getByText('Dữ Liệu Mô Phỏng', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Lưu Vào Session RAM', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Chẩn Đoán & RAM' }).click();
  await expect(page.getByText('Session RAM trống.', { exact: false })).toBeVisible();
  await choose(page); await page.getByRole('button', { name: 'Trích Xuất JSON', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Chế độ mô phỏng chỉ dùng ảnh tổng hợp'); expect(calls).toBe(0);
});

test('stale response cannot restore output after image replacement or overwrite the next result', async ({ page }) => {
  await page.addInitScript(({ first, second }) => {
    const nativeFetch = window.fetch.bind(window); let calls = 0;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/api/documents/json')) {
        calls++;
        if (calls === 1) return new Promise<Response>(resolve => Reflect.set(window, 'releaseOldWorkbench', () => resolve(Response.json({ success: true, data: first }))));
        return Response.json({ success: true, data: second });
      }
      return nativeFetch(...args);
    };
  }, { first: jsonDraft('OLD RESPONSE'), second: jsonDraft('NEW RESPONSE') });
  await page.goto('/document-test'); await choose(page);
  await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'releaseOldWorkbench')), { timeout: 60_000 }).toBe('function');
  await choose(page); await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  await expect(page.getByTestId('json-preview')).toContainText('NEW RESPONSE', { timeout: 60_000 });
  await page.evaluate(() => Reflect.get(window, 'releaseOldWorkbench')());
  await expect(page.getByTestId('json-preview')).toContainText('NEW RESPONSE');
  await expect(page.getByTestId('json-preview')).not.toContainText('OLD RESPONSE');
  await page.getByRole('button', { name: 'Mô Phỏng Offline', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Duyệt JSON', exact: true })).toHaveCount(0);
});

test('camera detection failure offers explicit whole-image OCR and preserves the original preview', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/documents/json', route => {
    calls++; expect(route.request().postDataBuffer()!.toString('latin1')).toContain('DOCUMENT_DETECTION_FAILED');
    return route.fulfill({ json: { success: true, data: jsonDraft() } });
  });
  await page.goto('/document-test'); await choose(page, true);
  await page.getByLabel('Chế Độ Nắn Phối Cảnh (OpenCV)').selectOption('camera-photo');
  await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  const full = page.getByRole('button', { name: 'Thử đọc toàn ảnh', exact: true });
  await expect(full).toBeVisible({ timeout: 60_000 }); expect(calls).toBe(0);
  await expect(page.getByTestId('workbench-evidence-image')).toBeVisible();
  await full.click(); await expect(page.getByRole('region', { name: 'Duyệt JSON', exact: true })).toBeVisible({ timeout: 60_000 });
  expect(calls).toBe(1); await expect(page.getByText('Ảnh primary chưa nắn phối cảnh', { exact: true })).toBeVisible();
});

test('blank result never appears successful and error review retains unreadable source regions', async ({ page }) => {
  const review = { attempts: [], selectedAttempt: 1, selectionReason: 'EMPTY', regions: [{ boundingBox: [0.1, 0.2, 0.3, 0.8], status: 'unreadable', reason: 'OCR_EMPTY', sources: [] }], warnings: [], requiresReview: true, documentDetectionFailed: false };
  await page.route('**/api/documents/json', route => route.fulfill({ status: 422, json: { success: false, data: jsonDraft(''), error: { message_vi: 'Chưa đọc được vùng này.', ocrReview: review } } }));
  await page.goto('/document-test'); await choose(page, true);
  await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Chưa đọc được vùng này', { timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Vùng cần kiểm tra', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Duyệt JSON', exact: true }).getByRole('button', { name: 'Tải .json', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Duyệt JSON', exact: true })).toContainText('Trạng thái xử lý: failed');
  await page.route('**/api/documents/extract', route => route.fulfill({ json: { success: true, data: { ...extraction, fullText: '', fields: {}, status: 'manual_review_required' } } }));
  await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check();
  await page.getByRole('button', { name: 'Trích Xuất JSON', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Chưa đọc được vùng này', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Lưu Vào Session RAM', exact: true })).toBeDisabled();
});
