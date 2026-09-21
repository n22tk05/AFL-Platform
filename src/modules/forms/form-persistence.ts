import { prisma, checkDatabaseConnection, markDatabaseOffline } from '@/lib/prisma';
import {
  FormGeometricManifest,
  FormWorkflow,
  WorkflowStep as ContractWorkflowStep,
  StepFaqItem
} from '@/shared/contracts';
import { localCache } from '@/modules/voice-ai/local-cache';

/**
 * Tầng Dịch Vụ Lưu Trữ & Đồng Bộ CSDL PostgreSQL qua Prisma ORM (FormPersistenceService)
 * Hiện thực hóa giao dịch ACID nguyên tử (Atomic Nested Transactions),
 * bảo vệ Quota 2 tầng và cơ chế phòng vệ ngoại tuyến (Graceful Offline Resilience).
 */
export class FormPersistenceService {
  /**
   * Lưu hoặc cập nhật Bộ khung hình học từ OpenCV (FormGeometricManifest)
   * Sử dụng prisma.$transaction để bảo đảm tính toàn vẹn 100%
   */
  public async saveGeometricManifest(manifest: FormGeometricManifest): Promise<{
    success: boolean;
    templateId?: string;
    manifestId?: string;
    source: 'database' | 'local_fallback';
  }> {
    const isDbOnline = await checkDatabaseConnection();

    if (!isDbOnline) {
      console.warn('[FormPersistence] PostgreSQL offline, lưu tạm Manifest vào Local Cache.');
      localCache.set(`manifest_${manifest.formCode}`, manifest);
      return { success: true, source: 'local_fallback' };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Khởi tạo hoặc cập nhật FormTemplate
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
          }
        });

        // 2. Khởi tạo hoặc cập nhật FormGeometricManifest
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
          }
        });

        // 3. Xóa các boxes cũ để đảm bảo không bị thừa box mồ côi (Orphan Records)
        await tx.formGeometricBox.deleteMany({
          where: { manifestId: geometricManifest.id }
        });

        // 4. Tạo danh sách các FormGeometricBox
        const boxCreates = manifest.boxes.map((b, idx) => ({
          manifestId: geometricManifest.id,
          boxId: b.boxId,
          rawText: b.rawText,
          boxType: b.boxType === 'checkbox' ? 'CHECKBOX' : b.boxType === 'table_cell' ? 'TABLE_CELL' : 'TEXT',
          estimatedWidthRatio: b.estimatedWidthRatio,
          spatialOrder: idx + 1,
          boxYmin: b.normalizedCoords[0],
          boxXmin: b.normalizedCoords[1],
          boxYmax: b.normalizedCoords[2],
          boxXmax: b.normalizedCoords[3],
        }));

        await tx.formGeometricBox.createMany({
          data: boxCreates as any
        });

        return { templateId: template.id, manifestId: geometricManifest.id };
      });

      return {
        success: true,
        templateId: result.templateId,
        manifestId: result.manifestId,
        source: 'database'
      };
    } catch (err) {
      console.error('[FormPersistence] Lỗi khi lưu Geometric Manifest vào CSDL:', err);
      markDatabaseOffline();
      localCache.set(`manifest_${manifest.formCode}`, manifest);
      return { success: true, source: 'local_fallback' };
    }
  }

  /**
   * Lưu hoặc cập nhật Kịch bản Hướng dẫn Điền biểu mẫu (FormWorkflow)
   * Lưu đồng thời toàn bộ 9 bước (WorkflowStep) và các câu hỏi nhanh (StepFaq)
   */
  public async saveWorkflow(workflow: FormWorkflow): Promise<{
    success: boolean;
    workflowId?: string;
    stepCount?: number;
    source: 'database' | 'local_fallback';
  }> {
    // Chốt chặn kiểm thực bảo vệ toàn vẹn dữ liệu (Input Guard chống mất dữ liệu QA-BUG-02)
    if (!workflow.steps || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new Error(
        `[FormPersistence] Dữ liệu kịch bản không hợp lệ: Biểu mẫu ${workflow.formCode} phải chứa ít nhất 1 bước hướng dẫn.`
      );
    }

    const isDbOnline = await checkDatabaseConnection();

    // Lưu ngay vào Local Cache làm chốt chặn L1
    localCache.set(`workflow_${workflow.formCode}`, workflow);

    if (!isDbOnline) {
      console.warn('[FormPersistence] PostgreSQL offline, kịch bản đã được bảo toàn trong L1 Cache.');
      return {
        success: true,
        stepCount: workflow.steps.length,
        source: 'local_fallback'
      };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Đảm bảo FormTemplate tồn tại
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
          }
        });

        // 2. Upsert FormWorkflow
        const formWorkflow = await tx.formWorkflow.upsert({
          where: { formTemplateId: template.id },
          update: {
            status: workflow.status === 'active' ? 'ACTIVE' : 'PENDING_REVIEW',
            updatedAt: new Date(),
          },
          create: {
            formTemplateId: template.id,
            status: workflow.status === 'active' ? 'ACTIVE' : 'PENDING_REVIEW',
          }
        });

        // 3. Xóa các bước cũ để ghi đè danh sách mới sạch sẽ
        await tx.workflowStep.deleteMany({
          where: { workflowId: formWorkflow.id }
        });

        // 4. Lưu từng bước kèm danh sách StepFaq lồng nhau
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
                create: (step.faqs || []).map((faq, fIdx) => ({
                  question: faq.question,
                  answer: faq.answer,
                  order: fIdx + 1
                }))
              }
            }
          });
        }

        return { workflowId: formWorkflow.id, stepCount: workflow.steps.length };
      });

      return {
        success: true,
        workflowId: result.workflowId,
        stepCount: result.stepCount,
        source: 'database'
      };
    } catch (err) {
      console.error('[FormPersistence] Lỗi khi lưu FormWorkflow vào CSDL:', err);
      markDatabaseOffline();
      return {
        success: true,
        stepCount: workflow.steps.length,
        source: 'local_fallback'
      };
    }
  }

  /**
   * Truy vấn Kịch bản Hướng dẫn hoàn chỉnh theo mã biểu mẫu (formCode)
   * Trả về định dạng chuẩn FormWorkflow cho Mobile Frontend (Người 2)
   */
  public async getWorkflowByFormCode(formCode: string): Promise<FormWorkflow | null> {
    const isDbOnline = await checkDatabaseConnection();

    if (isDbOnline) {
      try {
        const template = await prisma.formTemplate.findUnique({
          where: { formCode },
          include: {
            workflow: {
              include: {
                steps: {
                  include: {
                    faqs: {
                      orderBy: { order: 'asc' }
                    }
                  },
                  orderBy: { stepIndex: 'asc' }
                }
              }
            }
          }
        });

        if (template && template.workflow && template.workflow.steps.length > 0) {
          const steps: ContractWorkflowStep[] = template.workflow.steps.map(s => ({
            stepIndex: s.stepIndex,
            boxId: s.boxId,
            sectionName: s.sectionName,
            label: s.label,
            voiceGuidance: s.voiceGuidance,
            audioUrl: s.audioUrl || `/audio/step_${String(s.stepIndex).padStart(2, '0')}.mp3`,
            exampleRedText: s.exampleRedText || '',
            highlightCoords: [
              s.highlightYmin ?? 0,
              s.highlightXmin ?? 0,
              s.highlightYmax ?? 0,
              s.highlightXmax ?? 0,
            ],
            requiresPrerequisiteDoc: s.requiresPrerequisiteDoc,
            sourceFieldFromPrerequisite: s.sourceFieldFromPrerequisite || undefined,
            legalWarningFlag: s.legalWarningFlag,
            faqs: s.faqs.map(f => ({
              question: f.question,
              answer: f.answer
            }))
          }));

          const result: FormWorkflow = {
            formId: template.id,
            formTitle: template.formTitle,
            formCode: template.formCode,
            status: template.workflow.status.toLowerCase() as any,
            steps
          };

          // Tự động làm ấm (warm) L1 Cache để các lần truy vấn tiếp theo đạt 0ms
          localCache.set(`workflow_${formCode}`, result);

          return result;
        }
      } catch (err) {
        console.warn('[FormPersistence] Không thể đọc từ CSDL, fallback sang Local Cache:', err);
      }
    }

    // Fallback sang L1 Local Cache
    const cached = localCache.get<FormWorkflow>(`workflow_${formCode}`);
    return cached || null;
  }

  /**
   * Phê duyệt Kịch bản Biểu mẫu (FR-9 Admin Gatekeeper)
   * Kích hoạt trạng thái ACTIVE và ghi nhật ký kiểm định FormAuditLog
   */
  public async approveWorkflow(
    formCode: string,
    performedBy: string = 'Cán bộ Một cửa',
    note?: string
  ): Promise<{ success: boolean; newStatus: string }> {
    const isDbOnline = await checkDatabaseConnection();

    if (!isDbOnline) {
      console.warn('[FormPersistence] PostgreSQL offline, cập nhật trạng thái trong Local Cache.');
      const localWf = localCache.get<FormWorkflow>(`workflow_${formCode}`);
      if (!localWf) {
        return { success: false, newStatus: 'NOT_FOUND' };
      }
      localWf.status = 'active';
      localCache.set(`workflow_${formCode}`, localWf);
      return { success: true, newStatus: 'ACTIVE' };
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Kiểm tra xem template có tồn tại không trước khi update
        const existing = await tx.formTemplate.findUnique({
          where: { formCode }
        });

        if (!existing) {
          throw new Error('NOT_FOUND');
        }

        const template = await tx.formTemplate.update({
          where: { formCode },
          data: {
            status: 'ACTIVE',
            workflow: {
              upsert: {
                create: { status: 'ACTIVE' },
                update: { status: 'ACTIVE' }
              }
            },
            auditLogs: {
              create: {
                action: 'APPROVE',
                performedBy,
                note: note || 'Phê duyệt kịch bản hướng dẫn và kiểm tra chữ mẫu đỏ hợp lệ.',
                metadata: { approvedAt: new Date().toISOString() }
              }
            }
          }
        });
        return template;
      });

      return { success: true, newStatus: 'ACTIVE' };
    } catch (err: any) {
      console.error('[FormPersistence] Lỗi khi phê duyệt kịch bản:', err);
      if (err.message === 'NOT_FOUND' || err.code === 'P2025') {
        return { success: false, newStatus: 'NOT_FOUND' };
      }
      markDatabaseOffline();
      return { success: false, newStatus: 'ERROR' };
    }
  }

  /**
   * Lưu thông tin Giọng nói TTS vào bảng CSDL L2 voice_cache
   */
  public async saveVoiceCache(entry: {
    cacheKey: string;
    rawText: string;
    audioUrl: string;
    voiceName?: string;
    speakingRate?: number;
  }): Promise<void> {
    const isDbOnline = await checkDatabaseConnection();
    if (!isDbOnline) return;

    try {
      await prisma.voiceCache.upsert({
        where: { cacheKey: entry.cacheKey },
        update: {
          audioUrl: entry.audioUrl,
          rawText: entry.rawText,
        },
        create: {
          cacheKey: entry.cacheKey,
          rawText: entry.rawText,
          audioUrl: entry.audioUrl,
          voiceName: entry.voiceName || 'vi-VN-Neural2-A',
          speakingRate: entry.speakingRate || 0.9,
        }
      });
    } catch (err) {
      console.warn('[FormPersistence] Không thể ghi bảng voice_cache:', err);
    }
  }

  /**
   * Truy vấn thông tin Giọng nói TTS từ bảng CSDL L2 voice_cache
   */
  public async getVoiceCache(cacheKey: string): Promise<{ audioUrl: string } | null> {
    const isDbOnline = await checkDatabaseConnection();
    if (!isDbOnline) return null;

    try {
      const record = await prisma.voiceCache.findUnique({
        where: { cacheKey }
      });
      return record ? { audioUrl: record.audioUrl } : null;
    } catch {
      return null;
    }
  }
}

export const formPersistenceService = new FormPersistenceService();
