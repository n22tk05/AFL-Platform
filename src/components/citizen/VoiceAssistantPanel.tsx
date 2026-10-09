"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  Square,
  Radio,
  Volume2,
  CheckCircle2,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { StepFaqItem } from "@/shared/contracts";
import { useVoiceAssistant } from "@/modules/voice-ai/hooks/use-voice-assistant";
import { speakVietnamese } from "@/shared/utils/speech";

export interface VoiceAssistantPanelProps {
  currentStepIndex?: number;
  totalSteps?: number;
  transcript?: string;
  isListening?: boolean;
  isAnswering?: boolean;
  lastAnswer?: string | null;
  faqs?: Array<{ question: string; answer: string }> | StepFaqItem[];
  onStartListening?: () => void;
  onStopListening?: () => void;
  onSelectFaq?: (question: string) => void;
  onReplay?: () => void;

  // Hỗ trợ kết nối trực tiếp với kịch bản biểu mẫu (/citizen/guide)
  voiceGuidance?: string;
  audioUrl?: string;
  formCode?: string;
  stepIndex?: number;
}

export const VoiceAssistantPanel: React.FC<VoiceAssistantPanelProps> = ({
  currentStepIndex = 1,
  totalSteps = 1,
  transcript: controlledTranscript,
  isListening: controlledIsListening,
  isAnswering: controlledIsAnswering,
  lastAnswer: controlledLastAnswer,
  faqs = [],
  onStartListening,
  onStopListening,
  onSelectFaq,
  onReplay,
  voiceGuidance = "",
  formCode = "01/LPTB-PTP",
  stepIndex = 1,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [faqAnswer, setFaqAnswer] = useState<string | null>(null);
  const [lastQuestionText, setLastQuestionText] = useState<string>("");
  const transcriptRef = useRef<string>("");
  const lastSubmittedQuestionRef = useRef<string>("");

  // Đọc câu thoại bằng Web Speech Synthesis qua utility chung (tốc độ 0.9x)
  const speakText = useCallback((text: string) => {
    if (alive.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "vi-VN";
      utterance.rate = 0.9;
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const askQuestionRef = useRef<(code: string, idx: number, q: string) => Promise<void>>();

  const {
    isListening: internalIsListening,
    isPlaying: isAudioPlaying,
    isAnswering: internalIsAnswering,
    transcript: internalTranscript,
    startListening,
    stopListening,
    askQuestion,
    stopAudio,
  } = useVoiceAssistant({
    onTranscriptUpdate: (text, isFinal) => {
      if (!alive.current) return;
      transcriptRef.current = text;
      if (text.trim()) {
        setLastQuestionText(text.trim());
      }
      if (isFinal && text.trim()) {
        handleSendQuestion(text.trim());
      }
    },
    onAnswerReceived: (answerText) => {
      if (!alive.current) return;
      setFaqAnswer(answerText);
      speakText(answerText);
    },
  });

  askQuestionRef.current = askQuestion;

  // Xác định trạng thái thực tế (Ưu tiên controlled props nếu có, fallback sang internal hook)
  const isListeningEffective =
    controlledIsListening !== undefined ? controlledIsListening : internalIsListening;
  const isAnsweringEffective =
    controlledIsAnswering !== undefined ? controlledIsAnswering : internalIsAnswering;
  const transcriptEffective =
    controlledTranscript !== undefined
      ? controlledTranscript
      : internalTranscript || transcriptRef.current;
  const lastAnswerEffective =
    controlledLastAnswer !== undefined ? controlledLastAnswer : faqAnswer;

  const handleSendQuestion = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      if (lastSubmittedQuestionRef.current === trimmed && isAnsweringEffective) return;
      lastSubmittedQuestionRef.current = trimmed;
      setLastQuestionText(trimmed);
      askQuestion(formCode, stepIndex, trimmed);
    },
    [formCode, stepIndex, askQuestion, isAnsweringEffective]
  );

  // Tự động phát khi chuyển bước
  useEffect(() => {
    setFaqAnswer(null);
    setLastQuestionText("");
    if (voiceGuidance) {
      speakText(voiceGuidance);
    }

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopAudio();
    };
  }, [voiceGuidance, stepIndex, speakText, stopAudio]);

  const handleReplayClick = () => {
    if (onReplay) {
      onReplay();
      return;
    }
    const textToRead = lastAnswerEffective || voiceGuidance;
    if (textToRead) {
      speakText(textToRead);
    }
  };

  const handleFaqClick = (faq: { question: string; answer: string }) => {
    if (onSelectFaq) {
      onSelectFaq(faq.question);
    }
    setLastQuestionText(faq.question);
    setFaqAnswer(faq.answer);
    speakText(faq.answer);
  };

  // Xử lý chạm để bật / tắt nghe (Tap-to-Talk)
  const handleToggleListening = () => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.(45);
      } catch {
        // Bỏ qua nếu thiết bị không hỗ trợ rung
      }
    }

    if (isListeningEffective) {
      if (onStopListening) {
        onStopListening();
      } else {
        stopListening();
        const text = transcriptRef.current.trim();
        if (text) {
          setLastQuestionText(text);
          handleSendQuestion(text);
        }
      }
    } else {
      transcriptRef.current = "";
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopAudio();
      if (onStartListening) {
        onStartListening();
      } else {
        startListening();
      }
    }
  };

  const activePlaying = isPlaying || isAudioPlaying;

  return (
    <div className="w-full bg-white rounded-3xl border-2 border-emerald-800/30 shadow-2xl overflow-hidden flex flex-col font-sans transition-all">
      {/* 1. THANH HEADER: ĐÀI PHÁT THANH TRỢ LÝ HƯỚNG DẪN */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 px-5 py-3.5 text-white flex items-center justify-between border-b-2 border-emerald-600/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner shrink-0">
            <Radio className="w-5 h-5 text-emerald-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-wide text-white uppercase drop-shadow-xs">
                ĐÀI PHÁT THANH TIẾP DÂN
              </span>
            </div>
            <p className="text-[11px] text-emerald-200/90 font-medium">
              Trợ lý giải đáp trực tiếp theo từng mục tờ khai
            </p>
          </div>
        </div>

        {/* Đèn báo trạng thái phát sóng */}
        <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-emerald-400/30 shrink-0">
          <span
            className={`w-3 h-3 rounded-full ${
              isListeningEffective
                ? "bg-red-500 animate-ping"
                : isAnsweringEffective
                ? "bg-amber-400 animate-pulse"
                : "bg-emerald-400"
            }`}
          />
          <span className="text-[11px] font-black tracking-wider text-white uppercase">
            {isListeningEffective ? "ĐANG THU ÂM" : isAnsweringEffective ? "ĐANG DÒ SÓNG" : "SẴN SÀNG"}
          </span>
        </div>
      </div>

      {/* 2. KHU VỰC HIỂN THỊ NỘI DUNG TƯƠNG TÁC */}
      <div className="p-4 sm:p-6 space-y-4 bg-slate-50/50">
        {/* ========================================================
            TRẠNG THÁI 1: LOADING RÕ RÀNG (KHI ĐANG DÒ SÓNG / TÌM CÂU HỎI)
           ======================================================== */}
        {isAnsweringEffective && (
          <div className="bg-white border-2 border-emerald-600 rounded-3xl p-5 shadow-lg space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Header của Khung Loading */}
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2.5 text-emerald-950 font-black text-xs sm:text-sm uppercase tracking-wide">
                <Loader2 className="w-5 h-5 text-emerald-700 animate-spin" />
                <span>Đang kết nối đài phát thanh để tra cứu...</span>
              </div>
              <span className="text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                Vui lòng đợi 2-3 giây
              </span>
            </div>

            {/* Hiển thị lại câu người dùng vừa nói (để an tâm máy đã nhận đúng câu) */}
            {(lastQuestionText || transcriptEffective) && (
              <div className="bg-emerald-50/80 rounded-2xl p-3 border border-emerald-200">
                <div className="text-[10px] font-black uppercase text-emerald-800 tracking-wider mb-1">
                  Câu hỏi của bác:
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-800 italic">
                  &ldquo;{lastQuestionText || transcriptEffective}&rdquo;
                </div>
              </div>
            )}

            {/* Mô phỏng Dải sóng Radio Tuner đang dò */}
            <div className="bg-emerald-950 text-white rounded-2xl p-3.5 space-y-2 relative overflow-hidden shadow-inner">
              <div className="flex justify-between text-[10px] font-mono text-emerald-400 font-bold">
                <span>FM 88.0</span>
                <span className="text-white bg-emerald-700 px-1.5 rounded">FM 100.5 MHz</span>
                <span>FM 108.0</span>
              </div>

              {/* Vạch tần số với kim dò sóng chạy qua lại */}
              <div className="h-3 bg-emerald-900/90 rounded-full relative overflow-hidden border border-emerald-700/50">
                <div className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
                <div className="absolute inset-y-0 left-1/2 w-1.5 bg-amber-400 shadow-md transform -translate-x-1/2" />
              </div>

              {/* Dải Equalizer sống động lúc loading */}
              <div className="flex items-center justify-center gap-1.5 pt-1">
                {[40, 70, 100, 60, 85, 45, 90, 65, 30].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h * 0.22}px` }}
                    className="w-1.5 bg-emerald-400/90 rounded-full animate-pulse"
                  />
                ))}
              </div>
            </div>

            {/* Danh sách tiến trình 2 bước trực quan */}
            <div className="space-y-2 pt-1 text-xs">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Bước 1: Đã nhận diện rõ câu hỏi của bác</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 font-extrabold animate-pulse">
                <span className="w-4 h-4 rounded-full border-2 border-amber-600 border-t-transparent animate-spin shrink-0" />
                <span>Bước 2: Đang đối chiếu quy định thủ tục hành chính...</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic text-center pt-1 font-medium">
              &ldquo;Bác đợi cháu vài giây, hệ thống đang tổng hợp bản tin phát thanh...&rdquo;
            </p>
          </div>
        )}

        {/* ========================================================
            TRẠNG THÁI 2: ĐÃ CÓ CÂU TRẢ LỜI / LỜI THOẠI HƯỚNG DẪN
           ======================================================== */}
        {!isAnsweringEffective && (lastAnswerEffective || voiceGuidance) && (
          <div className="bg-emerald-50/90 border-2 border-emerald-600 rounded-3xl p-5 shadow-md space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-emerald-800/15 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                      activePlaying ? "bg-red-500 opacity-75" : "bg-emerald-500 opacity-75"
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      activePlaying ? "bg-red-600" : "bg-emerald-700"
                    }`}
                  />
                </span>
                <span className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wide">
                  {lastAnswerEffective ? "Bản Tin Giải Đáp Một Cửa" : "Bản Tin Hướng Dẫn Kê Khai"}
                </span>
                {activePlaying && (
                  <span className="text-[10px] font-black uppercase text-red-600 tracking-wider bg-red-100 px-1.5 py-0.5 rounded border border-red-300">
                    ● Đang phát thanh
                  </span>
                )}
              </div>

              {/* Dải Equalizer phát sóng */}
              <div className="flex items-end gap-1 h-5 px-2 bg-emerald-800 rounded-lg py-1">
                {[12, 18, 10, 20, 14, 16].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}px` }}
                    className="w-1 bg-white rounded-full animate-bounce"
                  />
                ))}
              </div>
            </div>

            {/* Nội dung câu trả lời to, dễ đọc */}
            <div className="text-slate-900 text-sm sm:text-base font-extrabold leading-relaxed">
              &ldquo;{lastAnswerEffective || voiceGuidance}&rdquo;
            </div>

            {/* Cụm điều khiển phụ: nút quay về lời thoại gốc (nếu có câu trả lời riêng) + nút nghe lại */}
            <div className="pt-2 flex items-center justify-between gap-2">
              {lastAnswerEffective && voiceGuidance ? (
                <button
                  type="button"
                  onClick={() => {
                    setFaqAnswer(null);
                    setLastQuestionText("");
                    speakText(voiceGuidance);
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-emerald-700 underline flex items-center gap-1 active:scale-95"
                >
                  <span>← Về câu hướng dẫn dòng này</span>
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={handleReplayClick}
                className="px-4 py-2 bg-white hover:bg-emerald-100 text-emerald-900 border-2 border-emerald-600/40 rounded-xl text-xs font-black flex items-center gap-2 shadow-xs active:scale-95 transition-all"
              >
                <Volume2 className="w-4 h-4 text-emerald-700" />
                <span>Nghe lại phát thanh</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            TRẠNG THÁI 3: ĐANG NÓI (TRANSCRIPT TRỰC TIẾP)
           ======================================================== */}
        {isListeningEffective && transcriptEffective && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-center animate-pulse">
            <span className="text-[11px] font-black text-amber-900 uppercase tracking-wider block mb-1">
              Đang ghi nhận giọng nói của bác:
            </span>
            <p className="text-sm sm:text-base font-black text-slate-900">
              &ldquo;{transcriptEffective}&rdquo;
            </p>
          </div>
        )}

        {/* ========================================================
            TRẠNG THÁI 4: GỢI Ý CÂU HỎI NHANH (NẾU CÓ)
           ======================================================== */}
        {!isAnsweringEffective && faqs && faqs.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 uppercase">
              <HelpCircle className="w-4 h-4 text-emerald-700" />
              <span>Câu hỏi người dân hay hỏi ở mục này:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {faqs.map((faq, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleFaqClick(faq)}
                  className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-slate-800 hover:text-emerald-950 border border-slate-300 hover:border-emerald-600 rounded-xl text-xs font-bold text-left shadow-2xs active:scale-95 transition-all"
                >
                  ❓ {faq.question}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================
            3. NÚT CHẠM ĐỂ NÓI (TAP-TO-TALK) SIÊU TO CHUẨN TRỢ NĂNG
           ======================================================== */}
        <div className="pt-2 flex flex-col items-center">
          <button
            type="button"
            onClick={handleToggleListening}
            className={`w-full max-w-lg min-h-[70px] px-6 py-3 rounded-2xl flex items-center justify-center gap-4 select-none active:scale-[0.98] transition-all shadow-xl ${
              isListeningEffective
                ? "bg-red-700 hover:bg-red-800 text-white ring-4 ring-red-300 scale-[1.02]"
                : isAnsweringEffective
                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                : "bg-emerald-700 hover:bg-emerald-800 text-white border-2 border-emerald-600"
            }`}
            disabled={isAnsweringEffective}
          >
            {/* Vòng tròn Icon */}
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center shadow-inner ${
                isListeningEffective ? "bg-white text-red-700 animate-pulse" : "bg-white/20 text-white"
              }`}
            >
              {isListeningEffective ? (
                <Square className="w-6 h-6 fill-current" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </div>

            {/* Nhãn chữ to rõ */}
            <div className="text-left">
              <div className="text-base sm:text-lg font-black tracking-wide uppercase leading-tight">
                {isListeningEffective
                  ? "BÁC NÓI XONG BẤM VÀO ĐÂY"
                  : isAnsweringEffective
                  ? "ĐANG TRA CỨU HƯỚNG DẪN..."
                  : "CHẠM ĐỂ NÓI CÂU HỎI"}
              </div>
              <div className="text-xs font-medium text-emerald-100/90 leading-tight mt-0.5">
                {isListeningEffective
                  ? "Chạm vào để kết thúc câu hỏi và nhận câu trả lời"
                  : isAnsweringEffective
                  ? "Đài phát thanh đang chuẩn bị giải đáp cho bác"
                  : "Chạm 1 lần rồi đọc câu hỏi thong thả"}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
