import assert from 'node:assert/strict';
import sharp from 'sharp';

/** Local-only smoke test with synthetic text; never sends a real document. */
function localUrl(value: string): URL {
  const url = new URL(value);
  assert.equal(url.protocol, 'http:', 'Only local HTTP endpoints are supported by this smoke test.');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'The smoke test must remain on loopback endpoints.');
  assert.ok(!url.username && !url.password, 'Endpoint credentials are not supported.');
  return url;
}

async function checkedJson(url: URL, options: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
    assert.ok(response.ok, `Local HTTP request failed with status ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function object(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object.');
  return value as Record<string, unknown>;
}

async function main(): Promise<void> {
  const web = localUrl(process.env.DOCUMENT_TEST_URL || 'http://127.0.0.1:3001');
  const ocr = localUrl(process.env.VIETOCR_ENDPOINT || 'http://127.0.0.1:8000/predict');
  const health = object(await checkedJson(new URL('/health', ocr), {}, 10_000));
  assert.equal(health.status, 'ok', 'VietOCR health must report status ok.');
  assert.equal(health.ready, true, 'VietOCR model is not loaded.');

  const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="800"><rect width="100%" height="100%" fill="white"/><g fill="black" font-family="Arial, sans-serif" font-size="64"><text x="100" y="200">KIEM TRA OCR</text><text x="100" y="360">MAU SO 123456</text><text x="100" y="520">AFL PLATFORM</text></g></svg>')).png().toBuffer();
  const start = performance.now();
  const payload = object(await checkedJson(new URL('/api/documents/markdown', web), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: `data:image/png;base64,${image.toString('base64')}`, deskewApplied: false }),
  }, 90_000));
  assert.equal(payload.success, true, 'Markdown API returned a failure.');
  const data = object(payload.data);
  assert.equal(data.provider, 'vietocr', 'The API must use the real local VietOCR provider.');
  assert.equal(data.status, 'review_required', 'OCR output must remain a human-review draft.');
  assert.equal(typeof data.rawText, 'string', 'Expected raw OCR text.');
  assert.ok((data.rawText as string).trim().length > 0, 'An empty OCR result is not a successful smoke test.');
  const knownTokens = new Set((data.rawText as string).normalize('NFKC').toUpperCase().match(/\b(?:OCR|123456|AFL)\b/g) ?? []);
  assert.ok(knownTokens.size >= 2, 'The synthetic OCR must preserve at least two expected tokens; non-empty noise is not success.');
  assert.ok(typeof data.markdown === 'string' && data.markdown.trim().length > 0, 'Markdown is empty.');
  assert.equal(object(data.validation).valid, true, 'Markdown validation did not pass.');
  const review = object(data.ocrReview);
  assert.ok(Array.isArray(review.attempts) && review.attempts.length > 0 && review.attempts.length <= 2, 'OCR attempt provenance is missing or exceeds the limit.');
  assert.ok(review.attempts.every(value => object(value).provider === 'vietocr'), 'Unexpected OCR provider in provenance.');
  assert.ok(Array.isArray(review.regions) && !review.regions.some(value => object(value).status === 'unreadable'), 'The synthetic source is still marked unreadable.');

  console.log(`Local VietOCR -> Markdown smoke test passed: ${review.attempts.length} OCR attempt(s), ${Math.round(performance.now() - start)} ms, ${Array.from(data.rawText as string).length} raw characters.`);
  console.log('Synthetic smoke test only; review is still required and camera-image accuracy is not measured.');
}

main().catch(() => {
  console.error('Local VietOCR smoke test failed. Check /health, the server logs and the loopback endpoint configuration. No OCR text or credentials were logged.');
  process.exitCode = 1;
});
