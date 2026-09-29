import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: 'document-extraction.spec.ts', fullyParallel: false, workers: 1,
  timeout: 90_000, reporter: 'list',
  use: { baseURL: process.env.DOCUMENT_TEST_URL || 'http://127.0.0.1:3100', channel: 'chrome', headless: true },
});
