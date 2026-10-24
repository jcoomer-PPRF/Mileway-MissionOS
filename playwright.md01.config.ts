import { defineConfig } from '@playwright/test';

/** Exercise the compiled, disconnected preview too, without the development server. */
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'md01.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview:md01 -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/demo.html',
    reuseExistingServer: false,
  },
});
