import type { LocalCacheService } from '@/modules/cache';
import type { FormRepository } from '@/modules/forms/repositories/form.repository';
import {
  ApproveWorkflowResult,
  SaveManifestResult,
  SaveWorkflowResult,
} from '@/modules/forms/types/form.types';
import { FormGeometricManifest, FormWorkflow } from '@/shared/contracts';

export interface DatabaseHealth {
  check(): Promise<boolean>;
  markOffline(): void;
}

export class FormPersistenceService {
  constructor(
    private readonly repository: FormRepository,
    private readonly cache: LocalCacheService,
    private readonly databaseHealth: DatabaseHealth
  ) {}

  public async saveGeometricManifest(manifest: FormGeometricManifest): Promise<SaveManifestResult> {
    if (!await this.databaseHealth.check()) {
      console.warn('[FormPersistence] PostgreSQL offline, lưu tạm Manifest vào Local Cache.');
      this.cache.set(`manifest_${manifest.formCode}`, manifest);
      return { success: true, source: 'local_fallback' };
    }

    try {
      const result = await this.repository.saveGeometricManifest(manifest);
      return { success: true, ...result, source: 'database' };
    } catch (error) {
      console.error('[FormPersistence] Lỗi khi lưu Geometric Manifest vào CSDL:', error);
      this.databaseHealth.markOffline();
      this.cache.set(`manifest_${manifest.formCode}`, manifest);
      return { success: true, source: 'local_fallback' };
    }
  }

  public async saveWorkflow(workflow: FormWorkflow): Promise<SaveWorkflowResult> {
    if (!workflow.steps || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new Error(
        `[FormPersistence] Dữ liệu kịch bản không hợp lệ: Biểu mẫu ${workflow.formCode} phải chứa ít nhất 1 bước hướng dẫn.`
      );
    }

    const isDatabaseOnline = await this.databaseHealth.check();
    this.cache.set(`workflow_${workflow.formCode}`, workflow);

    if (!isDatabaseOnline) {
      console.warn('[FormPersistence] PostgreSQL offline, kịch bản đã được bảo toàn trong L1 Cache.');
      return {
        success: true,
        stepCount: workflow.steps.length,
        source: 'local_fallback',
      };
    }

    try {
      const result = await this.repository.saveWorkflow(workflow);
      return { success: true, ...result, source: 'database' };
    } catch (error) {
      console.error('[FormPersistence] Lỗi khi lưu FormWorkflow vào CSDL:', error);
      this.databaseHealth.markOffline();
      return {
        success: true,
        stepCount: workflow.steps.length,
        source: 'local_fallback',
      };
    }
  }

  public async getWorkflowByFormCode(formCode: string): Promise<FormWorkflow | null> {
    if (await this.databaseHealth.check()) {
      try {
        const workflow = await this.repository.getWorkflowByFormCode(formCode);
        if (workflow) {
          this.cache.set(`workflow_${formCode}`, workflow);
          return workflow;
        }
      } catch (error) {
        console.warn('[FormPersistence] Không thể đọc từ CSDL, fallback sang Local Cache:', error);
      }
    }

    return this.cache.get<FormWorkflow>(`workflow_${formCode}`);
  }

  public async approveWorkflow(
    formCode: string,
    performedBy = 'Cán bộ Một cửa',
    note?: string
  ): Promise<ApproveWorkflowResult> {
    if (!await this.databaseHealth.check()) {
      console.warn('[FormPersistence] PostgreSQL offline, cập nhật trạng thái trong Local Cache.');
      const workflow = this.cache.get<FormWorkflow>(`workflow_${formCode}`);
      if (!workflow) return { success: false, newStatus: 'NOT_FOUND' };
      workflow.status = 'active';
      this.cache.set(`workflow_${formCode}`, workflow);
      return { success: true, newStatus: 'ACTIVE' };
    }

    try {
      await this.repository.approveWorkflow(formCode, performedBy, note);
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
      this.databaseHealth.markOffline();
      return { success: false, newStatus: 'ERROR' };
    }
  }
}
