import type { FormRepository } from "@/modules/forms/repositories/form.repository";
import {
  ApproveWorkflowResult,
  SaveManifestResult,
  SaveWorkflowResult,
} from "@/modules/forms/types/form.types";
import { FormGeometricManifest, FormWorkflow } from "@/shared/contracts";
import {
  validateWorkflow,
  validCoords,
} from "@/modules/forms/services/form-validation.service";

export interface DatabaseHealth {
  check(): Promise<boolean>;
  markOffline(): void;
}

const WORKFLOW_STATUSES = [
  "draft",
  "pending_review",
  "active",
  "archived",
  "PENDING_REVIEW",
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonBlankString(value: unknown): value is string {
  return typeof value === "string" && !!value.trim();
}

function validateReviewWorkflow(
  value: unknown,
  formCode: string,
): asserts value is FormWorkflow {
  if (
    !isRecord(value) ||
    value.formCode !== formCode ||
    !nonBlankString(value.formCode) ||
    !nonBlankString(value.formTitle) ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    (value.templateId !== undefined && !nonBlankString(value.templateId)) ||
    (value.formId !== undefined && !nonBlankString(value.formId)) ||
    (value.formTitleVi !== undefined &&
      typeof value.formTitleVi !== "string") ||
    (value.circularInfo !== undefined &&
      typeof value.circularInfo !== "string") ||
    (value.totalPages !== undefined &&
      (!Number.isSafeInteger(value.totalPages) ||
        (value.totalPages as number) < 1)) ||
    (value.totalSteps !== undefined &&
      (!Number.isSafeInteger(value.totalSteps) ||
        (value.totalSteps as number) < 1)) ||
    (value.status !== undefined &&
      (typeof value.status !== "string" ||
        !WORKFLOW_STATUSES.includes(value.status))) ||
    (value.version !== undefined &&
      (!Number.isSafeInteger(value.version) ||
        (value.version as number) < 1)) ||
    (value.publishedAt !== undefined && typeof value.publishedAt !== "string")
  ) {
    throw new Error("INVALID_WORKFLOW");
  }

  if (
    value.pages !== undefined &&
    (!Array.isArray(value.pages) ||
      value.pages.some(
        (page) =>
          !isRecord(page) ||
          !Number.isSafeInteger(page.pageNumber) ||
          (page.pageNumber as number) < 1 ||
          typeof page.imageUrl !== "string" ||
          typeof page.width !== "number" ||
          !Number.isFinite(page.width) ||
          page.width <= 0 ||
          typeof page.height !== "number" ||
          !Number.isFinite(page.height) ||
          page.height <= 0,
      ))
  ) {
    throw new Error("INVALID_WORKFLOW");
  }

  if (
    value.steps.some(
      (step, index) =>
        !isRecord(step) ||
        !Number.isSafeInteger(step.stepIndex) ||
        step.stepIndex !== index + 1 ||
        !nonBlankString(step.boxId) ||
        !nonBlankString(step.sectionName) ||
        !nonBlankString(step.label) ||
        !nonBlankString(step.voiceGuidance) ||
        typeof step.audioUrl !== "string" ||
        !nonBlankString(step.exampleRedText) ||
        !validCoords(step.highlightCoords) ||
        (step.pageNumber !== undefined &&
          (!Number.isSafeInteger(step.pageNumber) ||
            (step.pageNumber as number) < 1)) ||
        (step.requiresPrerequisiteDoc !== undefined &&
          typeof step.requiresPrerequisiteDoc !== "boolean") ||
        (step.sourceFieldFromPrerequisite !== undefined &&
          typeof step.sourceFieldFromPrerequisite !== "string") ||
        (step.legalWarningFlag !== undefined &&
          typeof step.legalWarningFlag !== "boolean") ||
        !Array.isArray(step.faqs) ||
        step.faqs.length === 0 ||
        step.faqs.some(
          (faq) =>
            !isRecord(faq) ||
            !nonBlankString(faq.question) ||
            !nonBlankString(faq.answer),
        ),
    )
  ) {
    throw new Error("INVALID_WORKFLOW");
  }
}

export class FormPersistenceService {
  constructor(
    private readonly repository: FormRepository,
    private readonly databaseHealth: DatabaseHealth,
  ) {}

  public async saveDraft(
    manifest: FormGeometricManifest,
    workflow: FormWorkflow,
  ) {
    validateWorkflow(manifest, workflow);
    if (!(await this.databaseHealth.check()))
      throw new Error("DATABASE_UNAVAILABLE");
    try {
      return await this.repository.saveDraft(manifest, workflow);
    } catch (error) {
      if (error instanceof Error && error.message === "FORM_ACTIVE")
        throw error;
      this.databaseHealth.markOffline();
      throw new Error("DATABASE_UNAVAILABLE");
    }
  }

  public async saveGeometricManifest(
    manifest: FormGeometricManifest,
  ): Promise<SaveManifestResult> {
    if (!(await this.databaseHealth.check())) {
      throw new Error("DATABASE_UNAVAILABLE");
    }

    try {
      const result = await this.repository.saveGeometricManifest(manifest);
      return { success: true, ...result, source: "database" };
    } catch (error) {
      console.error(
        "[FormPersistence] Lỗi khi lưu Geometric Manifest vào CSDL:",
        error,
      );
      if (error instanceof Error && error.message === "FORM_ACTIVE")
        throw error;
      this.databaseHealth.markOffline();
      throw new Error("DATABASE_UNAVAILABLE");
    }
  }

  public async saveWorkflow(
    workflow: FormWorkflow,
  ): Promise<SaveWorkflowResult> {
    if (
      !workflow.steps ||
      !Array.isArray(workflow.steps) ||
      workflow.steps.length === 0
    ) {
      throw new Error(
        `[FormPersistence] Dữ liệu kịch bản không hợp lệ: Biểu mẫu ${workflow.formCode} phải chứa ít nhất 1 bước hướng dẫn.`,
      );
    }

    const isDatabaseOnline = await this.databaseHealth.check();
    if (!isDatabaseOnline) {
      throw new Error("DATABASE_UNAVAILABLE");
    }

    try {
      const result = await this.repository.saveWorkflow(workflow);
      return { success: true, ...result, source: "database" };
    } catch (error) {
      console.error(
        "[FormPersistence] Lỗi khi lưu FormWorkflow vào CSDL:",
        error,
      );
      if (error instanceof Error && error.message === "FORM_ACTIVE")
        throw error;
      this.databaseHealth.markOffline();
      throw new Error("DATABASE_UNAVAILABLE");
    }
  }

  public async getWorkflowByFormCode(
    formCode: string,
  ): Promise<FormWorkflow | null> {
    if (!(await this.databaseHealth.check()))
      throw new Error("DATABASE_UNAVAILABLE");
    try {
      return await this.repository.getWorkflowByFormCode(formCode);
    } catch {
      this.databaseHealth.markOffline();
      throw new Error("DATABASE_UNAVAILABLE");
    }
  }

  public async listForms() {
    if (!(await this.databaseHealth.check()))
      throw new Error("DATABASE_UNAVAILABLE");
    try {
      return await this.repository.listForms();
    } catch {
      this.databaseHealth.markOffline();
      throw new Error("DATABASE_UNAVAILABLE");
    }
  }

  public async getWorkflowForReview(
    formCode: string,
  ): Promise<FormWorkflow | null> {
    if (!(await this.databaseHealth.check()))
      throw new Error("DATABASE_UNAVAILABLE");
    try {
      return await this.repository.getWorkflowForReview(formCode);
    } catch {
      this.databaseHealth.markOffline();
      throw new Error("DATABASE_UNAVAILABLE");
    }
  }

  public async saveReviewWorkflow(formCode: string, workflow: FormWorkflow) {
    validateReviewWorkflow(workflow, formCode);
    if (!(await this.databaseHealth.check()))
      throw new Error("DATABASE_UNAVAILABLE");
    try {
      return await this.repository.saveReviewWorkflow(formCode, workflow);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "FORM_ACTIVE",
          "NOT_FOUND",
          "FORM_CODE_MISMATCH",
          "INVALID_WORKFLOW",
          "REVIEW_CONFLICT",
        ].includes(error.message)
      )
        throw error;
      this.databaseHealth.markOffline();
      throw new Error("DATABASE_UNAVAILABLE");
    }
  }

  public async approveWorkflow(
    formCode: string,
    performedBy = "Cán bộ Một cửa",
    note?: string,
    reviewerName?: string,
  ): Promise<ApproveWorkflowResult> {
    if (!(await this.databaseHealth.check())) {
      return { success: false, newStatus: "DATABASE_UNAVAILABLE" };
    }

    try {
      await this.repository.approveWorkflow(
        formCode,
        "shared_admin_key",
        note,
        reviewerName,
      );
      return { success: true, newStatus: "ACTIVE" };
    } catch (error: unknown) {
      console.error("[FormPersistence] Lỗi khi phê duyệt kịch bản:", error);
      const code =
        typeof error === "object" && error && "code" in error
          ? (error as { code?: string }).code
          : undefined;
      const message = error instanceof Error ? error.message : undefined;
      if (message === "NOT_FOUND" || code === "P2025") {
        return { success: false, newStatus: "NOT_FOUND" };
      }
      if (message === "REVIEW_CONFLICT")
        return { success: false, newStatus: "REVIEW_CONFLICT" };
      this.databaseHealth.markOffline();
      return { success: false, newStatus: "DATABASE_UNAVAILABLE" };
    }
  }
}
