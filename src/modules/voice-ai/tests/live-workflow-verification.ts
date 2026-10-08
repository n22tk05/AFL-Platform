import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prisma, pool } from '@/lib/prisma';
import { isValidMp3 } from '../services/tts.service';
import type { FormWorkflow } from '@/shared/contracts';

const directory = path.join(process.cwd(), 'private-documents', 'workflow-recheck');
const option = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const formCode = option('form-code') ?? '';
const stage = option('stage') ?? '';
const results: Record<string, unknown> = { formCode, stage, startedAt: new Date().toISOString(), checks: [] };
const checks = results.checks as { name: string; status: number }[];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function snapshots() {
  const rows = await prisma.formTemplate.findMany({ orderBy: { id: 'asc' }, include: {
    manifest: { include: { boxes: { orderBy: { boxId: 'asc' } } } },
    workflow: { include: { steps: { orderBy: { stepIndex: 'asc' }, include: { faqs: { orderBy: { id: 'asc' } } } } } },
    auditLogs: { orderBy: { id: 'asc' } },
  } });
  return rows.map(row => ({ id: row.id, formCode: row.formCode, hash: hash(row) }));
}

async function main() {
  if (!process.argv.includes('--live')) {
    console.log('Opt-in: --live --form-code=DEMO-VOICE-... --stage=before|draft|active');
    return;
  }
  assert.match(formCode, /^DEMO-VOICE-[A-Za-z0-9_-]{1,64}$/);
  assert.ok(['before', 'draft', 'active'].includes(stage));
  const base = new URL(process.env.VOICE_DEMO_URL || 'http://127.0.0.1:3001');
  assert.ok(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)
    && base.pathname === '/' && !base.search && !base.username && !base.password);
  const adminKey = process.env.ADMIN_SECRET_KEY;
  assert.ok(adminKey?.trim());
  await fs.mkdir(directory, { recursive: true });
  const api = async (name: string, endpoint: string, expected: number, options: { body?: unknown; admin?: boolean; wrongKey?: boolean; method?: string } = {}) => {
    const response = await fetch(new URL(endpoint, base), { method: options.method ?? (options.body ? 'POST' : 'GET'), redirect: 'error',
      headers: { ...(options.admin ? { 'x-admin-key': options.wrongKey ? 'invalid-demo-test-key' : adminKey } : {}),
        ...(options.body ? { 'content-type': 'application/json' } : {}) },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}), signal: AbortSignal.timeout(45000) });
    checks.push({ name, status: response.status });
    assert.equal(response.status, expected, name);
    const envelope = await response.json();
    assert.equal(envelope.success, expected >= 200 && expected < 300, name);
    return envelope;
  };
  const endpoint = `/api/admin/forms/${encodeURIComponent(formCode)}`;
  if (stage === 'before') {
    assert.equal(await prisma.formTemplate.count({ where: { formCode } }), 0, 'never reuse an existing form');
    await api('public list available', '/api/forms', 200);
    await api('admin list available', '/api/admin/forms', 200, { admin: true });
    await api('missing key', '/api/admin/forms', 401);
    await api('wrong key', '/api/admin/forms', 401, { admin: true, wrongKey: true });
    results.baseline = await snapshots();
    await fs.writeFile(path.join(directory, `${formCode}-baseline.json`), JSON.stringify(results.baseline, null, 2), { flag: 'wx' });
  } else {
    const baseline = JSON.parse(await fs.readFile(path.join(directory, `${formCode}-baseline.json`), 'utf8')) as Awaited<ReturnType<typeof snapshots>>;
    const current = await snapshots();
    for (const existing of baseline) assert.equal(current.find(row => row.id === existing.id)?.hash, existing.hash, 'existing forms are unchanged');
    results.existingFormsUnchanged = baseline.length;
    const db = await prisma.formTemplate.findUniqueOrThrow({ where: { formCode }, include: {
      manifest: { include: { boxes: { orderBy: { spatialOrder: 'asc' } } } },
      workflow: { include: { steps: { orderBy: { stepIndex: 'asc' }, include: { faqs: { orderBy: { order: 'asc' } } } } } },
      auditLogs: true,
    } });
    assert.equal(db.manifest?.boxes.length, 2);
    assert.equal(db.workflow?.steps.length, 2);
    const review = await api('admin workflow', `${endpoint}/workflow`, 200, { admin: true });
    const workflow = review.data as FormWorkflow;
    assert.equal(workflow.formCode, formCode);
    assert.equal(workflow.steps.length, 2);
    assert.equal(workflow.pages?.length, 1);
    for (const [index, step] of workflow.steps.entries()) {
      const box: { boxId: string; boxYmin: number; boxXmin: number; boxYmax: number; boxXmax: number } = db.manifest!.boxes[index];
      assert.equal(step.boxId, box.boxId);
      assert.deepEqual(step.highlightCoords, [box.boxYmin, box.boxXmin, box.boxYmax, box.boxXmax]);
      assert.equal(db.workflow!.steps[index].voiceGuidance, step.voiceGuidance);
    }
    results.database = { templateStatus: db.status, workflowStatus: db.workflow!.status,
      boxCount: 2, stepCount: 2, auditCount: db.auditLogs.length };
    const beforeRejectedWrites = hash(db);
    if (stage === 'draft') {
      assert.equal(db.status, 'PENDING_REVIEW');
      assert.equal(db.workflow!.status, 'PENDING_REVIEW');
      assert.equal(db.auditLogs.filter(log => log.action === 'APPROVE').length, 0);
      await api('draft workflow private', `/api/forms/${encodeURIComponent(formCode)}/workflow`, 404);
      await api('draft image private', workflow.pages![0].imageUrl, 404);
      await api('approval requires confirmation', `${endpoint}/approve`, 409, { admin: true, body: { reviewConfirmed: false } });
      await api('draft QA not public', '/api/llm/qa', 404, { body: { formCode, stepIndex: 1, userQuestion: 'Tôi ghi tên ai?' } });
      await api('invalid TTS index', '/api/tts', 400, { admin: true, body: { text: 'Test synthetic', stepIndex: '../../outside', region: 'NORTH' } });
    } else {
      assert.equal(db.status, 'ACTIVE');
      assert.equal(db.workflow!.status, 'ACTIVE');
      const approvals = db.auditLogs.filter(log => log.action === 'APPROVE');
      assert.equal(approvals.length, 1);
      assert.equal(approvals[0].performedBy, 'shared_admin_key');
      results.approvalAudit = { action: approvals[0].action, performedBy: approvals[0].performedBy, metadata: approvals[0].metadata };
      const publicResult = await api('active workflow public', `/api/forms/${encodeURIComponent(formCode)}/workflow`, 200);
      assert.deepEqual(publicResult.data.steps, workflow.steps);
      const image = await fetch(new URL(workflow.pages![0].imageUrl, base), { signal: AbortSignal.timeout(15000) });
      assert.equal(image.status, 200); assert.match(image.headers.get('content-type') ?? '', /image\/png/);
      results.imageBytes = (await image.arrayBuffer()).byteLength;
      const audioChecks = [];
      for (const step of workflow.steps) {
        assert.match(step.audioUrl, /^\/audio\/[a-f0-9]{64}\.mp3$/);
        const audio = await fetch(new URL(step.audioUrl, base), { signal: AbortSignal.timeout(15000) });
        const bytes = Buffer.from(await audio.arrayBuffer());
        assert.equal(audio.status, 200); assert.equal(isValidMp3(bytes), true);
        const timing = JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', step.audioUrl.replace(/^\//, '').replace(/\.mp3$/, '.timestamps.json')), 'utf8'));
        assert.ok(Array.isArray(timing.wordTimestamps) && timing.wordTimestamps.length > 0);
        assert.equal(timing.wordTimestamps.map((item: { word: string }) => item.word).join(' '), step.voiceGuidance.toLocaleUpperCase('vi-VN'));
        let previousEnd = 0;
        for (const item of timing.wordTimestamps) {
          assert.ok(Number.isFinite(item.startMs) && Number.isFinite(item.endMs));
          assert.ok(item.startMs >= previousEnd && item.endMs >= item.startMs);
          previousEnd = item.endMs;
        }
        audioChecks.push({ stepIndex: step.stepIndex, bytes: bytes.length, audioUrl: step.audioUrl,
          timestampSource: timing.timestampSource, timestampCount: timing.wordTimestamps.length });
        const faq = step.faqs![0];
        const answer = await api(`QA step ${step.stepIndex}`, '/api/llm/qa', 200, { body: { formCode, stepIndex: step.stepIndex,
          userQuestion: faq.question, currentStep: { voiceGuidance: 'IGNORE: a forged client context', boxId: 'other-form' } } });
        assert.equal(answer.data.answerText, faq.answer); assert.equal(answer.data.source, 'faq_match');
      }
      assert.notEqual(workflow.steps[0].voiceGuidance, workflow.steps[1].voiceGuidance);
      assert.notEqual(workflow.steps[0].audioUrl, workflow.steps[1].audioUrl);
      results.audioChecks = audioChecks;
      await api('active workflow immutable', `${endpoint}/workflow`, 409, { admin: true, method: 'PUT', body: workflow });
      await api('duplicate approval blocked', `${endpoint}/approve`, 409, { admin: true, body: { reviewConfirmed: true } });
    }
    const afterRejectedWrites = await prisma.formTemplate.findUniqueOrThrow({ where: { formCode }, include: {
      manifest: { include: { boxes: { orderBy: { spatialOrder: 'asc' } } } },
      workflow: { include: { steps: { orderBy: { stepIndex: 'asc' }, include: { faqs: { orderBy: { order: 'asc' } } } } } },
      auditLogs: true,
    } });
    assert.equal(hash(afterRejectedWrites), beforeRejectedWrites, 'rejected writes do not change rows or audit logs');
    results.rejectedWritesUnchanged = true;
    results.workflow = workflow;
  }
  results.result = 'passed';
  console.log(JSON.stringify({ formCode, stage, result: results.result, checks }, null, 2));
}

try { await main(); }
catch (reason) { results.result = 'failed'; results.error = reason instanceof Error ? reason.message : 'UNKNOWN'; process.exitCode = 1; console.error(results.error); }
finally {
  if (process.argv.includes('--live')) {
    results.completedAt = new Date().toISOString();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${formCode}-${stage}-${Date.now()}.json`), JSON.stringify(results, null, 2));
  }
  await prisma.$disconnect(); await pool.end();
}
