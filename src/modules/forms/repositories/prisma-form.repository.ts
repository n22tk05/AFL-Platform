import { prisma } from '@/lib/prisma';
import { FormRepository } from '@/modules/forms/repositories/form.repository';
import {
  FormGeometricManifest,
  FormWorkflow,
  WorkflowStep as ContractWorkflowStep,
} from '@/shared/contracts';
import { validateWorkflow, validCoords } from '@/modules/forms/services/form-validation.service';

export class PrismaFormRepository implements FormRepository {
  constructor(private readonly database = prisma) {}

  public async saveDraft(manifest: FormGeometricManifest, workflow: FormWorkflow) {
    validateWorkflow(manifest, workflow);
    return this.database.$transaction(async tx => {
      const existing = await tx.formTemplate.findUnique({ where: { formCode: manifest.formCode } });
      if (existing?.status === 'ACTIVE') throw new Error('FORM_ACTIVE');
      const template = await tx.formTemplate.upsert({
        where: { formCode: manifest.formCode },
        update: { formTitle: manifest.formTitle, status: 'PENDING_REVIEW' },
        create: { formCode: manifest.formCode, formTitle: manifest.formTitle, status: 'PENDING_REVIEW' },
      });
      const geometricManifest = await tx.formGeometricManifest.upsert({
        where: { formTemplateId: template.id },
        update: { imageWidth: manifest.imageDimensions.width, imageHeight: manifest.imageDimensions.height },
        create: { formTemplateId: template.id, imageWidth: manifest.imageDimensions.width, imageHeight: manifest.imageDimensions.height },
      });
      await tx.formGeometricBox.deleteMany({ where: { manifestId: geometricManifest.id } });
      await tx.formGeometricBox.createMany({ data: manifest.boxes.map((box, index) => ({
        manifestId: geometricManifest.id, boxId: box.boxId, rawText: box.rawText,
        boxType: box.boxType === 'checkbox' ? 'CHECKBOX' as const : box.boxType === 'table_cell' ? 'TABLE_CELL' as const : 'TEXT' as const,
        estimatedWidthRatio: box.estimatedWidthRatio, spatialOrder: index + 1,
        boxYmin: box.normalizedCoords[0], boxXmin: box.normalizedCoords[1],
        boxYmax: box.normalizedCoords[2], boxXmax: box.normalizedCoords[3],
      })) });
      const formWorkflow = await tx.formWorkflow.upsert({
        where: { formTemplateId: template.id },
        update: { status: 'PENDING_REVIEW' },
        create: { formTemplateId: template.id, status: 'PENDING_REVIEW' },
      });
      await tx.workflowStep.deleteMany({ where: { workflowId: formWorkflow.id } });
      for (const step of workflow.steps) {
        await tx.workflowStep.create({ data: {
          workflowId: formWorkflow.id, stepIndex: step.stepIndex, boxId: step.boxId,
          sectionName: step.sectionName, label: step.label, voiceGuidance: step.voiceGuidance,
          audioUrl: step.audioUrl, exampleRedText: step.exampleRedText,
          highlightYmin: step.highlightCoords[0], highlightXmin: step.highlightCoords[1],
          highlightYmax: step.highlightCoords[2], highlightXmax: step.highlightCoords[3],
          requiresPrerequisiteDoc: step.requiresPrerequisiteDoc ?? false,
          sourceFieldFromPrerequisite: step.sourceFieldFromPrerequisite ?? null,
          legalWarningFlag: step.legalWarningFlag ?? false,
          faqs: { create: step.faqs.map((faq, index) => ({ question: faq.question, answer: faq.answer, order: index + 1 })) },
        } });
      }
      return { templateId: template.id, manifestId: geometricManifest.id, workflowId: formWorkflow.id, stepCount: workflow.steps.length };
    }, { isolationLevel: 'Serializable' });
  }

