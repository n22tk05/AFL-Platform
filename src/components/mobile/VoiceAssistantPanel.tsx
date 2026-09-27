'use client';

import React, { useEffect } from 'react';
import { Volume2, RotateCcw, Mic, HelpCircle } from 'lucide-react';
import { StepFaqItem } from '@/shared/contracts';
import { useVoiceAssistant } from '@/modules/voice-ai/client';

interface VoiceAssistantPanelProps {
  voiceGuidance: string;
  audioUrl?: string;
  faqs?: StepFaqItem[];
  formCode: string;
  stepIndex: number;
}

export function VoiceAssistantPanel({ voiceGuidance, audioUrl, faqs = [], formCode, stepIndex }: VoiceAssistantPanelProps) {
  const voice = useVoiceAssistant();
  useEffect(() => {
    voice.playGuidance(voiceGuidance, audioUrl);
    return () => voice.stopAudio();
  }, [voiceGuidance, audioUrl]);

  const start = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    voice.startListening();
  };
  const stop = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!voice.isListening) return;
    voice.stopListening(formCode, stepIndex);
  };
  const replay = () => voice.answer ? voice.playAnswer(voice.answer, voice.answerAudioUrl) : voice.playGuidance(voiceGuidance, audioUrl);

  return <div className="w-full flex flex-col gap-2.5">
    <div className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white ${voice.isPlaying ? 'bg-[#D32F2F] animate-pulse' : 'bg-slate-800'}`}><Volume2 className="w-5 h-5" /></div>
          <div><div className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Lời thoại hướng dẫn:</div>
            <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5 leading-snug">&ldquo;{voiceGuidance}&rdquo;</p></div>
        </div>
        <button type="button" onClick={replay} className="min-h-[44px] px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1 shrink-0 active:scale-95 shadow-sm" aria-label="Nghe lại câu hướng dẫn">
          <RotateCcw className="w-3.5 h-3.5" /><span>Nghe lại</span>
        </button>
      </div>
      {voice.transcript && <div aria-live="polite" className="mt-1 p-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800"><span className="text-slate-500 font-bold block mb-0.5">Bác vừa hỏi:</span>{voice.transcript}</div>}
      {voice.answer && <div aria-live="polite" className="mt-1 p-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800"><span className="text-slate-500 font-bold block mb-0.5">Giải đáp:</span>{voice.answer}</div>}
      {voice.isAnswering && <p role="status" className="text-xs font-semibold text-slate-600">Cháu đang tìm câu trả lời...</p>}
      {voice.error && <p role="alert" className="text-xs font-semibold text-red-700">{voice.error}</p>}
    </div>
    <button type="button" onPointerDown={start} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} disabled={!voice.isSupported || !voice.canListen || voice.isAnswering}
      className={`w-full min-h-[52px] rounded-xl border-2 flex items-center justify-center gap-2.5 font-bold text-sm select-none touch-none transition-all disabled:opacity-50 ${voice.isListening ? 'bg-[#D32F2F] text-white border-[#D32F2F] animate-pulse' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'}`}>
      <Mic className="w-5 h-5" /><span>{voice.isListening ? 'ĐANG LẮNG NGHE BÁC NÓI...' : voice.isSupported ? voice.canListen ? 'NHẤN GIỮ VÀO ĐÂY ĐỂ HỎI TRỢ LÝ' : 'VUI LÒNG ĐỢI ÂM THANH KẾT THÚC...' : 'TRÌNH DUYỆT CHƯA HỖ TRỢ MICRO'}</span>
    </button>
    {faqs.length > 0 && <div className="flex flex-wrap gap-1.5 pt-0.5">{faqs.map((faq, idx) => <button key={idx} type="button" onClick={() => { voice.stopAudio(); void voice.askQuestion(formCode, stepIndex, faq.question); }}
      className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 active:scale-95 transition-all flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5 text-slate-400" /><span>{faq.question}</span></button>)}</div>}
  </div>;
}
