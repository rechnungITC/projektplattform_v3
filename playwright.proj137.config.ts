import { defineConfig, devices } from "@playwright/test"

/**
 * PROJ-137 QA — port-3137 override so this sweep can run alongside another
 * session's :3000 dev server. Reuses the already-running dev server on 3137
 * (started by the QA agent); never spawns its own.
 */
const PORT = process.env.PROJ137_PORT ?? "3137"
const BASE = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/fixtures/global-setup.ts",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `echo reuse-existing-${PORT}`,
    url: BASE,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
