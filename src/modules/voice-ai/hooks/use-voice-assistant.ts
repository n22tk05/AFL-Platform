'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';
import { WebSpeechSTT } from '@/modules/voice-ai/services/stt.service';
import { WorkflowStep, StepFaqItem } from '@/shared/contracts';
import { playVoice, speakWithSynthesis } from '@/modules/voice-ai/services/voice-playback.service';
import { requestVoiceAnswer, FinalTranscriptBuffer } from '@/modules/voice-ai/services/voice-qa.client';

export interface UseVoiceAssistantOptions {
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
  const [answerAudioUrl, setAnswerAudioUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [canListen, setCanListen] = useState(true);
  const duplex = useRef(new HalfDuplexController());
  const stt = useRef<WebSpeechSTT | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscript = useRef(new FinalTranscriptBuffer());
  const pendingSubmission = useRef<{ formCode: string; stepIndex: number } | null>(null);
  const mounted = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const releasePlayback = useCallback(() => {
    duplex.current.onAudioPlaybackEnd();
    setIsPlaying(false);
    setCanListen(false);
    if (echoTimer.current) clearTimeout(echoTimer.current);
    echoTimer.current = setTimeout(() => {
      if (mounted.current) setCanListen(true);
    }, 300);
  }, []);

  const askQuestion = useCallback(async (formCode: string, stepIndex: number, question: string) => {
    const clean = question.trim();
    if (!clean || !mounted.current) return;
    setIsAnswering(true); setError(null); setAnswerAudioUrl(undefined);
    const start = Date.now();
    try {
      const response = await requestVoiceAnswer(formCode, stepIndex, clean);
      if (!mounted.current) return;
      const text = response.answerText;
      const audioUrl = response.audioUrl;
      setAnswer(text); setAnswerAudioUrl(audioUrl);
      optionsRef.current?.onAnswerReceived?.(text, Date.now() - start);
      await playAnswer(text, audioUrl);
    } catch (cause) {
      if (!mounted.current) return;
      const message = cause instanceof Error && cause.message === 'QA_TIMEOUT'
        ? 'Máy chủ trả lời quá lâu. Bác vui lòng thử lại nhé.'
        : cause instanceof Error ? cause.message : 'Không thể kết nối máy chủ hỗ trợ giọng nói.';
      setError(message); optionsRef.current?.onError?.(message);
    } finally {
      if (mounted.current) setIsAnswering(false);
    }
  }, []);

  const submitFinal = useCallback((formCode: string, stepIndex: number) => {
    const question = finalTranscript.current.take();
    if (question) void askQuestion(formCode, stepIndex, question);
  }, [askQuestion]);

  useEffect(() => {
    mounted.current = true;
    const recognition = new WebSpeechSTT({ lang: 'vi-VN', continuous: false, interimResults: true });
    recognition.registerCallbacks({
      onStart: () => { if (mounted.current) { setIsListening(true); setError(null); } },
      onResult: (text, isFinal) => {
        if (!mounted.current) return;
        setTranscript(text);
        finalTranscript.current.update(text, isFinal);
        optionsRef.current?.onTranscriptUpdate?.(text, isFinal);
      },
      onError: message => { if (mounted.current) { setIsListening(false); duplex.current.onMicRelease(); setError(message); } },
      onEnd: () => {
        if (mounted.current) setIsListening(false);
        duplex.current.onMicRelease();
        const pending = pendingSubmission.current;
        pendingSubmission.current = null;
        if (pending) submitFinal(pending.formCode, pending.stepIndex);
      },
    });
    stt.current = recognition;
    setIsSupported(recognition.isSupported());
    audio.current = typeof Audio === 'undefined' ? null : new Audio();
    return () => {
      mounted.current = false;
      recognition.abort();
      audio.current?.pause();
      if (audio.current) audio.current.src = '';
      if (echoTimer.current) clearTimeout(echoTimer.current);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [submitFinal]);

  const playAnswer = useCallback(async (text: string, audioUrl?: string) => {
    if (stt.current?.isListening) { stt.current.abort(); setIsListening(false); duplex.current.onMicRelease(); }
    duplex.current.onAudioPlaybackStart(); setCanListen(false);
    await playVoice(text, audioUrl, playing => {
      if (!mounted.current) return;
      setIsPlaying(playing);
      if (!playing) releasePlayback();
    }, fallback => {
      if (!speakWithSynthesis(fallback, playing => {
        if (!mounted.current) return;
        setIsPlaying(playing);
        if (!playing) releasePlayback();
      })) releasePlayback();
    }, url => {
      const item = new Audio(url); audio.current = item; return item;
    });
  }, [releasePlayback]);

  const playGuidance = useCallback((text: string, audioUrl?: string) => playAnswer(text, audioUrl), [playAnswer]);
  const startListening = useCallback((): boolean => {
    if (!canListen || !duplex.current.canSafelyListen()) return false;
    duplex.current.onMicPress(); finalTranscript.current.clear(); setTranscript(''); setError(null);
    return stt.current?.start() ?? false;
  }, [canListen]);
  const stopListening = useCallback((formCode?: string, stepIndex?: number) => {
    pendingSubmission.current = formCode && stepIndex !== undefined ? { formCode, stepIndex } : null;
    stt.current?.stop(); setIsListening(false); duplex.current.onMicRelease();
  }, [submitFinal]);
  const stopAudio = useCallback(() => {
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    releasePlayback();
  }, [releasePlayback]);
  const triggerTouchToAsk = useCallback((step: WorkflowStep, faq: StepFaqItem) => {
    stopAudio(); stt.current?.abort(); setIsListening(false); setTranscript(faq.question);
    finalTranscript.current.update(faq.question, true); setAnswer(faq.answer); setAnswerAudioUrl(undefined);
    optionsRef.current?.onTranscriptUpdate?.(faq.question, true);
    optionsRef.current?.onAnswerReceived?.(faq.answer, 0);
    void playAnswer(faq.answer);
  }, [playAnswer, stopAudio]);

  return { isListening, isPlaying, isAnswering, transcript, answer, answerAudioUrl, error, isSupported, canListen,
    startListening, stopListening, playAudio: (url: string) => playAnswer('', url), playGuidance, playAnswer,
    stopAudio, askQuestion, submitFinal, triggerTouchToAsk, halfDuplex: duplex.current };
}
