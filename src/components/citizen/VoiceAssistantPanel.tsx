'use client';
import { useEffect } from 'react';
import { useVoiceAssistant } from '@/modules/voice-ai/hooks/use-voice-assistant';
import type { StepFaqItem } from '@/shared/contracts';

interface VoiceAssistantPanelProps {
  voiceGuidance: string;
  audioUrl?: string;
  faqs?: StepFaqItem[];
  formCode: string;
  stepIndex: number;
}
export function VoiceAssistantPanel({ voiceGuidance, audioUrl, faqs = [], formCode, stepIndex }: VoiceAssistantPanelProps) {
  const voice = useVoiceAssistant({ context: { formCode, stepIndex } });
  const { playGuidance, resetContext, answer } = voice;
  useEffect(() => {
    let canceled = false;
    queueMicrotask(() => { if (!canceled) void playGuidance(voiceGuidance, audioUrl); });
    return () => { canceled = true; resetContext(); };
  }, [formCode, stepIndex, voiceGuidance, audioUrl, playGuidance, resetContext]);
  useEffect(() => { if (answer) void playGuidance(answer); }, [answer, playGuidance]);
  return <section className="border rounded-xl p-4 space-y-3" aria-label="Trợ lý giọng nói">
    <p className="text-lg font-bold">{voiceGuidance}</p>
    <button className="border rounded p-3 min-h-[44px]" onClick={() => void playGuidance(answer || voiceGuidance, answer ? undefined : audioUrl)}>Nghe lại</button>
    <p role="status" aria-live="polite">{voice.isPlaying ? 'Đang đọc' : voice.isAnswering ? 'Đang hỏi máy chủ' : voice.transcript}</p>
    {voice.error && <p role="alert" className="text-red-800">{voice.error}. Bác có thể dùng câu hỏi nhanh bên dưới.</p>}
    {answer && <p>{answer}</p>}
    <button className="block bg-emerald-800 text-white rounded p-4 min-h-[56px] w-full touch-none"
      disabled={!voice.isSupported || voice.isAnswering}
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); voice.startListening(); }}
      onPointerUp={() => voice.stopListening()} onPointerCancel={() => voice.resetContext()} onLostPointerCapture={() => voice.stopListening()}
      onKeyDown={event => { if (!event.repeat && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); voice.startListening(); } }}
      onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); voice.stopListening(); } }}>
      {voice.isListening ? 'Đang nghe — nhả để gửi câu hỏi' : 'Nhấn giữ để nói'}
    </button>
    {!voice.isSupported && <p>Trình duyệt chưa hỗ trợ mic; bác dùng câu hỏi nhanh nhé.</p>}
    <div className="flex flex-wrap gap-2">{faqs.map(faq => <button key={faq.question} className="border rounded p-3 min-h-[44px]"
      onClick={() => { resetContext(); void playGuidance(faq.answer); }}>{faq.question}</button>)}</div>
  </section>;
}
