import { readFile, writeFile } from 'node:fs/promises';
import { detailedTranscript, serializeDetailedCoordinates, serializeDetailedReview, validateDetailedDocument } from '@/modules/documents/detailed-export';
import type { DetailedDocument } from '@/shared/detailed-document.types';
const base = new URL(process.env.DOCUMENT_TEST_URL || 'http://127.0.0.1:3001');
if (!['127.0.0.1','localhost','[::1]'].includes(base.hostname)) throw new Error('LOCAL_TEST_ONLY');
const bytes = await readFile('test-results/camera/fixtures/table-phone.jpg');
const form = new FormData();
form.set('file',new Blob([bytes],{type:'image/jpeg'}),'table-phone.jpg');
form.set('photoMode','auto'); form.set('recognizeWords','true');
const response = await fetch(new URL('/api/documents/detailed',base),{method:'POST',body:form,signal:AbortSignal.timeout(170_000)});
if (!response.ok) throw new Error(`CAMERA_WORD_HTTP_${response.status}`);
const payload = await response.json();
validateDetailedDocument(payload.data);
const document: DetailedDocument = payload.data;
const blanks = document.elements.filter(e => e.kind === 'cell' && e.recognitionStatus === 'blank').length;
if (!document.provider.wordRecognition || document.preprocessing?.perspectiveOrigin !== 'auto' || document.counts.cell !== 25
  || blanks !== 4 || !document.elements.some(e => e.kind === 'word' && e.textOrigin === 'word_crop_ocr')) throw new Error('CAMERA_WORD_STRUCTURE_LOST');
const prefix = 'docs/ocr-camera/table-phone.words';
await writeFile(`${prefix}.layout.json`,JSON.stringify(document,null,2)+'\n');
await writeFile(`${prefix}.coordinates.txt`,serializeDetailedCoordinates(document));
await writeFile(`${prefix}.fulltext.txt`,'AFL · BẢN NHÁP CẦN ĐỐI CHIẾU\n\n'+detailedTranscript(document)+'\n');
await writeFile(`${prefix}.review.txt`,serializeDetailedReview(document));
const report = { syntheticOnly:true, realLocalModel:true, provider:document.provider, counts:document.counts, blankCells:blanks,
  lineWordDisagreements:document.elements.filter(e => e.kind === 'line' && e.reviewReasons.includes('LINE_WORD_OCR_DISAGREEMENT')).length,
  timingMs:document.timingMs, warnings:document.warnings };
await writeFile(`${prefix}.verification.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
