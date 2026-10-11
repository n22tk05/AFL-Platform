import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', testMatch: ['image-voice-integration.spec.ts', 'form-feedback.spec.ts', 'form-recognition.spec.ts'], workers: 1, fullyParallel: false,
  timeout: 30_000, reporter: 'list',
  use: { baseURL: process.env.IMAGE_VOICE_TEST_URL || 'http://127.0.0.1:3101', channel: 'chrome', headless: true },
});
