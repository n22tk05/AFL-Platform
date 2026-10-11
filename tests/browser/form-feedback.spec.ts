import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

async function openUpload(page: Page) {
  await page.route('**/api/admin/forms', route => route.fulfill({ json: { success: true, data: { forms: [] } } }));
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('test-key-only');
  await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mã biểu mẫu', { exact: true }).fill('DEMO-FE');
  await dialog.getByLabel('Tên biểu mẫu', { exact: true }).fill('Test only');
  const buffer = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="white"/><text x="10" y="150">Ho ten</text><rect x="120" y="130" width="180" height="35" fill="none" stroke="black" stroke-width="2"/></svg>')).png().toBuffer();
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles({ name: 'valid-a.png', mimeType: 'image/png', buffer });
  await dialog.getByRole('checkbox', { name: 'Đây là phôi trống' }).check();
  return dialog;
}

const ocr = { success: true, data: { status: 'success', source: { frame: 'processed-primary', pageCount: 1 },
  pages: [{ page: 1, width: 320, height: 480, coordinateSystem: 'normalized-xyxy' }], rawText: 'OCR of valid A', warnings: [],
  blocks: [], structure: { fields: [], checkboxes: [] } } };

test('invalid replacement keeps reviewed draft, image and confirmations without calling AI/storage', async ({ page }) => {
  test.setTimeout(90_000);
  let writes = 0;
  await page.route('**/api/documents/json', route => route.fulfill({ json: ocr }));
  await page.route('**/api/llm/prompt', route => { writes++; return route.fulfill({ status: 500 }); });
  await page.route('**/api/admin/forms/assets', route => { writes++; return route.fulfill({ status: 500 }); });
  const dialog = await openUpload(page);
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Ô cần đối soát' })).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole('checkbox', { name: 'Đã đối chiếu từng nhãn' }).check();
  await expect(dialog.getByRole('button', { name: 'Lưu phôi và sinh kịch bản chờ duyệt' })).toBeEnabled();
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles({ name: 'invalid-b.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(dialog.getByRole('alert').filter({ hasText: 'Chỉ nhận ảnh JPEG hoặc PNG' })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Ô cần đối soát' })).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(1);
  await expect(dialog.getByText('Text OCR và cảnh báo nguồn', { exact: false })).toHaveCount(1);
  await expect(dialog.getByText('Ảnh đang chọn:', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Đây là phôi trống' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Đã đối chiếu từng nhãn' })).toBeChecked();
  await expect(dialog.getByLabel('Ảnh phôi', { exact: true })).toHaveValue('');
  expect(writes).toBe(0);
});

test('invalid replacement during OCR leaves the active analysis intact', async ({ page }) => {
  test.setTimeout(90_000);
  let release!: () => void;
  let started!: () => void;
  let finished!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const completed = new Promise<void>(resolve => { finished = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/documents/json', async route => {
    started(); await blocked;
    await route.fulfill({ json: ocr }).catch(() => {});
    finished();
  });
  const dialog = await openUpload(page);
  await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
  await requested;
  await expect(dialog.getByLabel('Ảnh phôi', { exact: true })).toBeEnabled();
  await dialog.getByLabel('Ảnh phôi', { exact: true }).setInputFiles({ name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
  release();
  await completed;
  await expect(dialog.getByRole('alert').filter({ hasText: 'Ảnh phôi rỗng' })).toBeVisible();
  await expect(dialog.getByText('Đang xử lý… Có thể đóng để hủy.')).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Ô cần đối soát' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Đây là phôi trống' })).toBeChecked();
});

test('service outage has a retry control, 404 does not, and retry requests fresh server data', async ({ page }) => {
  let reads = 0;
  let status = 503;
  await page.route('**/api/forms/*/workflow', route => {
    reads++;
    return route.fulfill({ status, json: { success: false } });
  });
  await page.goto('/citizen/guide?formCode=DEMO-FE');
  await expect(page.getByRole('heading', { name: 'Máy chủ tạm thời không khả dụng' })).toBeVisible();
  const previousReads = reads;
  status = 404;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Không tìm thấy biểu mẫu đã ban hành' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nhấn giữ để nói' })).toHaveCount(0);
  expect(reads).toBeGreaterThan(previousReads);
});

test('admin wrong key uses an actionable localized message', async ({ page }) => {
  await page.route('**/api/admin/forms', route => route.fulfill({ status: 401, json: { success: false, error: { code: 'UNAUTHORIZED' } } }));
  await page.goto('/admin/library');
  await page.getByLabel('Khóa quản trị', { exact: false }).fill('invalid-test-key');
  const message = page.getByRole('alert').filter({ hasText: 'Khóa quản trị không đúng' });
  await expect(message).toBeVisible();
  await expect(message).not.toContainText('UNAUTHORIZED');
});
