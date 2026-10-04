"use client";

import React, { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Download, Printer, Copy, Check, ExternalLink, QrCode, Smartphone, FileText } from "lucide-react";

interface FormQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  formCode?: string;
  formTitle?: string;
  initialTargetType?: "direct" | "portal";
}

export const FormQrModal: React.FC<FormQrModalProps> = ({
  isOpen,
  onClose,
  templateId,
  formCode = "MẪU TỜ KHAI",
  formTitle = "Biểu mẫu dịch vụ công",
  initialTargetType = "direct",
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [targetType, setTargetType] = useState<"direct" | "portal">(initialTargetType);

  if (!isOpen) return null;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const targetUrl =
    targetType === "direct"
      ? `${baseUrl}/citizen/guide?templateId=${templateId}`
      : `${baseUrl}/citizen`;

  const handleDownloadImage = () => {
    const svgElement = printRef.current?.querySelector("svg");
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    canvas.width = 1200;
    canvas.height = 1450;

    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Tiêu đề cơ quan
        ctx.fillStyle = "#065f46";
        ctx.font = "bold 42px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("BỘ PHẬN TIẾP NHẬN & TRẢ KẾT QUẢ MỘT CỬA", 600, 110);

        // Mã biểu mẫu
        ctx.fillStyle = "#047857";
        ctx.font = "bold 36px monospace";
        ctx.fillText(`[ ${formCode} ]`, 600, 175);

        // Tên biểu mẫu
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 50px sans-serif";
        ctx.fillText(formTitle.toUpperCase(), 600, 245);

        ctx.fillStyle = "#64748b";
        ctx.font = "30px sans-serif";
        ctx.fillText("Quét mã để mở kịch bản hướng dẫn kê khai từng bước", 600, 305);

        // Vẽ mã QR
        ctx.drawImage(img, 200, 360, 800, 800);

        // Chân trang
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 34px sans-serif";
        ctx.fillText("DÙNG CAMERA ĐIỆN THOẠI HOẶC ZALO ĐỂ QUÉT MÃ", 600, 1240);

        ctx.fillStyle = "#059669";
        ctx.font = "26px monospace";
        ctx.fillText(targetUrl, 600, 1300);

        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QR_${formCode.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-300 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header Modal */}
        <div className="px-6 py-4 bg-emerald-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-emerald-300" />
            <h3 className="font-black text-sm uppercase tracking-wider">
              Mã QR Tờ Khai: {formCode}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white active:scale-95 transition-all"
            aria-label="Đóng modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung Standee xem trước */}
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          {/* Tabs chuyển đổi Direct vs Portal */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl w-full text-xs font-bold border border-slate-200">
            <button
              type="button"
              onClick={() => setTargetType("direct")}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                targetType === "direct"
                  ? "bg-white text-emerald-900 shadow-xs font-black"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-emerald-700" />
              <span>Vào thẳng tờ khai</span>
            </button>
            <button
              type="button"
              onClick={() => setTargetType("portal")}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                targetType === "portal"
                  ? "bg-white text-emerald-900 shadow-xs font-black"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
              <span>Vào Cổng chung</span>
            </button>
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 uppercase">
              <span className="font-mono">{formCode}</span>
            </div>
            <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-tight pt-1">
              {formTitle}
            </h4>
            <p className="text-xs text-slate-500 font-medium">
              {targetType === "direct"
                ? "Quét mã mở trực tiếp kịch bản hướng dẫn điền tờ khai này"
                : "Quét mã mở danh mục tiếp đón biểu mẫu người dân"}
            </p>
          </div>

          {/* Vùng chứa mã QR */}
          <div
            ref={printRef}
            className="p-5 bg-white border-2 border-emerald-600/30 rounded-3xl shadow-inner flex items-center justify-center relative group"
          >
            <QRCodeSVG
              value={targetUrl}
              size={240}
              level="H"
              includeMargin={true}
              imageSettings={{
                src: "/favicon.ico",
                x: undefined,
                y: undefined,
                height: 38,
                width: 38,
                excavate: true,
              }}
            />
          </div>

          {/* Thanh hiển thị URL */}
          <div className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <span className="truncate max-w-[270px] font-mono text-emerald-900 font-bold" title={targetUrl}>
              {targetUrl}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(targetUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg font-bold shrink-0 active:scale-95 flex items-center gap-1 text-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Đã chép" : "Chép"}</span>
            </button>
          </div>
        </div>

        {/* Thanh công cụ hành động */}
        <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3">
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2.5 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <ExternalLink className="w-4 h-4 text-emerald-700" />
            <span>Mở thử</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>In Standee</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadImage}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Tải ảnh PNG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
