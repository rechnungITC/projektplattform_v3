/**
 * PROJ-Y-144d — the PROJ-144 chain in a real browser: dictate → review →
 * confirm → work item.
 *
 * This closes PROJ-144's F-8, which was an OPEN acceptance criterion rather
 * than a deviation (the PROJ-135 lesson: an unrun E2E layer is not covered
 * work). PROJ-144 proved the confirmation *mechanics* on three levels — DB
 * pentest 17/17, route tests 11 cases, component tests 6 cases — but never the
 * chain, because all three assistant surfaces are module-gated and the shared
 * E2E tenant has the assistant module off.
 *
 * Why a second tenant instead of switching the module on for the shared one:
 * `AssistantLauncher` is mounted in the app shell, so an active module puts a
 * `fixed` button on every signed-in page — exactly what
 * `PROJ-51-visual-regression-authenticated.spec.ts` captures `fullPage`.
 * See `tests/fixtures/constants.ts` for the full reasoning.
 *
 * The load-bearing assertion is case 1 step 4: **before** the click there is no
 * work item. Without it this file would merely prove that a button creates a
 * row — not that the confirmation is a gate. AC-144.15/16 hinge on that.
 *
 * The text path is used deliberately: AC-144.29 makes it equivalent to speech,
 * and browser speech recognition cannot be driven headlessly. What is under
 * test is the runtime, the gate and the persistence — not the microphone.
 *
 * DO NOT run this file with `PW_SKIP_WARM_COMPILE=1` alongside other specs.
 * The chain needs `/projects/[id]` compiled; without the PROJ-138 warm-compile
 * a parallel worker starves it and the launcher assertion times out after a
 * minute. Measured, not guessed: skipping warm-compile made this file fail
 * next to a second spec and pass in isolation; with warm-compile enabled the
 * same parallel pair is 7/7 (the route warms in ~0.7s).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import {
  E2E_ASSISTANT_PROJECT_ID,
  E2E_ASSISTANT_TENANT_ID,
  E2E_USER_ID,
} from "./fixtures/constants"

async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  const { default: WebSocketImpl } = (await import("ws")) as {
    default: typeof WebSocket
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketImpl },
  })
}

/** Run-unique so parallel or repeated runs never collide, and cleanup is exact. */
const STAMP = `${Date.now()}`
const DICTATED = `Rechnungsimport testen ${STAMP}`
const CORRECTED = `Rechnungsimport-Schnittstelle testen ${STAMP}`
const RESUME_DICTATED = `Wiederaufnahme pruefen ${STAMP}`

/**
 * Teardown. Drafts and work items are matched by the run stamp, so a parallel
 * or repeated run never deletes another run's rows.
 *
 * Conversations and action events are cleared for the whole test tenant
 * instead: `assistant_action_events` written by the confirm route carry no
 * `session_id`, so deleting sessions does not cascade to them, and neither
 * table has a title to match on. Left alone they would grow by a handful of
 * rows per CI run forever. This is a dedicated test tenant created by
 * `global-setup`, and it mirrors the PROJ-Y-130h stance that test tenants
 * should not accumulate audit noise.
 *
 * It deliberately does NOT touch `audit_log_entries` — that table is
 * append-only since PROJ-130-α and nothing here may pretend otherwise.
 */
async function cleanup(admin: SupabaseClient) {
  await admin
    .from("assistant_work_item_drafts")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
    .like("title", `%${STAMP}%`)
  await admin
    .from("work_items")
    .delete()
    .eq("project_id", E2E_ASSISTANT_PROJECT_ID)
    .like("title", `%${STAMP}%`)
  await admin
    .from("assistant_action_events")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
  // Cascades to assistant_turns (FK ON DELETE CASCADE).
  await admin
    .from("assistant_sessions")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
}

// Serial: both cases drive the same overlay in the same tenant, and case 2
// asserts on the draft list, which case 1 would otherwise be mutating.
test.describe.configure({ mode: "serial" })

