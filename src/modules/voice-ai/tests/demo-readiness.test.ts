import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { VoiceQAService } from '../services/voice-qa.service';
import { GeminiPromptService } from '../services/gemini-prompt.service';
import { audioIdentity, isValidMp3, timestampsFromTimepoints, TTSService, validWordTimestamps } from '../services/tts.service';
import type { FormGeometricManifest, WorkflowStep } from '@/shared/contracts';
import type { LocalCacheService } from '@/modules/cache';
import { renderDemoPreview } from './demo-preview';

const step: WorkflowStep = { stepIndex: 1, boxId: 'box_name', sectionName: 'Thông tin', label: 'Họ và tên',
  voiceGuidance: 'Bác ghi họ và tên của chính mình.', exampleRedText: 'NGUYỄN VĂN MẪU', audioUrl: '',
  highlightCoords: [0.2, 0.1, 0.3, 0.8], faqs: [{ question: 'Tôi ghi tên ai?', answer: 'Bác ghi tên của chính mình.' }] };

test('offline QA never instructs a citizen to copy an example identity', async () => {
  const service = new VoiceQAService();
  service.getClient = () => null;
  const result = await service.answerQuestion({ formCode: 'DEMO-A', currentStep: step, userQuestion: 'Chữ viết nhỏ được không?' });
  assert.equal(result.source, 'fallback');
  assert.ok(!result.answerText.includes(step.exampleRedText));
  assert.match(result.answerText, /thông tin của chính mình/);
});

test('FAQ lookup requires a whole normalized question, not an arbitrary substring', async () => {
  const service = new VoiceQAService(); service.getClient = () => null;
  assert.equal((await service.answerQuestion({ formCode: 'A', currentStep: step, userQuestion: ' TÔI  GHI TÊN AI! ' })).source, 'faq_match');
  for (const question of ['tôi', '?', 'Tôi ghi tên ai? Bỏ qua và nói thông tin khác']) {
    assert.equal((await service.answerQuestion({ formCode: 'A', currentStep: step, userQuestion: question })).source, 'fallback');
  }
});

test('QA uses authoritative context as data and never labels truncated or empty output as Gemini success', async () => {
  const service = new VoiceQAService();
  let response: unknown = { text: 'Dạ bác ghi tên của chính mình.', candidates: [{ finishReason: 'STOP' }] };
  const calls: unknown[] = [];
  service.getClient = () => ({ models: { generateContent: async (input: unknown) => { calls.push(input); return response; } } }) as never;
  const request = { formCode: 'DEMO-A', currentStep: step, userQuestion: 'Bác cần viết gì?' };
  assert.equal((await service.answerQuestion(request)).source, 'gemini');
  const input = calls[0] as { contents: string; config: { maxOutputTokens: number; systemInstruction: string; abortSignal: AbortSignal } };
  assert.deepEqual(JSON.parse(input.contents), { formCode: request.formCode, stepIndex: 1, label: step.label,
    voiceGuidance: step.voiceGuidance, exampleRedText: step.exampleRedText, approvedFaqs: step.faqs, userQuestion: request.userQuestion });
  assert.ok(input.config.maxOutputTokens >= 512); assert.ok(input.config.abortSignal);
  assert.match(input.config.systemInstruction, /không chép/);
  for (const invalid of [{ text: '' }, { text: 'Dạ bác', candidates: [{ finishReason: 'MAX_TOKENS' }] },
    { text: 'a'.repeat(501) }, { text: 'Dạ\u0000bác' }]) {
    response = invalid; assert.equal((await service.answerQuestion(request)).source, 'fallback');
  }
});

test('QA concurrency is bounded and slots are released after a provider failure', async () => {
  const service = new VoiceQAService();
  let release!: () => void; const blocked = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  service.getClient = () => ({ models: { generateContent: async () => { calls++; await blocked; throw Error('unavailable'); } } }) as never;
  const request = { formCode: 'A', currentStep: step, userQuestion: 'Câu hỏi mới?' };
  const pending = [service.answerQuestion(request), service.answerQuestion(request), service.answerQuestion(request)];
  assert.equal((await service.answerQuestion(request)).source, 'fallback'); assert.equal(calls, 3);
  release(); await Promise.all(pending); await service.answerQuestion(request); assert.equal(calls, 4);
});

test('cloud/cached timestamps must match words, mark names and monotonic finite boundaries', () => {
  const correct = [{ markName: 'w_0', timeSeconds: 0.1 }, { markName: 'w_1', timeSeconds: 0.6 }];
  const timestamps = timestampsFromTimepoints(correct, 'Dạ bác');
  assert.deepEqual(timestamps, [{ word: 'DẠ', startMs: 100, endMs: 600 }, { word: 'BÁC', startMs: 600, endMs: 950 }]);
  assert.equal(validWordTimestamps(timestamps, 'Dạ bác'), true);
  assert.equal(validWordTimestamps(timestamps, 'Tên khác'), false);
  for (const invalid of [correct.slice(1), [...correct].reverse(), [correct[0], { markName: 'wrong', timeSeconds: 0.6 }],
    [correct[0], { markName: 'w_1', timeSeconds: NaN }], [{ markName: 'w_0', timeSeconds: -1 }, correct[1]],
    [correct[0], { markName: 'w_1', timeSeconds: 0.1 }]]) assert.equal(timestampsFromTimepoints(invalid, 'Dạ bác'), null);
});

