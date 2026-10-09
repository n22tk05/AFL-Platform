import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const baseURL = process.env.DOCUMENT_TEST_URL ?? 'http://127.0.0.1:3100';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname), 'LOCAL_APP_REQUIRED');
const manifest = JSON.parse(readFileSync('tests/fixtures/ocr-json/manifest.json', 'utf8'));
const baseline = JSON.parse(readFileSync('docs/ocr-optimization/latency-after.json', 'utf8'));
const focus = process.argv.find(arg => arg.startsWith('--fixture='))?.slice('--fixture='.length);
assert.ok(!focus || manifest.some(f => f.id === focus && f.id !== 'TC10'), 'INVALID_FIXTURE');
const repeats = focus ? 3 : 1;
const normalize = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1000 } });
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', route => new URL(route.request().url()).pathname === '/api/documents/json' ? route.continue() : route.abort());
  await page.goto('/document-test');
  await page.getByLabel('Chế Độ Nắn Phối Cảnh (OpenCV)').selectOption('clean-scan');
  const input = page.getByLabel('Hoặc Chọn File Ảnh Tùy Ý');
  const button = page.getByRole('button', { name: 'Xuất JSON', exact: true });
  // Warm WASM and the production JSON route, explicitly outside measured runs.
  await input.setInputFiles('tests/fixtures/ocr-json/' + manifest.find(f => f.id === 'TC10').filename);
  const warmup = page.waitForResponse(r => r.url().endsWith('/api/documents/json'), { timeout: 90_000 });
  await button.click(); await (await warmup).json();
  await button.waitFor({ state: 'visible' });
  const results = [];
  for (const fixture of manifest.filter(f => f.id !== 'TC10' && (!focus || f.id === focus))) {
    for (let repeat = 0; repeat < repeats; repeat++) {
    await input.setInputFiles('tests/fixtures/ocr-json/' + fixture.filename);
    const response = page.waitForResponse(r => r.url().endsWith('/api/documents/json'), { timeout: 90_000 });
    const start = performance.now();
    await button.click();
    const payload = await (await response).json();
    assert.equal(payload.success, true, fixture.id);
    await page.getByRole('region', { name: 'Duyệt JSON', exact: true }).waitFor({ timeout: 30_000 });
    const totalMs = performance.now() - start;
    const expected = baseline.results.find(f => f.fixture === fixture.id).actualText;
    assert.equal(normalize(payload.data.rawText), normalize(expected), fixture.id + ' text regression');
    // Timing cards live in the diagnostics tab; navigation is after totalMs.
    await page.getByRole('button', { name: 'Chẩn Đoán & RAM', exact: true }).click();
    const readTiming = async label => {
      const text = await page.getByText(label, { exact: true }).locator('..').textContent();
      const match = text?.match(/(\d+)\s*ms/u);
      assert.ok(match, 'MISSING_UI_TIMING');
      return Number(match[1]);
    };
    const result = { fixture: fixture.id, repeat: repeat+1, totalMs, attempts: payload.data.review.attempts.length,
      deskewMs: await readTiming('OpenCV Deskew'), extractionMs: await readTiming('OCR & AI Extraction'),
      uiReportedTotalMs: await readTiming('Tổng Thời Gian'), sameText: true };
    results.push(result); console.log(JSON.stringify(result));
    }
  }
  assert.deepEqual(pageErrors, []);
  writeFileSync(`docs/ocr-optimization/latency-browser${focus ? '-' + focus.toLowerCase() : ''}.json`, JSON.stringify({ syntheticOnly: true, actualLocalInference: true,
    scope: 'Warm WASM/route clean-scan, button click through rendered JSON review; excludes page load, image selection, model startup and structured cloud extraction',
    results, pageErrors }, null, 2) + '\n');
} finally { await browser.close(); }
