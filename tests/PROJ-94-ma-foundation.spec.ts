/**
 * PROJ-94 — M&A strategic-foundation surface smoke.
 *
 * Part 1 (unauth): auth-gate verification on the three new routes + the new
 *   project-room page (307/401/403 without a session), mirroring PROJ-88/89.
 * Part 2 (authenticated fixture, service-role seeded):
 *   - the "Strategische Grundlage" card renders for an M&A project (title,
 *     mandate badge, Grundlage tab) — AC-1/AC-2/AC-4 surfacing.
 *   - a non-M&A project shows the "no M&A foundation" empty state (the
 *     type-gated section never leaks a foundation onto other project types).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { E2E_TENANT_ID, E2E_USER_ID } from "./fixtures/constants"
import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"

const DUMMY_PROJECT = "00000000-0000-0000-0000-000000000000"

// ---------------------------------------------------------------------------
// Part 1 — auth gates (no session)
// ---------------------------------------------------------------------------
test.describe("PROJ-94 / ma-profile API + page auth-gates", () => {
  test("GET /ma-profile is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY_PROJECT}/ma-profile`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("PATCH /ma-profile is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY_PROJECT}/ma-profile`,
      {
        data: { deal_rationale: "x" },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST /ma-profile/mandate is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ma-profile/mandate`,
      {
        data: { to_status: "approved" },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("project-room page /strategische-grundlage is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/projects/${DUMMY_PROJECT}/strategische-grundlage`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("invalid project UUID on mandate returns 400 or auth-gate", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/not-a-uuid/ma-profile/mandate`,
      {
        data: { to_status: "approved" },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 400, 401, 403]).toContain(res.status())
  })
})

// ---------------------------------------------------------------------------
// Part 2 — authenticated card smoke
// ---------------------------------------------------------------------------
const MA_PROJECT_ID = "94e2e000-1111-4222-8333-444455556666"
// A general (non-M&A) project WITH a strict RFC-4122 v4 UUID (version nibble 4)
// — the shared E2E_PROJECT_ID fixture is a synthetic all-zero UUID that the
// route's z.string().uuid() (RFC-4122-strict) rejects (cf. PROJ-89 F-3), so we
// seed our own valid-UUID general project for the empty-state path.
const GEN_PROJECT_ID = "94e2e000-2222-4222-8333-444455556666"

async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const { default: WebSocketImpl } = (await import("ws")) as {
    default: typeof WebSocket
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocketImpl },
  })
}

test.describe("PROJ-94 Strategische Grundlage (authenticated)", () => {
  // Serial: both tests share one beforeAll seed on a fixed project id — running
  // them in parallel workers would race the delete/insert seed against itself.
  test.describe.configure({ mode: "serial" })
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")

    // Idempotent re-seed.
    await admin!.from("ma_project_profiles").delete().eq("project_id", MA_PROJECT_ID)
    await admin!.from("projects").delete().eq("id", MA_PROJECT_ID)
    await admin!.from("projects").delete().eq("id", GEN_PROJECT_ID)

    const { error: projErr } = await admin!.from("projects").insert({
      id: MA_PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E PROJ-94] M&A Deal",
      project_type: "ma",
      project_method: "waterfall",
      description: "Konsolidierung im DACH-Markt",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    if (projErr) throw new Error(`project seed failed: ${projErr.message}`)

    // General project WITHOUT an M&A profile (empty-state path).
    const { error: genErr } = await admin!.from("projects").insert({
      id: GEN_PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E PROJ-94] Non-M&A",
      project_type: "general",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    if (genErr) throw new Error(`general project seed failed: ${genErr.message}`)

    const { error: profErr } = await admin!.from("ma_project_profiles").insert({
      tenant_id: E2E_TENANT_ID,
      project_id: MA_PROJECT_ID,
      sponsor_user_id: E2E_USER_ID,
      deal_side: "buy",
      mandate_status: "draft",
      deal_rationale: "[E2E] Marktkonsolidierung",
      confidentiality_level: "standard",
      created_by: E2E_USER_ID,
    })
    if (profErr) throw new Error(`profile seed failed: ${profErr.message}`)
  })

  test.afterAll(async () => {
    if (!admin) return
    await admin.from("ma_project_profiles").delete().eq("project_id", MA_PROJECT_ID)
    await admin.from("projects").delete().eq("id", MA_PROJECT_ID)
    await admin.from("projects").delete().eq("id", GEN_PROJECT_ID)
  })

  test("renders the strategic-foundation card for an M&A project", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${MA_PROJECT_ID}/strategische-grundlage`, {
      timeout: 120_000,
    })
    // Card title + Grundlage tab + mandate badge ("Entwurf" = draft).
    await expect(
      page.getByText("Strategische Grundlage", { exact: false }).first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("tab", { name: "Grundlage" })).toBeVisible()
    await expect(page.getByText("Entwurf", { exact: false }).first()).toBeVisible()
  })

  test("shows the empty state for a non-M&A project", async ({
    authenticatedPage: page,
  }) => {
    // Seeded general project (no M&A profile) → notFound → empty state.
    await page.goto(`/projects/${GEN_PROJECT_ID}/strategische-grundlage`, {
      timeout: 120_000,
    })
    await expect(
      page.getByText("keine M&A-Grundlage hinterlegt", { exact: false }),
    ).toBeVisible({ timeout: 30_000 })
  })
})
