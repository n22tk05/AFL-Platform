import { FormWorkflow, FormStatus } from "@/shared/contracts";
import initialTemplates from "../../../assets/mock-data/mock-admin-templates.json";
import mockLptb from "../../../assets/mock-data/mock-workflow-01-lptb.json";
import mockKhaiSinh from "../../../assets/mock-data/mock-workflow-khai-sinh-lai.json";
import mockVphc from "../../../assets/mock-data/mock-workflow-tpl_02_vphc.json";

const DRAFT_PREFIX = "afl_workflow_draft_";
const PUBLISHED_PREFIX = "afl_workflow_published_";

export const FormStorageService = {
  // Lấy TOÀN BỘ biểu mẫu đang ACTIVE để hiển thị cho Người dân
  getActiveCitizenForms(): any[] {
    const templateMap = new Map<string, any>();

    // 1. Nạp tất cả biểu mẫu mặc định có status ACTIVE
    (initialTemplates as any[]).forEach((base: any) => {
      if ((base.status || "").toUpperCase() === "ACTIVE") {
        templateMap.set(base.id, {
          id: base.id,
          formCode: base.formCode,
          title: base.title || base.formTitleVi,
          department: base.department || "Bộ phận Tiếp nhận & Trả kết quả Một cửa",
          legalBasis: base.legalBasis || base.circularInfo,
          version: base.version || 1,
          totalPages: base.totalPages || 1,
          totalSteps: base.totalSteps || 0,
          status: "ACTIVE",
          thumbnailUrl: base.thumbnailUrl || "/assets/forms/01-lptb/page-1.jpg",
          publishedAt: base.publishedAt,
        });
      }
    });

    // 2. Quét localStorage để cập nhật phiên bản mới hoặc thêm biểu mẫu mới xuất bản
    if (typeof window !== "undefined") {
      try {
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (key.startsWith(PUBLISHED_PREFIX)) {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const item = JSON.parse(raw);
            const status = (item.status || "").toUpperCase();

            // Nếu biểu mẫu được đánh dấu là ACTIVE
            if (status === "ACTIVE" && item.templateId) {
              templateMap.set(item.templateId, {
                id: item.templateId,
                formCode: item.formCode || "MẪU",
                title: item.formTitleVi || item.title || item.formTitle || "Biểu mẫu hành chính",
                department: item.department || "Bộ phận Tiếp nhận & Trả kết quả Một cửa",
                legalBasis: item.circularInfo || item.legalBasis || "Quy định hiện hành",
                version: item.version || 1,
                totalPages: item.totalPages || 1,
                totalSteps: item.totalSteps || item.steps?.length || 0,
                status: "ACTIVE",
                thumbnailUrl: item.pages?.[0]?.imageUrl || "/assets/forms/01-lptb/page-1.jpg",
                publishedAt: item.publishedAt || new Date().toISOString(),
              });
            } else if (status !== "ACTIVE" && templateMap.has(item.templateId)) {
              // Nếu admin chủ động chuyển mẫu gốc về DRAFT hoặc ARCHIVED thì ẩn khỏi Citizen
              templateMap.delete(item.templateId);
            }
          }
        });
      } catch (err) {
        console.warn("Lỗi khi đọc danh mục biểu mẫu từ localStorage:", err);
      }
    }

    return Array.from(templateMap.values());
  },

  // Lấy chi tiết kịch bản cho Citizen (Chỉ nhận ACTIVE)
  getCitizenWorkflow(templateId: string): FormWorkflow | null {
    if (typeof window !== "undefined") {
      const publishedRaw = localStorage.getItem(`${PUBLISHED_PREFIX}${templateId}`);
      if (publishedRaw) {
        try {
          const parsed = JSON.parse(publishedRaw) as FormWorkflow;
          if ((parsed.status || "").toUpperCase() === "ACTIVE") {
            return {
              ...parsed,
              templateId: parsed.templateId || templateId,
              formTitle: parsed.formTitle || parsed.formTitleVi || "Biểu mẫu hành chính",
              formTitleVi: parsed.formTitleVi || parsed.formTitle || "Biểu mẫu hành chính",
            };
          }
          return null; // Nếu bị hạ trạng thái thì chặn không cho xem
        } catch {}
      }
    }

    // Fallback sang file mock ban đầu nếu có status ACTIVE
    let fallback: any = null;
    if (templateId === "tpl_03_khai_sinh") fallback = mockKhaiSinh;
    else if (templateId === "tpl_01_lptb") fallback = mockLptb;
    else if (templateId === "tpl_02_vphc") fallback = mockVphc;

    if (fallback && (fallback.status || "").toUpperCase() === "ACTIVE") {
      return {
        ...fallback,
        templateId: fallback.templateId || templateId,
        formTitle: fallback.formTitle || fallback.formTitleVi || "Biểu mẫu hành chính",
        formTitleVi: fallback.formTitleVi || fallback.formTitle || "Biểu mẫu hành chính",
        status: "ACTIVE",
      } as FormWorkflow;
    }

    return null;
  },

  // Lấy chi tiết workflow cho Admin Review (Cho phép cả DRAFT, PENDING, ACTIVE)
  getAdminWorkflow(templateId: string): FormWorkflow {
    if (typeof window !== "undefined") {
      const draft = localStorage.getItem(`${DRAFT_PREFIX}${templateId}`);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          return {
            ...parsed,
            templateId: parsed.templateId || templateId,
            formTitle: parsed.formTitle || parsed.formTitleVi || "Biểu mẫu hành chính",
            formTitleVi: parsed.formTitleVi || parsed.formTitle || "Biểu mẫu hành chính",
            status: ((parsed.status || "DRAFT") as string).toUpperCase() as FormStatus,
          };
        } catch {}
      }
      const published = localStorage.getItem(`${PUBLISHED_PREFIX}${templateId}`);
      if (published) {
        try {
          const parsed = JSON.parse(published);
          return {
            ...parsed,
            templateId: parsed.templateId || templateId,
            formTitle: parsed.formTitle || parsed.formTitleVi || "Biểu mẫu hành chính",
            formTitleVi: parsed.formTitleVi || parsed.formTitle || "Biểu mẫu hành chính",
            status: ((parsed.status || "ACTIVE") as string).toUpperCase() as FormStatus,
          };
        } catch {}
      }
    }

    let defaultWorkflow: any = mockLptb;
    if (templateId === "tpl_03_khai_sinh") defaultWorkflow = mockKhaiSinh;
    else if (templateId === "tpl_02_vphc") defaultWorkflow = mockVphc;

    // Tìm template gốc để lấy đúng trạng thái danh mục đã khai báo
    const targetTemplate = (initialTemplates as any[]).find(
      (t: any) => t.id === templateId || t.formCode === templateId
    );
    const declaredStatus = targetTemplate
      ? targetTemplate.status
      : (defaultWorkflow.status || "PENDING_REVIEW");

    return {
      ...defaultWorkflow,
      templateId: templateId,
      formCode: targetTemplate?.formCode || defaultWorkflow.formCode || templateId,
      formTitle: targetTemplate?.title || defaultWorkflow.formTitleVi || defaultWorkflow.formTitle || "Biểu mẫu hành chính",
      formTitleVi: targetTemplate?.title || defaultWorkflow.formTitleVi || defaultWorkflow.formTitle || "Biểu mẫu hành chính",
      status: (declaredStatus || "PENDING_REVIEW").toUpperCase() as FormStatus,
    };
  },

  // Lấy toàn bộ danh sách biểu mẫu cho Thư viện Admin (bao gồm cả DRAFT, PENDING, ACTIVE, ARCHIVED)
  getAllAdminForms(): any[] {
    const list: any[] = (initialTemplates as any[]).map((t) => ({ ...t }));
    if (typeof window === "undefined") return list;

    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(PUBLISHED_PREFIX) || key.startsWith(DRAFT_PREFIX)) {
          const item = JSON.parse(localStorage.getItem(key) || "{}");
          if (item.templateId) {
            const rawStatus = (item.status ? String(item.status).toUpperCase() : "DRAFT") as FormStatus;
            const existingIdx = list.findIndex((t) => t.id === item.templateId);
            if (existingIdx !== -1) {
              list[existingIdx].status = rawStatus;
              if (item.version) list[existingIdx].version = item.version;
              if (item.totalSteps) list[existingIdx].totalSteps = item.totalSteps;
              if (item.formTitleVi) list[existingIdx].title = item.formTitleVi;
            } else if (!list.some((t) => t.id === item.templateId)) {
              list.unshift({
                id: item.templateId,
                formCode: item.formCode || "MẪU_MỚI",
                title: item.formTitleVi || item.formTitle || "Biểu mẫu hành chính",
                legalBasis: item.circularInfo || "Kê khai hành chính",
                department: item.department || "Bộ phận Một cửa",
                version: item.version || 1,
                totalSteps: item.totalSteps || item.steps?.length || 0,
                totalPages: item.totalPages || 1,
                status: rawStatus,
                publishedAt: item.publishedAt || new Date().toISOString(),
                thumbnailUrl: item.pages?.[0]?.imageUrl || "/assets/forms/01-lptb/page-1.jpg",
              });
            }
          }
        }
      });
    } catch (e) {
      console.warn("Lỗi load admin forms:", e);
    }
    return list;
  },

  // Lưu bản nháp (DRAFT hoặc PENDING_REVIEW)
  saveDraft(workflow: FormWorkflow): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(`${DRAFT_PREFIX}${workflow.templateId}`, JSON.stringify(workflow));
  },

  // Phê duyệt và Xuất bản / Cập nhật phiên bản mới
  publish(workflow: FormWorkflow): void {
    if (typeof window === "undefined") return;

    const publishedAt = new Date().toISOString();
    const activeWorkflow: FormWorkflow = {
      ...workflow,
      status: "ACTIVE",
      publishedAt,
    };

    localStorage.setItem(`${PUBLISHED_PREFIX}${workflow.templateId}`, JSON.stringify(activeWorkflow));
    localStorage.setItem(`${DRAFT_PREFIX}${workflow.templateId}`, JSON.stringify(activeWorkflow));
    localStorage.setItem("afl_admin_last_published_time", publishedAt);

    // Bắn sự kiện đồng bộ toàn hệ thống
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("afl:form-updated", { detail: { templateId: workflow.templateId } }));
  },
};
