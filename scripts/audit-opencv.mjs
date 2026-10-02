// Read-only browser audit. Start the local app before running this script.
// node scripts/audit-opencv.mjs http://127.0.0.1:3100 test-results/opencv-audit.json
// Uses synthetic images and bundled blank forms; blocks all API/provider requests.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const baseURL = process.argv[2] || 'http://127.0.0.1:3100';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('This audit requires a local application URL.');
}
const output = process.argv[3] || 'test-results/opencv-audit.json';
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const context = await browser.newContext({ baseURL });
await context.route('**/api/**', route => route.abort());
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const report = { generatedAt: new Date().toISOString(), baseURL,
  browser: browser.version(), environment: `${process.platform}/${process.arch}, development server`,
  scope: 'Browser geometry audit; no live OCR; fixture counts are not real-data accuracy.', runs: [], errors };

try {
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto('/opencv-test');
  async function fixture(kind) {
    const data = await page.evaluate(kind => {
      const paper = document.createElement('canvas'); paper.width = 1200; paper.height = 1600;
      const p = paper.getContext('2d'); p.fillStyle = '#fff'; p.fillRect(0, 0, 1200, 1600);
      const rects = [];
      p.strokeStyle = '#111'; p.lineWidth = 3; p.fillStyle = '#111'; p.font = '22px Arial';
      if (kind !== 'empty') {
        p.fillText('SYNTHETIC FORM - ABC 0123456789', 100, 100);
        for (let row = 0; row < 5; row++) for (let col = 0; col < 2; col++) {
          const rect = { x: 100 + col * 500, y: 200 + row * 220, width: 450, height: 130 };
          rects.push(rect); p.strokeRect(rect.x, rect.y, rect.width, rect.height);
          p.fillText(`Field ${row * 2 + col + 1}`, rect.x + 15, rect.y + 38);
        }
        for (let col = 0; col < 3; col++) {
          const rect = { x: 100 + col * 140, y: 1400, width: 24, height: 24 };
          rects.push(rect); p.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }
        if (kind === 'nested') { p.strokeRect(85, 185, 980, 1040); rects.push({ x: 85, y: 185, width: 980, height: 1040 }); }
      }
      if (kind === 'empty' || kind === 'clean' || kind === 'nested') {
        return { png: paper.toDataURL('image/png').split(',')[1], rects };
      }
      const image = document.createElement('canvas'); image.width = 1500; image.height = 1900;
      const c = image.getContext('2d'); c.fillStyle = '#404040'; c.fillRect(0, 0, 1500, 1900);
      const angle = (kind === 'rotated' ? 5 : 2) * Math.PI / 180;
      c.translate(750, 950); c.rotate(angle); c.scale(0.88, 0.88); c.drawImage(paper, -600, -800);
      return { png: image.toDataURL('image/png').split(',')[1], rects: [] };
    }, kind);
    return { file: { name: `${kind}.png`, mimeType: 'image/png', buffer: Buffer.from(data.png, 'base64') }, rects: data.rects };
  }
  async function run(label, mode, file, expected = []) {
    await page.getByLabel('Chế độ xử lý').selectOption(mode);
    await page.getByLabel('Chọn ảnh JPEG hoặc PNG').setInputFiles(file);
    const button = page.getByRole('button', { name: 'Chạy pipeline phát hiện đường', exact: true });
    await button.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Chạy pipeline phát hiện đường' && !b.disabled));
    await button.click();
    await page.waitForFunction(() => !!document.querySelector('[role="alert"]') || [...document.querySelectorAll('strong')].some(el => el.textContent.startsWith('Hoàn tất trong')));
    const result = await page.evaluate(() => {
      const alert = document.querySelector('[role="alert"]');
      const timing = [...document.querySelectorAll('strong')].find(el => el.textContent.startsWith('Hoàn tất trong'));
      const rows = [...document.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(td => td.textContent));
      const quad = document.querySelector('details pre');
      return { error: alert?.textContent || null, timing: timing?.parentElement.textContent || null,
        candidates: rows.map(r => ({ id: r[0], x: +r[1], y: +r[2], width: +r[3], height: +r[4] })),
        quad: quad ? JSON.parse(quad.textContent) : null };
    });
    if (expected.length) {
      function iou(a, b) {
        const overlap = Math.max(0, Math.min(a.x+a.width, b.x+b.width)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
        return overlap / (a.width*a.height + b.width*b.height - overlap);
      }
      result.fixtureMatchesAtIou05 = expected.map(rect => result.candidates.some(c => iou(rect, c) >= 0.5));
      result.expectedFixtureRects = expected.length;
    }
    report.runs.push({ label, mode, ...result });
    console.log(`${label}: ${result.error || result.timing}`);
  }
  const clean = await fixture('clean');
  for (let i = 0; i < 10; i++) await run(`synthetic-clean-${i+1}`, 'clean-scan', clean.file, clean.rects);
  const nested = await fixture('nested'); await run('synthetic-nested', 'clean-scan', nested.file, nested.rects);
  const camera = await fixture('camera');
  for (let i = 0; i < 5; i++) await run(`synthetic-camera-${i+1}`, 'camera-photo', camera.file);
  const rotated = await fixture('rotated'); await run('synthetic-rotated-5deg', 'camera-photo', rotated.file);
  const empty = await fixture('empty'); await run('synthetic-empty-camera', 'camera-photo', empty.file);
  for (const path of ['public/assets/forms/01-lptb/page-1.jpg', 'public/assets/forms/01-lptb/page-2.jpg', 'public/assets/forms/khai-sinh-lai/page-1.jpg']) {
    await run(path, 'clean-scan', path);
  }
  const cameraPage = await context.newPage();
  await cameraPage.addInitScript(() => {
    window.__cameraAudit = { starts: 0, stoppedTracks: 0 };
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      window.__cameraAudit.starts++;
      const stream = await original(options);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { window.__cameraAudit.stoppedTracks++; stop(); };
      }
      return stream;
    };
  });
  await cameraPage.goto('/scan');
  await cameraPage.getByRole('button', { name: 'Chụp ảnh tờ khai trên bàn', exact: true }).click();
  await cameraPage.waitForTimeout(2000);
  report.cameraLifecycle = await cameraPage.evaluate(() => window.__cameraAudit);
  await cameraPage.getByRole('button', { name: 'Đóng camera', exact: true }).click();
  await cameraPage.waitForTimeout(300);
  report.cameraAfterClose = await cameraPage.evaluate(() => window.__cameraAudit);
  const repeated = report.runs.filter(r => r.label.startsWith('synthetic-clean-'));
  const warm = repeated.slice(1).map(r => Number(r.timing?.match(/Hoàn tất trong ([\d.]+)/)?.[1])).filter(Number.isFinite).sort((a,b) => a-b);
  report.summary = { repeatedCleanIdentical: repeated.every(r => JSON.stringify(r.candidates) === JSON.stringify(repeated[0].candidates)),
    warmCleanSamples: warm.length, warmCleanMedianMs: warm[Math.floor(warm.length/2)], warmCleanP95Ms: warm[Math.ceil(warm.length*0.95)-1],
    cameraResultsIdentical: report.runs.filter(r => r.label.startsWith('synthetic-camera-')).every(r => JSON.stringify(r.quad) === JSON.stringify(report.runs.find(x => x.label === 'synthetic-camera-1').quad)) };
} catch (error) {
  report.auditError = error.message;
  process.exitCode = 1;
} finally {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary: report.summary, cameraLifecycle: report.cameraLifecycle, cameraAfterClose: report.cameraAfterClose, auditError: report.auditError, output }));
  await browser.close();
}
