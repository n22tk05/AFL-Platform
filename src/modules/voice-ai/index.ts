import { localCache } from '@/modules/cache';
import { formPersistenceService } from '@/modules/forms';
import { PromptController } from '@/modules/voice-ai/controllers/prompt.controller';
import { TTSController } from '@/modules/voice-ai/controllers/tts.controller';
import { VoiceQAController } from '@/modules/voice-ai/controllers/voice-qa.controller';
import { PrismaVoiceCacheRepository } from '@/modules/voice-ai/repositories/prisma-voice-cache.repository';
import { GeminiPromptService } from '@/modules/voice-ai/services/gemini-prompt.service';
import { TTSService } from '@/modules/voice-ai/services/tts.service';
import { VoiceQAService } from '@/modules/voice-ai/services/voice-qa.service';

export const voiceCacheRepository = new PrismaVoiceCacheRepository();
export const geminiPromptService = new GeminiPromptService(localCache);
export const ttsService = new TTSService(localCache, voiceCacheRepository);
export const voiceQAService = new VoiceQAService(localCache);

export const promptController = new PromptController(geminiPromptService, formPersistenceService);
export const ttsController = new TTSController(ttsService);
export const voiceQAController = new VoiceQAController(voiceQAService);

export { useVoiceAssistant } from '@/modules/voice-ai/hooks/use-voice-assistant';
export { PromptController } from '@/modules/voice-ai/controllers/prompt.controller';
export { TTSController } from '@/modules/voice-ai/controllers/tts.controller';
export { VoiceQAController } from '@/modules/voice-ai/controllers/voice-qa.controller';
export { PrismaVoiceCacheRepository } from '@/modules/voice-ai/repositories/prisma-voice-cache.repository';
export type { VoiceCacheEntry, VoiceCacheRepository } from '@/modules/voice-ai/repositories/voice-cache.repository';
export { GeminiPromptService } from '@/modules/voice-ai/services/gemini-prompt.service';
export { WebSpeechSTT } from '@/modules/voice-ai/services/stt.service';
export { TTSService } from '@/modules/voice-ai/services/tts.service';
export { HalfDuplexController, VoiceQAService } from '@/modules/voice-ai/services/voice-qa.service';
export type * from '@/modules/voice-ai/types/voice-ai.types';
