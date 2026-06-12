import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

/**
 * PROJ-67 F2: WebKit needs host system libraries (libgtk-4, libwebkitgtk, ...)
 * that are not installable without sudo. On hosts where they are missing,
 * every Mobile Safari test fails at browser launch. Instead of 14 hard
 * failures, we detect launchability once and skip the project with an
 * explicit, documented warning. Override with PW_FORCE_WEBKIT=1.
 * Remedy: `sudo npx playwright install-deps webkit`
 */
function webkitHostDepsAvailable(): boolean {
  if (process.env.PW_FORCE_WEBKIT === '1') return true
  if (process.platform !== 'linux') return true // macOS/Windows ship the deps
  try {
    const cache = join(homedir(), '.cache', 'ms-playwright')
    const webkitDir = readdirSync(cache).find((d) => d.startsWith('webkit-'))
    if (!webkitDir) return false // browser not installed -> playwright reports that itself
    const binary = join(cache, webkitDir, 'minibrowser-gtk', 'bin', 'MiniBrowser')
    if (!existsSync(binary)) return true // unknown layout -> don't gate
    const ldd = execFileSync('ldd', [binary], { encoding: 'utf8' })
    return !ldd.includes('not found')
  } catch {
    return true // detection failure must never silently drop coverage
  }
}

const includeWebkit = webkitHostDepsAvailable()
if (!includeWebkit) {
  console.warn(
    '[playwright.config] Mobile Safari project SKIPPED: WebKit host libraries missing ' +
      '(ldd reports unresolved shared objects). Install with `sudo npx playwright install-deps webkit` ' +
      'or force with PW_FORCE_WEBKIT=1.',
  )
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  globalSetup: './tests/fixtures/global-setup.ts',
  expect: {
    toHaveScreenshot: {
      // PROJ-67 F3: caret "hide" mutates inline styles pre-hydration and
      // triggers React hydration-mismatch warnings; the stylesheet achieves
      // the same caret-free screenshot without touching style attributes.
      caret: 'initial',
      stylePath: './tests/fixtures/screenshot-stabilize.css',
    },
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(includeWebkit
      ? [{ name: 'Mobile Safari', use: { ...devices['iPhone 13'] } }]
      : []),
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
