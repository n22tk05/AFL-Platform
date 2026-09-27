"use client";

import React, { useState, useEffect } from "react";
import { Volume2, RotateCcw, Mic, HelpCircle } from "lucide-react";
import { StepFaqItem } from "@/shared/contracts";

interface VoiceAssistantPanelProps {
  voiceGuidance: string;
  audioUrl?: string;
  faqs?: StepFaqItem[];
}

export function VoiceAssistantPanel({
  voiceGuidance,
  faqs = [],
}: VoiceAssistantPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [faqAnswer, setFaqAnswer] = useState<string | null>(null);

  // Đọc câu thoại voiceGuidance bằng Web Speech Synthesis (tốc độ 0.9x)
  const speakText = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "vi-VN";
      utterance.rate = 0.9;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Tự động phát khi chuyển bước
  useEffect(() => {
    setFaqAnswer(null);
    speakText(voiceGuidance);

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [voiceGuidance]);

  const handleReplay = () => {
    speakText(faqAnswer || voiceGuidance);
  };

  const handleSelectFaq = (faq: StepFaqItem) => {
    setFaqAnswer(faq.answer);
    speakText(faq.answer);
  };

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* Khung lời thoại hướng dẫn (Tối giản màu sắc) */}
      <div className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white ${
                isPlaying ? "bg-[#D32F2F] animate-pulse" : "bg-slate-800"
              }`}
            >
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                Lời thoại hướng dẫn:
              </div>
              <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5 leading-snug">
                &ldquo;{voiceGuidance}&rdquo;
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReplay}
            className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1 shrink-0 active:scale-95 shadow-sm"
            aria-label="Nghe lại câu hướng dẫn"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nghe lại</span>
          </button>
        </div>

        {faqAnswer && (
          <div className="mt-1 p-3 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800">
            <span className="text-slate-500 font-bold block mb-0.5">Giải đáp:</span>
            {faqAnswer}
          </div>
        )}
      </div>

      {/* Nút Nhấn Giữ Mic (Chuẩn bị cho Voice AI) */}
      <button
        type="button"
        onMouseDown={() => setIsListening(true)}
        onMouseUp={() => setIsListening(false)}
        onTouchStart={() => setIsListening(true)}
        onTouchEnd={() => setIsListening(false)}
        className={`w-full min-h-[52px] rounded-xl border-2 flex items-center justify-center gap-2.5 font-bold text-sm select-none transition-all ${
          isListening
            ? "bg-[#D32F2F] text-white border-[#D32F2F] animate-pulse"
            : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50"
        }`}
      >
        <Mic className="w-5 h-5" />
        <span>{isListening ? "ĐANG LẮNG NGHE BÁC NÓI..." : "NHẤN GIỮ VÀO ĐÂY ĐỂ HỎI TRỢ LÝ"}</span>
      </button>

      {/* Gợi ý câu hỏi nhanh (nếu có) */}
      {faqs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {faqs.map((faq, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectFaq(faq)}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>{faq.question}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
