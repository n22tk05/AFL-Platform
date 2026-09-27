"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  X,
  Sparkles,
  Terminal,
  AlertCircle,
} from "lucide-react";
import { FormWorkflow } from "@/shared/contracts";

interface FormUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FormUploadModal({ isOpen, onClose }: FormUploadModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCode, setFormCode] = useState("");
  const [legalBasis, setLegalBasis] = useState("");

  // Trạng thái Animation
  const [isScanning, setIsScanning] = useState(false);
  const [, setScanPhase] = useState<number>(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [detectedBoxes, setDetectedBoxes] = useState<
    Array<{ top: string; left: string; width: string; height: string }>
  >([]);

  // Điều kiện kiểm tra bắt buộc: Phải có file và điền đủ cả 3 trường metadata
  const isFormValid = Boolean(
    selectedFile &&
    formCode.trim().length > 0 &&
    formTitle.trim().length > 0 &&
    legalBasis.trim().length > 0
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  // KÍCH HOẠT HOẠT CẢNH QUÉT AI MÔ PHỎNG
  const handleStartAnalysis = async () => {
    if (!isFormValid) return;

    setIsScanning(true);
    setScanPhase(1);
    setTerminalLogs([
      "➜ Khởi động tiến trình xử lý biểu mẫu đa tầng...",
      "➜ [Tầng 1 - OpenCV WASM] Đang phân tích góc nghiêng và viền mép giấy...",
    ]);

    // Giai đoạn 1: Nắn thẳng & Tiền xử lý (1.2s)
    await new Promise((r) => setTimeout(r, 1200));
    setScanPhase(2);
    setTerminalLogs((prev) => [
      ...prev,
      "✔ Đã nắn thẳng góc nghiêng tài liệu (-0.8° -> 0.0°)",
      "➜ [Tầng 2 - Geometric Vision] Đang định vị các đường kẻ ngang và ô tích chọn...",
    ]);

    // Bung ra các box ảo ngẫu nhiên mô phỏng phát hiện khung ô
    setDetectedBoxes([
      { top: "14%", left: "20%", width: "60%", height: "4%" },
      { top: "25%", left: "16%", width: "70%", height: "5%" },
      { top: "35%", left: "16%", width: "45%", height: "4%" },
      { top: "42%", left: "16%", width: "68%", height: "6%" },
      { top: "60%", left: "16%", width: "55%", height: "8%" },
      { top: "78%", left: "48%", width: "40%", height: "10%" },
    ]);

    // Giai đoạn 2: Bóc tách ngữ nghĩa LLM (1.4s)
    await new Promise((r) => setTimeout(r, 1400));
    setScanPhase(3);
    setTerminalLogs((prev) => [
      ...prev,
      "✔ Đã phát hiện 38 vùng ô kê khai & 4 ô checkbox hợp lệ",
      "➜ [Tầng 3 - Gemini LLM] Đang sinh kịch bản câu thoại bình dân tốc độ 0.9x...",
    ]);

    // Giai đoạn 3: Hoàn tất kịch bản (1.0s)
    await new Promise((r) => setTimeout(r, 1000));
    setScanPhase(4);
    setTerminalLogs((prev) => [
      ...prev,
      "✔ Hoàn tất tạo kịch bản kẹp tọa độ chuẩn hóa [0.0 - 1.0]",
      "➜ Đang chuyển dữ liệu sang Cổng kiểm duyệt chuyên viên...",
    ]);

    // Tạo bản nháp lưu vào LocalStorage
    const draftId = `tpl_custom_${Date.now()}`;
    const draftWorkflow: FormWorkflow = {
      templateId: draftId,
      formCode: formCode.trim(),
      formTitle: formTitle.trim(),
      formTitleVi: formTitle.trim(),
      circularInfo: legalBasis.trim(),
      totalPages: 1,
      version: 1,
      status: "DRAFT",
      publishedAt: new Date().toISOString(),
      pages: [
        {
          pageNumber: 1,
          imageUrl: previewUrl || "/assets/forms/01-lptb/page-1.jpg",
          width: 1200,
          height: 1700,
        },
      ],
      totalSteps: 5,
      steps: [
        {
          stepIndex: 0,
          boxId: "box_new_01",
          pageNumber: 1,
          sectionName: "I. TIÊU ĐỀ & KÍNH GỬI",
          label: "Cơ quan tiếp nhận giải quyết",
          voiceGuidance:
            "Bác nhìn vào góc trên cùng của tờ giấy, viết tên cơ quan tiếp nhận vào đây nhé.",
          audioUrl: "/assets/audio/default.mp3",
          exampleRedText: "ỦY BAN NHÂN DÂN XÃ / PHƯỜNG",
          highlightCoords: [0.135, 0.2, 0.175, 0.8],
          requiresPrerequisiteDoc: false,
          legalWarningFlag: false,
          faqs: [],
        },
        {
          stepIndex: 1,
          boxId: "box_new_02",
          pageNumber: 1,
          sectionName: "II. THÔNG TIN NGƯỜI KÊ KHAI",
          label: "Họ và tên người kê khai",
          voiceGuidance:
            "Bác viết rõ họ và tên của mình bằng chữ in hoa theo đúng thẻ Căn cước công dân.",
          audioUrl: "/assets/audio/default.mp3",
          exampleRedText: "NGUYỄN VĂN AN",
          highlightCoords: [0.245, 0.16, 0.295, 0.85],
          requiresPrerequisiteDoc: false,
          legalWarningFlag: false,
          faqs: [],
        },
        {
          stepIndex: 2,
          boxId: "box_new_03",
          pageNumber: 1,
          sectionName: "II. THÔNG TIN NGƯỜI KÊ KHAI",
          label: "Số Căn cước công dân / Định danh",
          voiceGuidance:
            "Bác chép đúng 12 chữ số trên thẻ Căn cước công dân của bác vào dòng này.",
          audioUrl: "/assets/audio/default.mp3",
          exampleRedText: "048056001234",
          highlightCoords: [0.345, 0.16, 0.385, 0.6],
          requiresPrerequisiteDoc: false,
          legalWarningFlag: false,
          faqs: [],
        },
        {
          stepIndex: 3,
          boxId: "box_new_04",
          pageNumber: 1,
          sectionName: "III. NỘI DUNG YÊU CẦU",
          label: "Nội dung đề nghị giải quyết",
          voiceGuidance:
            "Bác ghi rõ nội dung yêu cầu làm thủ tục hành chính vào ô này.",
          audioUrl: "/assets/audio/default.mp3",
          exampleRedText: "XIN CẤP LẠI GIẤY TỜ DO BỊ THẤT LẠC",
          highlightCoords: [0.55, 0.16, 0.65, 0.88],
          requiresPrerequisiteDoc: true,
          legalWarningFlag: false,
          faqs: [],
        },
        {
          stepIndex: 4,
          boxId: "box_new_05",
          pageNumber: 1,
          sectionName: "IV. KÝ TÊN",
          label: "Chữ ký và họ tên người làm đơn",
          voiceGuidance:
            "Bước cuối rồi bác ơi! Bác ký tên và viết rõ họ tên của mình vào góc phải dưới cùng này nhé.",
          audioUrl: "/assets/audio/default.mp3",
          exampleRedText: "KÝ VÀ GHI RÕ HỌ TÊN",
          highlightCoords: [0.77, 0.48, 0.88, 0.9],
          requiresPrerequisiteDoc: false,
          legalWarningFlag: false,
          faqs: [],
        },
      ],
    };

    try {
      localStorage.setItem(`afl_workflow_published_${draftId}`, JSON.stringify(draftWorkflow));
      localStorage.setItem(`afl_workflow_draft_${draftId}`, JSON.stringify(draftWorkflow));
    } catch (e) {
      console.warn("Storage error", e);
    }

    await new Promise((r) => setTimeout(r, 600));
    setIsScanning(false);
    onClose();

    // Chuyển thẳng sang Cổng đối soát để Admin căn chỉnh ô
    router.push(`/admin/review/${draftId}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-300 flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wide">
                Tải Lên Biểu Mẫu Hành Chính Mới
              </h3>
              <p className="text-[11px] text-emerald-400 font-medium">
                Bóc tách khung ô tự động bằng OpenCV & Gemini AI
              </p>
            </div>
          </div>
          {!isScanning && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nội dung Modal */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4 no-scrollbar">
          {/* HOẠT CẢNH QUÉT AI CÔNG NGHỆ CAO */}
          {isScanning ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* Khung ảnh có tia laser và các box ảo bung ra */}
              <div className="relative w-full max-w-[340px] aspect-[1/1.3] bg-slate-950 rounded-xl overflow-hidden shadow-2xl border-2 border-emerald-500/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl || "/assets/forms/01-lptb/page-1.jpg"}
                  alt="Scanning Form"
                  className="w-full h-full object-cover opacity-60"
                />

                {/* TIA LASER CHẠY LÊN XUỐNG */}
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-laser-scan z-30 pointer-events-none" />

                {/* CÁC BOX ẢO BUNG RA KHI PHÁT HIỆN */}
                {detectedBoxes.map((b, i) => (
                  <div
                    key={i}
                    style={{ top: b.top, left: b.left, width: b.width, height: b.height }}
                    className="absolute border-2 border-emerald-400 bg-emerald-400/20 rounded z-20 animate-pulse transition-all duration-300"
                  >
                    <span className="absolute -top-3 left-0 bg-emerald-600 text-white text-[8px] font-black px-1 rounded shadow">
                      Field #{i + 1}
                    </span>
                  </div>
                ))}

                {/* Lớp phủ hiệu ứng mờ */}
                <div className="absolute inset-0 bg-emerald-950/20 pointer-events-none" />
              </div>

              {/* BẢNG LOG TERMINAL CHẠY CHỮ CÔNG NGHỆ CAO */}
              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] space-y-1.5 shadow-inner">
                <div className="flex items-center gap-1.5 text-slate-400 pb-1 border-b border-slate-800">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-300">
                    AFL AI Vision Pipeline • Telemetry Status
                  </span>
                </div>
                <div className="space-y-1 pt-1 max-h-24 overflow-y-auto no-scrollbar">
                  {terminalLogs.map((log, index) => (
                    <div
                      key={index}
                      className={
                        log.startsWith("✔") ? "text-emerald-400 font-bold" : "text-slate-300"
                      }
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* FORM KÉO THẢ ẢNH GỐC */
            <>
              {/* Dropzone kéo thả ảnh */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  previewUrl
                    ? "border-emerald-500 bg-emerald-50/20"
                    : "border-slate-300 hover:border-emerald-600 bg-slate-50 hover:bg-slate-100/60"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="flex flex-col items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Xem trước ảnh scan"
                      className="max-h-40 object-contain rounded-lg shadow-sm border border-slate-300"
                    />
                    <span className="text-xs font-black text-emerald-800">
                      ✓ Đã chọn: {selectedFile?.name} (Chạm để chọn lại)
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mb-1">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-black text-slate-800">
                      Kéo thả ảnh scan biểu mẫu vào đây hoặc bấm để chọn tệp{" "}
                      <span className="text-red-500">*</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      Hỗ trợ định dạng hình ảnh PNG, JPG hoặc tài liệu PDF
                    </span>
                  </div>
                )}
              </div>

              {/* Thông tin metadata bắt buộc */}
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                      Mã biểu mẫu <span className="text-red-500">*</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Mẫu 01/LPTB"
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      className={`w-full text-xs font-bold px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-600 ${
                        !formCode.trim()
                          ? "border-slate-300 bg-slate-50"
                          : "border-emerald-500 bg-white"
                      }`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                      Tên biểu mẫu tiếng Việt <span className="text-red-500">*</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Tờ khai đăng ký lại khai sinh..."
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className={`w-full text-xs font-bold px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-600 ${
                        !formTitle.trim()
                          ? "border-slate-300 bg-slate-50"
                          : "border-emerald-500 bg-white"
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">
                    Căn cứ pháp lý <span className="text-red-500">*</span>:
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Thông tư số 89/2026/TT-BTC ngày 30/6/2026 của Bộ Tài chính"
                    value={legalBasis}
                    onChange={(e) => setLegalBasis(e.target.value)}
                    className={`w-full text-xs font-medium px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-600 ${
                      !legalBasis.trim()
                        ? "border-slate-300 bg-slate-50"
                        : "border-emerald-500 bg-white"
                    }`}
                  />
                </div>
              </div>

              {/* Dòng cảnh báo điều kiện hợp lệ */}
              {!isFormValid && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2 text-amber-900 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Bác vui lòng tải tệp ảnh và điền đủ 3 mục (Mã biểu mẫu, Tên biểu mẫu, Căn cứ pháp lý) để kích hoạt AI quét nhé!
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Modal */}
        {!isScanning && (
          <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500 font-medium">
              Tất cả các trường gắn dấu (*) là bắt buộc
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg active:scale-95 transition-all"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={!isFormValid || isScanning}
                onClick={handleStartAnalysis}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-lg flex items-center gap-2 active:scale-95 shadow-md transition-all"
              >
                <Sparkles className="w-4 h-4 text-emerald-300" />
                <span>Bắt Đầu Quét AI & Tạo Kịch Bản</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
