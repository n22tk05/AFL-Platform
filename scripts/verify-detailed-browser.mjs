import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.DOCUMENT_TEST_URL || 'http://127.0.0.1:3001';
if (!['127.0.0.1','localhost','[::1]'].includes(new URL(baseURL).hostname)) throw new Error('LOCAL_TEST_ONLY');
await mkdir('test-results/detailed', { recursive:true });
const browser = await chromium.launch({ channel:'chrome', headless:true });
const errors = [], report = { provider:'real-local-vietocr', runs:[], pageErrors:errors };
try {
  const page = await browser.newPage({ baseURL, viewport:{width:1440,height:1000}, acceptDownloads:true });
  page.setDefaultTimeout(90_000);
  page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.addInitScript(() => {
    window.__detailedErrors = [];
    window.addEventListener('error', e => window.__detailedErrors.push({message:e.message,filename:e.filename,line:e.lineno,column:e.colno}));
  });
  await page.goto('/document-detail');
  await page.getByLabel('Chọn ảnh đọc chi tiết').setInputFiles('tests/fixtures/ocr-json/tc04_table_empty_cells.png');
  const button = page.getByRole('button', { name:'Đọc chi tiết', exact:true });
  await button.waitFor();
  try { await page.waitForFunction(() => document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]')?.complete); }
  catch(error) { console.log(await page.evaluate(() => ({errors:window.__detailedErrors,alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent)}))); throw error; }
  const response = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await button.click();
  const data = await (await response).json();
  if (!data.success) throw new Error(JSON.stringify(data));
  await page.getByRole('button', { name:'TXT tọa độ', exact:true }).waitFor({timeout:160_000});
  if (data.data.counts.cell !== 25) throw new Error('CELL_COUNT_LOST');
  await page.getByRole('button', { name:/^Từ / }).click();
  await page.getByTestId('detailed-records').locator('button').first().click();
  if (await page.getByTestId('detailed-selected-polygon').count() !== 1) throw new Error('OVERLAY_MISSING');
  const first = page.getByTestId('detailed-inspector');
  if (!(await first.textContent()).includes('word_')) throw new Error('WORD_INSPECTOR_MISSING');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name:'TXT tọa độ', exact:true }).click();
  const download = await downloadEvent, file = path.resolve('test-results/detailed/browser.coordinates.txt');
  await download.saveAs(file);
  const records = (await readFile(file,'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
  if (records.length !== data.data.elements.length+1 || records[0].exportStatus !== 'draft') throw new Error('DOWNLOAD_ROUNDTRIP_FAILED');
  if (records.filter(e => e.kind === 'cell' && e.recognitionStatus === 'blank').length !== 4) throw new Error('BLANK_CELLS_LOST');
  await page.screenshot({path:'test-results/detailed/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/detailed/mobile.png',fullPage:true});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+2);
  if (overflow) throw new Error('MOBILE_HORIZONTAL_OVERFLOW');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('checkbox', { name:/Tôi đã đối chiếu ảnh nguồn/ }).check();
  await page.getByLabel('Nội dung đối chiếu của vùng').fill('Đã đối chiếu');
  if (await page.getByRole('checkbox', { name:/Tôi đã đối chiếu ảnh nguồn/ }).isChecked()) throw new Error('EDIT_DID_NOT_REVOKE_CONFIRMATION');
  report.runs.push({fixture:'TC04',counts:data.data.counts,recordsExported:records.length-1,blankCells:4,overlay:true,editRevokesConfirmation:true,mobileOverflow:overflow});
  await page.getByLabel('Chọn ảnh đọc chi tiết').setInputFiles('tests/fixtures/ocr-json/tc10_blank_page.png');
  await page.waitForFunction(() => !document.querySelector('[data-testid="detailed-records"] button'));
  await page.waitForFunction(() => document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]')?.complete);
  const blankResponse = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).click();
  const blank = await (await blankResponse).json();
  if (!blank.success || blank.data.fullText !== '' || blank.data.elements.length !== 1) throw new Error('BLANK_PAGE_FAILED');
  report.runs.push({fixture:'TC10',counts:blank.data.counts,blankTranscript:true});
  const cameraPng = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width=1000; c.height=1300;
    const ctx=c.getContext('2d'); ctx.fillStyle='#555'; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#fff'; ctx.fillRect(80,80,840,1140);
    ctx.fillStyle='#111'; ctx.font='28px Arial';
    ctx.fillText('CAMERA DOCUMENT TEST',140,230);
    ctx.fillText('Alpha beta 001234',140,330);
    ctx.fillText('Native source coordinates',140,430);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Chọn ảnh đọc chi tiết').setInputFiles({name:'camera.png',mimeType:'image/png',buffer:Buffer.from(cameraPng,'base64')});
  await page.getByLabel('Loại ảnh tài liệu').selectOption('camera');
  await page.getByRole('checkbox',{name:/Kiểm tra từng từ bằng OCR/}).uncheck();
  await page.waitForFunction(() => document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]')?.complete);
  const cameraResponse = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).click();
  const camera = await (await cameraResponse).json();
  if (!camera.success || !camera.data.warnings.includes('PERSPECTIVE_APPLIED') || camera.data.source.width !== 1000 || camera.data.counts.line < 3) throw new Error('CAMERA_PERSPECTIVE_FAILED:'+JSON.stringify(camera));
  if (camera.data.preprocessing.perspectiveOrigin !== 'auto') throw new Error('CAMERA_AUTO_QUAD_MISSING');
  report.runs.push({fixture:'synthetic-camera',counts:camera.data.counts,nativeDocumentDetection:true,perspectiveApplied:true,sourceDimensions:camera.data.source});
  await page.getByLabel('Chọn ảnh đọc chi tiết').setInputFiles('test-results/camera/fixtures/low-light.jpg');
  await page.getByLabel('Loại ảnh tài liệu').selectOption('auto');
  await page.waitForFunction(() => document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]')?.complete);
  const darkResponse = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).click();
  const dark = await (await darkResponse).json();
  if (!dark.success || dark.data.preprocessing.perspectiveOrigin !== 'auto' || dark.data.counts.line !== 19
    || !dark.data.warnings.includes('CAMERA_LOW_LIGHT')) throw new Error('AUTO_LOW_LIGHT_FAILED:'+JSON.stringify(dark));
  await page.getByTestId('detailed-paper-quad').waitFor();
  report.runs.push({fixture:'synthetic-low-light',counts:dark.data.counts,serverAutoPerspective:true,lowLightFeedback:true});
  await page.getByRole('button',{name:'Chỉnh 4 góc giấy',exact:true}).click();
  if (await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).isEnabled()) throw new Error('PARTIAL_CORNERS_ENABLED_OCR');
  // Dispatch at source-relative positions to verify mapping even when the image
  // is larger than its scroll viewport. Any order must become TL/TR/BR/BL.
  for (const point of [[1260,1450],[130,140],[60,1550],[1150,90]]) await page.evaluate(([x,y]) => {
    const img = document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]');
    const svg = img.parentElement.querySelector('svg');
    const bounds = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:bounds.left+x/1500*bounds.width,clientY:bounds.top+y/1750*bounds.height}));
  }, point);
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).waitFor();
  const manualResponse = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).click();
  const manual = await (await manualResponse).json();
  if (!manual.success || manual.data.preprocessing.perspectiveOrigin !== 'manual' || manual.data.counts.line < 19
    || Math.abs(manual.data.preprocessing.sourceQuad[0][0]-130)>3) throw new Error('MANUAL_CORNERS_FAILED:'+JSON.stringify({success:manual.success,counts:manual.data?.counts,preprocessing:manual.data?.preprocessing}));
  report.runs.push({fixture:'synthetic-low-light-manual',manualSourceCorners:true,counts:manual.data.counts});
  const darkFrame = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=500; canvas.height=500;
    const ctx = canvas.getContext('2d'); ctx.fillStyle='#0c0c0c'; ctx.fillRect(0,0,500,500);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Chọn ảnh đọc chi tiết').setInputFiles({name:'dark-frame.png',mimeType:'image/png',buffer:Buffer.from(darkFrame,'base64')});
  await page.getByLabel('Loại ảnh tài liệu').selectOption('camera');
  await page.waitForFunction(() => document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]')?.complete);
  const failedCornersResponse = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).click();
  const failedCorners = await (await failedCornersResponse).json();
  if (!failedCorners.success || failedCorners.data.preprocessing.perspectiveOrigin !== 'none' || failedCorners.data.fullText !== ''
    || !failedCorners.data.warnings.includes('DOCUMENT_CORNERS_NEED_REVIEW')) throw new Error('CAMERA_FALLBACK_NOT_REVIEWABLE');
  report.runs.push({fixture:'dark-frame',missingCornersStillReviewable:true,noInventedQuadOrText:true,manualCornersResetOnNewImage:true});
  await page.getByLabel('Chọn ảnh đọc chi tiết').setInputFiles('tests/fixtures/ocr-json/tc04_table_empty_cells.png');
  await page.waitForFunction(() => document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]')?.complete);
  const scanCameraResponse = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).click();
  const scanCamera = await (await scanCameraResponse).json();
  if (!scanCamera.success || scanCamera.data.counts.cell !== 25 || scanCamera.data.preprocessing.perspectiveOrigin !== 'none') throw new Error('TABLE_MISTAKEN_FOR_CAMERA_PAGE');
  report.runs.push({fixture:'TC04-camera-mode',printedTableNotUsedAsPaperQuad:true,counts:scanCamera.data.counts});
  await page.getByLabel('Chọn ảnh đọc chi tiết').setInputFiles('test-results/line-separation/fixtures/multiline-cell.png');
  await page.getByLabel('Loại ảnh tài liệu').selectOption('scan');
  await page.getByRole('checkbox',{name:/Kiểm tra từng từ bằng OCR/}).check();
  await page.waitForFunction(() => document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]')?.complete);
  const tightResponse = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).click();
  const tight = await (await tightResponse).json();
  if (!tight.success || tight.data.counts.line !== 2 || tight.data.counts.cell !== 1 || !tight.data.provider.wordRecognition) throw new Error('TIGHT_CELL_LINES_LOST');
  const tightLines = tight.data.elements.filter(e => e.kind === 'line');
  if (tightLines[0].cropBox[3] > tightLines[1].processedBox[1] || tightLines[1].cropBox[1] < tightLines[0].processedBox[3]) throw new Error('TIGHT_CROP_CONTAINS_NEIGHBOR');
  report.runs.push({fixture:'tight-multiline-cell',realWordCropOcr:true,independentRowsAndCrops:true,counts:tight.data.counts});
  await page.screenshot({path:'test-results/detailed/tight-lines.png',fullPage:true});
  await page.getByLabel('Chọn ảnh đọc chi tiết').setInputFiles('test-results/diacritics/fixtures/stacked-tahoma.png');
  await page.waitForFunction(() => document.querySelector('img[alt="Ảnh nguồn của tài liệu chi tiết"]')?.complete);
  const accentResponse = page.waitForResponse(r => r.url().endsWith('/api/documents/detailed'));
  await page.getByRole('button',{name:'Đọc chi tiết',exact:true}).click();
  const accent = await (await accentResponse).json();
  if (!accent.success || accent.data.counts.line !== 1 || accent.data.counts.word !== 2
      || accent.data.counts.unknown_region || !accent.data.provider.wordRecognition) throw new Error('DETACHED_ACCENT_RECORDS_REMAIN');
  const accentDownload = page.waitForEvent('download');
  await page.getByRole('button',{name:'TXT tọa độ',exact:true}).click();
  const accentDownloaded = await accentDownload;
  await accentDownloaded.saveAs('test-results/detailed/diacritics.coordinates.txt');
  const accentRecords = (await readFile('test-results/detailed/diacritics.coordinates.txt','utf8')).trim().split('\n').map(line => JSON.parse(line));
  if (accentRecords.length !== accent.data.elements.length+1 || accentRecords.filter(e => e.kind === 'line').length !== 1
      || accentRecords.filter(e => e.kind === 'word').length !== 2) throw new Error('DIACRITIC_TXT_RECORDS_DUPLICATED_OR_LOST');
  report.runs.push({fixture:'stacked-tahoma',realWordCropOcr:true,detachedMarksStayWithGlyph:true,recordsExported:accentRecords.length-1,counts:accent.data.counts});
  await page.screenshot({path:'test-results/detailed/diacritics.png',fullPage:true});
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(report));
} finally {
  await writeFile('test-results/detailed/browser-verification.json',JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
