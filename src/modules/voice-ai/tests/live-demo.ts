import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { GeminiPromptService } from '../services/gemini-prompt.service';
import { isValidMp3, validWordTimestamps } from '../services/tts.service';
import { renderDemoPreview, type DemoAudio } from './demo-preview';
import type { LocalCacheService } from '@/modules/cache';
import type { FormGeometricManifest, FormWorkflow, NormalizedBoundingBox } from '@/shared/contracts';
import type { DocumentJsonExport } from '@/shared/document-export.types';

const outputDirectory = path.join(process.cwd(), 'private-documents', 'voice-demo');
const reviewedFields = [
  { label: 'Họ và tên', coords: [300 / 1400, 0.08, 400 / 1400, 0.92],
    guidance: 'Dạ bác ghi họ và tên của chính mình vào ô này. Chữ đỏ chỉ là ví dụ, bác không chép tên mẫu nhé.',
    example: 'NGUYỄN VĂN MẪU', question: 'Tôi ghi tên ai?', answer: 'Dạ bác ghi họ và tên của chính mình, không chép tên ví dụ nhé.' },
  { label: 'Địa chỉ liên hệ', coords: [520 / 1400, 0.08, 620 / 1400, 0.92],
    guidance: 'Dạ bác ghi địa chỉ liên hệ của chính mình vào ô này. Đây là bản demo, bác không ghi dữ liệu cá nhân thật khi thử nhé.',
    example: 'ĐỊA CHỈ MINH HỌA', question: 'Tôi ghi địa chỉ nào?', answer: 'Dạ bác ghi địa chỉ liên hệ của chính mình. Khi chạy demo, bác chỉ dùng thông tin giả để thử nhé.' },
] as const;

