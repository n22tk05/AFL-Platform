import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluateExtractions, type GroundTruthDocument } from '../src/modules/documents/evaluation';
import type { DocumentExtractionResult } from '../src/shared/document-extraction.types';

// Explicit live opt-in: this sends private, already-deskewed images to the configured server.
async function main() {
  const manifestPath = process.argv[2], base = process.argv[3];
  if (!manifestPath || !base || !process.argv.includes('--live')) throw new Error('Usage: npx tsx scripts/evaluate-document-extraction.ts <private-manifest.json> <http://localhost:3000> --live');
  const url = new URL(base);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Use HTTPS outside localhost.');
  const dataset: unknown = JSON.parse(await readFile(manifestPath,'utf8'));
  if (!Array.isArray(dataset) || !dataset.length) throw new Error('Dataset is empty; no benchmark was run.');
  const rows: { truth: GroundTruthDocument; actual: DocumentExtractionResult }[] = [];
  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i];
    if (!item || typeof item.imagePath !== 'string' || typeof item.documentType !== 'string' || !item.expectedFields || typeof item.expectedFields !== 'object'
      || Object.values(item.expectedFields).some(v => v !== null && typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v)))) throw new Error(`Invalid manifest entry ${i+1}`);
    const truth = item as GroundTruthDocument;
    const filePath = path.resolve(path.dirname(path.resolve(manifestPath)), truth.imagePath);
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg','.jpeg','.png'].includes(ext)) throw new Error(`Unsupported image at entry ${i+1}`);
    const bytes = await readFile(filePath);
    const form = new FormData();
    form.set('file',new Blob([bytes],{type:ext === '.png' ? 'image/png' : 'image/jpeg'}),'document'+ext);
    form.set('deskewApplied','true'); form.set('documentHint','auto');
    const response = await fetch(new URL('/api/documents/extract',url), {method:'POST',body:form,signal:AbortSignal.timeout(100_000)});
    const payload = await response.json();
    if (!response.ok || payload.data?.contractVersion !== 2) throw new Error(`API failure at entry ${i+1}`);
    rows.push({truth,actual:payload.data});
  }
  // Aggregate counts only. Do not print images, paths, actual or ground-truth values.
  console.log(JSON.stringify({ ...evaluateExtractions(rows), manualReviewDocuments: rows.filter(r=>r.actual.status==='manual_review_required').length,
    documentTypeMatches: rows.filter(r=>r.actual.documentType===r.truth.documentType).length, scope:'OCR + extraction on preprocessed images; excludes client deskew accuracy' },null,2));
}
main().catch(()=>{ console.error('Benchmark could not run. Check private manifest, server, configuration and --live opt-in. No accuracy is reported.'); process.exitCode=1; });
