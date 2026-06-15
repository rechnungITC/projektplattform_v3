/**
 * PROJ-90 — orchestrated "Projekt befüllen" conductor.
 *
 * PROJ-90 adds NO new API routes — it composes the deployed PROJ-70/88/89
 * endpoints client-side. So this spec focuses on the conductor UI:
 *   - The drawer has a 7th tab "Projekt befüllen" with a shared source
 *     picker, three module progress rows, and the global Accept-All bar.
 *   - The wizard deep-link `?aiDrawer=fill` opens the conductor tab.
 *
 * Auth-gates for the three underlying routes are already covered by the
 * PROJ-70/88/89 specs; the orchestration calls those same gated routes.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { E2E_TENANT_ID, E2E_USER_ID } from "./fixtures/constants"
import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"

const PROJECT_ID = "90e2e000-1111-4222-8333-444455556666"

async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  // realtime-js needs an explicit ws transport under Node (PROJ-70 lesson).
  const { default: WebSocketImpl } = (await import("ws")) as {
    default: typeof WebSocket
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketImpl },
  })
}

/** Drop the seed project + every child row that an authenticated visit can
 *  spawn (project_memberships is auto-created when the admin opens the
 *  project, and its FK otherwise blocks the project delete → leftover). */
async function purgeProject(admin: SupabaseClient): Promise<void> {
  await admin.from("ki_suggestions").delete().eq("project_id", PROJECT_ID)
  await admin.from("ki_runs").delete().eq("project_id", PROJECT_ID)
  await admin.from("work_items").delete().eq("project_id", PROJECT_ID)
  await admin.from("risks").delete().eq("project_id", PROJECT_ID)
  await admin.from("project_memberships").delete().eq("project_id", PROJECT_ID)
  await admin.from("projects").delete().eq("id", PROJECT_ID)
}

test.describe("PROJ-90 'Projekt befüllen' conductor (authenticated)", () => {
  // Serial: both tests share one seeded project, so they must run in one
  // worker — otherwise two workers race the beforeAll insert (duplicate key).
  test.describe.configure({ mode: "serial" })
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")

    await purgeProject(admin!)
    const { error } = await admin!.from("projects").insert({
      id: PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E PROJ-90] Conductor",
      project_type: "software",
      project_method: "scrum",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    if (error) throw new Error(`project seed failed: ${error.message}`)
  })

  test.afterAll(async () => {
    if (!admin) return
    await purgeProject(admin)
  })

  test("AC-90.1/90.3 — conductor tab shows shared source picker, 3 module rows and global Accept-All", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PROJECT_ID}/backlog`, { timeout: 120_000 })

    // Open the drawer via the PROJ-87 launcher.
    const launcher = page.getByTestId("backlog-ai-proposals-trigger")
    await expect(launcher).toBeVisible({ timeout: 30_000 })
    await launcher.click()

    // The conductor tab exists and opens.
    const fillTab = page.getByRole("tab", { name: "Projekt befüllen" })
    await expect(fillTab).toBeVisible()
    await fillTab.click()
    await expect(page.getByTestId("orchestration-tab")).toBeVisible()

    // Shared source picker + Generate-All button.
    await expect(
      page.getByTestId("orchestration-source-select"),
    ).toBeVisible()
    await expect(
      page.getByTestId("orchestration-generate-all"),
    ).toBeVisible()

    // Three module progress rows.
    await expect(page.getByTestId("orchestration-row-backlog")).toBeVisible()
    await expect(
      page.getByTestId("orchestration-row-stakeholder"),
    ).toBeVisible()
    await expect(page.getByTestId("orchestration-row-risiken")).toBeVisible()

    // Global Accept-All bar (disabled with 0 drafts — empty seed project).
    const acceptAll = page.getByTestId("orchestration-accept-all")
    await expect(acceptAll).toBeVisible()
    await expect(acceptAll).toBeDisabled()
  })

  test("AC-90.2 — wizard deep-link ?aiDrawer=fill opens the conductor tab", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(
      `/projects/${PROJECT_ID}/graph?mode=trajectory&aiDrawer=fill`,
      { timeout: 120_000 },
    )
    // The conductor tab content is visible (drawer auto-opened on "fill").
    await expect(page.getByTestId("orchestration-tab")).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      page.getByTestId("orchestration-generate-all"),
    ).toBeVisible()
  })
})
