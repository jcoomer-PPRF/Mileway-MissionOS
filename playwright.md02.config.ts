import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/md02-browser",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  use: {
    baseURL: process.env.MD02_BASE_URL || "http://127.0.0.1:5175",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    trace: "off",
  },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.MD02_TEST_REPORT || "test-results/md02-browser.json",
      },
    ],
  ],
});
