import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Prisma } from '@prisma/client';
import { prisma, pool } from '@/lib/prisma';
import { PrismaFormRepository } from '@/modules/forms/repositories/prisma-form.repository';
import { FormArtifactStore } from '@/modules/forms/services/form-artifact-store';
import type { FormGeometricManifest, FormWorkflow, NormalizedBoundingBox } from '@/shared/contracts';

test('two-page draft, review and approval round-trip on Postgres rolls back completely',
  { skip: process.env.AFL_TEST_DB_ROLLBACK !== '1' }, async context => {
    const formCode = `CODEX-MULTI-ROLLBACK-${randomUUID().slice(0, 12)}`;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'afl-multipage-rollback-'));
    context.after(async () => {
      const resolved = path.resolve(root);
      assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)
        && path.basename(resolved).startsWith('afl-multipage-rollback-'));
      fs.rmSync(resolved, { recursive: true, force: true });
      await prisma.$disconnect();
      await pool.end();
    });
    const store = new FormArtifactStore(root);
    const first = await store.saveImage(formCode,
      await sharp({ create: { width: 320, height: 480, channels: 3, background: 'white' } }).png().toBuffer(), 1);
    const second = await store.saveImage(formCode,
      await sharp({ create: { width: 480, height: 320, channels: 3, background: 'white' } }).png().toBuffer(), 2);
    const firstCoords: NormalizedBoundingBox = [0.2, 0.1, 0.25, 0.8];
    const secondCoords: NormalizedBoundingBox = [0.4, 0.1, 0.45, 0.8];
    const firstRegions = [{ regionId: 'first_primary', pageNumber: 1, normalizedCoords: firstCoords },
      { regionId: 'first_continued', pageNumber: 2, normalizedCoords: [0.1, 0.1, 0.15, 0.8] as NormalizedBoundingBox }];
    const secondRegions = [{ regionId: 'second_primary', pageNumber: 2, normalizedCoords: secondCoords }];
    const manifest: FormGeometricManifest = { formId: `form_${randomUUID().slice(0, 12)}`, formCode,
      formTitle: 'Biểu mẫu kiểm thử rollback hai trang', imageDimensions: { width: first.width, height: first.height }, pages: [first, second],
      boxes: [
        { boxId: 'p1_box_001', pageNumber: 1, rawText: 'Nội dung', boxType: 'text', estimatedWidthRatio: 0.7,
          normalizedCoords: firstCoords, inputKind: 'multiline_text', inputRegions: firstRegions },
        { boxId: 'p2_box_001', pageNumber: 2, rawText: 'Địa chỉ', boxType: 'text', estimatedWidthRatio: 0.7,
          normalizedCoords: secondCoords, inputKind: 'single_line_text', inputRegions: secondRegions },
      ] };
    const workflow: FormWorkflow = { formId: manifest.formId, formCode, formTitle: manifest.formTitle,
      status: 'PENDING_REVIEW', pages: [first, second], totalPages: 2, steps: manifest.boxes.map((box, index) => ({
        stepIndex: index + 1, boxId: box.boxId, pageNumber: box.pageNumber, sectionName: 'I', label: box.rawText,
        voiceGuidance: `Bác điền ${box.rawText.toLowerCase()} của mình.`, audioUrl: '', exampleRedText: 'VÍ DỤ',
        highlightCoords: box.normalizedCoords, inputKind: box.inputKind, highlightRegions: box.inputRegions,
        faqs: [{ question: 'Viết ở đâu?', answer: 'Viết đúng ô đang sáng.' }],
      })) };
    assert.equal(await prisma.formTemplate.findUnique({ where: { formCode } }), null);
    const rollback = new Error('EXPECTED_ROLLBACK');
    try {
      await prisma.$transaction(async transaction => {
        const database = { formTemplate: transaction.formTemplate,
          $transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) => callback(transaction) };
        const repository = new PrismaFormRepository(database as never, store);
        await repository.saveDraft(manifest, workflow);
        const pending = await repository.getWorkflowForReview(formCode);
        assert.equal(pending?.status, 'PENDING_REVIEW');
        assert.deepEqual(pending?.pages, [first, second]);
        assert.deepEqual(pending?.steps.map(step => step.pageNumber), [1, 2]);
        assert.deepEqual(pending?.steps[0].highlightRegions, firstRegions);
        assert.equal(await repository.getWorkflowByFormCode(formCode), null);
        const reviewed: FormWorkflow = { ...pending!, steps: pending!.steps.map(step => step.pageNumber === 2
          ? { ...step, voiceGuidance: 'Bác viết địa chỉ của mình ở trang hai.' } : step) };
        await repository.saveReviewWorkflow(formCode, reviewed);
        const savedReview = await repository.getWorkflowForReview(formCode);
        assert.equal(savedReview?.steps[1].voiceGuidance, 'Bác viết địa chỉ của mình ở trang hai.');
        assert.deepEqual(savedReview?.steps.map(step => step.pageNumber), [1, 2]);
        const asset = new URL(second.imageUrl, 'http://local').searchParams.get('asset')!;
        const assetPath = path.join(root, `${asset}.png`);
        const imageBytes = store.readImage(asset);
        fs.unlinkSync(assetPath);
        await assert.rejects(repository.approveWorkflow(formCode, 'shared_admin_key'), /FORM_ASSET_UNAVAILABLE/);
        assert.equal((await transaction.formTemplate.findUnique({ where: { formCode }, select: { status: true } }))?.status, 'PENDING_REVIEW');
        assert.equal(await transaction.formAuditLog.count({ where: { formTemplateId: pending!.formId } }), 0);
        fs.writeFileSync(assetPath, imageBytes, { flag: 'wx' });
        await repository.approveWorkflow(formCode, 'shared_admin_key');
        const active = await repository.getWorkflowByFormCode(formCode);
        assert.equal(active?.status, 'ACTIVE');
        assert.deepEqual(active?.steps.map(step => step.pageNumber), [1, 2]);
        assert.deepEqual(active?.steps[0].highlightRegions, firstRegions);
        const logs = await transaction.formAuditLog.findMany({ where: { formTemplateId: active!.formId } });
        assert.equal(logs.length, 1);
        throw rollback;
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 20000 });
    } catch (reason) {
      if (reason !== rollback) throw reason;
    }
    assert.equal(await prisma.formTemplate.findUnique({ where: { formCode } }), null);
  });
