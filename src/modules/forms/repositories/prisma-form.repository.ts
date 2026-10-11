import { prisma } from "@/lib/prisma";
import { FormRepository } from "@/modules/forms/repositories/form.repository";
import {
  FormGeometricManifest,
  FormWorkflow,
  FormStatus,
  WorkflowStep as ContractWorkflowStep,
} from "@/shared/contracts";
import {
  validateWorkflow,
  validateManifest,
  validCoords,
} from "@/modules/forms/services/form-validation.service";
import type { AdminFormSummary, PublicFormSummary } from "@/modules/forms/types/form.types";
import { isDeepStrictEqual } from 'node:util';
import { FormArtifactStore, formArtifactStore } from '@/modules/forms/services/form-artifact-store';
import { bindFieldMetadata } from '@/modules/forms/services/form-field-metadata';
import { boundAudioUrlOrEmpty } from '@/modules/voice-ai/services/tts.service';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
const DB_TX_OPTIONS = {
  timeout: 60000,
  maxWait: 10000,
  isolationLevel: 'Serializable' as const,
};

async function createWorkflowSteps(
  tx: Prisma.TransactionClient,
  workflowId: string,
  steps: ContractWorkflowStep[],
) {
  await tx.workflowStep.createMany({
    data: steps.map((step) => ({
      id: randomUUID(),
      workflowId,
      stepIndex: step.stepIndex,
      boxId: step.boxId,
      sectionName: step.sectionName,
      label: step.label,
      voiceGuidance: step.voiceGuidance,
      audioUrl: boundAudioUrlOrEmpty(step.voiceGuidance, step.stepIndex, step.audioUrl),
      exampleRedText: step.exampleRedText,
      highlightYmin: step.highlightCoords[0],
      highlightXmin: step.highlightCoords[1],
      highlightYmax: step.highlightCoords[2],
      highlightXmax: step.highlightCoords[3],
      requiresPrerequisiteDoc: step.requiresPrerequisiteDoc ?? false,
      sourceFieldFromPrerequisite: step.sourceFieldFromPrerequisite ?? null,
      legalWarningFlag: step.legalWarningFlag ?? false,
    })),
  });

  const persistedSteps = await tx.workflowStep.findMany({
    where: { workflowId },
    select: { id: true, stepIndex: true },
  });
  const stepIdByIndex = new Map(persistedSteps.map((step) => [step.stepIndex, step.id]));
  const faqRows = steps.flatMap((step) => {
    const stepId = stepIdByIndex.get(step.stepIndex);
    if (!stepId) throw new Error('WORKFLOW_STEP_PERSISTENCE_FAILED');
    return (step.faqs ?? []).map((faq, index) => ({
      id: randomUUID(),
      stepId,
      question: faq.question,
      answer: faq.answer,
      order: index + 1,
    }));
  });
  if (faqRows.length > 0) await tx.stepFaq.createMany({ data: faqRows });
}

export class PrismaFormRepository implements FormRepository {
  constructor(private readonly database = prisma, private readonly artifacts: FormArtifactStore = formArtifactStore) {}

