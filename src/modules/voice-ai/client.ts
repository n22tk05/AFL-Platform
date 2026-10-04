'use client';

export { useVoiceAssistant } from '@/modules/voice-ai/hooks/use-voice-assistant';
export { WebSpeechSTT } from '@/modules/voice-ai/services/stt.service';
export { HalfDuplexController } from '@/modules/voice-ai/services/half-duplex.service';
export { playVoice, startVoicePlayback, speakWithSynthesis } from '@/modules/voice-ai/services/voice-playback.service';
export { requestVoiceAnswer, FinalTranscriptBuffer, RecognitionSubmissionLifecycle, VoiceRequestGeneration } from '@/modules/voice-ai/services/voice-qa.client';