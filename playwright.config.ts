import { defineConfig } from '@playwright/test';

// E2E-прогон потоков в реальном браузере. Каталог грузится из файла-фикстуры через file chooser
// (см. test/e2e/helpers.ts) — тесты детерминированы и офлайн.
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.ts', // не пересекается с `bun test` (*.test/*.spec)
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://localhost:8008',
    viewport: { width: 390, height: 844 }, // портретный мобильный экран
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'bun start',
    url: 'http://localhost:8008',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
