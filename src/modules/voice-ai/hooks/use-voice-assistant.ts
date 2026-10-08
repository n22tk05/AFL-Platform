'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';
import { WebSpeechSTT } from '@/modules/voice-ai/services/stt.service';
import { startVoicePlayback, type PlaybackSession } from '@/modules/voice-ai/services/voice-playback.service';
import { contentAddressedAudioUrlOrEmpty } from '@/modules/voice-ai/services/audio-url.service';
import { requestVoiceAnswer, RecognitionSubmissionLifecycle, VoiceRequestGeneration, type RecognitionContext } from '@/modules/voice-ai/services/voice-qa.client';
import type { WorkflowStep, StepFaqItem } from '@/shared/contracts';

export interface UseVoiceAssistantOptions {
  context?: RecognitionContext;
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAnswerReceived?: (answerText: string, latencyMs: number) => void;
  onError?: (errorMessage: string) => void;
}

export function useVoiceAssistant(options?: UseVoiceAssistantOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const alive = useRef(false);
  const halfDuplexRef = useRef(new HalfDuplexController());
  const lifecycle = useRef(new RecognitionSubmissionLifecycle());
  const generation = useRef(new VoiceRequestGeneration());
  const request = useRef<AbortController | null>(null);
  const playback = useRef<PlaybackSession | null>(null);
  const microphone = useRef<WebSpeechSTT | null>(null);
  const turn = useRef<number | null>(null);
  const turnContext = useRef<RecognitionContext | null>(null);
  const pendingStart = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAudio = useCallback(() => { playback.current?.cancel(); playback.current = null; }, []);
  const askQuestion = useCallback(async (formCode: string, stepIndex: number, questionText: string) => {
    if (!questionText.trim()) return;
    request.current?.abort();
    const current = generation.current.invalidate();
    const controller = new AbortController();
    request.current = controller;
    setIsAnswering(true); setAnswer(null); setError(null);
    const started = Date.now();
    try {
      const result = await requestVoiceAnswer(formCode, stepIndex, questionText, { signal: controller.signal });
      if (!alive.current || !generation.current.isCurrent(current)) return;
      setAnswer(result.answerText);
      optionsRef.current?.onAnswerReceived?.(result.answerText, Date.now() - started);
    } catch (reason) {
      if (!alive.current || !generation.current.isCurrent(current) || controller.signal.aborted) return;
      const message = reason instanceof Error ? reason.message : 'Không hỏi được máy chủ.';
      setError(message); optionsRef.current?.onError?.(message);
    } finally {
      if (alive.current && generation.current.isCurrent(current)) setIsAnswering(false);
    }
  }, []);
  const submit = useCallback((result: { ready: boolean; question: string; context?: RecognitionContext }) => {
    if (result.ready && result.context && result.question) void askQuestion(result.context.formCode, result.context.stepIndex, result.question);
  }, [askQuestion]);
  const stopListening = useCallback(() => {
    const current = turn.current, context = turnContext.current;
    if (current === null || !context) return;
    submit(lifecycle.current.release(current, context));
    if (pendingStart.current) {
      clearTimeout(pendingStart.current); pendingStart.current = null;
      submit(lifecycle.current.end(current));
    } else microphone.current?.stop();
    halfDuplexRef.current.onMicRelease(); setIsListening(false);
  }, [submit]);
  const startListening = useCallback(() => {
    const context = optionsRef.current?.context;
    if (!context) { setError('Chưa có biểu mẫu và bước đang đọc.'); return false; }
    const current = lifecycle.current.begin();
    if (current === null) return false;
    turn.current = current; turnContext.current = { ...context };
    const echoGuard = !halfDuplexRef.current.canSafelyListen();
    const interrupted = halfDuplexRef.current.onMicPress().shouldPauseSpeaker;
    stopAudio(); setTranscript(''); setError(null);
    const recognition = new WebSpeechSTT({ lang: 'vi-VN', continuous: false, interimResults: true });
    microphone.current = recognition;
    recognition.registerCallbacks({
      onStart: () => { if (alive.current && turn.current === current) setIsListening(true); },
      onResult: (text, isFinal) => {
        if (!alive.current || !lifecycle.current.result(current, text, isFinal)) return;
        setTranscript(text); optionsRef.current?.onTranscriptUpdate?.(text, isFinal);
      },
      onEnd: () => {
        const result = lifecycle.current.end(current);
        if (alive.current && turn.current === current) { setIsListening(false); halfDuplexRef.current.onMicRelease(); submit(result); }
      },
      onError: message => {
        if (!alive.current || turn.current !== current) return;
        lifecycle.current.reset(); turn.current = null; setIsListening(false); setError(message);
        halfDuplexRef.current.onMicRelease(); optionsRef.current?.onError?.(message);
      },
    });
    if (interrupted || echoGuard) {
      pendingStart.current = setTimeout(() => {
        pendingStart.current = null;
        if (!recognition.start()) { lifecycle.current.reset(); turn.current = null; halfDuplexRef.current.onMicRelease(); setIsListening(false); }
      }, 300);
    } else if (!recognition.start()) {
      lifecycle.current.reset(); turn.current = null; halfDuplexRef.current.onMicRelease(); return false;
    }
    return true;
  }, [stopAudio, submit]);
  const playGuidance = useCallback((text: string, audioUrl?: string) => {
    lifecycle.current.reset(); turn.current = null;
    if (pendingStart.current) { clearTimeout(pendingStart.current); pendingStart.current = null; }
    microphone.current?.abort(); stopAudio(); setIsListening(false); setError(null);
    halfDuplexRef.current.onAudioPlaybackStart();
    const session = startVoicePlayback(text, contentAddressedAudioUrlOrEmpty(audioUrl), playing => {
      if (!playing) halfDuplexRef.current.onAudioPlaybackEnd();
      if (alive.current) setIsPlaying(playing);
    }, { onError: message => {
      if (!alive.current) return;
      setError(message); optionsRef.current?.onError?.(message);
    } });
    playback.current = session;
    return session.promise;
  }, [stopAudio]);
  const resetContext = useCallback(() => {
    generation.current.invalidate(); request.current?.abort();
    lifecycle.current.reset(); turn.current = null; turnContext.current = null;
    if (pendingStart.current) { clearTimeout(pendingStart.current); pendingStart.current = null; }
    microphone.current?.abort(); stopAudio();
    halfDuplexRef.current.onMicRelease();
    if (alive.current) { setIsListening(false); setIsAnswering(false); setAnswer(null); setTranscript(''); setError(null); }
  }, [stopAudio]);
  useEffect(() => {
    alive.current = true; setIsSupported(new WebSpeechSTT().isSupported());
    return () => { alive.current = false; resetContext(); };
  }, [resetContext]);
  useEffect(() => { resetContext(); }, [options?.context?.formCode, options?.context?.stepIndex, resetContext]);
  const triggerTouchToAsk = useCallback((_step: WorkflowStep, faq: StepFaqItem) => {
    resetContext(); setAnswer(faq.answer); void playGuidance(faq.answer);
  }, [resetContext, playGuidance]);
  return { isListening, isPlaying, isAnswering, transcript, answer, error, isSupported, canListen: !isListening && !isAnswering,
    startListening, stopListening, stopAudio, playGuidance, askQuestion, triggerTouchToAsk, resetContext, halfDuplex: halfDuplexRef.current };
}
