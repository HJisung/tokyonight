import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: './tests/e2e/review-gallery.ts',
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:1420',
    actionTimeout: 10_000,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium-dark', use: { browserName: 'chromium', colorScheme: 'dark' } },
    { name: 'chromium-light', use: { browserName: 'chromium', colorScheme: 'light' } },
    { name: 'webkit-dark', use: { browserName: 'webkit', colorScheme: 'dark' } },
    { name: 'webkit-light', use: { browserName: 'webkit', colorScheme: 'light' } }
  ],
  webServer: {
    command: 'npm run dev:web -- --host 127.0.0.1',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: false,
    timeout: 30_000
  }
})
