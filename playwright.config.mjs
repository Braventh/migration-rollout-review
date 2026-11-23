import { defineConfig } from '@playwright/test';

const port = 3176;
const baseURL = 'http://127.0.0.1:' + port;
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  use: {
    baseURL, viewport: { width: 1360, height: 920 },
    launchOptions: process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}
  },
  webServer: {
    command: 'node server.mjs',
    env: { PORT: String(port), REVIEW_DB: ':memory:' },
    url: baseURL
  }
});
