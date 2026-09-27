'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';
import { WebSpeechSTT } from '@/modules/voice-ai/services/stt.service';
import { WorkflowStep, StepFaqItem } from '@/shared/contracts';
import { startVoicePlayback, type AudioFactory, type SpeechDriver, type PlaybackSession } from '@/modules/voice-ai/services/voice-playback.service';
import { requestVoiceAnswer, FinalTranscriptBuffer, RecognitionSubmissionLifecycle, VoiceRequestGeneration, type VoiceFetch } from '@/modules/voice-ai/services/voice-qa.client';

export interface UseVoiceAssistantOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAnswerReceived?: (answerText: string, latencyMs: number) => void;
  onError?: (errorMessage: string) => void;
  formCode?: string;
  stepIndex?: number;
  fetcher?: VoiceFetch;
  createAudio?: AudioFactory;
  speak?: SpeechDriver;
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
  const recognition = useRef(new RecognitionSubmissionLifecycle());
  const recognitionId = useRef<number | null>(null);
  const finalTranscript = useRef(new FinalTranscriptBuffer());
  const playback = useRef<PlaybackSession | null>(null);
  const playbackGeneration = useRef(0);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qaController = useRef<AbortController | null>(null);
  const qaGeneration = useRef(new VoiceRequestGeneration());
  const mounted = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const contextKey = `${options?.formCode ?? ''}\u0000${options?.stepIndex ?? ''}`;
  const contextKeyRef = useRef(contextKey);
  contextKeyRef.current = contextKey;

  const finishDuplexPlayback = useCallback((generation: number) => {
    if (!mounted.current || generation !== playbackGeneration.current || !duplex.current.isSpeaking) return;
    duplex.current.onAudioPlaybackEnd();
    setIsPlaying(false);
    setCanListen(false);
    if (echoTimer.current) clearTimeout(echoTimer.current);
    echoTimer.current = setTimeout(() => {
      if (mounted.current && generation === playbackGeneration.current) setCanListen(true);
    }, 300);
  }, []);

  const cancelPlayback = useCallback((updateState = true) => {
    const generation = ++playbackGeneration.current;
    const previous = playback.current;
    playback.current = null;
    previous?.cancel();
    if (echoTimer.current) clearTimeout(echoTimer.current);
    if (duplex.current.isSpeaking) {
      duplex.current.onAudioPlaybackEnd();
      if (updateState && mounted.current) {
        setIsPlaying(false);
        setCanListen(false);
        echoTimer.current = setTimeout(() => {
          if (mounted.current && generation === playbackGeneration.current) setCanListen(true);
        }, 300);
      }
    } else if (updateState && mounted.current) setIsPlaying(false);
  }, []);

  const cancelQa = useCallback(() => {
    qaGeneration.current.invalidate();
    qaController.current?.abort();
    qaController.current = null;
    if (mounted.current) setIsAnswering(false);
  }, []);

  const playAnswer = useCallback(async (text: string, audioUrl?: string) => {
    cancelPlayback();
    if (stt.current?.isListening) { stt.current.abort(); setIsListening(false); duplex.current.onMicRelease(); }
    if (echoTimer.current) clearTimeout(echoTimer.current);
    const generation = ++playbackGeneration.current;
    duplex.current.onAudioPlaybackStart();
    setCanListen(false);
    const session = startVoicePlayback(text, audioUrl, playing => {
      if (!mounted.current || generation !== playbackGeneration.current) return;
      setIsPlaying(playing);
      if (!playing) finishDuplexPlayback(generation);
    }, {
      createAudio: url => {
        if (optionsRef.current?.createAudio) return optionsRef.current.createAudio(url);
        const nextAudio = new Audio(url);
        return nextAudio;
      },
      speak: (value, done) => optionsRef.current?.speak
        ? optionsRef.current.speak(value, done)
        : browserSpeech(value, done),
    });
    playback.current = session;
    try { await session.promise; } finally {
      if (generation === playbackGeneration.current && playback.current === session) playback.current = null;
    }
  }, [cancelPlayback, finishDuplexPlayback]);

  const askQuestion = useCallback(async (formCode: string, stepIndex: number, question: string) => {
    const clean = question.trim();
    if (!clean || !mounted.current) return;
    cancelQa();
    const generation = qaGeneration.current.current();
    const requestContext = `${formCode}\u0000${stepIndex}`;
    const controller = new AbortController();
    qaController.current = controller;
    setIsAnswering(true); setError(null); setAnswerAudioUrl(undefined);
    const start = Date.now();
    try {
      const response = await requestVoiceAnswer(formCode, stepIndex, clean, {
        fetcher: optionsRef.current?.fetcher,
        signal: controller.signal,
      });
      if (!mounted.current || !qaGeneration.current.isCurrent(generation) || contextKeyRef.current !== requestContext) return;
      setAnswer(response.answerText); setAnswerAudioUrl(response.audioUrl);
      optionsRef.current?.onAnswerReceived?.(response.answerText, Date.now() - start);
      await playAnswer(response.answerText, response.audioUrl);
    } catch (cause) {
      if (!mounted.current || !qaGeneration.current.isCurrent(generation) || contextKeyRef.current !== requestContext || (cause instanceof Error && cause.message === 'QA_ABORTED')) return;
      const message = cause instanceof Error && cause.message === 'QA_TIMEOUT'
        ? 'Máy chủ trả lời quá lâu. Bác vui lòng thử lại nhé.'
        : cause instanceof Error ? cause.message : 'Không thể kết nối máy chủ hỗ trợ giọng nói.';
      setError(message); optionsRef.current?.onError?.(message);
    } finally {
      if (qaGeneration.current.isCurrent(generation)) {
        qaController.current = null;
        if (mounted.current) setIsAnswering(false);
      }
    }
  }, [cancelQa, playAnswer]);

  const submitRecognition = useCallback((result: { ready: boolean; question: string; context?: { formCode: string; stepIndex: number } }) => {
    if (result.ready && result.question && result.context) void askQuestion(result.context.formCode, result.context.stepIndex, result.question);
  }, [askQuestion]);

  useEffect(() => {
    mounted.current = true;
    const speech = new WebSpeechSTT({ lang: 'vi-VN', continuous: false, interimResults: true });
    speech.registerCallbacks({
      onStart: () => { if (mounted.current) { setIsListening(true); setError(null); } },
      onResult: (text, isFinal) => {
        const id = recognitionId.current;
        if (id === null || !mounted.current) return;
        recognition.current.result(id, text, isFinal);
        finalTranscript.current.update(text, isFinal);
        setTranscript(text);
        optionsRef.current?.onTranscriptUpdate?.(text, isFinal);
      },
      onError: message => { if (mounted.current) { setIsListening(false); setError(message); } },
      onEnd: () => {
        const id = recognitionId.current;
        if (mounted.current) setIsListening(false);
        duplex.current.onMicRelease();
        if (id !== null) submitRecognition(recognition.current.end(id));
      },
    });
    stt.current = speech;
    setIsSupported(speech.isSupported());
    return () => {
      mounted.current = false;
      qaGeneration.current.invalidate();
      qaController.current?.abort();
      qaController.current = null;
      recognition.current.reset();
      speech.abort();
      cancelPlayback(false);
      if (echoTimer.current) clearTimeout(echoTimer.current);
    };
  }, [cancelPlayback, submitRecognition]);

  const previousContext = useRef(contextKey);
  useEffect(() => {
    if (previousContext.current === contextKey) return;
    previousContext.current = contextKey;
    cancelQa();
    cancelPlayback();
    recognition.current.reset(); recognitionId.current = null; finalTranscript.current.clear();
    stt.current?.abort(); setIsListening(false); setAnswer(null); setAnswerAudioUrl(undefined); setTranscript('');
  }, [contextKey, cancelPlayback, cancelQa]);

  const startListening = useCallback((): boolean => {
    if (!canListen || !duplex.current.canSafelyListen()) return false;
    const id = recognition.current.begin();
    if (id === null) return false;
    recognitionId.current = id;
    finalTranscript.current.clear(); setTranscript(''); setError(null);
    duplex.current.onMicPress();
    const started = stt.current?.start() ?? false;
    if (!started) {
      setIsListening(false);
      duplex.current.onMicRelease();
      submitRecognition(recognition.current.end(id));
    }
    return started;
  }, [canListen, submitRecognition]);

  const stopListening = useCallback((formCode = optionsRef.current?.formCode, stepIndex = optionsRef.current?.stepIndex) => {
    const id = recognitionId.current;
    if (id === null || !formCode || stepIndex === undefined) return;
    const released = recognition.current.release(id, { formCode, stepIndex });
    if (!released.ready) {
      stt.current?.stop();
      duplex.current.onMicRelease();
      setIsListening(false);
    } else submitRecognition(released);
  }, [submitRecognition]);

  const stopAudio = useCallback(() => {
    cancelQa();
    cancelPlayback();
    stt.current?.abort();
    recognition.current.reset(); recognitionId.current = null; finalTranscript.current.clear();
    duplex.current.onMicRelease();
    if (mounted.current) setIsListening(false);
  }, [cancelPlayback, cancelQa]);

  const triggerTouchToAsk = useCallback((step: WorkflowStep, faq: StepFaqItem) => {
    stopAudio(); setTranscript(faq.question); setAnswer(faq.answer); setAnswerAudioUrl(undefined);
    optionsRef.current?.onTranscriptUpdate?.(faq.question, true);
    optionsRef.current?.onAnswerReceived?.(faq.answer, 0);
    void playAnswer(faq.answer);
  }, [playAnswer, stopAudio]);

  return { isListening, isPlaying, isAnswering, transcript, answer, answerAudioUrl, error, isSupported, canListen,
    startListening, stopListening, playAudio: (url: string) => playAnswer('', url), playGuidance: playAnswer,
    playAnswer, stopAudio, askQuestion, triggerTouchToAsk, halfDuplex: duplex.current };
}

function browserSpeech(text: string, onDone: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN'; utterance.rate = 0.9;
  utterance.onend = utterance.onerror = onDone;
  window.speechSynthesis.speak(utterance);
  return () => window.speechSynthesis.cancel();
}