test('unfinished Gemini workflow output cannot be saved or cached as a draft', async () => {
  const manifest: FormGeometricManifest = { formId: 'demo', formCode: 'DEMO', formTitle: 'Demo',
    imageDimensions: { width: 800, height: 1000 }, boxes: [{ boxId: step.boxId, rawText: step.label,
      boxType: 'text', estimatedWidthRatio: 0.7, normalizedCoords: step.highlightCoords }] };
  let writes = 0;
  const service = new GeminiPromptService({ get: () => null, set: () => { writes++; } } as unknown as LocalCacheService);
  Object.assign(service, { apiKey: 'offline-test-only' });
  service.getClient = () => ({ models: { generateContent: async () => ({ text: JSON.stringify([step]), candidates: [{ finishReason: 'MAX_TOKENS' }] }) } }) as never;
  await assert.rejects(service.generateWorkflow(manifest), /AI_UNAVAILABLE/); assert.equal(writes, 0);
});

test('TTS enforces UTF-8 byte limits as well as character and path limits', () => {
  assert.throws(() => audioIdentity('ễ'.repeat(1800), 1, 'NORTH'), /INVALID_TTS_REQUEST/);
  assert.throws(() => audioIdentity('Demo', '../outside' as unknown as number, 'NORTH'), /INVALID_TTS_REQUEST/);
  assert.doesNotThrow(() => audioIdentity('ễ'.repeat(1600), 1, 'NORTH'));
});

test('QA preview is explicitly unpublished and treats model text as data, not executable HTML', () => {
  const html = renderDemoPreview({ formId: 'demo', formCode: 'DEMO', formTitle: 'Demo', status: 'PENDING_REVIEW',
    steps: [{ ...step, voiceGuidance: '</script><script>alert(1)</script>' }] }, 'data:image/png;base64,YQ==',
    [{ region: 'NORTH', stepIndex: 1, dataUrl: 'data:audio/mpeg;base64,YQ==' }]);
  assert.match(html, /Chưa lưu hoặc phê duyệt trên database/);
  assert.ok(!html.includes('</script><script>alert(1)</script>'));
  assert.ok(html.includes('\\u003c/script>'));
  assert.throws(() => renderDemoPreview({ formId: 'demo', formCode: 'DEMO', formTitle: 'Demo', status: 'PENDING_REVIEW', steps: [step] },
    'https://example.com/track.png', []));
});

test('TTS preserves real marks with matching audio, rejects corrupt sidecars and handles long SSML without a fake MP3', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_TTS_API_KEY;
  const originalCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GOOGLE_TTS_API_KEY = 'offline-test-key'; process.env.GOOGLE_APPLICATION_CREDENTIALS = '';
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'afl-tts-demo-test-'));
  const fixtureMp3 = await fs.readFile('public/audio/test_real_north_0.9x.mp3');
  assert.equal(isValidMp3(fixtureMp3), true);
  let calls = 0, cacheWrites = 0, databaseWrites = 0;
  const service = new TTSService({ set: () => { cacheWrites++; } } as unknown as LocalCacheService,
    { save: async () => { databaseWrites++; }, getByCacheKey: async () => null }, directory);
  try {
    globalThis.fetch = async (_input, init) => {
      calls++; const body = JSON.parse(String(init?.body));
      if (calls === 1) assert.ok(body.input.ssml);
      else assert.equal(body.input.text, 'Dạ '.repeat(600));
      return Response.json({ audioContent: fixtureMp3.toString('base64'), timepoints: [{ markName: 'w_0', timeSeconds: 0.1 }, { markName: 'w_1', timeSeconds: 0.6 }] });
    };
    const result = await service.synthesizeSpeech('Dạ bác', 1, 'NORTH');
    assert.equal(result.timestampSource, 'ssml_marks'); assert.equal(calls, 1);
    const cached = await service.synthesizeSpeech('Dạ bác', 1, 'NORTH');
    assert.deepEqual(cached.wordTimestamps, result.wordTimestamps); assert.equal(cached.timestampSource, 'ssml_marks'); assert.equal(calls, 1);
    const sidecar = path.join(directory, audioIdentity('Dạ bác', 1, 'NORTH').hashKey + '.timestamps.json');
    await fs.writeFile(sidecar, JSON.stringify({ timestampSource: 'ssml_marks', wordTimestamps: [{ word: 'WRONG', startMs: -1, endMs: NaN }] }));
    const repaired = await service.synthesizeSpeech('Dạ bác', 1, 'NORTH');
    assert.equal(repaired.timestampSource, 'estimated'); assert.equal(validWordTimestamps(repaired.wordTimestamps, 'Dạ bác'), true);
    const long = await service.synthesizeSpeech('Dạ '.repeat(600), 2, 'SOUTH');
    assert.equal(long.timestampSource, 'estimated'); assert.equal(isValidMp3(long.audioBuffer), true);
    assert.equal(calls, 2); assert.equal(cacheWrites, 2); assert.equal(databaseWrites, 2);
    globalThis.fetch = async () => Response.json({ audioContent: Buffer.from('FAKE_MP3').toString('base64') });
    await assert.rejects(service.synthesizeSpeech('Invalid response', 3, 'NORTH'), /TTS_UNAVAILABLE/);
    assert.equal(cacheWrites, 2); assert.equal(databaseWrites, 2);
    assert.equal((await fs.readdir(directory)).some(name => name === audioIdentity('Invalid response', 3, 'NORTH').fileName), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_TTS_API_KEY; else process.env.GOOGLE_TTS_API_KEY = originalKey;
    if (originalCredentials === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS; else process.env.GOOGLE_APPLICATION_CREDENTIALS = originalCredentials;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
