"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { FormWorkflow, WorkflowStep, NormalizedBoundingBox } from "@/shared/contracts";
import { getMockWorkflow } from "@/config/app.config";
import { AdminVisualTwinEditor } from "@/components/admin/AdminVisualTwinEditor";
import { AdminStepEditor } from "@/components/admin/AdminStepEditor";
import { CheckCircle2, Download, Copy, Check, FileCode, X, Database, Tag, ArrowLeft } from "lucide-react";

export default function AdminReviewPage() {
  const router = useRouter();
  const params = useParams();
  const formId = (params?.id as string) || "tpl_01_lptb";

  const defaultWorkflow = useMemo(() => {
    return getMockWorkflow(formId);
  }, [formId]);

  const [workflow, setWorkflow] = useState<FormWorkflow>(defaultWorkflow);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [currentPageNumber, setCurrentPageNumber] = useState<number>(1);
  const [isLegalChecked, setIsLegalChecked] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Khôi phục từ localStorage nếu có bản lưu trước đó
  useEffect(() => {
    let activeWorkflow = getMockWorkflow(formId);
    if (typeof window !== "undefined") {
      try {
        const savedData = localStorage.getItem(`afl_workflow_published_${formId}`);
        if (savedData) {
          const parsed = JSON.parse(savedData) as FormWorkflow;
          if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
            activeWorkflow = parsed;
            setToastMessage(`Đã nạp bản lưu v${parsed.version || 1} từ trình duyệt!`);
            setTimeout(() => setToastMessage(null), 3000);
          }
        }
      } catch (e) {
        console.warn("Lỗi đọc localStorage:", e);
      }
    }
    setWorkflow(activeWorkflow);
    setCurrentStepIndex(0);
    setCurrentPageNumber(activeWorkflow.steps[0]?.pageNumber || 1);
  }, [formId]);

  const currentStep = workflow.steps[currentStepIndex];

  // Chuẩn hóa trạng thái biểu mẫu hiện tại
  const normalizedStatus = useMemo<"DRAFT" | "ACTIVE" | "ARCHIVED">(() => {
    const raw = (workflow.status || "DRAFT").toUpperCase();
    if (raw === "ACTIVE") return "ACTIVE";
    if (raw === "ARCHIVED") return "ARCHIVED";
    return "DRAFT";
  }, [workflow.status]);

  // Xử lý đổi trạng thái trực tiếp từ Header
  const handleStatusChange = (newStatus: "DRAFT" | "ACTIVE" | "ARCHIVED") => {
    const updatedWorkflow: FormWorkflow = {
      ...workflow,
      status: newStatus,
    };
    setWorkflow(updatedWorkflow);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          `afl_workflow_published_${workflow.templateId || formId}`,
          JSON.stringify(updatedWorkflow)
        );
        localStorage.setItem(
          `afl_workflow_draft_${workflow.templateId || formId}`,
          JSON.stringify(updatedWorkflow)
        );
      } catch (e) {
        console.warn("Lỗi lưu trạng thái vào localStorage:", e);
      }
    }

    const labelMap: Record<"DRAFT" | "ACTIVE" | "ARCHIVED", string> = {
      DRAFT: "Bản nháp",
      ACTIVE: "Đang áp dụng",
      ARCHIVED: "Lưu trữ / Hết hiệu lực",
    };
    setToastMessage(`Đã đổi trạng thái sang: "${labelMap[newStatus]}"!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Tự động lưu bản nháp khi bấm quay lại Thư viện
  const handleReturnToLibrary = () => {
    if (typeof window !== "undefined") {
      try {
        const draftWorkflow: FormWorkflow = {
          ...workflow,
          templateId: workflow.templateId || formId,
          totalSteps: workflow.steps.length,
          steps: workflow.steps.map((s, idx) => ({ ...s, stepIndex: idx })),
        };
        localStorage.setItem(
          `afl_workflow_published_${workflow.templateId || formId}`,
          JSON.stringify(draftWorkflow)
        );
        localStorage.setItem(
          `afl_workflow_draft_${workflow.templateId || formId}`,
          JSON.stringify(draftWorkflow)
        );
      } catch (e) {
        console.warn("Lỗi lưu tự động trước khi thoát:", e);
      }
    }
    router.push("/admin/library");
  };

  // 1. Cập nhật nội dung bước
  const handleUpdateStep = (updatedStep: WorkflowStep) => {
    const updatedSteps = [...workflow.steps];
    updatedSteps[currentStepIndex] = updatedStep;
    setWorkflow({ ...workflow, steps: updatedSteps });
  };

  // 2. Chèn bước mới ngay sau vị trí hiện tại theo đúng ngữ cảnh phân đoạn
  const handleInsertStep = (insertAfterIndex: number) => {
    const baseStep = workflow.steps[insertAfterIndex] || workflow.steps[0];
    const newStep: WorkflowStep = {
      stepIndex: insertAfterIndex + 1,
      boxId: `box_custom_${Date.now()}`,
      pageNumber: baseStep.pageNumber || 1,
      sectionName: baseStep.sectionName,
      label: "Mục mới bổ sung",
      voiceGuidance: "Bác ghi rõ nội dung của mục này theo giấy tờ gốc nhé.",
      audioUrl: baseStep.audioUrl || "/assets/audio/default.mp3",
      exampleRedText: "NỘI DUNG MẪU",
      highlightCoords: [0.42, 0.2, 0.46, 0.85],
      requiresPrerequisiteDoc: false,
      legalWarningFlag: false,
      faqs: [],
    };

    const newSteps = [...workflow.steps];
    newSteps.splice(insertAfterIndex + 1, 0, newStep);

    // Đánh lại chỉ số index cho toàn bộ mảng chuẩn xác từ 0 đến N-1
    const reindexedSteps = newSteps.map((s, idx) => ({ ...s, stepIndex: idx }));

    setWorkflow({
      ...workflow,
      totalSteps: reindexedSteps.length,
      steps: reindexedSteps,
    });
    setCurrentStepIndex(insertAfterIndex + 1);
    setToastMessage(`Đã thêm bước mới vào mục "${baseStep.sectionName}"!`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // 3. Xóa bước hiện tại và đánh số lại toàn bộ
  const handleDeleteStep = (deleteIndex: number) => {
    const newSteps = workflow.steps.filter((_, idx) => idx !== deleteIndex);
    const reindexedSteps = newSteps.map((s, idx) => ({ ...s, stepIndex: idx }));

    setWorkflow({
      ...workflow,
      totalSteps: reindexedSteps.length,
      steps: reindexedSteps,
    });
    setCurrentStepIndex(Math.max(0, deleteIndex - 1));
    setToastMessage("Đã xóa bước thành công!");
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleCoordsChange = (newCoords: NormalizedBoundingBox) => {
    if (!currentStep) return;
    handleUpdateStep({ ...currentStep, highlightCoords: newCoords });
  };

  const handleSelectStep = (index: number) => {
    setCurrentStepIndex(index);
    const targetStep = workflow.steps[index];
    if (targetStep && targetStep.pageNumber && targetStep.pageNumber !== currentPageNumber) {
      setCurrentPageNumber(targetStep.pageNumber);
    }
  };

  // 4. PHÊ DUYỆT & GỌI API LƯU FILE VÀO HỆ THỐNG
  const handlePublishAndExport = async () => {
    if (!isLegalChecked) return;
    setIsPublishing(true);
    const publishPayload: FormWorkflow = {
      ...workflow,
      status: "ACTIVE",
      templateId: workflow.templateId || formId,
    };
    try {
      // 1. Phê duyệt trong Database qua API /api/admin/forms/[formCode]/approve (chuyển trạng thái sang ACTIVE)
      const formCode = workflow.formCode || formId;
      try {
        await fetch(`/api/admin/forms/${encodeURIComponent(formCode)}/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": "afl_admin_secret_guard_key_2026",
          },
          body: JSON.stringify({
            reviewConfirmed: true,
            performedBy: "Cán bộ quản trị",
            note: "Phê duyệt biểu mẫu qua Admin Review Portal",
          }),
        });
      } catch (dbErr) {
        console.warn("DB approve warning (offline fallback enabled):", dbErr);
      }

      // 2. Gọi API phía server để ghi file vào thư mục assets/mock-data/
      const res = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publishPayload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const finalWorkflow: FormWorkflow = {
          ...data.workflow,
          status: "ACTIVE",
        };
        setWorkflow(finalWorkflow);

        // Lưu vào LocalStorage đồng bộ cho cả Citizen
        localStorage.setItem(
          `afl_workflow_published_${finalWorkflow.templateId || formId}`,
          JSON.stringify(finalWorkflow)
        );
        localStorage.setItem(
          `afl_workflow_draft_${finalWorkflow.templateId || formId}`,
          JSON.stringify(finalWorkflow)
        );
        localStorage.setItem("afl_admin_last_published_time", finalWorkflow.publishedAt || new Date().toISOString());

        setToastMessage(`Đã xuất bản thành công phiên bản v${data.version} (Đang áp dụng)!`);
        setIsExportModalOpen(true);
      } else {
        throw new Error(data.error || "Không thể xuất bản");
      }
    } catch (err: any) {
      console.warn("Lưu file qua API thất bại, lưu fallback vào LocalStorage:", err);
      // Fallback lưu LocalStorage nếu API route bị lỗi
      const nextVer = (workflow.version || 1) + 1;
      const fallbackWorkflow: FormWorkflow = {
        ...workflow,
        status: "ACTIVE",
        version: nextVer,
        publishedAt: new Date().toISOString(),
        totalSteps: workflow.steps.length,
        steps: workflow.steps.map((s, idx) => ({ ...s, stepIndex: idx })),
      };
      setWorkflow(fallbackWorkflow);
      localStorage.setItem(
        `afl_workflow_published_${workflow.templateId || formId}`,
        JSON.stringify(fallbackWorkflow)
      );
      localStorage.setItem(
        `afl_workflow_draft_${workflow.templateId || formId}`,
        JSON.stringify(fallbackWorkflow)
      );
      localStorage.setItem("afl_admin_last_published_time", fallbackWorkflow.publishedAt || new Date().toISOString());
      setToastMessage(`Đã xuất bản v${nextVer} (lưu vào LocalStorage, Đang áp dụng)!`);
      setIsExportModalOpen(true);
    } finally {
      setIsPublishing(false);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  const handleDownloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(workflow, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `${workflow.templateId || formId}_v${workflow.version || 1}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(workflow, null, 2));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!currentStep) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8 text-slate-500 font-bold">
        Đang tải kịch bản biểu mẫu...
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-61px)] flex flex-col overflow-hidden relative">
      {/* Toast thông báo nổi */}
      {toastMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-2xl border border-emerald-500 animate-bounce">
          <Database className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header trạng thái */}
      <div className="bg-white border-b border-slate-300 px-6 py-2.5 flex items-center justify-between gap-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          {/* Nút quay lại danh mục thư viện admin (Tự động lưu bản nháp) */}
          <button
            type="button"
            onClick={handleReturnToLibrary}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
            title="Tự động lưu bản nháp và quay lại thư viện"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-700" />
            <span>Thư viện</span>
          </button>

          <div className="h-4 w-px bg-slate-300" />

          <span className="font-mono text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
            {workflow.formCode}
          </span>
          <h2 className="text-base font-black text-slate-900">
            {workflow.formTitleVi || workflow.formTitle}
          </h2>
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 text-xs font-black px-2 py-0.5 rounded-full border border-amber-300">
            <Tag className="w-3 h-3" />
            <span>Bản ban hành: v{workflow.version || 1}</span>
          </span>

          {/* Ô chọn Trạng thái Biểu mẫu trực tiếp (Status Selector) */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black transition-all ${
              normalizedStatus === "ACTIVE"
                ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                : normalizedStatus === "ARCHIVED"
                ? "bg-slate-100 text-slate-700 border-slate-300"
                : "bg-amber-50 text-amber-900 border-amber-300"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                normalizedStatus === "ACTIVE"
                  ? "bg-emerald-500 animate-pulse"
                  : normalizedStatus === "ARCHIVED"
                  ? "bg-slate-400"
                  : "bg-amber-500 animate-pulse"
              }`}
            />
            <select
              value={normalizedStatus}
              onChange={(e) =>
                handleStatusChange(e.target.value as "DRAFT" | "ACTIVE" | "ARCHIVED")
              }
              className="bg-transparent font-black cursor-pointer focus:outline-none pr-1 text-xs"
              aria-label="Chọn trạng thái biểu mẫu"
            >
              <option value="DRAFT" className="bg-white text-amber-900 font-bold">
                Bản nháp (DRAFT)
              </option>
              <option value="ACTIVE" className="bg-white text-emerald-900 font-bold">
                Đang áp dụng (ACTIVE)
              </option>
              <option value="ARCHIVED" className="bg-white text-slate-700 font-bold">
                Lưu trữ (ARCHIVED)
              </option>
            </select>
          </div>
        </div>

        {/* Cam kết pháp lý & Nút xuất bản */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={isLegalChecked}
              onChange={(e) => setIsLegalChecked(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-800 select-none">
              Tôi đã đối soát kỹ lưỡng căn cứ pháp lý & tọa độ ô
            </span>
          </label>

          <button
            type="button"
            disabled={!isLegalChecked || isPublishing}
            onClick={handlePublishAndExport}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-lg flex items-center gap-2 active:scale-95 transition-all shadow-md"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isPublishing ? "ĐANG LƯU FILE..." : "PHÊ DUYỆT & XUẤT FILE JSON"}</span>
          </button>
        </div>
      </div>

      {/* Khung chia đôi 60/40 */}
      <div className="flex-1 flex overflow-hidden">
        {/* Cột trái: Document Viewer & Bounding Box Editor */}
        <div className="w-[60%] h-full">
          <AdminVisualTwinEditor
            pages={
              workflow.pages && workflow.pages.length > 0
                ? workflow.pages
                : [
                    {
                      pageNumber: 1,
                      imageUrl: "/assets/forms/01-lptb/page-1.jpg",
                      width: 1200,
                      height: 1700,
                    },
                  ]
            }
            currentPageNumber={currentPageNumber}
            onPageChange={setCurrentPageNumber}
            highlightCoords={currentStep.highlightCoords}
            onCoordsChange={handleCoordsChange}
            fieldLabel={currentStep.label}
          />
        </div>

        {/* Cột phải: Step Inspector */}
        <div className="w-[40%] h-full">
          <AdminStepEditor
            steps={workflow.steps}
            currentStepIndex={currentStepIndex}
            onSelectStep={handleSelectStep}
            onUpdateStep={handleUpdateStep}
            onInsertStep={handleInsertStep}
            onDeleteStep={handleDeleteStep}
          />
        </div>
      </div>

      {/* Modal Xuất bản JSON hoàn chỉnh */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-sm uppercase tracking-wide">
                  Đã Lưu Vào Thư Mục assets/mock-data/ (Phiên bản: v{workflow.version || 1})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                aria-label="Đóng modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto bg-slate-950 font-mono text-xs text-emerald-300 leading-relaxed no-scrollbar">
              <pre className="whitespace-pre-wrap">{JSON.stringify(workflow, null, 2)}</pre>
            </div>

            <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-300 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-bold flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Phiên bản v{workflow.version || 1} sẽ được Citizen tự động ưu tiên nạp</span>
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{isCopied ? "Đã sao chép!" : "Sao chép JSON"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File .json Về Máy</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