async function main() {
  if (!process.argv.includes('--live')) {
    console.log('Opt-in only: npx tsx src/modules/voice-ai/tests/live-demo.ts --live --cloud-only');
    console.log('Create real DB draft: --live --create; publish only the reviewed synthetic fixture: add --publish-demo');
    return;
  }
  const create = process.argv.includes('--create');
  const cloudOnly = process.argv.includes('--cloud-only');
  const publish = process.argv.includes('--publish-demo');
  assert.ok(create !== cloudOnly && (!publish || create), 'Choose --create OR --cloud-only; publishing requires --create.');
  const base = process.env.VOICE_DEMO_URL || 'http://127.0.0.1:3001';
  const origin = new URL(base);
  assert.ok(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
    && origin.pathname === '/' && !origin.search && !origin.username && !origin.password, 'Only a loopback demo server is allowed.');
  const adminKey = process.env.ADMIN_SECRET_KEY;
  assert.ok(adminKey?.trim(), 'ADMIN_SECRET_KEY is required; never pass it on the command line.');
  const formCode = process.env.VOICE_DEMO_FORM_CODE || `DEMO-VOICE-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17)}`;
  assert.match(formCode, /^DEMO-VOICE-[A-Za-z0-9_-]{1,64}$/);
  const evidence: Record<string, unknown> = { formCode, startedAt: new Date().toISOString(), mode: create ? 'real-database' : 'cloud-only', persisted: false, published: false };
  await fs.mkdir(outputDirectory, { recursive: true });
  const api = async (endpoint: string, options: { method?: string; body?: unknown; admin?: boolean } = {}) => {
    const response = await fetch(new URL(endpoint, origin), { method: options.method ?? 'GET', redirect: 'error',
      headers: { ...(options.admin ? { 'x-admin-key': adminKey } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}), signal: AbortSignal.timeout(45000) });
    const body = await response.json();
    if (!response.ok || body.success !== true) throw new Error(`${endpoint}: HTTP_${response.status} ${body.error?.code ?? 'INVALID_ENVELOPE'}`);
    return body;
  };
  try {
    if (create) {
      const forms = await api('/api/admin/forms', { admin: true });
      assert.ok(!forms.data.forms.some((form: { formCode: string }) => form.formCode === formCode), 'Never overwrite an existing form, including a draft.');
      evidence.databasePreflight = 'passed';
    }
    const health = await fetch('http://127.0.0.1:8000/health', { signal: AbortSignal.timeout(5000) });
    const ocrHealth = await health.json(); assert.equal(health.status, 200); assert.equal(ocrHealth.ready, true);
    evidence.ocrHealth = ocrHealth;
    const png = await sharp(path.join(process.cwd(), 'src/modules/voice-ai/tests/fixtures/demo-blank.svg')).png().toBuffer();
    const pngPath = path.join(outputDirectory, 'demo-blank.png'); await fs.writeFile(pngPath, png);
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    let manifest!: FormGeometricManifest;
    let processedImage!: Buffer;
    try {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
      await page.goto(new URL('/admin/library', origin).toString());
      await page.getByRole('button', { name: 'Thêm phôi trống' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Mã biểu mẫu').fill(formCode);
      await dialog.getByLabel('Tên biểu mẫu').fill('DEMO Voice AI - không dùng làm thủ tục');
      await dialog.getByLabel('Ảnh phôi').setInputFiles(pngPath);
      await dialog.getByRole('checkbox', { name: 'Đây là phôi trống', exact: false }).check();
      const ocrResponse = page.waitForResponse(response => response.url().endsWith('/api/documents/json'), { timeout: 90000 });
      await dialog.getByRole('button', { name: 'Phân tích OpenCV và VietOCR' }).click();
      const response = await ocrResponse;
      const envelope = await response.json(); assert.equal(response.status(), 200); assert.equal(envelope.success, true);
      const document: DocumentJsonExport = envelope.data;
      assert.equal(document.provider.name, 'vietocr'); assert.notEqual(document.status, 'failed');
      await dialog.getByLabel('Ô cần đối soát').waitFor({ timeout: 30000 });
      const selector = dialog.getByLabel('Ô cần đối soát');
      const count = await selector.locator('option').count();
      const candidates: NormalizedBoundingBox[] = [];
      for (let index = 0; index < count; index++) {
        await selector.selectOption(String(index));
        candidates.push(await dialog.locator('[title="Nhấn giữ và kéo để di chuyển ô"]').evaluate(element => {
          const style = (element.parentElement as HTMLElement).style;
          const top = parseFloat(style.top) / 100, left = parseFloat(style.left) / 100;
          return [top, left, top + parseFloat(style.height) / 100, left + parseFloat(style.width) / 100];
        }) as NormalizedBoundingBox);
      }
      evidence.detectedCandidates = candidates;
      const selectedIndices = reviewedFields.map(field => {
        const matches = candidates.flatMap((coords, index) => coords.every((value, axis) => Math.abs(value - field.coords[axis]) < 0.025)
          ? [{ index, distance: coords.reduce((total, value, axis) => total + Math.abs(value - field.coords[axis]), 0) }] : [])
          .sort((first, second) => first.distance - second.distance);
        assert.ok(matches.length > 0 && (matches.length === 1 || matches[1].distance - matches[0].distance > 0.001),
          `OpenCV writing regions must have an unambiguous nearest match for ${field.label}; do not substitute fixture geometry.`);
        return matches[0].index;
      });
      for (let index = count - 1; index >= 0; index--) {
        if (!selectedIndices.includes(index)) {
          await selector.selectOption(String(index)); await dialog.getByRole('button', { name: 'Loại ô không cần kê khai', exact: true }).click();
        }
      }
      assert.equal(await selector.locator('option').count(), 2);
      for (let index = 0; index < 2; index++) {
        await selector.selectOption(String(index)); await dialog.getByLabel('Nhãn thực trên phôi').fill(reviewedFields[index].label);
      }
      await dialog.getByRole('checkbox', { name: 'Đã đối chiếu từng nhãn', exact: false }).check();
      const image = dialog.getByRole('img', { name: 'Biểu mẫu cần đối soát' });
      processedImage = Buffer.from(await image.evaluate(async element => [...new Uint8Array(await (await fetch((element as HTMLImageElement).src)).arrayBuffer())]));
      const dimensions = await sharp(processedImage).metadata();
      assert.equal(dimensions.width, document.pages[0].width); assert.equal(dimensions.height, document.pages[0].height);
      manifest = { formId: `demo_${Date.now()}`, formCode, formTitle: 'DEMO Voice AI - không dùng làm thủ tục',
        imageDimensions: { width: dimensions.width!, height: dimensions.height! },
        boxes: reviewedFields.map((field, index) => ({ boxId: `box_${index + 1}`, rawText: field.label, boxType: 'text',
          normalizedCoords: candidates[selectedIndices[index]], estimatedWidthRatio: candidates[selectedIndices[index]][3] - candidates[selectedIndices[index]][1] })) };
      evidence.geometry = { candidateCount: count, retainedCount: 2, candidates, selectedIndices, correctedLabels: reviewedFields.map(field => field.label) };
      evidence.ocr = { rawText: document.rawText, warnings: document.warnings, status: document.status };
      await page.screenshot({ path: path.join(outputDirectory, `${formCode}-admin-ocr.png`), fullPage: true, mask: [page.locator('input[type=password]')] });
    } finally { await browser.close(); }
    let workflow: FormWorkflow;
    if (create) {
      const asset = await api('/api/admin/forms/assets', { admin: true, method: 'POST',
        body: { formCode, blankTemplateConfirmed: true, imageBase64: `data:image/png;base64,${processedImage.toString('base64')}` } });
      manifest.pages = [asset.data];
      const generated = await api('/api/llm/prompt', { admin: true, method: 'POST', body: { manifest } });
      assert.equal(generated.meta.persisted, true); workflow = generated.data; evidence.persisted = true;
      const draftRead = await fetch(new URL(`/api/forms/${encodeURIComponent(formCode)}/workflow`, origin));
      assert.equal(draftRead.status, 404); evidence.draftPublicRead = 404;
    } else {
      const noFileCache = { get: () => null, set: () => {} } as unknown as LocalCacheService;
      workflow = await new GeminiPromptService(noFileCache).generateWorkflow(manifest, true);
    }
    assert.equal(workflow.steps.length, 2); assert.equal(workflow.status, 'PENDING_REVIEW');
    evidence.generatedWorkflow = workflow;
    const reviewed = { ...workflow, steps: workflow.steps.map((step, index) => ({ ...step,
      sectionName: 'Thông tin demo', requiresPrerequisiteDoc: false, sourceFieldFromPrerequisite: undefined, legalWarningFlag: false,
      voiceGuidance: reviewedFields[index].guidance, exampleRedText: reviewedFields[index].example,
      faqs: [{ question: reviewedFields[index].question, answer: reviewedFields[index].answer }] })) };
    const audioChecks = [];
    const previewAudio: DemoAudio[] = [];
    for (const region of ['NORTH', 'SOUTH'] as const) {
      for (const step of reviewed.steps) {
        const result = await api('/api/tts', { method: 'POST', admin: true, body: { text: step.voiceGuidance, stepIndex: step.stepIndex, region } });
        const audio = await fetch(new URL(result.data.audioUrl, origin), { redirect: 'error', signal: AbortSignal.timeout(15000) });
        const bytes = Buffer.from(await audio.arrayBuffer()); assert.equal(audio.status, 200); assert.equal(isValidMp3(bytes), true);
        assert.equal(validWordTimestamps(result.data.wordTimestamps, step.voiceGuidance), true);
        audioChecks.push({ region, stepIndex: step.stepIndex, audioUrl: result.data.audioUrl, bytes: bytes.length,
          timestampCount: result.data.wordTimestamps.length, timestampSource: result.data.timestampSource ?? 'unknown_legacy_cache' });
        previewAudio.push({ region, stepIndex: step.stepIndex, dataUrl: `data:audio/mpeg;base64,${bytes.toString('base64')}` });
        if (region === 'NORTH') step.audioUrl = result.data.audioUrl;
      }
    }
    assert.equal(new Set(audioChecks.map(audio => audio.audioUrl)).size, 4); evidence.audioChecks = audioChecks;
    evidence.reviewedWorkflow = reviewed;
    if (cloudOnly) {
      const previewPath = path.join(outputDirectory, 'voice-qa-demo.html');
      await fs.writeFile(previewPath, renderDemoPreview(reviewed, `data:image/png;base64,${processedImage.toString('base64')}`, previewAudio));
      evidence.previewPath = previewPath;
    }
    if (create) {
      await api(`/api/admin/forms/${encodeURIComponent(formCode)}/workflow`, { method: 'PUT', admin: true, body: reviewed });
      if (publish) {
        await api(`/api/admin/forms/${encodeURIComponent(formCode)}/approve`, { method: 'POST', admin: true,
          body: { reviewConfirmed: true, performedBy: 'DEMO Voice QA', note: 'Synthetic blank fixture, two reviewed fields, no citizen data, no legal procedure. Demo only.' } });
        const active = await api(`/api/forms/${encodeURIComponent(formCode)}/workflow`);
        assert.equal(active.data.status, 'ACTIVE'); assert.equal(active.data.steps.length, 2); evidence.published = true;
        for (const step of active.data.steps) {
          assert.equal(step.voiceGuidance, reviewed.steps[step.stepIndex - 1].voiceGuidance);
          assert.equal(step.audioUrl, reviewed.steps[step.stepIndex - 1].audioUrl);
          const qa = await api('/api/llm/qa', { method: 'POST', body: { formCode, stepIndex: step.stepIndex, userQuestion: step.faqs[0].question } });
          assert.equal(qa.data.source, 'faq_match'); assert.equal(qa.data.answerText, step.faqs[0].answer);
        }
        const image = await fetch(new URL(active.data.pages[0].imageUrl, origin));
        assert.equal(image.status, 200); assert.match(image.headers.get('content-type') ?? '', /image\/png/);
        evidence.citizenUrl = new URL(`/citizen/guide?formCode=${encodeURIComponent(formCode)}`, origin).toString();
      }
    }
    evidence.result = 'passed'; console.log(JSON.stringify({ formCode, persisted: evidence.persisted, published: evidence.published, citizenUrl: evidence.citizenUrl, outputDirectory }, null, 2));
  } catch (error) {
    evidence.result = 'failed'; evidence.error = error instanceof Error ? error.message : 'UNKNOWN'; throw error;
  } finally {
    evidence.completedAt = new Date().toISOString(); await fs.writeFile(path.join(outputDirectory, `${formCode}-evidence.json`), JSON.stringify(evidence, null, 2));
  }
}

main().catch(error => { console.error('DEMO_NOT_READY:', error instanceof Error ? error.message : 'UNKNOWN'); process.exitCode = 1; });
