import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fixtures, visibleTranscript, ocrMetrics } from '@/modules/documents/json-evaluation';

const label = process.argv[2] ?? 'after';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('INVALID_REPORT_LABEL');
const python = process.env.VIETOCR_PYTHON ?? path.join('services', 'vietocr-service', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const { stdout, stderr } = await promisify(execFile)(python, ['scripts/benchmark-vietocr.py'], { maxBuffer: 8 * 1024 * 1024, timeout: 900_000, encoding: 'utf8' });
process.stderr.write(stderr);
const report = JSON.parse(stdout);
for (const result of report.results) {
  result.actualText = result.predictions.map((p: { text: string }) => p.text).join('\n');
  Object.assign(result, ['TC02', 'TC10'].includes(result.fixture) ? { cer: null, wer: null } : ocrMetrics(visibleTranscript(fixtures[result.fixture]).join('\n'), result.actualText));
  console.log(`${result.fixture}: CER=${result.cer} WER=${result.wer}`);
}
report.metricScope = 'One real local inference per synthetic page; NFC/collapsed whitespace; no browser preprocessing or adaptive retry. TC02 excluded (unverified dot count); TC10 negative blank.';
report.createdAt = new Date().toISOString();
mkdirSync('docs/ocr-optimization', { recursive: true });
writeFileSync(`docs/ocr-optimization/${label}.json`, JSON.stringify(report, null, 2) + '\n');
