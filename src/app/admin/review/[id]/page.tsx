"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { FormWorkflow, WorkflowStep, NormalizedBoundingBox, FormStatus } from "@/shared/contracts";
import { FormStorageService } from "@/shared/services/form-storage";
import { getMockWorkflow } from "@/config/app.config";
import { AdminVisualTwinEditor } from "@/components/admin/AdminVisualTwinEditor";
import { AdminStepEditor } from "@/components/admin/AdminStepEditor";
import {
  CheckCircle2,
  Download,
  Copy,
  Check,
  FileCode,
  X,
  Database,
  Tag,
  ArrowLeft,
  Send,
  RotateCcw,
  CheckSquare,
  Archive,
} from "lucide-react";

export type FormLifecycleStatus = FormStatus;

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

  // 1. Khôi phục từ localStorage nếu có bản lưu trước đó
  useEffect(() => {
    const activeWorkflow = FormStorageService.getAdminWorkflow(formId);
    setWorkflow(activeWorkflow);
    setCurrentStepIndex(0);
    setCurrentPageNumber(activeWorkflow.steps[0]?.pageNumber || 1);
    setToastMessage(`Đã nạp bản lưu (${activeWorkflow.status || "DRAFT"})!`);
    const timer = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [formId]);

  const currentStep = workflow.steps[currentStepIndex];

  // Chuẩn hóa trạng thái vòng đời biểu mẫu
  const currentStatus: FormLifecycleStatus = useMemo(() => {
    const raw = (workflow.status || "DRAFT").toUpperCase();
    if (raw === "PENDING_REVIEW") return "PENDING_REVIEW";
    if (raw === "ACTIVE") return "ACTIVE";
    if (raw === "ARCHIVED") return "ARCHIVED";
    return "DRAFT";
  }, [workflow.status]);

  // Hàm lưu dữ liệu vào LocalStorage
  const saveToLocal = (dataToSave: FormWorkflow) => {
    if (dataToSave.status === "ACTIVE") {
      FormStorageService.publish(dataToSave);
    } else {
      FormStorageService.saveDraft(dataToSave);
    }
  };

  // Nút quay lại: Tự động lưu bản nháp hiện tại
  const handleReturnToLibrary = () => {
    const draftWorkflow: FormWorkflow = {
      ...workflow,
      templateId: workflow.templateId || formId,
      totalSteps: workflow.steps.length,
      steps: workflow.steps.map((s, idx) => ({ ...s, stepIndex: idx })),
    };
    saveToLocal(draftWorkflow);
    router.push("/admin/library");
  };

  const handleUpdateStep = (updatedStep: WorkflowStep) => {
    const updatedSteps = [...workflow.steps];
    updatedSteps[currentStepIndex] = updatedStep;
    setWorkflow({ ...workflow, steps: updatedSteps });
  };

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

  // HÀNH ĐỘNG 1: DRAFT -> PENDING_REVIEW (GỬI THẨM ĐỊNH)
  const handleSubmitForReview = () => {
    const updated: FormWorkflow = {
      ...workflow,
      status: "PENDING_REVIEW",
    };
    setWorkflow(updated);
    saveToLocal(updated);
    setToastMessage("Đã nộp hồ sơ chuyển sang trạng thái CHỜ THẨM ĐỊNH!");
    setTimeout(() => setToastMessage(null), 2500);
  };

  // HÀNH ĐỘNG 2: PENDING_REVIEW -> DRAFT (TRẢ VỀ SỬA)
  const handleReturnToDraft = () => {
    if (
      confirm(
        "Bác có chắc chắn muốn trả biểu mẫu này về trạng thái Bản Nháp để sửa lại tọa độ / nội dung không?"
      )
    ) {
      const updated: FormWorkflow = {
        ...workflow,
        status: "DRAFT",
      };
      setWorkflow(updated);
      saveToLocal(updated);
      setIsLegalChecked(false);
      setToastMessage("Đã chuyển về trạng thái BẢN NHÁP!");
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  // HÀNH ĐỘNG 3: PENDING_REVIEW -> ACTIVE (PHÊ DUYỆT & BAN HÀNH CHÍNH THỨC)
  const handlePublishAndExport = async () => {
    if (!isLegalChecked) return;
    setIsPublishing(true);

    const publishedPayload: FormWorkflow = {
      ...workflow,
      status: "ACTIVE",
      templateId: workflow.templateId || formId,
      publishedAt: new Date().toISOString(),
    };

    try {
      // 1. Phê duyệt trong Database qua API /api/admin/forms/[formCode]/approve
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

      // 2. Ghi file JSON lên hệ thống qua API /api/admin/publish
      const res = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publishedPayload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const finalWorkflow: FormWorkflow = {
          ...data.workflow,
          status: "ACTIVE",
        };
        setWorkflow(finalWorkflow);
        saveToLocal(finalWorkflow);

        setToastMessage(`Đã phê duyệt và xuất bản v${data.version} ĐANG ÁP DỤNG!`);
        setIsExportModalOpen(true);
      } else {
        throw new Error(data.error || "Không thể xuất bản");
      }
    } catch (err: any) {
      console.warn("Lưu file qua API thất bại, lưu fallback vào LocalStorage:", err);
      const nextVer = (workflow.version || 1) + 1;
      const fallbackWorkflow: FormWorkflow = {
        ...publishedPayload,
        status: "ACTIVE",
        version: nextVer,
        totalSteps: workflow.steps.length,
        steps: workflow.steps.map((s, idx) => ({ ...s, stepIndex: idx })),
      };
      setWorkflow(fallbackWorkflow);
      saveToLocal(fallbackWorkflow);
      setToastMessage(`Đã xuất bản v${nextVer} (ĐANG ÁP DỤNG)!`);
      setIsExportModalOpen(true);
    } finally {
      setIsPublishing(false);
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  // HÀNH ĐỘNG CẬP NHẬT BIỂU MẪU ĐANG ACTIVE (TĂNG PHIÊN BẢN VÀ ĐỒNG BỘ NGAY)
  const handleUpdateActiveVersion = async () => {
    setIsPublishing(true);
    const nextVer = (workflow.version || 1) + 1;
    const updatedWorkflow: FormWorkflow = {
      ...workflow,
      templateId: workflow.templateId || formId,
      version: nextVer,
      status: "ACTIVE",
      publishedAt: new Date().toISOString(),
      totalSteps: workflow.steps.length,
      steps: workflow.steps.map((s, idx) => ({ ...s, stepIndex: idx })),
    };

    try {
      // 1. Thử gọi API ghi nhận
      await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedWorkflow),
      }).catch(() => null);

      // 2. Lưu trực tiếp qua Service và phát tín hiệu đồng bộ
      FormStorageService.publish(updatedWorkflow);
      setWorkflow(updatedWorkflow);

      setToastMessage(`Đã cập nhật thành công v${nextVer}! Phía Người dân đã tự động đồng bộ.`);
    } catch (err) {
      console.warn("Lỗi cập nhật biểu mẫu:", err);
      FormStorageService.publish(updatedWorkflow);
      setWorkflow(updatedWorkflow);
      setToastMessage(`Đã lưu bản cập nhật v${nextVer} vào bộ nhớ!`);
    } finally {
      setIsPublishing(false);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Thao tác chuyển lưu trữ
  const handleArchiveForm = () => {
    if (confirm("Chuyển biểu mẫu này vào mục Lưu trữ? Biểu mẫu sẽ ngừng hiển thị phía Người dân.")) {
      const updated: FormWorkflow = {
        ...workflow,
        templateId: workflow.templateId || formId,
        status: "ARCHIVED",
        publishedAt: new Date().toISOString(),
      };
      setWorkflow(updated);

      // Ghi đè vào storage và phát tín hiệu đồng bộ gỡ khỏi Citizen
      localStorage.setItem(`afl_workflow_published_${formId}`, JSON.stringify(updated));
      localStorage.setItem(`afl_workflow_draft_${formId}`, JSON.stringify(updated));
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new CustomEvent("afl:form-updated", { detail: { templateId: formId } }));

      setToastMessage("Đã chuyển biểu mẫu sang mục Lưu trữ (ARCHIVED)!");
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  // Thao tác khôi phục từ lưu trữ về nháp
  const handleRestoreToDraft = () => {
    const updated: FormWorkflow = {
      ...workflow,
      templateId: workflow.templateId || formId,
      status: "DRAFT",
    };
    setWorkflow(updated);
    localStorage.setItem(`afl_workflow_published_${formId}`, JSON.stringify(updated));
    localStorage.setItem(`afl_workflow_draft_${formId}`, JSON.stringify(updated));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("afl:form-updated", { detail: { templateId: formId } }));
    setToastMessage("Đã khôi phục biểu mẫu về Bản nháp (DRAFT)!");
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleDownloadJson = () => {
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(workflow, null, 2));
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

  // Render Badge trạng thái tĩnh (thay thế hoàn toàn dropdown)
  const renderStatusBadge = () => {
    switch (currentStatus) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-400 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            <span>🟢 ĐANG ÁP DỤNG (ACTIVE)</span>
          </span>
        );
      case "PENDING_REVIEW":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-950 border border-blue-400 shadow-sm animate-pulse">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span>🔵 CHỜ THẨM ĐỊNH (PENDING)</span>
          </span>
        );
      case "ARCHIVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-700 border border-slate-300">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span>⚪ ĐÃ LƯU TRỮ (ARCHIVED)</span>
          </span>
        );
      case "DRAFT":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-950 border border-amber-400 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>🟡 BẢN NHÁP (DRAFT)</span>
          </span>
        );
    }
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
      {/* Toast thông báo */}
      {toastMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-2xl border border-emerald-500 animate-bounce">
          <Database className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER TRẠNG THÁI & HÀNH ĐỘNG PHÂN TẦNG */}
      <div className="bg-white border-b border-slate-300 px-5 py-2.5 flex items-center justify-between gap-4 shrink-0 shadow-sm z-10 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Nút quay lại: Tự động lưu bản dở dang */}
          <button
            type="button"
            onClick={handleReturnToLibrary}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
            title="Tự động lưu và quay lại thư viện"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-700" />
            <span>Thư viện</span>
          </button>

          <div className="h-4 w-px bg-slate-300 hidden sm:block" />

          <span className="font-mono text-xs font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
            {workflow.formCode}
          </span>

          <h2
            className="text-base font-black text-slate-900 max-w-[240px] truncate"
            title={workflow.formTitleVi || workflow.formTitle}
          >
            {workflow.formTitleVi || workflow.formTitle}
          </h2>

          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 text-xs font-black px-2 py-0.5 rounded-full border border-amber-300">
            <Tag className="w-3 h-3" />
            <span>v{workflow.version || 1}</span>
          </span>

          {/* Thanh Tiến Trình Vòng Đời (Lifecycle Stepper) */}
          <div className="hidden xl:flex items-center gap-1 text-[11px] font-bold bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200">
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                currentStatus === "DRAFT"
                  ? "bg-amber-200 text-amber-950 font-black shadow-xs"
                  : currentStatus === "PENDING_REVIEW" || currentStatus === "ACTIVE"
                  ? "text-emerald-700 font-bold"
                  : "text-slate-400"
              }`}
            >
              {currentStatus !== "DRAFT" &&
              (currentStatus === "PENDING_REVIEW" || currentStatus === "ACTIVE") ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <span>1.</span>
              )}
              Bản nháp
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                currentStatus === "PENDING_REVIEW"
                  ? "bg-blue-200 text-blue-950 font-black shadow-xs animate-pulse"
                  : currentStatus === "ACTIVE"
                  ? "text-emerald-700 font-bold"
                  : "text-slate-400"
              }`}
            >
              {currentStatus === "ACTIVE" ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <span>2.</span>
              )}
              Chờ thẩm định
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                currentStatus === "ACTIVE"
                  ? "bg-emerald-200 text-emerald-950 font-black shadow-xs"
                  : "text-slate-400"
              }`}
            >
              <span>3.</span>
              Đang áp dụng
            </span>
          </div>

          {/* HUY HIỆU TRẠNG THÁI TĨNH (KHÔNG DÙNG DROPDOWN) */}
          <div className="ml-1">{renderStatusBadge()}</div>
        </div>

        {/* CỤM NÚT HÀNH ĐỘNG QUY ĐỊNH CHẶT CHẼ THEO VÒNG ĐỜI */}
        <div className="flex items-center gap-3">
          {/* 1. GIAI ĐOẠN DRAFT: CHỈ HIỆN DUY NHẤT NÚT GỬI THẨM ĐỊNH */}
          {currentStatus === "DRAFT" && (
            <button
              type="button"
              onClick={handleSubmitForReview}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg flex items-center gap-2 active:scale-95 transition-all shadow-md"
            >
              <Send className="w-4 h-4 text-blue-200" />
              <span>GỬI THẨM ĐỊNH HỒ SƠ</span>
            </button>
          )}

          {/* 2. GIAI ĐOẠN PENDING_REVIEW: HIỂN THỊ NÚT TRẢ VỀ, CHECKBOX VÀ NÚT PHÊ DUYỆT */}
          {currentStatus === "PENDING_REVIEW" && (
            <>
              <button
                type="button"
                onClick={handleReturnToDraft}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                title="Trả về bản nháp để điều chỉnh lại tọa độ hoặc câu từ"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                <span>Trả về sửa</span>
              </button>

              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={isLegalChecked}
                  onChange={(e) => setIsLegalChecked(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800 select-none">
                  Tôi đã đối soát căn cứ pháp lý & tọa độ ô
                </span>
              </label>

              <button
                type="button"
                disabled={!isLegalChecked || isPublishing}
                onClick={handlePublishAndExport}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-lg flex items-center gap-2 active:scale-95 transition-all shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isPublishing ? "ĐANG LƯU..." : "PHÊ DUYỆT & BAN HÀNH (ACTIVE)"}</span>
              </button>
            </>
          )}

          {/* 3. GIAI ĐOẠN ACTIVE: ĐÃ BAN HÀNH -> CHO PHÉP LƯU TRỮ, XEM JSON HOẶC CẬP NHẬT BẢN MỚI */}
          {currentStatus === "ACTIVE" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleArchiveForm}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                title="Chuyển vào kho lưu trữ, ngừng áp dụng"
              >
                <Archive className="w-4 h-4 text-slate-500" />
                <span>Lưu trữ</span>
              </button>

              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <FileCode className="w-4 h-4 text-emerald-700" />
                <span>Xem JSON</span>
              </button>

              <button
                type="button"
                disabled={isPublishing}
                onClick={handleUpdateActiveVersion}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-black rounded-lg flex items-center gap-2 active:scale-95 transition-all shadow-md"
              >
                <RotateCcw className={`w-4 h-4 ${isPublishing ? "animate-spin" : ""}`} />
                <span>CẬP NHẬT BẢN MỚI (v{(workflow.version || 1) + 1})</span>
              </button>
            </div>
          )}

          {/* 4. GIAI ĐOẠN ARCHIVED: HẾT HIỆU LỰC, CÓ THỂ KHÔI PHỤC VỀ DRAFT */}
          {currentStatus === "ARCHIVED" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestoreToDraft}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 active:scale-95 shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Khôi phục về Bản nháp</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                <FileCode className="w-4 h-4" />
                <span>Xem JSON</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KHUNG CHIA ĐÔI MÀN HÌNH 60/40 */}
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

      {/* MODAL XEM TRƯỚC FILE JSON XUẤT BẢN */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-sm uppercase tracking-wide">
                  Dữ Liệu JSON Biểu Mẫu Đã Ban Hành (Trạng thái: ACTIVE)
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
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <span>
                  Biểu mẫu đã chuyển sang <strong>ĐANG ÁP DỤNG</strong> cho Người dân
                </span>
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