test.describe("PROJ-Y-144d / speech-draft chain in the browser", () => {
  test.afterAll(async () => {
    const admin = await createAdminClient()
    if (admin) await cleanup(admin)
  })

  test("dictate → review → correct → confirm creates exactly one work item", async ({
    assistantTenantPage: page,
  }) => {
    // The global per-test budget is 60s (playwright.config.ts). A cold `.next`
    // — e.g. the first run after `npm run build` — spends most of that on
    // compiling, and the test died before its own 120s navigation timeout could
    // ever apply: an inner timeout above the test budget is dead code. Observed
    // exactly once that way, then reproduced. Raise the budget rather than
    // shorten the waits; the app is not slow, the dev server is cold.
    test.setTimeout(180_000)
    test.skip(!hasAuthStorageState(), "auth fixture not provisioned")
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY missing — cannot verify persistence")
    if (!admin) return

    await cleanup(admin)

    // 1. A project room in the assistant tenant: the shell derives the project
    //    id from the path and hands it to the launcher, so the draft is bound
    //    to this project without any name matching.
    await page.goto(`/projects/${E2E_ASSISTANT_PROJECT_ID}`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    })

    // 2. The launcher only renders when the assistant module is active — its
    //    presence already proves the tenant pinning worked.
    const launcher = page.getByRole("button", { name: "Assistant öffnen" })
    await expect(launcher).toBeVisible({ timeout: 30_000 })
    await launcher.click()

    // 3. Dictate via the equivalent text path (AC-144.29).
    await page.getByPlaceholder("Assistant fragen").fill(`Neue Story: ${DICTATED}`)
    await page.getByRole("button", { name: "Senden" }).click()

    // The review card, not a created item.
    await expect(page.getByText("Entwurf — noch nicht angelegt")).toBeVisible({
      timeout: 60_000,
    })
    // Scrum → "story". A `work_package` here would mean the method rule broke.
    await expect(
      page.getByRole("button", { name: /Story anlegen/ }),
    ).toBeVisible()

    // 4. THE gate assertion: the draft exists, the work item does NOT.
    const { data: draftsBefore } = await admin
      .from("assistant_work_item_drafts")
      .select("id, status, target_kind, title")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("title", `%${STAMP}%`)
    expect(draftsBefore ?? []).toHaveLength(1)
    expect(draftsBefore?.[0]?.status).toBe("open")
    expect(draftsBefore?.[0]?.target_kind).toBe("story")

    const { data: itemsBefore } = await admin
      .from("work_items")
      .select("id")
      .eq("project_id", E2E_ASSISTANT_PROJECT_ID)
      .like("title", `%${STAMP}%`)
    expect(
      itemsBefore ?? [],
      "no work item may exist before the confirmation (AC-144.15/16)",
    ).toHaveLength(0)

    // 5. Correct the title, as a user would after a misheard term — the whole
    //    reason the field is editable.
    const titleField = page.getByLabel("Titel")
    await expect(titleField).toHaveValue(DICTATED)
    await titleField.fill(CORRECTED)

    // 6. Confirm.
    await page.getByRole("button", { name: /Story anlegen/ }).click()
    await expect(page.getByText(/wurde angelegt/)).toBeVisible({
      timeout: 60_000,
    })
    // The jump link is offered and the overlay stays open (L6, AC-144.20).
    await expect(
      page.getByRole("button", { name: /Backlog öffnen/ }),
    ).toBeVisible()
    await expect(page.getByPlaceholder("Assistant fragen")).toBeVisible()

    // 7. Exactly one work item, carrying the CORRECTED title.
    const { data: itemsAfter } = await admin
      .from("work_items")
      .select("id, title, kind, project_id, tenant_id")
      .eq("project_id", E2E_ASSISTANT_PROJECT_ID)
      .like("title", `%${STAMP}%`)
    expect(itemsAfter ?? []).toHaveLength(1)
    expect(itemsAfter?.[0]?.title).toBe(CORRECTED)
    expect(itemsAfter?.[0]?.kind).toBe("story")
    expect(itemsAfter?.[0]?.tenant_id).toBe(E2E_ASSISTANT_TENANT_ID)

    // 8. The draft is consumed and points at what it created (AC-144.19).
    const { data: draftsAfter } = await admin
      .from("assistant_work_item_drafts")
      .select("status, created_work_item_id, user_id")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("title", `%${STAMP}%`)
    expect(draftsAfter ?? []).toHaveLength(1)
    expect(draftsAfter?.[0]?.status).toBe("confirmed")
    expect(draftsAfter?.[0]?.created_work_item_id).toBe(itemsAfter?.[0]?.id)
    expect(draftsAfter?.[0]?.user_id).toBe(E2E_USER_ID)

    // 9. The action left an audit entry (AC-144.27).
    const { data: events } = await admin
      .from("assistant_action_events")
      .select("action_key, result_status, project_id")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .eq("action_key", "work_item_draft.confirm")
      .order("created_at", { ascending: false })
      .limit(1)
    expect(events?.[0]?.result_status).toBe("success")
    expect(events?.[0]?.project_id).toBe(E2E_ASSISTANT_PROJECT_ID)
  })

  /**
   * The guard that protects someone else's lane.
   *
   * The whole two-tenant design rests on one claim: with the shared tenant
   * active, the assistant module is off and the launcher does not render — so
   * the authenticated visual-regression baselines keep photographing a shell
   * without a `fixed` button bottom-right. That claim was argued in prose in
   * PROJ-144 F-8; here it is asserted, so a future change that flips the module
   * on for the shared tenant fails HERE with a clear reason instead of showing
   * up as an unexplained pixel diff in PROJ-51.
   */
  test("the launcher stays absent on the shared tenant (visual-baseline guard)", async ({
    authenticatedPage: page,
  }) => {
    test.skip(!hasAuthStorageState(), "auth fixture not provisioned")

    await page.goto("/", { waitUntil: "networkidle", timeout: 120_000 })
    // Sanity: we really are past the auth gate — otherwise "no launcher" would
    // be trivially true on a login page and the guard would prove nothing.
    await expect(page.locator("[data-sidebar='sidebar']").first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      page.getByRole("button", { name: "Assistant öffnen" }),
    ).toHaveCount(0)
  })

  test("an unconfirmed draft survives closing the overlay and can be discarded", async ({
    assistantTenantPage: page,
  }) => {
    // Same reason as the chain test, plus a full page reload in the middle.
    test.setTimeout(180_000)
    test.skip(!hasAuthStorageState(), "auth fixture not provisioned")
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY missing")
    if (!admin) return

    await page.goto(`/projects/${E2E_ASSISTANT_PROJECT_ID}`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    })
    await page.getByRole("button", { name: "Assistant öffnen" }).click()
    await page
      .getByPlaceholder("Assistant fragen")
      .fill(`Neue Story: ${RESUME_DICTATED}`)
    await page.getByRole("button", { name: "Senden" }).click()
    await expect(page.getByText("Entwurf — noch nicht angelegt")).toBeVisible({
      timeout: 60_000,
    })

    // Leave without confirming — nothing may be written (AC-144.15).
    await page.keyboard.press("Escape")
    const { data: itemsWhileOpen } = await admin
      .from("work_items")
      .select("id")
      .eq("project_id", E2E_ASSISTANT_PROJECT_ID)
      .like("title", `%${RESUME_DICTATED}%`)
    expect(itemsWhileOpen ?? []).toHaveLength(0)

    // Same session: closing the sheet does not unmount the launcher, so the
    // conversation — and with it the review card — is simply still there. The
    // list intentionally suppresses a draft that is already on screen inline,
    // otherwise the same draft would be confirmable from two places at once.
    // Asserted on the card's title FIELD, not on the text: the dictated string
    // also appears in the user bubble and in the assistant reply, which makes a
    // plain text locator ambiguous (strict-mode violation).
    await page.getByRole("button", { name: "Assistant öffnen" }).click()
    await expect(page.getByLabel("Titel")).toHaveValue(RESUME_DICTATED, {
      timeout: 30_000,
    })

    // The real resumption test is a fresh mount: reload, so React state is
    // gone and the draft can only come back from the database (L7, AC-144.17).
    // Reopening via Escape alone would merely prove that component state
    // survived, which is not what "resumable later" means.
    await page.reload({ waitUntil: "networkidle", timeout: 120_000 })
    await page.getByRole("button", { name: "Assistant öffnen" }).click()
    await expect(page.getByText("Offene Entwürfe")).toBeVisible({
      timeout: 30_000,
    })
    // After the reload the conversation is empty, so the only place this title
    // can come from is the database-backed list.
    await expect(page.getByLabel("Titel")).toHaveValue(RESUME_DICTATED)

    // Discarding removes it from the list without creating anything. The whole
    // section disappears with the last open draft.
    await page.getByRole("button", { name: /Verwerfen/ }).first().click()
    await expect(page.getByText("Offene Entwürfe")).toBeHidden({
      timeout: 30_000,
    })

    const { data: draftRows } = await admin
      .from("assistant_work_item_drafts")
      .select("status")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("title", `%${RESUME_DICTATED}%`)
    expect(draftRows?.[0]?.status).toBe("discarded")

    const { data: itemsAfter } = await admin
      .from("work_items")
      .select("id")
      .eq("project_id", E2E_ASSISTANT_PROJECT_ID)
      .like("title", `%${RESUME_DICTATED}%`)
    expect(itemsAfter ?? []).toHaveLength(0)
  })
})
