import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: isCI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:3099',
    headless: true,
    ...(isCI ? {} : { channel: 'msedge' }),
  },
  webServer: {
    command: 'node dist-server/server.js',
    url: 'http://localhost:3099/api/health',
    reuseExistingServer: false,
    env: {
      ...process.env,
      PORT: '3099',
    },
  },
});
