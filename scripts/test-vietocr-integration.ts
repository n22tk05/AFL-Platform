import { readFileSync, unlinkSync } from 'node:fs';
import { POST } from '@/app/api/documents/markdown/route';

async function main() {
  console.log('--- Testing Next.js Route POST /api/documents/markdown with VietOCR ---');

  const base64Png = readFileSync('tests/fixtures/vietocr_test_b64.txt', 'utf-8').trim();

  const req = new Request('http://localhost:3000/api/documents/markdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: `data:image/png;base64,${base64Png}`,
    }),
  });

  const t0 = performance.now();
  const response = await POST(req);
  const duration = performance.now() - t0;

  console.log('HTTP Status:', response.status);
  console.log(`Execution Time: ${duration.toFixed(1)}ms`);

  const data = await response.json();
  console.log('Response Success:', data.success);
  console.log('Provider:', data.data?.provider);
  console.log('Validation Valid:', data.data?.validation?.valid);
  console.log('Confidence:', data.data?.confidence);
  console.log('\nReturned Markdown:');
  console.log('--------------------------------------------------');
  console.log(data.data?.markdown);
  console.log('--------------------------------------------------');

  if (response.status !== 200 || !data.success || data.data?.provider !== 'vietocr') {
    throw new Error('API Route did not return expected VietOCR result!');
  }

  console.log('\n[ALL CHECKS PASSED] Next.js Route /api/documents/markdown is fully integrated and optimized!');
}

main().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
