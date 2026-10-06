import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { validateJsonExport } from '../../src/modules/documents/json-validator';
import { assembleJson } from '../../src/modules/documents/json-assembler';
test.beforeEach(async ({ page }) => {
  // All browser OCR is intercepted; never submit fixtures or private documents
  // to a real provider. Per-test routes below override this fail-closed guard.
  await page.route('**/api/documents/**', route => route.fulfill({ status: 503, json: { success: false, error: { message_vi: 'Test provider not intercepted' } } }));
});

async function synthetic(page: Page, kind: 'clean'|'camera'|'blur'|'glare'|'empty'|'low-contrast'|'small'|'shadow'): Promise<Buffer> {
  const data = await page.evaluate(kind => {
    const c=document.createElement('canvas'); c.width=kind==='small'?123:1200;c.height=kind==='small'?161:1600;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#404040';ctx.fillRect(0,0,c.width,c.height);
    if(kind==='empty') return c.toDataURL('image/png').split(',')[1];
    const paper=document.createElement('canvas');paper.width=1000;paper.height=1400;const p=paper.getContext('2d')!;
    p.fillStyle=kind==='glare' ? '#b0b0b0' : kind==='low-contrast' ? '#e6e6e6' : '#fff';p.fillRect(0,0,1000,1400);p.fillStyle=kind==='low-contrast'?'#cdcdcd':'#111';p.font='24px Arial';
    p.fillText('BIÊN BẢN VI PHẠM GIAO THÔNG — DỮ LIỆU THỬ',50,70);
    for(let i=0;i<26;i++)p.fillText(`Dòng thử nghiệm ${i+1}: ABCDEFG 0123456789`,50,130+i*42);
    if(kind==='glare'){p.fillStyle='#fff';p.fillRect(430,650,38,38);}
    if(kind==='camera'){ctx.setTransform(0.85,0.06,-0.06,0.85,220,130);ctx.drawImage(paper,0,0);}
    else {if(kind==='blur')ctx.filter='blur(12px)';ctx.drawImage(paper,0,0,c.width,c.height);}
    if(kind==='shadow'){const shade=ctx.createLinearGradient(0,0,c.width,0);shade.addColorStop(0,'rgba(0,0,0,0.6)');shade.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shade;ctx.fillRect(0,0,c.width,c.height);}
    return c.toDataURL('image/png').split(',')[1];
  },kind);
  return Buffer.from(data,'base64');
}
const result = {
  contractVersion:2,status:'extracted',documentType:'traffic_violation_record',fullText:'TEST-01/BB\n900.000 đồng',overallConfidence:0.7,requiresReview:true,warnings:[],processingTimeMs:1,deskewApplied:true,
  fields:{recordNumber:{key:'recordNumber',label:'Số biên bản',value:'TEST-01/BB',rawText:'TEST-01/BB',confidence:0.99,evidenceText:'TEST-01/BB',sourceLineIds:['l1'],sourceBoundingBoxes:[[0.1,0.1,0.2,0.8]],status:'accepted',validationErrors:[]},
    fineAmount:{key:'fineAmount',label:'Số tiền phạt',value:900000,rawText:'900.000 đồng',confidence:0.4,evidenceText:'900.000 đồng',sourceLineIds:['l2'],sourceBoundingBoxes:[[0.3,0.1,0.4,0.8]],status:'needs_review',validationErrors:['Độ tin cậy chưa đạt ngưỡng duyệt.']}}
};
test('clean scan, evidence, review, expiry-safe navigation and three consecutive camera runs',async({page})=>{
  await page.addInitScript(() => {
    const live=new Set<string>();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);live.add(url);return url;};
    URL.revokeObjectURL=url=>{live.delete(url);revoke(url);};
    Object.defineProperty(window,'documentTestLiveUrls',{get:()=>live.size});
  });
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const consoleErrors:string[]=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  const dimensions:number[][]=[];
  await page.route('**/api/documents/extract',async route=>{
    const bytes=route.request().postDataBuffer()!;const offset=bytes.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));
    expect(offset).toBeGreaterThan(0);dimensions.push([bytes.readUInt32BE(offset+16),bytes.readUInt32BE(offset+20)]);
    await route.fulfill({json:{success:true,data:result}});
  });
  await page.goto('/scan-document'); await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check();
  await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:await synthetic(page,'clean')});
  await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByRole('button',{name:'Đọc chứng từ',exact:true}).click();
  await expect(page.getByText('2. Đối chiếu từng trường')).toBeVisible({timeout:60_000});
  expect(dimensions[0]).toEqual([1200,1600]);
  await page.getByRole('button',{name:'Số tiền phạt — xem bằng chứng'}).click();
  await expect(page.getByTestId('evidence-box')).toHaveCount(1);
  const box=await page.getByTestId('evidence-box').boundingBox(),image=await page.getByTestId('evidence-image').boundingBox();
  expect(Math.abs(box!.x-(image!.x+image!.width*0.1))).toBeLessThan(2);
  await expect(page.getByRole('button',{name:'3. Xác nhận'})).toBeDisabled();
  expect(await page.evaluate(()=>sessionStorage.getItem('afl_prerequisite_document_data'))).toBeNull();
  await page.locator('#field-fineAmount').fill('800000');
  await page.getByRole('button',{name:'Xác nhận trường này',exact:true}).nth(1).click();
  await page.getByRole('button',{name:'3. Xác nhận'}).click();
  await expect(page.getByRole('link',{name:'Tiếp tục điền biểu mẫu'})).toBeVisible();
  const workflow=JSON.parse(readFileSync('assets/mock-data/mock-workflow.json','utf8'));
  workflow.steps=[{...workflow.steps[0],requiresPrerequisiteDoc:true,sourceFieldFromPrerequisite:'so_tien_phat',audioUrl:'',faqs:[]}];
  await page.evaluate(workflow=>localStorage.setItem('afl_workflow_published_tpl_01_lptb',JSON.stringify(workflow)),workflow);
  await page.getByRole('link',{name:'Tiếp tục điền biểu mẫu'}).click();
  await expect(page.getByText('800.000 ĐỒNG',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText('CHƯA CÓ DỮ LIỆU CHỨNG TỪ ĐÃ DUYỆT',{exact:true})).toBeVisible();
  await page.goto('/scan-document'); await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check();
  const camera=await synthetic(page,'camera');
  for(let i=0;i<3;i++) {
    await page.getByLabel('1. Chọn ảnh').setInputFiles({name:`camera-${i}.png`,mimeType:'image/png',buffer:camera});
    await expect(page.getByText('2. Đối chiếu từng trường')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByRole('button',{name:'Đọc chứng từ',exact:true}).click();
    await expect(page.getByText('2. Đối chiếu từng trường')).toBeVisible({timeout:60_000});
    expect(dimensions[i+1][0]).toBeLessThan(1200);expect(dimensions[i+1][1]).toBeLessThan(1600);
    expect(await page.evaluate(()=>Reflect.get(window,'documentTestLiveUrls'))).toBeLessThanOrEqual(4);
  }
  await page.getByLabel('Loại chứng từ').selectOption('unknown');await expect(page.getByText('2. Đối chiếu từng trường')).toHaveCount(0);
  await page.getByRole('button',{name:'Xóa phiên',exact:true}).click();
  expect(await page.evaluate(()=>Reflect.get(window,'documentTestLiveUrls'))).toBe(0);
  expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);
});
for(const kind of ['blur','glare','empty'] as const) test(`${kind} valid image reaches OCR instead of failing a quality gate`,async({page})=>{
  let calls=0;await page.route('**/api/documents/extract',async route=>{calls++;await route.fulfill({json:{success:true,data:result}});});
  await page.goto('/scan-document'); await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check();
  await page.getByLabel('Nguồn ảnh').selectOption(kind==='empty'?'upload-photo':'clean-scan');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({name:`${kind}.png`,mimeType:'image/png',buffer:await synthetic(page,kind)});
  await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByRole('button',{name:'Đọc chứng từ',exact:true}).click();
  await expect(page.getByText('2. Đối chiếu từng trường')).toBeVisible({timeout:60_000});
  expect(calls).toBe(1);
});

