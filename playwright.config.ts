import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

// End-to-end tests on real phone profiles (Pixel 7, iPhone 15) against a local
// Supabase seeded with `npm run seed`. Tests change data: reseed between runs.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
// Where only Chromium is available (for example a sandbox), run the iPhone profile in Chromium.
const iphoneBrowser = process.env.E2E_CHROMIUM_ONLY === "1" ? "chromium" : "webkit";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  projects: [
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    {
      name: "iphone-15",
      use: {
        ...devices["iPhone 15"],
        browserName: iphoneBrowser,
        ...(iphoneBrowser === "chromium" ? { launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined } : { launchOptions: undefined }),
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
