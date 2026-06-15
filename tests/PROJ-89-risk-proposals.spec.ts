/**
 * PROJ-89 — risk-proposals API surface + drawer smoke.
 *
 * Part 1 (unauth): auth-gate verification on the three new routes,
 * mirroring the PROJ-88 spec pattern (307/401/403 without a session).
 *
 * Part 2 (authenticated fixture, service-role seeded):
 *   - AC-89.8: the drawer has a 6th "Risiken" tab; a seeded draft
 *     suggestion renders as a card with the P×I score badge, the
 *     "≠ Ziel" badge, the duplicate hint and the bulk-accept bar.
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

test.describe("PROJ-89 / risk-proposals API auth-gates", () => {
  test("GET /ai/risk-proposals is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY_PROJECT}/ai/risk-proposals`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /ai/risk-proposals is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/risk-proposals`,
      {
        data: { contextSourceId: DUMMY_CONTEXT_SOURCE },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /ai/risk-proposals/accept is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/risk-proposals/accept`,
      {
        data: { suggestionIds: [DUMMY_SUGGESTION] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /ai/risk-proposals/undo is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/risk-proposals/undo`,
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
      `/api/projects/not-a-uuid/ai/risk-proposals/accept`,
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
// Part 2 — authenticated drawer smoke (tab 6 "Risiken")
// ---------------------------------------------------------------------------

const PROJECT_ID = "89e2e000-1111-4222-8333-444455556666"

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

test.describe("PROJ-89 Risiken tab (authenticated)", () => {
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null
  let existingRiskId: string | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")

    // Idempotent re-seed: drop leftovers from a previous failed run.
    await admin!.from("ki_suggestions").delete().eq("project_id", PROJECT_ID)
    await admin!.from("ki_runs").delete().eq("project_id", PROJECT_ID)
    await admin!.from("risks").delete().eq("project_id", PROJECT_ID)
    await admin!.from("projects").delete().eq("id", PROJECT_ID)

    const { error: projErr } = await admin!.from("projects").insert({
      id: PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E PROJ-89] Risiken Drawer",
      project_type: "software",
      project_method: "scrum",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    if (projErr) throw new Error(`project seed failed: ${projErr.message}`)

    // Existing register risk for the duplicate-hint card.
    const { data: risk, error: riskErr } = await admin!
      .from("risks")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: PROJECT_ID,
        title: "[E2E] Bestehendes Migrationsrisiko",
        probability: 3,
        impact: 3,
        status: "open",
        created_by: E2E_USER_ID,
      })
      .select("id")
      .single()
    if (riskErr || !risk) throw new Error(`risk seed failed: ${riskErr?.message}`)
    existingRiskId = (risk as { id: string }).id

    const { data: run, error: runErr } = await admin!
      .from("ki_runs")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: PROJECT_ID,
        purpose: "proposal_risks_from_context",
        classification: 2,
        provider: "openai",
        status: "success",
      })
      .select("id")
      .single()
    if (runErr || !run) throw new Error(`ki_runs seed failed: ${runErr?.message}`)
    const runId = (run as { id: string }).id

    const basePayload = {
      description: "Kickoff nennt exklusiven Wartungsvertrag.",
      mitigation: "Exit-Klausel vor Migrationsstart verhandeln.",
      source_quote: "Wartung liegt vollständig beim Altanbieter.",
      confidence: "high",
    }
    const createPayload = {
      ...basePayload,
      title: "[E2E] Abhängigkeit vom Alt-Dienstleister",
      probability: 4,
      impact: 4,
      duplicate_of_risk_id: null,
      relevance: "off_goal",
    }
    const dupPayload = {
      ...basePayload,
      title: "[E2E] Migrationsrisiko (Duplikat)",
      probability: 3,
      impact: 3,
      duplicate_of_risk_id: existingRiskId,
      relevance: "on_goal",
    }
    const { error: sugErr } = await admin!.from("ki_suggestions").insert(
      [createPayload, dupPayload].map((payload) => ({
        tenant_id: E2E_TENANT_ID,
        project_id: PROJECT_ID,
        ki_run_id: runId,
        purpose: "proposal_risks_from_context",
        payload,
        original_payload: payload,
        status: "draft",
        created_by: E2E_USER_ID,
      })),
    )
    if (sugErr) throw new Error(`suggestion seed failed: ${sugErr.message}`)
  })

  test.afterAll(async () => {
    if (!admin) return
    await admin.from("ki_suggestions").delete().eq("project_id", PROJECT_ID)
    await admin.from("ki_runs").delete().eq("project_id", PROJECT_ID)
    await admin.from("risks").delete().eq("project_id", PROJECT_ID)
    await admin.from("projects").delete().eq("id", PROJECT_ID)
  })

  test("AC-89.8 — drawer tab 6 'Risiken' renders seeded cards with score badge, off-goal badge and duplicate hint", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${PROJECT_ID}/backlog`, { timeout: 120_000 })

    // Open the drawer via the PROJ-87 launcher.
    const launcher = page.getByTestId("backlog-ai-proposals-trigger")
    await expect(launcher).toBeVisible({ timeout: 30_000 })
    await launcher.click()

    // Drawer opens with the 6th tab.
    const risksTab = page.getByRole("tab", { name: "Risiken" })
    await expect(risksTab).toBeVisible()
    await risksTab.click()
    await expect(page.getByTestId("risk-proposal-tab")).toBeVisible()

    // Both seeded drafts render as cards.
    const cards = page.getByTestId("risk-proposal-card")
    await expect(cards).toHaveCount(2)

    // Create-card: title, P×I score badge, off-goal badge.
    const createCard = cards.filter({
      hasText: "[E2E] Abhängigkeit vom Alt-Dienstleister",
    })
    await expect(createCard).toContainText("P4 × A4 = 16")
    await expect(createCard).toContainText("≠ Ziel")
    await expect(createCard).toContainText("Wartung liegt vollständig")

    // Duplicate-card: link hint instead of fresh create.
    const dupCard = cards.filter({
      hasText: "[E2E] Migrationsrisiko (Duplikat)",
    })
    await expect(dupCard).toContainText("Bereits im Risikoregister")

    // Bulk bar present.
    await expect(page.getByTestId("risk-proposal-accept-all")).toBeVisible()
  })
})