  public async saveDraft(
    manifest: FormGeometricManifest,
    workflow: FormWorkflow,
  ) {
    validateManifest(manifest);
    validateWorkflow(manifest, workflow);
    const artifactReference = await this.artifacts.save({ ...workflow, pages: manifest.pages ?? workflow.pages });
    return this.database.$transaction(
      async (tx) => {
        const existing = await tx.formTemplate.findUnique({
          where: { formCode: manifest.formCode },
        });
        if (existing?.status === "ACTIVE") throw new Error("FORM_ACTIVE");
        const template = await tx.formTemplate.upsert({
          where: { formCode: manifest.formCode },
          update: { formTitle: manifest.formTitle, status: "PENDING_REVIEW", originalPdfUrl: artifactReference },
          create: {
            formCode: manifest.formCode,
            formTitle: manifest.formTitle,
            status: "PENDING_REVIEW",
            originalPdfUrl: artifactReference,
          },
        });
        const geometricManifest = await tx.formGeometricManifest.upsert({
          where: { formTemplateId: template.id },
          update: {
            imageWidth: manifest.imageDimensions.width,
            imageHeight: manifest.imageDimensions.height,
          },
          create: {
            formTemplateId: template.id,
            imageWidth: manifest.imageDimensions.width,
            imageHeight: manifest.imageDimensions.height,
          },
        });
        await tx.formGeometricBox.deleteMany({
          where: { manifestId: geometricManifest.id },
        });
        await tx.formGeometricBox.createMany({
          data: manifest.boxes.map((box, index) => ({
            manifestId: geometricManifest.id,
            boxId: box.boxId,
            rawText: box.rawText,
            boxType:
              box.boxType === "checkbox"
                ? ("CHECKBOX" as const)
                : box.boxType === "table_cell"
                  ? ("TABLE_CELL" as const)
                  : ("TEXT" as const),
            estimatedWidthRatio: box.estimatedWidthRatio,
            spatialOrder: index + 1,
            boxYmin: box.normalizedCoords[0],
            boxXmin: box.normalizedCoords[1],
            boxYmax: box.normalizedCoords[2],
            boxXmax: box.normalizedCoords[3],
          })),
        });
        const formWorkflow = await tx.formWorkflow.upsert({
          where: { formTemplateId: template.id },
          update: { status: "PENDING_REVIEW" },
          create: { formTemplateId: template.id, status: "PENDING_REVIEW" },
        });
        await tx.workflowStep.deleteMany({
          where: { workflowId: formWorkflow.id },
        });
        await createWorkflowSteps(tx, formWorkflow.id, workflow.steps);
        return {
          templateId: template.id,
          manifestId: geometricManifest.id,
          workflowId: formWorkflow.id,
          stepCount: workflow.steps.length,
        };
      },
      DB_TX_OPTIONS,
    );
  }

