import { prisma } from '@/lib/prisma';
import { FormRepository } from '@/modules/forms/repositories/form.repository';
import {
  FormGeometricManifest,
  FormWorkflow,
  WorkflowStep as ContractWorkflowStep,
} from '@/shared/contracts';

export class PrismaFormRepository implements FormRepository {
  public async saveGeometricManifest(manifest: FormGeometricManifest): Promise<{
    templateId: string;
    manifestId: string;
  }> {
    return prisma.$transaction(async tx => {
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
    return prisma.$transaction(async tx => {
      const template = await tx.formTemplate.upsert({
        where: { formCode: workflow.formCode },
        update: {
          formTitle: workflow.formTitle,
          updatedAt: new Date(),
        },
        create: {
          formCode: workflow.formCode,
          formTitle: workflow.formTitle,
          status: workflow.status === 'active' ? 'ACTIVE' : 'PENDING_REVIEW',
        },
      });

      const formWorkflow = await tx.formWorkflow.upsert({
        where: { formTemplateId: template.id },
        update: {
          status: workflow.status === 'active' ? 'ACTIVE' : 'PENDING_REVIEW',
          updatedAt: new Date(),
        },
        create: {
          formTemplateId: template.id,
          status: workflow.status === 'active' ? 'ACTIVE' : 'PENDING_REVIEW',
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
    const template = await prisma.formTemplate.findUnique({
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

    if (!template?.workflow || template.workflow.steps.length === 0) return null;

    const steps: ContractWorkflowStep[] = template.workflow.steps.map(step => ({
      stepIndex: step.stepIndex,
      boxId: step.boxId,
      sectionName: step.sectionName,
      label: step.label,
      voiceGuidance: step.voiceGuidance,
      audioUrl: step.audioUrl || `/audio/step_${String(step.stepIndex).padStart(2, '0')}.mp3`,
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
    note?: string
  ): Promise<void> {
    await prisma.$transaction(async tx => {
      const existing = await tx.formTemplate.findUnique({ where: { formCode } });
      if (!existing) throw new Error('NOT_FOUND');

      await tx.formTemplate.update({
        where: { formCode },
        data: {
          status: 'ACTIVE',
          workflow: {
            upsert: {
              create: { status: 'ACTIVE' },
              update: { status: 'ACTIVE' },
            },
          },
          auditLogs: {
            create: {
              action: 'APPROVE',
              performedBy,
              note: note || 'Phê duyệt kịch bản hướng dẫn và kiểm tra chữ mẫu đỏ hợp lệ.',
              metadata: { approvedAt: new Date().toISOString() },
            },
          },
        },
      });
    });
  }
}
