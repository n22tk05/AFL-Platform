import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const baseURL = process.env.DOCUMENT_TEST_URL ?? 'http://127.0.0.1:3100';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname), 'LOCAL_APP_REQUIRED');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // The JSON route uses the local OCR service. No structured/cloud calls here.
  await page.route('**/api/**', route => new URL(route.request().url()).pathname === '/api/documents/json' ? route.continue() : route.abort());
  await page.goto('/document-test');
  await page.getByLabel('Chế Độ Nắn Phối Cảnh (OpenCV)').selectOption('clean-scan');
  await page.getByLabel('Hoặc Chọn File Ảnh Tùy Ý').setInputFiles('tests/fixtures/ocr-json/tc04_table_empty_cells.png');
  const response = page.waitForResponse(r => r.url().endsWith('/api/documents/json'), { timeout: 90_000 });
  await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  const payload = await (await response).json();
  assert.equal(payload.success, true);
  assert.deepEqual(payload.data.structure.tables[0].rows.map(row => row.length), [5, 5, 5, 5, 5]);
  const review = page.getByRole('region', { name: 'Duyệt JSON', exact: true });
  await review.waitFor({ timeout: 30_000 });
  const table = review.locator('table');
  assert.equal(await table.locator('td').count(), 25);
  assert.equal((await table.locator('td').allTextContents()).filter(text => !text).length, 4);
  assert.ok((await table.textContent()).includes('4.500.000.000 đ'));
  assert.deepEqual(errors, []);
  mkdirSync('docs/ocr-optimization', { recursive: true });
  await table.screenshot({ path: 'docs/ocr-optimization/table-browser.png' });
  writeFileSync('docs/ocr-optimization/browser-verification.json', JSON.stringify({ syntheticOnly: true, actualBrowserPreprocessing: true,
    actualNextHttpRoute: true, actualLocalVietOcr: true, rows: 5, columns: 5, blankCells: 4, pageErrors: errors }, null, 2) + '\n');
  console.log('Real browser -> OpenCV WASM -> Next JSON API -> VietOCR -> 25 cells / 4 blanks: PASS');
} finally { await browser.close(); }