  public async saveGeometricManifest(manifest: FormGeometricManifest): Promise<{
    templateId: string;
    manifestId: string;
  }> {
    return this.database.$transaction(async tx => {
      const existing = await tx.formTemplate.findUnique({ where: { formCode: manifest.formCode } });
      if (existing?.status === 'ACTIVE') throw new Error('FORM_ACTIVE');
      const template = await tx.formTemplate.upsert({
        where: { formCode: manifest.formCode },
        update: {
          formTitle: manifest.formTitle,
          updatedAt: new Date(),
        },
        create: {
          formCode: manifest.formCode,
          formTitle: manifest.formTitle,
          category: 'Hành chính công',
          status: 'DRAFT',
        },
      });

      const geometricManifest = await tx.formGeometricManifest.upsert({
        where: { formTemplateId: template.id },
        update: {
          imageWidth: manifest.imageDimensions.width,
          imageHeight: manifest.imageDimensions.height,
          updatedAt: new Date(),
        },
        create: {
          formTemplateId: template.id,
          imageWidth: manifest.imageDimensions.width,
          imageHeight: manifest.imageDimensions.height,
        },
      });

      await tx.formGeometricBox.deleteMany({ where: { manifestId: geometricManifest.id } });
      await tx.formGeometricBox.createMany({
        data: manifest.boxes.map((box, index) => ({
          manifestId: geometricManifest.id,
          boxId: box.boxId,
          rawText: box.rawText,
          boxType: box.boxType === 'checkbox'
            ? 'CHECKBOX' as const
            : box.boxType === 'table_cell'
              ? 'TABLE_CELL' as const
              : 'TEXT' as const,
          estimatedWidthRatio: box.estimatedWidthRatio,
          spatialOrder: index + 1,
          boxYmin: box.normalizedCoords[0],
          boxXmin: box.normalizedCoords[1],
          boxYmax: box.normalizedCoords[2],
          boxXmax: box.normalizedCoords[3],
        })),
      });

      return { templateId: template.id, manifestId: geometricManifest.id };
    });
  }

  public async saveWorkflow(workflow: FormWorkflow): Promise<{
    workflowId: string;
    stepCount: number;
  }> {
    return this.database.$transaction(async tx => {
      const existing = await tx.formTemplate.findUnique({ where: { formCode: workflow.formCode } });
      if (existing?.status === 'ACTIVE') throw new Error('FORM_ACTIVE');
      const template = await tx.formTemplate.upsert({
        where: { formCode: workflow.formCode },
        update: {
          formTitle: workflow.formTitle,
          status: 'PENDING_REVIEW',
          updatedAt: new Date(),
        },
        create: {
          formCode: workflow.formCode,
          formTitle: workflow.formTitle,
          status: 'PENDING_REVIEW',
        },
      });

      const formWorkflow = await tx.formWorkflow.upsert({
        where: { formTemplateId: template.id },
        update: {
          status: 'PENDING_REVIEW',
          updatedAt: new Date(),
        },
        create: {
          formTemplateId: template.id,
          status: 'PENDING_REVIEW',
        },
      });

      await tx.workflowStep.deleteMany({ where: { workflowId: formWorkflow.id } });
      for (const step of workflow.steps) {
        await tx.workflowStep.create({
          data: {
            workflowId: formWorkflow.id,
            stepIndex: step.stepIndex,
            boxId: step.boxId,
            sectionName: step.sectionName,
            label: step.label,
            voiceGuidance: step.voiceGuidance,
            audioUrl: step.audioUrl,
            exampleRedText: step.exampleRedText,
            highlightYmin: step.highlightCoords[0],
            highlightXmin: step.highlightCoords[1],
            highlightYmax: step.highlightCoords[2],
            highlightXmax: step.highlightCoords[3],
            requiresPrerequisiteDoc: step.requiresPrerequisiteDoc ?? false,
            sourceFieldFromPrerequisite: step.sourceFieldFromPrerequisite ?? null,
            legalWarningFlag: step.legalWarningFlag ?? false,
            faqs: {
              create: (step.faqs || []).map((faq, index) => ({
                question: faq.question,
                answer: faq.answer,
                order: index + 1,
              })),
            },
          },
        });
      }

      return { workflowId: formWorkflow.id, stepCount: workflow.steps.length };
    });
  }