const draft = (rawText = 'THÔNG BÁO\nHọ và tên: Người Thử\nSố tiền: 100.000 đồng') => ({ success: true, data: assembleJson({ provider: 'fixed-browser', fullText: rawText, lines: [], tokens: [], pageCount: 1, warnings: [] }, { documentId: 'browser-' + rawText, mimeType: 'image/png' }) });
test('JSON upload, structured review, edit, raw preservation and parseable download', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { Reflect.set(window, 'copiedJson', text); } } }));
  await page.route('**/api/documents/json', route => route.fulfill({ json: draft() }));
  await page.goto('/scan-document'); await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check();
  await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: await synthetic(page, 'clean') });
  await page.getByRole('button', { name: 'Chuyển ảnh sang JSON' }).click();
  const review = page.getByRole('region', { name: 'Duyệt JSON' });
  await expect(review).toBeVisible({ timeout: 60_000 });
  const download = review.getByRole('button', { name: 'Tải .json', exact: true });
  const confirm = review.getByRole('checkbox');
  await expect(download).toBeDisabled();
  expect(await page.evaluate(() => sessionStorage.getItem('afl_prerequisite_document_data'))).toBeNull();
  await confirm.check();
  await review.getByLabel('Giá trị sử dụng: Số tiền', { exact: true }).fill('200.000 đồng');
  await expect(confirm).not.toBeChecked();
  await review.getByRole('button', { name: 'Raw OCR', exact: true }).click();
  await expect(review.getByTestId('raw-ocr')).toHaveText(draft().data.rawText);
  await review.getByRole('button', { name: 'JSON raw', exact: true }).click();
  await expect(review.getByTestId('json-raw')).toContainText('200.000 đồng');
  await review.getByRole('button', { name: 'Copy JSON', exact: true }).click();
  const copied = JSON.parse(await page.evaluate(() => Reflect.get(window, 'copiedJson')));
  expect(validateJsonExport(copied).valid).toBe(true);
  expect(copied.rawText).toBe(draft().data.rawText);
  await confirm.check();
  const pending = page.waitForEvent('download'); await download.click(); const file = await pending;
  expect(file.suggestedFilename()).toBe('test.json');
  const output = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(validateJsonExport(output).valid).toBe(true);
  expect(output.rawText).toBe(draft().data.rawText);
  expect(output.structure.fields.find((f: { label: string }) => f.label === 'Số tiền').normalizedValue).toBe('200.000 đồng');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'next.png', mimeType: 'image/png', buffer: await synthetic(page, 'clean') });
  await expect(review).toHaveCount(0);
  await page.route('**/api/documents/json', route => route.fulfill({ status: 503, json: { success: false, error: { code: 'OCR_NOT_CONFIGURED', message_vi: 'Chưa cấu hình VietOCR' } } }));
  await page.getByRole('button', { name: 'Chuyển ảnh sang JSON' }).click();
  await expect(page.getByRole('status').first()).toContainText('VietOCR', { timeout: 60_000 });
  await expect(review).toHaveCount(0);
});

