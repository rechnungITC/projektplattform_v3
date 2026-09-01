import type { Page } from "@playwright/test"

/**
 * Collects browser-side runtime problems for the duration of a test.
 *
 * Introduced by PROJ-Y-143e, which found a real defect this way: the approval
 * inbox keyed its rows by `approver_id`, which is the *same user* in every row
 * of that panel, so two open approvals produced duplicate React keys. Nobody
 * saw it because the shared tenant has no approvals — the pinned two-row
 * fixture made it visible, and by then the red "2 Issues" overlay badge had
 * already been baked into a baseline.
 *
 * Extracted to `tests/fixtures/` by PROJ-Y-155a so the Gantt chain can use the
 * same guard. It was a local function in the visual spec before; a second copy
 * would have drifted from the exclusion rule below, which is the only subtle
 * part.
 *
 * The exclusion is deliberate and was arrived at by measurement, not caution:
 * Chromium logs every non-2xx response as a console error, including the
 * module-gated 404s that PROJ-Y-143f made the UI handle *on purpose*
 * (`requireModuleActive`, read intent). Keeping them would make the guard fire
 * on correct behaviour and train everyone to ignore it. React errors and
 * uncaught exceptions — what this exists for — never take that shape.
 */
export function watchRuntimeIssues(page: Page): () => string[] {
  const issues: string[] = []
  page.on("console", (m) => {
    if (m.type() !== "error") return
    if (m.text().startsWith("Failed to load resource")) return
    issues.push(`[console] ${m.text()}`)
  })
  page.on("pageerror", (e) => issues.push(`[pageerror] ${e.message}`))
  return () => issues
}
