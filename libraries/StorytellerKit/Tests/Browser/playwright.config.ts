import { defineConfig } from "@playwright/test"

const port = Number(process.env.READER_TEST_PORT ?? 4179)

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: "test-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    [
      "junit",
      {
        outputFile: "test-results/results.xml",
        includeProjectInTestName: true,
      },
    ],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 800, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "node server.ts",
    url: `http://127.0.0.1:${port}/harness/reader.html`,
    reuseExistingServer: false,
    env: { READER_TEST_PORT: String(port) },
  },
})
