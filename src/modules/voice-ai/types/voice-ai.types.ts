import { WorkflowStep } from '@/shared/contracts';

export type VietnameseVoiceRegion = 'NORTH' | 'SOUTH';

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SynthesisResult {
  audioBuffer: Buffer;
  audioUrl: string;
  wordTimestamps: WordTimestamp[];
}

export interface QARequest {
  formCode: string;
  currentStep: WorkflowStep;
  userQuestion: string;
}

export interface QAResponse {
  answerText: string;
  latencyMs: number;
  source: 'gemini' | 'faq_match' | 'fallback';
}

export interface STTConfig {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
}

export interface STTCallbacks {
  onStart?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (errorMessage: string, rawError?: unknown) => void;
  onEnd?: () => void;
}

export interface PromptControllerDto {
  manifest?: unknown;
  authorization?: string | null;
  adminKey?: string | null;
}

export interface TTSControllerDto {
  text?: unknown;
  stepIndex?: unknown;
  region?: unknown;
  authorization?: string | null;
  adminKey?: string | null;
}

export interface VoiceQAControllerDto {
  formCode?: unknown;
  stepIndex?: unknown;
  userQuestion?: unknown;
}