  public async getWorkflowByFormCode(formCode: string): Promise<FormWorkflow | null> {
    const template = await this.database.formTemplate.findUnique({
      where: { formCode },
      include: {
        workflow: {
          include: {
            steps: {
              include: { faqs: { orderBy: { order: 'asc' } } },
              orderBy: { stepIndex: 'asc' },
            },
          },
        },
      },
    });

    if (!template?.workflow || template.status !== 'ACTIVE' || template.workflow.status !== 'ACTIVE' || template.workflow.steps.length === 0) return null;

    const steps: ContractWorkflowStep[] = template.workflow.steps.map(step => ({
      stepIndex: step.stepIndex,
      boxId: step.boxId,
      sectionName: step.sectionName,
      label: step.label,
      voiceGuidance: step.voiceGuidance,
      audioUrl: step.audioUrl ?? '',
      exampleRedText: step.exampleRedText || '',
      highlightCoords: [
        step.highlightYmin ?? 0,
        step.highlightXmin ?? 0,
        step.highlightYmax ?? 0,
        step.highlightXmax ?? 0,
      ],
      requiresPrerequisiteDoc: step.requiresPrerequisiteDoc,
      sourceFieldFromPrerequisite: step.sourceFieldFromPrerequisite || undefined,
      legalWarningFlag: step.legalWarningFlag,
      faqs: step.faqs.map(faq => ({ question: faq.question, answer: faq.answer })),
    }));

    return {
      formId: template.id,
      formTitle: template.formTitle,
      formCode: template.formCode,
      status: template.workflow.status.toLowerCase() as FormWorkflow['status'],
      steps,
    };
  }

  public async approveWorkflow(
    formCode: string,
    performedBy: string,
    note?: string,
    reviewerName?: string
  ): Promise<void> {
    await this.database.$transaction(async tx => {
      const existing = await tx.formTemplate.findUnique({ where: { formCode }, include: {
        manifest: { include: { boxes: true } },
        workflow: { include: { steps: { include: { faqs: true } } } },
      } });
      if (!existing) throw new Error('NOT_FOUND');
      const boxes = existing.manifest?.boxes ?? [];
      const steps = existing.workflow?.steps ?? [];
      const boxIds = new Set(boxes.map(box => box.boxId));
      if (existing.status !== 'PENDING_REVIEW' || existing.workflow?.status !== 'PENDING_REVIEW' ||
          boxes.length === 0 || steps.length !== boxes.length ||
          boxes.some(box => !validCoords([box.boxYmin, box.boxXmin, box.boxYmax, box.boxXmax])) ||
          new Set(steps.map(step => step.boxId)).size !== boxes.length ||
          new Set(steps.map(step => step.stepIndex)).size !== boxes.length ||
          steps.some(step => step.stepIndex > boxes.length) ||
          steps.some(step => !boxIds.has(step.boxId) || !Number.isSafeInteger(step.stepIndex) || step.stepIndex < 1 ||
            !step.label.trim() || !step.voiceGuidance.trim() || !step.exampleRedText?.trim() ||
            !validCoords([step.highlightYmin, step.highlightXmin, step.highlightYmax, step.highlightXmax]) ||
            step.faqs.length === 0 || step.faqs.some(faq => !faq.question.trim() || !faq.answer.trim()))) {
        throw new Error('REVIEW_CONFLICT');
      }
      const updated = await tx.formTemplate.updateMany({ where: { id: existing.id, status: 'PENDING_REVIEW' }, data: { status: 'ACTIVE' } });
      if (updated.count !== 1) throw new Error('REVIEW_CONFLICT');
      await tx.formWorkflow.update({ where: { id: existing.workflow.id }, data: { status: 'ACTIVE' } });
      await tx.formAuditLog.create({ data: {
        formTemplateId: existing.id, action: 'APPROVE', performedBy,
        note: note || 'Phê duyệt kịch bản hướng dẫn.',
        metadata: { approvedAt: new Date().toISOString(), reviewerName: reviewerName || null, identityType: 'shared_admin_key' },
      } });
    }, { isolationLevel: 'Serializable' });
  }
}