test('workbench JSON resets on image replacement', async ({ page }) => {
  await page.route('**/api/documents/json', route => route.fulfill({ json: draft() }));
  await page.goto('/document-test');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: await synthetic(page, 'clean') });
  await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  const review = page.getByRole('region', { name: 'Duyệt JSON' });
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review.getByRole('button', { name: 'Tải .json', exact: true })).toBeDisabled();
  await page.locator('input[type=file]').setInputFiles({ name: 'next.png', mimeType: 'image/png', buffer: await synthetic(page, 'clean') });
  await expect(review).toHaveCount(0);
});

for (const kind of ['clean', 'low-contrast', 'small'] as const) test(`adaptive ${kind}: three runs retain primary, preview enhancement and clear output`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const consoleErrors: string[] = []; page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  let calls = 0; const sizes: number[][] = [];
  await page.route('**/api/documents/extract', async route => {
    calls++; const body = route.request().postDataBuffer()!;
    const offset = body.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));
    sizes.push([body.readUInt32BE(offset+16), body.readUInt32BE(offset+20)]);
    if (kind !== 'clean') expect(body.toString('latin1')).toContain('name="contrast"');
    await route.fulfill({ json: { success: true, data: result } });
  });
  await page.goto('/scan-document'); await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  const image = await synthetic(page, kind);
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: `${kind}-${i}.png`, mimeType: 'image/png', buffer: image });
    await expect(page.getByText('2. Đối chiếu từng trường')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByRole('button', { name: 'Đọc chứng từ', exact: true }).click();
    await expect(page.getByText('2. Đối chiếu từng trường')).toBeVisible({ timeout: 60_000 });
    if (kind !== 'clean') {
      const primary = await page.getByTestId('evidence-image').locator('img').getAttribute('src');
      await page.getByRole('button', { name: 'Bản tăng tương phản', exact: true }).click();
      expect(await page.getByTestId('evidence-image').locator('img').getAttribute('src')).not.toBe(primary);
      await page.getByRole('button', { name: 'Ảnh màu primary', exact: true }).click();
      await expect(page.getByTestId('evidence-image').locator('img')).toHaveAttribute('src', primary!);
      await expect(page.getByRole('region', { name: 'Kiểm tra kết quả' })).not.toContainText('Hãy chụp lại');
    }
  }
  expect(calls).toBe(3); expect(sizes.every(size => JSON.stringify(size) === JSON.stringify(kind === 'small' ? [123,161] : [1200,1600]))).toBe(true);
  await page.getByLabel('Nguồn ảnh').selectOption('upload-photo'); await expect(page.getByText('2. Đối chiếu từng trường')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ảnh màu primary', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]); expect(consoleErrors).toEqual([]);
});

