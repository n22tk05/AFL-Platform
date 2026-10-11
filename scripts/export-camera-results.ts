/** Validate real-model camera layouts and export every coordinate, including
 * unresolved marks. No transcript edits or ground-truth text enter the export. */
import { readFile, writeFile } from 'node:fs/promises';
import { serializeDetailedCoordinates, serializeDetailedReview, validateDetailedDocument } from '@/modules/documents/detailed-export';
const directory = 'docs/ocr-camera';
const report = JSON.parse(await readFile(`${directory}/after.json`, 'utf8'));
for (const result of report.results) {
  if (!result.success || !/^[a-z-]+$/.test(result.case)) throw new Error('CAMERA_BENCHMARK_INCOMPLETE');
  const document = JSON.parse(await readFile(`${directory}/${result.case}.layout.json`, 'utf8'));
  validateDetailedDocument(document);
  const coordinates = serializeDetailedCoordinates(document);
  if (coordinates.trimEnd().split('\n').length !== document.elements.length + 1) throw new Error('CAMERA_COORDINATES_LOST');
  await writeFile(`${directory}/${result.case}.coordinates.txt`, coordinates);
  await writeFile(`${directory}/${result.case}.review.txt`, serializeDetailedReview(document));
  console.log(JSON.stringify({ case: result.case, elementsExported: document.elements.length, source: document.source, perspectiveOrigin: document.preprocessing?.perspectiveOrigin }));
}
