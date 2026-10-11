import { readFile, writeFile } from 'node:fs/promises';
import { serializeDetailedCoordinates, serializeDetailedReview, validateDetailedDocument } from '@/modules/documents/detailed-export';
const directory=process.argv[2] ?? 'docs/ocr-line-separation';
if (!['docs/ocr-line-separation','docs/ocr-diacritics'].includes(directory) || process.argv.length>3) throw new Error('INVALID_BENCHMARK_DIRECTORY');
const report=JSON.parse(await readFile(`${directory}/after.json`,'utf8'));
for (const result of report.results) {
  if (!/^[a-z-]+$/.test(result.case)) throw new Error('INVALID_BENCHMARK_CASE');
  const document=JSON.parse(await readFile(`${directory}/${result.case}.layout.json`,'utf8'));
  validateDetailedDocument(document);
  const coordinates=serializeDetailedCoordinates(document);
  if (coordinates.trimEnd().split('\n').length!==document.elements.length+1) throw new Error('LINE_COORDINATES_LOST');
  await writeFile(`${directory}/${result.case}.coordinates.txt`,coordinates);
  await writeFile(`${directory}/${result.case}.review.txt`,serializeDetailedReview(document));
  console.log(JSON.stringify({case:result.case,elementsExported:document.elements.length,lines:document.counts.line}));
}