test('shadow input previews the lighting variant without a blocking warning', async ({ page }) => {
  await page.route('**/api/documents/extract', route => route.fulfill({ json: { success: true, data: result } }));
  await page.goto('/scan-document'); await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'shadow.png', mimeType: 'image/png', buffer: await synthetic(page, 'shadow') });
  await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByRole('button', { name: 'Đọc chứng từ', exact: true }).click();
  await expect(page.getByText('2. Đối chiếu từng trường')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Bản cân bằng ánh sáng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bản cân bằng ánh sáng', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('camera with no trustworthy paper retains preview and requires explicit whole-image action', async ({ page }) => {
  await page.addInitScript(() => {
    const live = new Set<string>(), create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); live.add(url); return url; };
    URL.revokeObjectURL = url => { live.delete(url); revoke(url); };
    Object.defineProperty(window, 'ocrCleanupUrls', { get: () => live.size });
  });
  let calls = 0;
  await page.route('**/api/documents/extract', async route => {
    calls++; const body = route.request().postDataBuffer()!.toString('latin1');
    expect(body).toMatch(/name="documentDetectionFailed"\r\n\r\ntrue/); expect(body).toMatch(/name="deskewApplied"\r\n\r\nfalse/);
    await route.fulfill({ json: { success: true, data: { ...result, status: 'manual_review_required', fields: {}, fullText: '',
      ocrReview: { documentDetectionFailed: true, attempts: [], selectedAttempt: 0, selectionReason: '', warnings: ['OCR_EMPTY_TEXT'], requiresReview: true,
        regions: [{ boundingBox: [0,0,1,1], status: 'unreadable', reason: 'OCR_EMPTY_TEXT', sources: [] }] } } } });
  });
  await page.goto('/scan-document'); await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByLabel('Nguồn ảnh').selectOption('camera-photo');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'no-paper.png', mimeType: 'image/png', buffer: await synthetic(page, 'empty') });
  await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByRole('button', { name: 'Đọc chứng từ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thử đọc toàn ảnh', exact: true })).toBeVisible({ timeout: 60_000 });
  expect(calls).toBe(0); await expect(page.getByTestId('evidence-image').locator('img')).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'ocrCleanupUrls'))).toBe(1);
  await page.getByRole('button', { name: 'Thử đọc toàn ảnh', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Vùng cần kiểm tra', exact: true })).toContainText('Chưa đọc được vùng này', { timeout: 60_000 });
  expect(calls).toBe(1); await expect(page.getByRole('button', { name: '3. Xác nhận' })).toBeDisabled();
  await page.getByRole('button', { name: /Vùng cần kiểm tra 1/ }).click(); await expect(page.getByTestId('evidence-box')).toHaveCount(1);
  await page.getByRole('button', { name: 'Xóa phiên', exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, 'ocrCleanupUrls'))).toBe(0);
});

test('late response cannot overwrite a newer request; replacing image clears output immediately', async ({ page }) => {
  let releaseOld!: () => void; const oldResponse = new Promise<void>(resolve => { releaseOld = resolve; });
  let announceFirst!: () => void; const firstStarted = new Promise<void>(resolve => { announceFirst = resolve; });
  let calls = 0;
  await page.route('**/api/documents/extract', async route => {
    const old = ++calls === 1;
    if (old) { announceFirst(); await oldResponse; }
    try { await route.fulfill({ json: { success: true, data: { ...result, fullText: old ? 'OLD_RESULT_SHOULD_NOT_APPEAR' : 'NEW_RESULT_CURRENT' } } }); } catch { /* Old aborted request may be gone. */ }
  });
  await page.goto('/scan-document'); await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  const image = await synthetic(page, 'clean');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'old.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByRole('button', { name: 'Đọc chứng từ', exact: true }).click(); await firstStarted;
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('checkbox', { name: 'Tôi đồng ý gửi nội dung chữ đã đọc tới Gemini để trích xuất trường.' }).check(); await page.getByRole('button', { name: 'Đọc chứng từ', exact: true }).click();
  await expect(page.getByText('2. Đối chiếu từng trường')).toBeVisible({ timeout: 60_000 });
  releaseOld(); await page.getByText('Xem toàn văn OCR', { exact: true }).click();
  await expect(page.locator('details pre').last()).toHaveText('NEW_RESULT_CURRENT');
  await expect(page.getByText('OLD_RESULT_SHOULD_NOT_APPEAR', { exact: true })).toHaveCount(0);
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'third.png', mimeType: 'image/png', buffer: image });
  await expect(page.getByText('2. Đối chiếu từng trường')).toHaveCount(0); await expect(page.getByText('NEW_RESULT_CURRENT', { exact: true })).toHaveCount(0);
});
