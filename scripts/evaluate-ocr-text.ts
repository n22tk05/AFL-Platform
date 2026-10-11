import fs from 'node:fs';
import crypto from 'node:crypto';
import { extractOcrText, scoreOcrText } from '../src/modules/documents/ocr-text-evaluation';

const [fixturePath, responsePath] = process.argv.slice(2);
if (!fixturePath || !responsePath) throw new Error('Usage: tsx scripts/evaluate-ocr-text.ts FIXTURE.json RESPONSE.json');
const fixtureBytes = fs.readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString('utf8')) as { expectedLines: string[]; renderedImageSha256: string };
const responseBytes = fs.readFileSync(responsePath);
const response = JSON.parse(responseBytes.toString('utf8')) as unknown;
const actualText = extractOcrText(response);
if (!Array.isArray(fixture.expectedLines) || !fixture.expectedLines.length
  || fixture.expectedLines.some(line => typeof line !== 'string' || !line.trim())
  || actualText === undefined) throw new Error('INVALID_OCR_EVALUATION_INPUT');
process.stdout.write(JSON.stringify({ fixtureSha256: crypto.createHash('sha256').update(fixtureBytes).digest('hex').toUpperCase(),
  responseSha256: crypto.createHash('sha256').update(responseBytes).digest('hex').toUpperCase(),
  renderedImageSha256: fixture.renderedImageSha256, ...scoreOcrText(fixture.expectedLines, actualText) }, null, 2));
