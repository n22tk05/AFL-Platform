/** Actual local model -> Next endpoint -> validated TXT. Synthetic public fixtures only. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { detailedTranscript, serializeDetailedCoordinates, serializeDetailedReview, validateDetailedDocument } from '@/modules/documents/detailed-export';
import type { DetailedDocument } from '@/shared/detailed-document.types';

const base = new URL(process.env.DOCUMENT_TEST_URL || 'http://127.0.0.1:3001');
if (!['127.0.0.1','localhost','[::1]'].includes(base.hostname)) throw new Error('LOCAL_TEST_ONLY');
const directory = path.resolve('docs/examples/detailed-txt');
await mkdir(directory, { recursive: true });
const results = [];
for (const name of ['tc01_clean_accents','tc04_table_empty_cells','tc05_checkboxes','tc07_skewed_perspective','tc10_blank_page']) {
  const bytes = await readFile(`tests/fixtures/ocr-json/${name}.png`);
  const form = new FormData(); form.set('file', new Blob([bytes], { type: 'image/png' }), `${name}.png`);
  // Real word-crop recognition, not a mock and not splitting a supplied transcript.
  form.set('recognizeWords', 'true');
  const response = await fetch(new URL('/api/documents/detailed', base), { method:'POST', body:form, signal:AbortSignal.timeout(170_000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}: ${JSON.stringify(payload)}`);
  validateDetailedDocument(payload.data);
  const document: DetailedDocument = payload.data;
  const coordinates = serializeDetailedCoordinates(document);
  const records = coordinates.trimEnd().split('\n').map(line => JSON.parse(line));
  if (records.length !== document.elements.length+1) throw new Error('TXT_RECORDS_LOST');
  if (name === 'tc04_table_empty_cells' && (document.counts.cell !== 25 || document.elements.filter(e => e.kind === 'cell' && e.recognitionStatus === 'blank').length !== 4)) throw new Error('TABLE_SLOTS_LOST');
  if (name === 'tc10_blank_page' && document.fullText !== '') throw new Error('BLANK_PAGE_INVENTED_TEXT');
  await writeFile(path.join(directory,`${name}.coordinates.txt`), coordinates);
  await writeFile(path.join(directory,`${name}.fulltext.txt`), 'AFL · BẢN NHÁP CẦN ĐỐI CHIẾU\n\n'+detailedTranscript(document)+'\n');
  await writeFile(path.join(directory,`${name}.review.txt`), serializeDetailedReview(document));
  await writeFile(path.join(directory,`${name}.layout.json`), JSON.stringify(document,null,2)+'\n');
  const result = { fixture:name, provider:document.provider, status:document.status, counts:document.counts,
    elementsExported:records.length-1, timingMs:document.timingMs, warnings:document.warnings,
    unreadable:document.elements.filter(e => e.recognitionStatus === 'unreadable').length,
    lineWordDisagreements:document.elements.filter(e => e.kind === 'line' && e.reviewReasons.includes('LINE_WORD_OCR_DISAGREEMENT')).length };
  results.push(result); console.log(JSON.stringify(result));
  await writeFile(path.join(directory,'verification.json'), JSON.stringify({ model:'real-local', syntheticOnly:true, noAccuracyGuarantee:true, results },null,2)+'\n');
}
