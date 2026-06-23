#!/usr/bin/env node
/**
 * PROJ-138 Block B — start the Playwright E2E suite against a GUARANTEED-FRESH
 * dev server.
 *
 * Why: a hard-killed Playwright `webServer` can leave a deadlocked Turbopack
 * compile worker behind. The next run reuses that wedged server
 * (`reuseExistingServer: !CI`) and hangs forever in global-setup's
 * warm-compile (symptom: `○ Compiling ...` never completes, CPU idle).
 *
 * This helper removes the wedge before handing off to Playwright:
 *   1. kill ONLY the process listening on port 3000 (worktree-safe — never
 *      touches another session's dev server on a different port, per
 *      CLAUDE.md parallel-session rules),
 *   2. clear the `.next/dev` Turbopack cache (checkout-local; no cross-worktree
 *      effect),
 *   3. run `playwright test` (Playwright then boots a clean webServer).
 *
 * Extra args are forwarded: `npm run test:e2e:fresh -- tests/PROJ-94-*.spec.ts`.
 * Linux/WSL/macOS (uses `ss`/`lsof` when present); a no-op kill on platforms
 * without either is harmless — the cache clear + clean boot still help.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { rmSync } from "node:fs"

const PORT = 3000

function pidOnPort(port) {
  // Try `ss` first (Linux), then `lsof` (macOS / some Linux). Best-effort.
  try {
    const out = execFileSync("ss", ["-ltnp"], { encoding: "utf8" })
    const line = out.split("\n").find((l) => new RegExp(`:${port}\\s`).test(l))
    const m = line && /pid=(\d+)/.exec(line)
    if (m) return Number(m[1])
  } catch {
    /* ss not available — fall through */
  }
  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`], {
      encoding: "utf8",
    })
    const pid = Number(out.trim().split("\n")[0])
    if (Number.isInteger(pid) && pid > 0) return pid
  } catch {
    /* lsof not available */
  }
  return null
}

const pid = pidOnPort(PORT)
if (pid) {
  try {
    process.kill(pid, "SIGKILL")
    console.info(`[test:e2e:fresh] killed stray dev server on :${PORT} (pid ${pid})`)
  } catch {
    console.warn(`[test:e2e:fresh] could not kill pid ${pid} — continuing`)
  }
} else {
  console.info(`[test:e2e:fresh] no listener on :${PORT}`)
}

rmSync(".next/dev", { recursive: true, force: true })
console.info("[test:e2e:fresh] cleared .next/dev — starting Playwright")

const res = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
})
process.exit(res.status ?? 1)
