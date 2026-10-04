"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Volume2, RotateCcw, Mic, HelpCircle, Loader2 } from "lucide-react";
import { StepFaqItem } from "@/shared/contracts";
import { useVoiceAssistant } from "@/modules/voice-ai/hooks/use-voice-assistant";

import { speakVietnamese } from "@/shared/utils/speech";

interface VoiceAssistantPanelProps {
  voiceGuidance: string;
  audioUrl?: string;
  faqs?: StepFaqItem[];
  formCode?: string;
  stepIndex?: number;
}

export function VoiceAssistantPanel({
  voiceGuidance,
  faqs = [],
  formCode = "01/LPTB-PTP",
  stepIndex = 1,
}: VoiceAssistantPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [faqAnswer, setFaqAnswer] = useState<string | null>(null);
  const transcriptRef = useRef<string>("");
  const alive = useRef(true);
  const micReleaseTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(micReleaseTimer.current); };
  }, []);

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
    isListening,
    isPlaying: isAudioPlaying,
    isAnswering,
    transcript,
    startListening,
    stopListening,
    askQuestion,
    stopAudio,
  } = useVoiceAssistant({
    onTranscriptUpdate: (text, isFinal) => {
      if (!alive.current) return;
      transcriptRef.current = text;
      if (isFinal && text.trim()) {
        askQuestionRef.current?.(formCode, stepIndex, text);
      }
    },
    onAnswerReceived: (answerText) => {
      if (!alive.current) return;
      setFaqAnswer(answerText);
      speakText(answerText);
    },
  });

  askQuestionRef.current = askQuestion;

  const handleSendQuestion = useCallback((q: string) => {
    if (!q.trim()) return;
    askQuestion(formCode, stepIndex, q);
  }, [formCode, stepIndex, askQuestion]);

  // Tự động phát khi chuyển bước
  useEffect(() => {
    setFaqAnswer(null);
    speakText(voiceGuidance);

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopAudio();
    };
  }, [voiceGuidance, speakText, stopAudio]);

  const handleReplay = () => {
    speakText(faqAnswer || voiceGuidance);
  };

  const handleSelectFaq = (faq: StepFaqItem) => {
    setFaqAnswer(faq.answer);
    speakText(faq.answer);
  };

  const handleMicDown = () => {
    clearTimeout(micReleaseTimer.current);
    transcriptRef.current = "";
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    stopAudio();
    startListening();
  };

  const handleMicUp = () => {
    stopListening();
    clearTimeout(micReleaseTimer.current);
    micReleaseTimer.current = setTimeout(() => {
      if (alive.current && transcriptRef.current.trim()) {
        handleSendQuestion(transcriptRef.current);
      }
    }, 300);
  };

  const activePlaying = isPlaying || isAudioPlaying;

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* Khung lời thoại hướng dẫn (Tối giản màu sắc) */}
      <div className="w-full bg-green border-2 border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white ${
                activePlaying ? "bg-[#D32F2F] animate-pulse" : "bg-slate-800"
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

        {isAnswering && (
          <div className="mt-1 p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs sm:text-sm font-semibold text-amber-900 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
            <span>Cháu đang nghe và suy nghĩ câu trả lời cho bác, bác đợi xíu nhé...</span>
          </div>
        )}

        {faqAnswer && !isAnswering && (
          <div className="mt-1 p-3 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold text-slate-800">
            <span className="text-slate-500 font-bold block mb-0.5">Giải đáp:</span>
            {faqAnswer}
          </div>
        )}
      </div>

      {/* NÚT NHẤN GIỮ ĐỂ NÓI: NỀN XANH - CHỮ TRẮNG */}
      <button
        type="button"
        onMouseDown={handleMicDown}
        onMouseUp={handleMicUp}
        onTouchStart={handleMicDown}
        onTouchEnd={handleMicUp}
        className={`min-h-[56px] w-full px-6 py-3 rounded-2xl flex items-center justify-center gap-3 select-none active:scale-95 transition-all shadow-md ${
          isListening
            ? "bg-emerald-900 text-white ring-4 ring-emerald-400/60 shadow-lg scale-98"
            : "bg-emerald-700 hover:bg-emerald-800 text-white"
        }`}
      >
        {/* Icon Micro màu trắng */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isListening ? "bg-white/25 animate-pulse" : "bg-white/20"
          }`}
        >
          <Mic className="w-5 h-5 text-white" />
        </div>

        {/* Chữ hiển thị màu trắng rõ nét */}
        <span className="text-sm sm:text-base font-black tracking-wide text-white uppercase">
          {isListening
            ? transcript
              ? `Bác đang hỏi: "${transcript}"`
              : "Đang lắng nghe bác nói..."
            : "Nhấn giữ để nói"}
        </span>
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
