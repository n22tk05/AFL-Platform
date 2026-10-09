import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { VietOcrProvider } from '@/modules/documents/providers/vietocr-provider';
import { JsonExportService } from '@/modules/documents/services/json-export.service';
import { handleJsonConversion } from '@/modules/documents/json-api';
import { validateJsonExport } from '@/modules/documents/json-validator';
import { fixtures, visibleTranscript, ocrMetrics, auditSourceCoverage } from '@/modules/documents/json-evaluation';
import type { DocumentOcrResult } from '@/shared/document-extraction.types';

const endpoint = new URL(process.env.VIETOCR_ENDPOINT ?? 'http://127.0.0.1:8000/predict');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) && endpoint.protocol === 'http:', 'LOCAL_PROVIDER_REQUIRED');
mkdirSync('docs/ocr-optimization', { recursive: true });
const results = [];
for (const id of ['TC04', 'TC07', 'TC10']) {
  const fixture = fixtures[id], provider = new VietOcrProvider({ endpoint: endpoint.href });
  const attempts: DocumentOcrResult[] = [];
  const form = new FormData();
  form.set('file', new Blob([readFileSync('tests/fixtures/ocr-json/' + fixture.filename)], { type: 'image/png' }), fixture.filename);
  const response = await handleJsonConversion(new Request('http://localhost/api/documents/json', { method: 'POST', body: form }), () => new JsonExportService({
    providerId: 'vietocr', extract: async input => { const output = await provider.extract(input); attempts.push(output); return output; },
  }));
  const payload = await response.json(), document = payload.data;
  assert.ok(document, JSON.stringify(payload.error));
  assert.equal(validateJsonExport(document).valid, true);
  const selected = attempts[document.review.selectedAttempt - 1];
  assert.ok(selected); auditSourceCoverage(selected, document);
  if (id === 'TC04') {
    const table = fixture.structuralRelationships.find(r => r.type === 'table')!;
    assert.deepEqual(document.structure.tables[0].rows.map((row: { rawValue: string }[]) => row.map(cell => cell.rawValue)),
      [table.headerRow, ...table.dataRows!.map(row => row.map(value => value ?? ''))]);
  }
  if (id === 'TC07') assert.ok(document.warnings.includes('OCR_DESKEW_APPLIED'));
  if (id === 'TC10') { assert.equal(document.rawText, ''); assert.equal(response.status, 422); }
  writeFileSync(`docs/ocr-optimization/${id.toLowerCase()}-export.json`, JSON.stringify(document, null, 2) + '\n');
  const result = { fixture: id, httpStatus: response.status, schemaValid: true, sourcePreserved: true, attempts: attempts.length,
    tables: document.structure.tables.length, ...ocrMetrics(visibleTranscript(fixture).join('\n'), document.rawText) };
  results.push(result); console.log(result);
}
writeFileSync('docs/ocr-optimization/export-verification.json', JSON.stringify({ syntheticOnly: true, actualLocalHttpInference: true, nextRouteHandlerExecuted: true, results }, null, 2) + '\n');
