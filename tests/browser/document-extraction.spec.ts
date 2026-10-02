import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { validateMarkdown } from '../../src/modules/documents/markdown-validator';

async function synthetic(page: Page, kind: 'clean'|'camera'|'blur'|'glare'|'empty'): Promise<Buffer> {
  const data = await page.evaluate(kind => {
    const c=document.createElement('canvas'); c.width=1200;c.height=1600;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#404040';ctx.fillRect(0,0,c.width,c.height);
    if(kind==='empty') return c.toDataURL('image/png').split(',')[1];
    const paper=document.createElement('canvas');paper.width=1000;paper.height=1400;const p=paper.getContext('2d')!;
    p.fillStyle=kind==='glare' ? '#b0b0b0' : '#fff';p.fillRect(0,0,1000,1400);p.fillStyle='#111';p.font='24px Arial';
    p.fillText('BIÊN BẢN VI PHẠM GIAO THÔNG — DỮ LIỆU THỬ',50,70);
    for(let i=0;i<26;i++)p.fillText(`Dòng thử nghiệm ${i+1}: ABCDEFG 0123456789`,50,130+i*42);
    if(kind==='glare'){p.fillStyle='#fff';p.fillRect(430,650,38,38);}
    if(kind==='camera'){ctx.setTransform(0.85,0.06,-0.06,0.85,220,130);ctx.drawImage(paper,0,0);}
    else {if(kind==='blur')ctx.filter='blur(12px)';ctx.drawImage(paper,0,0,1200,1600);}
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
  await page.goto('/scan-document');
  await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:await synthetic(page,'clean')});
  await page.getByRole('button',{name:'Đọc chứng từ',exact:true}).click();
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
  await page.goto('/scan-document');
  const camera=await synthetic(page,'camera');
  for(let i=0;i<3;i++) {
    await page.getByLabel('1. Chọn ảnh').setInputFiles({name:`camera-${i}.png`,mimeType:'image/png',buffer:camera});
    await expect(page.getByText('2. Đối chiếu từng trường')).toHaveCount(0);
    await page.getByRole('button',{name:'Đọc chứng từ',exact:true}).click();
    await expect(page.getByText('2. Đối chiếu từng trường')).toBeVisible({timeout:60_000});
    expect(dimensions[i+1][0]).toBeLessThan(1200);expect(dimensions[i+1][1]).toBeLessThan(1600);
    expect(await page.evaluate(()=>Reflect.get(window,'documentTestLiveUrls'))).toBe(2);
  }
  await page.getByLabel('Loại chứng từ').selectOption('unknown');await expect(page.getByText('2. Đối chiếu từng trường')).toHaveCount(0);
  await page.getByRole('button',{name:'Xóa phiên',exact:true}).click();
  expect(await page.evaluate(()=>Reflect.get(window,'documentTestLiveUrls'))).toBe(0);
  expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);
});
for(const kind of ['blur','glare','empty'] as const) test(`${kind} image fails gate without OCR request`,async({page})=>{
  let calls=0;await page.route('**/api/documents/extract',async route=>{calls++;await route.fulfill({json:{success:true,data:result}});});
  await page.goto('/scan-document');
  if(kind!=='empty')await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({name:`${kind}.png`,mimeType:'image/png',buffer:await synthetic(page,kind)});
  await page.getByRole('button',{name:'Đọc chứng từ',exact:true}).click();
  await expect(page.getByRole('status')).toContainText(kind==='blur'?'mờ':kind==='glare'?'lóa':'bốn góc',{timeout:60_000});
  expect(calls).toBe(0);
});

const draftText = '# THÔNG BÁO\n\n| Họ tên | Số tiền |\n| --- | --- |\n| Nguyễn Văn A | 100.000 đồng |\n';
const draft = (markdown = draftText) => ({ success: true, data: { contractVersion: 1, status: 'review_required', markdown,
  provider: 'google-document-ai', rawText: 'THÔNG BÁO\nHọ tên\nSố tiền\nNguyễn Văn A\n100.000 đồng', pageCount: 1, confidence: 0.99, warnings: [], validation: validateMarkdown(markdown) } });

test('Markdown: OpenCV upload, table preview, edit invalidates review, download matches edited text', async ({ page }) => {
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.route('**/api/documents/markdown', async route => {
    const bytes = route.request().postDataBuffer()!;
    expect(bytes.indexOf(Buffer.from([137,80,78,71,13,10,26,10]))).toBeGreaterThan(0);
    await route.fulfill({ json: draft() });
  });
  await page.goto('/scan-document');
  await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: await synthetic(page, 'clean') });
  await page.getByRole('button', { name: 'Chuyển ảnh sang Markdown' }).click();
  const review = page.getByRole('region', { name: 'Duyệt Markdown' });
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review.getByRole('table')).toBeVisible();
  await review.getByText('Văn bản OCR nguyên bản để đối chiếu', { exact: true }).click();
  await expect(review.locator('details pre')).toHaveText(draft().data.rawText);
  const download = review.getByRole('button', { name: '3. Tải file .md đã duyệt' });
  const confirm = review.getByRole('checkbox');
  expect(downloads).toBe(0);
  await expect(download).toBeDisabled();
  await confirm.check();
  await expect(download).toBeEnabled();
  await review.getByRole('button', { name: 'Sửa Markdown' }).click();
  await review.getByLabel('Nội dung Markdown').fill('```\nthiếu dấu đóng');
  await expect(confirm).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await expect(download).toBeDisabled();
  const edited = draftText.replace('100.000', '200.000');
  await review.getByLabel('Nội dung Markdown').fill(edited);
  await expect(review.locator('details pre')).toHaveText(draft().data.rawText);
  await confirm.check();
  const pending = page.waitForEvent('download');
  await download.click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('test.md');
  expect(readFileSync((await file.path())!, 'utf8')).toBe(edited);
  await page.getByLabel('Nguồn ảnh').selectOption('camera-photo');
  await expect(review).toHaveCount(0);
});

test('Markdown API failure displays actionable error with no stale draft or download', async ({ page }) => {
  await page.route('**/api/documents/markdown', route => route.fulfill({ status: 503, json: { success: false, error: { code: 'OCR_NOT_CONFIGURED', message_vi: 'Chưa cấu hình Google Document AI' } } }));
  await page.goto('/scan-document');
  await page.getByLabel('Nguồn ảnh').selectOption('clean-scan');
  await page.getByLabel('1. Chọn ảnh').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: await synthetic(page, 'clean') });
  await page.getByRole('button', { name: 'Chuyển ảnh sang Markdown' }).click();
  await expect(page.getByRole('status')).toContainText('Google Document AI', { timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Duyệt Markdown' })).toHaveCount(0);
});

test('test workspace also requires review and prevents stale results after replacement', async ({ page }) => {
  await page.route('**/api/documents/markdown', route => route.fulfill({ json: draft() }));
  await page.goto('/document-test');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: await synthetic(page, 'clean') });
  await page.getByRole('button', { name: 'Xuất Markdown', exact: true }).click();
  const review = page.getByRole('region', { name: 'Duyệt Markdown' });
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review.getByRole('button', { name: '3. Tải file .md đã duyệt' })).toBeDisabled();
  await page.locator('input[type=file]').setInputFiles({ name: 'next.png', mimeType: 'image/png', buffer: await synthetic(page, 'clean') });
  await expect(review).toHaveCount(0);
});
