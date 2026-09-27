import type { FormRepository } from '@/modules/forms/repositories/form.repository';
import {
  ApproveWorkflowResult,
  SaveManifestResult,
  SaveWorkflowResult,
} from '@/modules/forms/types/form.types';
import { FormGeometricManifest, FormWorkflow } from '@/shared/contracts';
import { validateWorkflow } from '@/modules/forms/services/form-validation.service';

export interface DatabaseHealth {
  check(): Promise<boolean>;
  markOffline(): void;
}

export class FormPersistenceService {
  constructor(
    private readonly repository: FormRepository,
    private readonly databaseHealth: DatabaseHealth
  ) {}

  public async saveDraft(manifest: FormGeometricManifest, workflow: FormWorkflow) {
    validateWorkflow(manifest, workflow);
    if (!await this.databaseHealth.check()) throw new Error('DATABASE_UNAVAILABLE');
    try {
      return await this.repository.saveDraft(manifest, workflow);
    } catch (error) {
      if (error instanceof Error && error.message === 'FORM_ACTIVE') throw error;
      this.databaseHealth.markOffline();
      throw new Error('DATABASE_UNAVAILABLE');
    }
  }

  public async saveGeometricManifest(manifest: FormGeometricManifest): Promise<SaveManifestResult> {
    if (!await this.databaseHealth.check()) {
      throw new Error('DATABASE_UNAVAILABLE');
    }

    try {
      const result = await this.repository.saveGeometricManifest(manifest);
      return { success: true, ...result, source: 'database' };
    } catch (error) {
      console.error('[FormPersistence] Lỗi khi lưu Geometric Manifest vào CSDL:', error);
      if (error instanceof Error && error.message === 'FORM_ACTIVE') throw error;
      this.databaseHealth.markOffline();
      throw new Error('DATABASE_UNAVAILABLE');
    }
  }

  public async saveWorkflow(workflow: FormWorkflow): Promise<SaveWorkflowResult> {
    if (!workflow.steps || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new Error(
        `[FormPersistence] Dữ liệu kịch bản không hợp lệ: Biểu mẫu ${workflow.formCode} phải chứa ít nhất 1 bước hướng dẫn.`
      );
    }

    const isDatabaseOnline = await this.databaseHealth.check();
    if (!isDatabaseOnline) {
      throw new Error('DATABASE_UNAVAILABLE');
    }

    try {
      const result = await this.repository.saveWorkflow(workflow);
      return { success: true, ...result, source: 'database' };
    } catch (error) {
      console.error('[FormPersistence] Lỗi khi lưu FormWorkflow vào CSDL:', error);
      if (error instanceof Error && error.message === 'FORM_ACTIVE') throw error;
      this.databaseHealth.markOffline();
      throw new Error('DATABASE_UNAVAILABLE');
    }
  }

  public async getWorkflowByFormCode(formCode: string): Promise<FormWorkflow | null> {
    if (!await this.databaseHealth.check()) throw new Error('DATABASE_UNAVAILABLE');
    try {
      return await this.repository.getWorkflowByFormCode(formCode);
    } catch {
      this.databaseHealth.markOffline();
      throw new Error('DATABASE_UNAVAILABLE');
    }
  }

  public async approveWorkflow(
    formCode: string,
    performedBy = 'Cán bộ Một cửa',
    note?: string,
    reviewerName?: string
  ): Promise<ApproveWorkflowResult> {
    if (!await this.databaseHealth.check()) {
      return { success: false, newStatus: 'DATABASE_UNAVAILABLE' };
    }

    try {
      await this.repository.approveWorkflow(formCode, 'shared_admin_key', note, reviewerName);
      return { success: true, newStatus: 'ACTIVE' };
    } catch (error: unknown) {
      console.error('[FormPersistence] Lỗi khi phê duyệt kịch bản:', error);
      const code = typeof error === 'object' && error && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
      const message = error instanceof Error ? error.message : undefined;
      if (message === 'NOT_FOUND' || code === 'P2025') {
        return { success: false, newStatus: 'NOT_FOUND' };
      }
      if (message === 'REVIEW_CONFLICT') return { success: false, newStatus: 'REVIEW_CONFLICT' };
      this.databaseHealth.markOffline();
      return { success: false, newStatus: 'DATABASE_UNAVAILABLE' };
    }
  }
}
