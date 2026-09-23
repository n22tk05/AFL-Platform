'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HalfDuplexController } from '@/modules/voice-ai/services/voice-qa.service';
import { WebSpeechSTT } from '@/modules/voice-ai/services/stt.service';
import { WorkflowStep, StepFaqItem } from '@/shared/contracts';

export interface UseVoiceAssistantOptions {
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onAnswerReceived?: (answerText: string, latencyMs: number) => void;
  onError?: (errorMessage: string) => void;
}

export interface VoiceAssistantState {
  isListening: boolean;
  isPlaying: boolean;
  isAnswering: boolean;
  transcript: string;
  answer: string | null;
  error: string | null;
  isSupported: boolean;
  canListen: boolean;
}

export function useVoiceAssistant(options?: UseVoiceAssistantOptions) {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isAnswering, setIsAnswering] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [canListen, setCanListen] = useState<boolean>(true);

  const halfDuplexRef = useRef<HalfDuplexController>(new HalfDuplexController());
  const sttRef = useRef<WebSpeechSTT | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const echoGuardTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Khởi tạo STT và kiểm tra hỗ trợ trên trình duyệt
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stt = new WebSpeechSTT({
        lang: 'vi-VN',
        continuous: false,
        interimResults: true,
      });

      stt.registerCallbacks({
        onStart: () => {
          setIsListening(true);
          setError(null);
        },
        onResult: (text: string, isFinal: boolean) => {
          setTranscript(text);
          options?.onTranscriptUpdate?.(text, isFinal);
        },
        onError: (errMsg: string) => {
          setIsListening(false);
          halfDuplexRef.current.onMicRelease();
          setError(errMsg);
          options?.onError?.(errMsg);
        },
        onEnd: () => {
          setIsListening(false);
          halfDuplexRef.current.onMicRelease();
        }
      });

      sttRef.current = stt;
      setIsSupported(stt.isSupported());

      // Tạo đối tượng Audio duy nhất
      audioRef.current = new Audio();
      audioRef.current.onended = () => {
        handleAudioEnded();
      };
      audioRef.current.onerror = () => {
        handleAudioEnded();
      };
    }

    return () => {
      sttRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (echoGuardTimerRef.current) {
        clearTimeout(echoGuardTimerRef.current);
      }
    };
  }, []);

  /**
   * Xử lý kết thúc phát âm thanh với khoảng đệm Echo-Guard 300ms
   */
  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
    halfDuplexRef.current.onAudioPlaybackEnd();
    setCanListen(false);

    // Kích hoạt bộ đếm thời gian an toàn 300ms chống dội âm
    if (echoGuardTimerRef.current) {
      clearTimeout(echoGuardTimerRef.current);
    }
    echoGuardTimerRef.current = setTimeout(() => {
      setCanListen(true);
    }, 300);
  }, []);

  /**
   * Dừng toàn bộ âm thanh đang phát
   */
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    handleAudioEnded();
  }, [handleAudioEnded]);

  /**
   * Phát tệp âm thanh hướng dẫn (MP3)
   */
  const playAudio = useCallback((audioUrl: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!audioRef.current) {
        resolve();
        return;
      }

      // 1. Nếu đang thu âm -> Lập tức hủy thu âm
      if (sttRef.current?.isListening) {
        sttRef.current.abort();
        setIsListening(false);
        halfDuplexRef.current.onMicRelease();
      }

      // 2. Kích hoạt trạng thái phát âm thanh của bộ điều khiển bán song công
      halfDuplexRef.current.onAudioPlaybackStart();
      setIsPlaying(true);
      setCanListen(false);

      audioRef.current.src = audioUrl;
      audioRef.current.play()
        .then(() => resolve())
        .catch((err) => {
          console.warn('[useVoiceAssistant] Không thể phát âm thanh tự động:', err);
          handleAudioEnded();
          resolve();
        });
    });
  }, [handleAudioEnded]);

  /**
   * Bắt đầu thu âm giọng nói (Push-to-Talk)
   */
  const startListening = useCallback((): boolean => {
    // 1. Nếu loa đang phát, lập tức ngắt loa (Half-Duplex Rule 1)
    const { shouldPauseSpeaker } = halfDuplexRef.current.onMicPress();
    if (shouldPauseSpeaker && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    // 2. Xóa transcript và lỗi cũ
    setTranscript('');
    setError(null);

    // 3. Khởi chạy nhận dạng giọng nói Web Speech API
    if (!sttRef.current) return false;
    const started = sttRef.current.start();
    if (started) {
      setIsListening(true);
    }
    return started;
  }, []);

  /**
   * Nhả Micro / Dừng thu âm
   */
  const stopListening = useCallback(() => {
    if (sttRef.current) {
      sttRef.current.stop();
    }
    halfDuplexRef.current.onMicRelease();
    setIsListening(false);
  }, []);

  /**
   * Gửi câu hỏi thắc mắc tới API /api/llm/qa (FR-4)
   */
  const askQuestion = useCallback(async (currentStep: WorkflowStep, questionText: string) => {
    if (!questionText.trim()) return;

    setIsAnswering(true);
    setError(null);

    try {
      const startTime = Date.now();
      const res = await fetch('/api/llm/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStep, userQuestion: questionText })
      });

      const json = await res.json();
      const latencyMs = Date.now() - startTime;

      if (json.success && json.data) {
        const answerText = json.data.answerText;
        setAnswer(answerText);
        options?.onAnswerReceived?.(answerText, latencyMs);
      } else {
        const fallbackMsg = json.error?.message_vi || 'Dạ bác ơi, bác nhìn theo chữ mẫu màu đỏ trên màn hình và ghi theo giúp cháu nhé!';
        setAnswer(fallbackMsg);
      }
    } catch (err: any) {
      const fallbackMsg = 'Dạ bác nhìn vào ô hướng dẫn chữ màu đỏ trên màn hình giúp cháu nhé!';
      setAnswer(fallbackMsg);
      setError('Lỗi kết nối máy chủ hỗ trợ giọng nói.');
    } finally {
      setIsAnswering(false);
    }
  }, [options]);

  /**
   * Xử lý tương tác một chạm Touch-to-Ask Chips (Fallback chống ồn)
   */
  const triggerTouchToAsk = useCallback((step: WorkflowStep, faq: StepFaqItem) => {
    // Ngắt toàn bộ âm thanh & Micro đang hoạt động
    stopAudio();
    stopListening();

    setTranscript(faq.question);
    setAnswer(faq.answer);
    options?.onTranscriptUpdate?.(faq.question, true);
    options?.onAnswerReceived?.(faq.answer, 0);
  }, [stopAudio, stopListening, options]);

  return {
    // Trạng thái hệ thống
    isListening,
    isPlaying,
    isAnswering,
    transcript,
    answer,
    error,
    isSupported,
    canListen,

    // Thao tác điều khiển
    startListening,
    stopListening,
    playAudio,
    stopAudio,
    askQuestion,
    triggerTouchToAsk,

    // Bộ điều khiển gốc
    halfDuplex: halfDuplexRef.current
  };
}
