/**
 * PROJ-88 — stakeholder-proposals API surface + drawer smoke.
 *
 * Part 1 (unauth): auth-gate verification on the three new routes,
 * mirroring the PROJ-70 spec pattern (307/401/403 without a session).
 *
 * Part 2 (authenticated fixture, service-role seeded):
 *   - PROJ-87 deferred smoke (rides along per QA plan): the
 *     "KI-Backlog generieren" launcher is visible on /backlog for an
 *     editor and opens the AIProposalDrawer on the Backlog tab.
 *   - PROJ-88 AC-88.8: the drawer has a 5th "Stakeholder" tab; a seeded
 *     draft suggestion renders as a card with accept options
 *     (resource toggle + member picker) and the "≠ Ziel" badge.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { E2E_TENANT_ID, E2E_USER_ID } from "./fixtures/constants"
import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"

const DUMMY_PROJECT = "00000000-0000-0000-0000-000000000000"
const DUMMY_SUGGESTION = "00000000-0000-0000-0000-000000000001"
const DUMMY_CONTEXT_SOURCE = "00000000-0000-0000-0000-000000000002"

// ---------------------------------------------------------------------------
// Part 1 — auth gates (no session)
// ---------------------------------------------------------------------------

test.describe("PROJ-88 / stakeholder-proposals API auth-gates", () => {
  test("GET /ai/stakeholder-proposals is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY_PROJECT}/ai/stakeholder-proposals`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /ai/stakeholder-proposals is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/stakeholder-proposals`,
      {
        data: { contextSourceId: DUMMY_CONTEXT_SOURCE },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /ai/stakeholder-proposals/accept is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/stakeholder-proposals/accept`,
      {
        data: { suggestionIds: [DUMMY_SUGGESTION] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /ai/stakeholder-proposals/undo is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/stakeholder-proposals/undo`,
      {
        data: { suggestionIds: [DUMMY_SUGGESTION] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("invalid project UUID on accept returns 400 or auth-gate", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/not-a-uuid/ai/stakeholder-proposals/accept`,
      {
        data: { suggestionIds: [DUMMY_SUGGESTION] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 400, 401, 403]).toContain(res.status())
  })
})

// ---------------------------------------------------------------------------
// Part 2 — authenticated drawer smoke (PROJ-87 launcher + PROJ-88 tab)
// ---------------------------------------------------------------------------

const PROJECT_ID = "88e2e000-1111-4222-8333-444455556666"

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

test.describe("PROJ-87 launcher + PROJ-88 Stakeholder tab (authenticated)", () => {
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")

    // Idempotent re-seed: drop leftovers from a previous failed run.
    await admin!.from("ki_suggestions").delete().eq("project_id", PROJECT_ID)
    await admin!.from("ki_runs").delete().eq("project_id", PROJECT_ID)
    await admin!.from("projects").delete().eq("id", PROJECT_ID)

    const { error: projErr } = await admin!.from("projects").insert({
      id: PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E PROJ-88] Stakeholder Drawer",
      project_type: "software",
      project_method: "scrum",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    if (projErr) throw new Error(`project seed failed: ${projErr.message}`)

    const { data: run, error: runErr } = await admin!
      .from("ki_runs")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: PROJECT_ID,
        purpose: "proposal_stakeholders_from_context",
        classification: 3,
        provider: "ollama",
        status: "success",
      })
      .select("id")
      .single()
    if (runErr || !run) throw new Error(`ki_runs seed failed: ${runErr?.message}`)

    const payload = {
      name: "[E2E] Maria Beispiel",
      kind: "person",
      origin: "external",
      role_key: "Projektleiterin Fachbereich",
      org_unit: "Einkauf",
      contact_email: null,
      contact_phone: null,
      duplicate_of_stakeholder_id: null,
      source_quote: "Fr. Beispiel leitet das Projekt fachseitig.",
      confidence: "high",
      relevance: "off_goal",
    }
    const { error: sugErr } = await admin!.from("ki_suggestions").insert({
      tenant_id: E2E_TENANT_ID,
      project_id: PROJECT_ID,
      ki_run_id: (run as { id: string }).id,
      purpose: "proposal_stakeholders_from_context",
      payload,
      original_payload: payload,
      status: "draft",
      created_by: E2E_USER_ID,
    })
    if (sugErr) throw new Error(`suggestion seed failed: ${sugErr.message}`)
  })

  test.afterAll(async () => {
    if (!admin) return
    await admin.from("ki_suggestions").delete().eq("project_id", PROJECT_ID)
    await admin.from("ki_runs").delete().eq("project_id", PROJECT_ID)
    await admin.from("projects").delete().eq("id", PROJECT_ID)
  })

  test("PROJ-87 — backlog launcher opens the drawer; PROJ-88 tab shows the seeded card", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PROJECT_ID}/backlog`, { timeout: 120_000 })

    // PROJ-87 deferred smoke: launcher visible for an editor/lead.
    const launcher = page.getByTestId("backlog-ai-proposals-trigger")
    await expect(launcher).toBeVisible({ timeout: 30_000 })
    await launcher.click()

    // Drawer opens with all five tabs.
    await expect(page.getByRole("tab", { name: "Backlog" })).toBeVisible()
    const stakeholderTab = page.getByRole("tab", { name: "Stakeholder" })
    await expect(stakeholderTab).toBeVisible()

    // PROJ-88 AC-88.8: switch to the Stakeholder tab.
    await stakeholderTab.click()
    await expect(page.getByTestId("stakeholder-proposal-tab")).toBeVisible()

    // Seeded draft renders as a card with name, off_goal badge and
    // accept options (resource toggle + member picker).
    const card = page.getByTestId("stakeholder-proposal-card").first()
    await expect(card).toBeVisible()
    await expect(card).toContainText("[E2E] Maria Beispiel")
    await expect(card).toContainText("≠ Ziel")
    await expect(
      card.getByTestId("stakeholder-proposal-resource-toggle"),
    ).toBeVisible()
    await expect(
      card.getByTestId("stakeholder-proposal-member-picker"),
    ).toBeVisible()
    await expect(
      page.getByTestId("stakeholder-proposal-accept-all"),
    ).toBeVisible()
  })
})