  public async saveGeometricManifest(manifest: FormGeometricManifest): Promise<{
    templateId: string;
    manifestId: string;
  }> {
    return this.database.$transaction(async (tx) => {
      const existing = await tx.formTemplate.findUnique({
        where: { formCode: manifest.formCode },
      });
      if (existing?.status === "ACTIVE") throw new Error("FORM_ACTIVE");
      const template = await tx.formTemplate.upsert({
        where: { formCode: manifest.formCode },
        update: {
          formTitle: manifest.formTitle,
          updatedAt: new Date(),
        },
        create: {
          formCode: manifest.formCode,
          formTitle: manifest.formTitle,
          category: "Hành chính công",
          status: "DRAFT",
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

      await tx.formGeometricBox.deleteMany({
        where: { manifestId: geometricManifest.id },
      });
      await tx.formGeometricBox.createMany({
        data: manifest.boxes.map((box, index) => ({
          manifestId: geometricManifest.id,
          boxId: box.boxId,
          rawText: box.rawText,
          boxType:
            box.boxType === "checkbox"
              ? ("CHECKBOX" as const)
              : box.boxType === "table_cell"
                ? ("TABLE_CELL" as const)
                : ("TEXT" as const),
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
    return this.database.$transaction(async (tx) => {
      const existing = await tx.formTemplate.findUnique({
        where: { formCode: workflow.formCode },
      });
      if (existing?.status === "ACTIVE") throw new Error("FORM_ACTIVE");
      const template = await tx.formTemplate.upsert({
        where: { formCode: workflow.formCode },
        update: {
          formTitle: workflow.formTitle || workflow.formTitleVi || workflow.formCode,
          status: 'PENDING_REVIEW',
          updatedAt: new Date(),
        },
        create: {
          formCode: workflow.formCode,
          formTitle: workflow.formTitle || workflow.formTitleVi || workflow.formCode,
          status: 'PENDING_REVIEW',
        },
      });

      const formWorkflow = await tx.formWorkflow.upsert({
        where: { formTemplateId: template.id },
        update: {
          status: "PENDING_REVIEW",
          updatedAt: new Date(),
        },
        create: {
          formTemplateId: template.id,
          status: "PENDING_REVIEW",
        },
      });

      await tx.workflowStep.deleteMany({
        where: { workflowId: formWorkflow.id },
      });
      for (const step of workflow.steps) {
        await tx.workflowStep.create({
          data: {
            workflowId: formWorkflow.id,
            stepIndex: step.stepIndex,
            boxId: step.boxId,
            sectionName: step.sectionName,
            label: step.label,
            voiceGuidance: step.voiceGuidance,
            audioUrl: boundAudioUrlOrEmpty(step.voiceGuidance, step.stepIndex, step.audioUrl),
            exampleRedText: step.exampleRedText,
            highlightYmin: step.highlightCoords[0],
            highlightXmin: step.highlightCoords[1],
            highlightYmax: step.highlightCoords[2],
            highlightXmax: step.highlightCoords[3],
            requiresPrerequisiteDoc: step.requiresPrerequisiteDoc ?? false,
            sourceFieldFromPrerequisite:
              step.sourceFieldFromPrerequisite ?? null,
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

  public async getWorkflowByFormCode(
    formCode: string,
  ): Promise<FormWorkflow | null> {
    const template = await this.database.formTemplate.findUnique({
      where: { formCode },
      include: {
        workflow: {
          include: {
            steps: {
              include: { faqs: { orderBy: { order: "asc" } } },
              orderBy: { stepIndex: "asc" },
            },
          },
        },
      },
    });

    if (
      !template?.workflow ||
      template.status !== "ACTIVE" ||
      template.workflow.status !== "ACTIVE" ||
      template.workflow.steps.length === 0
    )
      return null;

    const steps: ContractWorkflowStep[] = template.workflow.steps.map(
      (step) => ({
        stepIndex: step.stepIndex,
        boxId: step.boxId,
        pageNumber: 1,
        sectionName: step.sectionName,
        label: step.label,
        voiceGuidance: step.voiceGuidance,
        audioUrl: boundAudioUrlOrEmpty(step.voiceGuidance, step.stepIndex, step.audioUrl),
        exampleRedText: step.exampleRedText || "",
        highlightCoords: [
          step.highlightYmin ?? 0,
          step.highlightXmin ?? 0,
          step.highlightYmax ?? 0,
          step.highlightXmax ?? 0,
        ],
        requiresPrerequisiteDoc: step.requiresPrerequisiteDoc,
        sourceFieldFromPrerequisite:
          step.sourceFieldFromPrerequisite || undefined,
        legalWarningFlag: step.legalWarningFlag,
        faqs: step.faqs.map((faq) => ({
          question: faq.question,
          answer: faq.answer,
        })),
      }),
    );

    const display = await this.artifacts.read(template.originalPdfUrl, formCode);
    return {
      formId: template.id,
      templateId: template.id,
      version: template.version,
      totalSteps: steps.length,
      totalPages: display?.pages.length,
      pages: display?.pages,
      circularInfo: display?.circularInfo,
      department: display?.department,
      formTitle: template.formTitle,
      formCode: template.formCode,
      status: (template.workflow.status.toUpperCase() as FormStatus),
      steps: bindFieldMetadata(steps, display?.fields, display?.pages.length ?? 1),
    };
  }

  public async listActiveForms(): Promise<PublicFormSummary[]> {
    const forms = await this.database.formTemplate.findMany({
      where: { status: 'ACTIVE', workflow: { status: 'ACTIVE', steps: { some: {} } } },
      select: { id: true, formCode: true, formTitle: true, version: true, updatedAt: true,
        workflow: { select: { _count: { select: { steps: true } } } } },
      orderBy: [{ updatedAt: 'desc' }, { formCode: 'asc' }],
    });
    return forms.map(form => ({ formId: form.id, formCode: form.formCode, formTitle: form.formTitle, status: 'ACTIVE' as const,
      version: form.version, stepCount: form.workflow?._count.steps ?? 0, updatedAt: form.updatedAt.toISOString() }));
  }

  public async listForms(): Promise<AdminFormSummary[]> {
    const forms = await this.database.formTemplate.findMany({
      include: {
        workflow: { include: { _count: { select: { steps: true } } } },
      },
      orderBy: [{ updatedAt: "desc" }, { formCode: "asc" }],
    });
    return forms.map((form) => ({
      formId: form.id,
      formCode: form.formCode,
      formTitle: form.formTitle,
      status: form.status.toLowerCase(),
      version: form.version,
      stepCount: form.workflow?._count.steps ?? 0,
      updatedAt: form.updatedAt.toISOString(),
    }));
  }

  public async getWorkflowForReview(
    formCode: string,
  ): Promise<FormWorkflow | null> {
    const template = await this.database.formTemplate.findUnique({
      where: { formCode },
      include: {
        workflow: {
          include: {
            steps: {
              include: { faqs: { orderBy: { order: "asc" } } },
              orderBy: { stepIndex: "asc" },
            },
          },
        },
      },
    });
    if (!template) return null;
    const display = await this.artifacts.read(template.originalPdfUrl, formCode);
    if (!template.workflow) {
      if (template.status !== "DRAFT") return null;
      return {
        formId: template.id,
        formCode: template.formCode,
        formTitle: template.formTitle,
        status: "DRAFT",
        version: template.version,
        steps: [],
      };
    }
    return {
      formId: template.id,
      formCode: template.formCode,
      formTitle: template.formTitle,
      templateId: template.id,
      pages: display?.pages,
      totalPages: display?.pages.length,
      circularInfo: display?.circularInfo,
      department: display?.department,
      status: template.workflow.status as FormWorkflow["status"],
      version: template.workflow.version,
      steps: bindFieldMetadata(template.workflow.steps.map((step) => ({
        stepIndex: step.stepIndex,
        boxId: step.boxId,
        pageNumber: 1,
        sectionName: step.sectionName,
        label: step.label,
        voiceGuidance: step.voiceGuidance,
        audioUrl: boundAudioUrlOrEmpty(step.voiceGuidance, step.stepIndex, step.audioUrl),
        exampleRedText: step.exampleRedText ?? "",
        highlightCoords: [
          step.highlightYmin ?? 0,
          step.highlightXmin ?? 0,
          step.highlightYmax ?? 0,
          step.highlightXmax ?? 0,
        ],
        requiresPrerequisiteDoc: step.requiresPrerequisiteDoc,
        sourceFieldFromPrerequisite:
          step.sourceFieldFromPrerequisite ?? undefined,
        legalWarningFlag: step.legalWarningFlag,
        faqs: step.faqs.map((faq) => ({
          question: faq.question,
          answer: faq.answer,
        })),
      })), display?.fields, display?.pages.length ?? 1),
    };
  }

  public async saveReviewWorkflow(formCode: string, workflow: FormWorkflow) {
    if (workflow.formCode !== formCode) throw new Error("FORM_CODE_MISMATCH");
    if (typeof workflow.formTitle !== "string" || !workflow.formTitle.trim())
      throw new Error("INVALID_WORKFLOW");
    try {
      return await this.database.$transaction(
        async (tx) => {
          const existing = await tx.formTemplate.findUnique({
            where: { formCode },
            include: { manifest: { include: { boxes: true } }, workflow: { include: { steps: true } } },
          });
          if (!existing) throw new Error("NOT_FOUND");
          if (
            existing.status !== "DRAFT" &&
            existing.status !== "PENDING_REVIEW" &&
            existing.status !== "ACTIVE"
          )
            throw new Error("FORM_ACTIVE");
          const persistedManifest = existing.manifest;
          const display = await this.artifacts.read(existing.originalPdfUrl, formCode);
          if (workflow.pages !== undefined && !isDeepStrictEqual(workflow.pages, display?.pages)) throw new Error('INVALID_WORKFLOW');
          if (!persistedManifest || persistedManifest.boxes.length === 0)
            throw new Error("INVALID_WORKFLOW");
          const manifest: FormGeometricManifest = {
            formId: existing.id,
            formCode: existing.formCode,
            formTitle: existing.formTitle,
            pages: display?.pages,
            imageDimensions: {
              width: persistedManifest.imageWidth,
              height: persistedManifest.imageHeight,
            },
            boxes: persistedManifest.boxes.map((box) => {
              const editedStep = workflow.steps.find(step => step.boxId === box.boxId);
              if (!editedStep || (display?.fields?.some(field => field.boxId === box.boxId) && !editedStep.highlightRegions)) throw new Error('INVALID_WORKFLOW');
              return {
              boxId: box.boxId,
              pageNumber: editedStep.pageNumber ?? 1,
              rawText: box.rawText,
              boxType:
                editedStep.inputKind === 'checkbox' || (!editedStep.inputKind && box.boxType === "CHECKBOX")
                  ? "checkbox"
                  : editedStep.inputKind === 'table_cell' || (!editedStep.inputKind && box.boxType === "TABLE_CELL")
                    ? "table_cell"
                    : "text",
              estimatedWidthRatio: box.estimatedWidthRatio,
              normalizedCoords: editedStep.highlightCoords,
              inputKind: editedStep.inputKind,
              inputRegions: editedStep.highlightRegions,
            }; }),
          };
          if (
            workflow.steps.some(
              (step) => step.faqs !== undefined && step.faqs.length === 0,
            )
          )
            throw new Error("INVALID_WORKFLOW");
          try {
            validateWorkflow(manifest, workflow);
          } catch {
            throw new Error("INVALID_WORKFLOW");
          }
          const artifactReference = await this.artifacts.save({ ...workflow, pages: display?.pages });

          const guarded = await tx.formTemplate.updateMany({
            where: {
              id: existing.id,
              status: { in: ["DRAFT", "PENDING_REVIEW", "ACTIVE"] },
            },
            data: { formTitle: workflow.formTitle, status: existing.status === "ACTIVE" ? "ACTIVE" : "PENDING_REVIEW", ...(artifactReference ? { originalPdfUrl: artifactReference } : {}) },
          });
          if (guarded.count !== 1) throw new Error("REVIEW_CONFLICT");
          const formWorkflow = await tx.formWorkflow.upsert({
            where: { formTemplateId: existing.id },
            update: { status: existing.status === "ACTIVE" ? "ACTIVE" : "PENDING_REVIEW", updatedAt: new Date() },
            create: { formTemplateId: existing.id, status: existing.status === "ACTIVE" ? "ACTIVE" : "PENDING_REVIEW" },
          });
          await tx.stepFaq.deleteMany({
            where: { step: { workflowId: formWorkflow.id } },
          });
          await tx.workflowStep.deleteMany({
            where: { workflowId: formWorkflow.id },
          });
          for (const step of workflow.steps) {
            const savedAudio = boundAudioUrlOrEmpty(step.voiceGuidance, step.stepIndex, step.audioUrl);
            const box = persistedManifest.boxes.find(saved => saved.boxId === step.boxId)!;
            if (!isDeepStrictEqual([box.boxYmin, box.boxXmin, box.boxYmax, box.boxXmax], step.highlightCoords) || box.spatialOrder !== step.stepIndex || step.inputKind) {
              await tx.formGeometricBox.update({ where: { manifestId_boxId: { manifestId: persistedManifest.id, boxId: step.boxId } },
                data: { boxYmin: step.highlightCoords[0], boxXmin: step.highlightCoords[1], boxYmax: step.highlightCoords[2], boxXmax: step.highlightCoords[3],
                  spatialOrder: step.stepIndex, estimatedWidthRatio: step.highlightCoords[3] - step.highlightCoords[1],
                  ...(step.inputKind ? { boxType: step.inputKind === 'checkbox' ? 'CHECKBOX' : step.inputKind === 'table_cell' ? 'TABLE_CELL' : 'TEXT' } : {}) } });
            }
            await tx.workflowStep.create({
              data: {
                workflowId: formWorkflow.id,
                stepIndex: step.stepIndex,
                boxId: step.boxId,
                sectionName: step.sectionName,
                label: step.label,
                voiceGuidance: step.voiceGuidance,
                audioUrl: savedAudio || null,
                exampleRedText: step.exampleRedText,
                highlightYmin: step.highlightCoords[0],
                highlightXmin: step.highlightCoords[1],
                highlightYmax: step.highlightCoords[2],
                highlightXmax: step.highlightCoords[3],
                requiresPrerequisiteDoc: step.requiresPrerequisiteDoc ?? false,
                sourceFieldFromPrerequisite:
                  step.sourceFieldFromPrerequisite ?? null,
                legalWarningFlag: step.legalWarningFlag ?? false,
                faqs: {
                  create: (step.faqs ?? []).map((faq, index) => ({
                    question: faq.question,
                    answer: faq.answer,
                    order: index + 1,
                  })),
                },
              },
            });
          }
          return {
            workflowId: formWorkflow.id,
            stepCount: workflow.steps.length,
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "NOT_FOUND",
          "FORM_ACTIVE",
          "INVALID_WORKFLOW",
          "REVIEW_CONFLICT",
        ].includes(error.message)
      )
        throw error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2034"
      )
        throw new Error("REVIEW_CONFLICT");
      throw error;
    }
  }

  public async approveWorkflow(
    formCode: string,
    performedBy: string,
    note?: string,
    reviewerName?: string,
  ): Promise<void> {
    await this.database.$transaction(
      async (tx) => {
        const existing = await tx.formTemplate.findUnique({
          where: { formCode },
          include: {
            manifest: { include: { boxes: true } },
            workflow: { include: { steps: { include: { faqs: true } } } },
          },
        });
        if (!existing) throw new Error("NOT_FOUND");
        const display = await this.artifacts.read(existing.originalPdfUrl, formCode);
        const boxes = existing.manifest?.boxes ?? [];
        const steps = existing.workflow?.steps ?? [];
        const boxIds = new Set(boxes.map((box) => box.boxId));
        if (
          existing.status !== "PENDING_REVIEW" ||
          existing.workflow?.status !== "PENDING_REVIEW" ||
          boxes.length === 0 ||
          (display !== null && (display.pages[0].width !== existing.manifest?.imageWidth || display.pages[0].height !== existing.manifest?.imageHeight)) ||
          steps.length !== boxes.length ||
          boxes.some(
            (box) =>
              !validCoords([
                box.boxYmin,
                box.boxXmin,
                box.boxYmax,
                box.boxXmax,
              ]),
          ) ||
          new Set(steps.map((step) => step.boxId)).size !== boxes.length ||
          new Set(steps.map((step) => step.stepIndex)).size !== boxes.length ||
          steps.some((step) => step.stepIndex > boxes.length) ||
          steps.some(
            (step) =>
              !boxIds.has(step.boxId) ||
              !Number.isSafeInteger(step.stepIndex) ||
              step.stepIndex < 1 ||
              !step.label.trim() ||
              !step.voiceGuidance.trim() ||
              step.voiceGuidance.length > 2000 ||
              !step.exampleRedText?.trim() ||
              !validCoords([
                step.highlightYmin,
                step.highlightXmin,
                step.highlightYmax,
                step.highlightXmax,
              ]) ||
              !boxes.some(box => box.boxId === step.boxId && isDeepStrictEqual(
                [box.boxYmin, box.boxXmin, box.boxYmax, box.boxXmax],
                [step.highlightYmin, step.highlightXmin, step.highlightYmax, step.highlightXmax])) ||
              step.faqs.length === 0 ||
              step.faqs.some(
                (faq) => !faq.question.trim() || !faq.answer.trim(),
              ),
          )
        ) {
          throw new Error("REVIEW_CONFLICT");
        }
        bindFieldMetadata(steps.map(step => ({ ...step, audioUrl: step.audioUrl ?? '', exampleRedText: step.exampleRedText ?? '',
          sourceFieldFromPrerequisite: step.sourceFieldFromPrerequisite ?? undefined,
          highlightCoords: [step.highlightYmin!, step.highlightXmin!, step.highlightYmax!, step.highlightXmax!] })), display?.fields, display?.pages.length ?? 1);
        const updated = await tx.formTemplate.updateMany({
          where: { id: existing.id, status: "PENDING_REVIEW" },
          data: { status: "ACTIVE" },
        });
        if (updated.count !== 1) throw new Error("REVIEW_CONFLICT");
        await tx.formWorkflow.update({
          where: { id: existing.workflow.id },
          data: { status: "ACTIVE" },
        });
        await tx.formAuditLog.create({
          data: {
            formTemplateId: existing.id,
            action: "APPROVE",
            performedBy,
            note: note || "Phê duyệt kịch bản hướng dẫn.",
            metadata: {
              approvedAt: new Date().toISOString(),
              reviewerName: reviewerName || null,
              identityType: "shared_admin_key",
            },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  }
}
