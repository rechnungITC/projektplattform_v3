/**
 * PROJ-Y-148a — auth gates for the honest hard-delete refusal.
 *
 * The slice adds one query flag to an existing route and rewrites a dialog; it
 * adds no new route, no RPC and no migration. What is new and therefore worth
 * gating is the pre-flight `?hard_delete_check=true`, which reports whether a
 * project carries immutable governance history — an admin-only question that
 * must not answer to an anonymous caller, and must not leak the project's
 * existence on the way.
 *
 * DEPTH is proven elsewhere, because it cannot honestly be proven here:
 *
 *   - Live against prod, in a transaction rolled back by a raising DO block:
 *     a project with governance history refuses the delete with `23514`
 *     ("decision_approval_events are append-only…"), while one without is
 *     deleted (0 rows left). Residue counter-checked across nine tables.
 *   - Live against PostgREST with the service-role key (read-only): the
 *     embedded-FK count query returns exactly the numbers the SQL joins do
 *     (17 / 4 / 0 / 0 / 0), and the same query *without* the FK hint answers
 *     HTTP 300 — the hint is load-bearing, not decoration.
 *   - `src/lib/projects/governance-history.test.ts` (17 cases): the frozen
 *     island registry, business labels, missing-table tolerance, and the
 *     wording shared by API and dialog.
 *   - `src/app/api/projects/[id]/route.test.ts`: 422 + stable code before any
 *     delete is attempted, the `42501`-guard island, the `23514` race-window
 *     mapping, 500 kept for genuine failures, and no regress for a project
 *     without such history.
 *   - `src/components/projects/hard-delete-confirm-dialog.test.tsx` (15 cases):
 *     the corrected promise, the refusal shown before the button, German copy.
 *
 * Deliberately NOT seeded live: an authenticated end-to-end run of the blocked
 * path would have to insert a row into an append-only island in production.
 * Those rows cannot be deleted afterwards — that is the whole point of this
 * slice — and the project holding them would become permanently undeletable.
 * The test fixture would be the residue.
 */

import { expect, test } from "@playwright/test"

const PROJECT_ID = "44444444-4444-4444-8444-444444444444"
const GATE = [307, 401, 403]

test.describe("PROJ-Y-148a / hard-delete refusal auth-gates", () => {
  test("GET …?hard_delete_check=true is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${PROJECT_ID}?hard_delete_check=true`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("the pre-flight leaks neither the verdict nor the project", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${PROJECT_ID}?hard_delete_check=true`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    const body = await res.text()
    // The verdict is what must not escape: neither the field nor any wording
    // that would reveal whether this project carries governance history.
    expect(body).not.toContain("hard_delete_block")
    expect(body).not.toContain("Historie")
    expect(body).not.toContain("Papierkorb")
    // The project id itself is deliberately NOT asserted absent: the redirect
    // echoes the requested path back as `next=`, and that id is the caller's
    // own input, not information the server disclosed. A first version of this
    // test failed on exactly that and was wrong, not the route.
  })

  test("DELETE …?hard=true stays auth-gated", async ({ request }) => {
    const res = await request.delete(`/api/projects/${PROJECT_ID}?hard=true`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the plain detail GET is unchanged and still gated", async ({
    request,
  }) => {
    // The flag is opt-in; the ordinary route must behave exactly as before.
    const res = await request.get(`/api/projects/${PROJECT_ID}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the admin trash page is auth-gated", async ({ request }) => {
    const res = await request.get("/settings/projects-trash", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
