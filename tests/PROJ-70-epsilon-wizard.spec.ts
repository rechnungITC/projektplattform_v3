/**
 * PROJ-70-ε — E2E: Wizard KI-Backlog integration (AC-ε7).
 *
 * Three layers, mirroring the δ-spec strategy:
 *
 *   1. UI gating (chromium): the basics-step toggle adds the optional
 *      `ki_backlog` step (AC-ε1/ε5) and the step renders the upload zone.
 *      Pure UI, no project mutation.
 *
 *   2. Live handoff (chromium): a draft with a real uploaded context
 *      source is seeded (service-role — the draft CREATE path rejects the
 *      synthetic E2E tenant id under Zod-4 strict-UUID, F-3), then the
 *      REAL finalize route runs → asserts the project is created with the
 *      method, the context source is attached, and navigating the
 *      Post-Finalize deep-link opens the drawer on the Backlog tab AND
 *      fires an auto-generation run (a `ki_runs` row for
 *      proposal_from_context appears — the stub provider yields 0
 *      suggestions in the test tenant, which is environment-correct).
 *
 *   3. Accept through the deep-linked drawer (chromium): 5 seeded
 *      proposal_from_context drafts → open the deep-link (no contextSource,
 *      so no auto-gen interferes) → Accept-All → 5 work_items created with
 *      the project method preserved (AC-ε7 core).
 *
 * Auth-fixture tests are chromium-only (Mobile-Safari storage-state is
 * flaky, pre-existing PROJ-67). Service-role admin uses the same
 * ws-transport workaround as global-setup.
 */

import { randomUUID } from "node:crypto"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import { E2E_TENANT_ID, E2E_USER_ID } from "./fixtures/constants"

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

const EML_FIXTURE = [
  "Message-ID: <eps-kickoff@example.com>",
  "From: Alice <alice@example.com>",
  "To: Bob <bob@example.com>",
  "Subject: ERP Kickoff ε",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hallo Team, dies ist der ε-Wizard-Kickoff-Body.",
].join("\r\n")

// ---------------------------------------------------------------------------
// 1. UI gating — toggle adds the optional step (AC-ε1 / AC-ε5)
// ---------------------------------------------------------------------------

test.describe("PROJ-70-ε / wizard UI gating", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "auth storage-state is flaky on Mobile Safari (pre-existing, PROJ-67)",
  )
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  test("ε — KI-Backlog toggle adds a 6th step + shows the upload zone (AC-ε1/ε5)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage
    await page.goto("/projects/new/wizard", { timeout: 120_000 })

    const stepper = page.locator('[aria-label="Wizard-Schritte"] button')
    await expect
      .poll(async () => stepper.count(), { timeout: 30_000 })
      .toBeGreaterThan(0)

    // Toggle off → 5 steps, no KI-Backlog.
    const stepsOff = (await stepper.allInnerTexts()).map((t) =>
      t.replace(/\s+/g, " ").trim(),
    )
    expect(stepsOff).toHaveLength(5)
    expect(stepsOff.join(" ")).not.toContain("KI-Backlog")

    // Flip the toggle.
    const toggle = page.getByRole("switch", { name: /KI-Backlog/ })
    await expect(toggle).toBeVisible()
    await toggle.click()

    // Toggle on → 6 steps, KI-Backlog at position 5 (before Review).
    await expect
      .poll(async () => stepper.count(), { timeout: 5_000 })
      .toBe(6)
    const stepsOn = (await stepper.allInnerTexts()).map((t) =>
      t.replace(/\s+/g, " ").trim(),
    )
    expect(stepsOn[4]).toContain("KI-Backlog")
    expect(stepsOn[5]).toContain("Review")
  })
})

// ---------------------------------------------------------------------------
// 2. Live handoff — finalize attaches + deep-link opens drawer + auto-gen
// ---------------------------------------------------------------------------

test.describe.serial("PROJ-70-ε / finalize handoff + deep-link auto-generate", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "auth storage-state is flaky on Mobile Safari (pre-existing, PROJ-67)",
  )
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null
  let contextSourceId: string | null = null
  let draftId: string | null = null
  let projectId: string | null = null
  let storagePath: string | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")
  })

  test.afterAll(async () => {
    if (!admin) return
    try {
      if (storagePath) {
        await admin.storage
          .from("context-source-uploads")
          .remove([storagePath])
          .then(
            () => undefined,
            () => undefined,
          )
      }
      if (projectId) {
        // children first
        await admin.from("ki_provenance").delete().eq("tenant_id", E2E_TENANT_ID).then(()=>undefined,()=>undefined)
        await admin.from("work_items").delete().eq("project_id", projectId)
        await admin.from("ki_suggestions").delete().eq("project_id", projectId)
        await admin.from("ki_runs").delete().eq("project_id", projectId)
        await admin.from("context_sources").delete().eq("project_id", projectId)
        await admin.from("project_members").delete().eq("project_id", projectId)
        await admin.from("projects").delete().eq("id", projectId)
      }
      if (contextSourceId) {
        await admin.from("context_sources").delete().eq("id", contextSourceId)
      }
      if (draftId) {
        await admin.from("project_wizard_drafts").delete().eq("id", draftId)
      }
    } catch {
      // best-effort
    }
  })

  test("ε — real upload (no project) → finalize attaches + deep-link auto-generates (AC-ε2/ε4)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage

    // (a) Real multipart upload WITHOUT project_id — exactly what the
    // wizard ki_backlog step does.
    const upload = await page.request.post("/api/context-sources", {
      multipart: {
        file: {
          name: "eps-kickoff.eml",
          mimeType: "message/rfc822",
          buffer: Buffer.from(EML_FIXTURE),
        },
        kind: "email",
        title: "[E2E ε] Kickoff",
      },
    })
    expect(upload.status()).toBe(201)
    const uploadBody = (await upload.json()) as {
      context_source: { id: string; project_id: string | null }
    }
    contextSourceId = uploadBody.context_source.id
    storagePath = `${E2E_TENANT_ID}/${contextSourceId}/eps-kickoff.eml`
    // Uploaded without a project (wizard draft phase).
    expect(uploadBody.context_source.project_id).toBeNull()

    // (b) Seed a draft carrying the ki_backlog block (service-role — the
    // draft CREATE route rejects the synthetic E2E tenant id under Zod-4
    // strict-UUID, F-3; the FINALIZE path under test runs for real).
    const draftData = {
      name: "[E2E ε] Wizard KI Project",
      project_type: "software",
      project_method: "scrum",
      responsible_user_id: E2E_USER_ID,
      ki_backlog: {
        enabled: true,
        context_source_id: contextSourceId,
        filename: "eps-kickoff.eml",
      },
    }
    const { data: draft, error: draftErr } = await admin!
      .from("project_wizard_drafts")
      .insert({
        tenant_id: E2E_TENANT_ID,
        created_by: E2E_USER_ID,
        name: draftData.name,
        project_type: "software",
        project_method: "scrum",
        data: draftData,
      })
      .select("id")
      .single()
    if (draftErr || !draft) {
      throw new Error(`draft seed failed: ${draftErr?.message}`)
    }
    draftId = (draft as { id: string }).id

    // (c) Real finalize route.
    const finalize = await page.request.post(
      `/api/wizard-drafts/${draftId}/finalize`,
    )
    expect(finalize.status()).toBe(201)
    const finalizeBody = (await finalize.json()) as {
      project: { id: string; project_method: string | null }
    }
    projectId = finalizeBody.project.id
    expect(finalizeBody.project.project_method).toBe("scrum")

    // (d) The context source is now attached to the new project (AC-ε4).
    const { data: cs } = await admin!
      .from("context_sources")
      .select("project_id")
      .eq("id", contextSourceId!)
      .single()
    expect((cs as { project_id: string | null } | null)?.project_id).toBe(
      projectId,
    )

    // (e) Navigate the Post-Finalize deep-link → drawer opens on the
    // Backlog tab and auto-generates for the attached source.
    await page.goto(
      `/projects/${projectId}/graph?mode=trajectory&aiDrawer=backlog&contextSource=${contextSourceId}`,
      { timeout: 120_000 },
    )

    // The drawer's Backlog tab content (file picker label) is visible.
    await expect(
      page.getByText(/Kickoff-Datei \(PDF/i),
    ).toBeVisible({ timeout: 60_000 })

    // Auto-generation fired: a proposal_from_context ki_run exists for the
    // project (stub provider → 0 suggestions in the test tenant, which is
    // environment-correct; the wiring is what we verify).
    await expect
      .poll(
        async () => {
          const { count } = await admin!
            .from("ki_runs")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId!)
            .eq("purpose", "proposal_from_context")
          return count ?? 0
        },
        { timeout: 30_000, intervals: [1_000] },
      )
      .toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Accept through the deep-linked drawer → work_items (AC-ε7 core)
// ---------------------------------------------------------------------------

test.describe.serial("PROJ-70-ε / accept seeded backlog via deep-linked drawer", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "auth storage-state is flaky on Mobile Safari (pre-existing, PROJ-67)",
  )
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  const PROJECT_ID = randomUUID()
  let admin: SupabaseClient | null = null
  let runId: string | null = null
  const suggestionIds: string[] = []

  // 5 scrum-method-compatible suggestions: 1 epic → 2 stories → 2 tasks.
  const SEED = [
    { temp: "ep1", kind: "epic", parent: null, title: "[E2E ε] Epic 1" },
    { temp: "st1", kind: "story", parent: "ep1", title: "[E2E ε] Story 1" },
    { temp: "st2", kind: "story", parent: "ep1", title: "[E2E ε] Story 2" },
    { temp: "tk1", kind: "task", parent: "st1", title: "[E2E ε] Task 1" },
    { temp: "tk2", kind: "task", parent: "st2", title: "[E2E ε] Task 2" },
  ]

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")

    const { error: projErr } = await admin!.from("projects").insert({
      id: PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E ε] Accept Project",
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
        purpose: "proposal_from_context",
        classification: 1,
        provider: "stub",
        status: "success",
      })
      .select("id")
      .single()
    if (runErr || !run) throw new Error(`ki_runs seed failed: ${runErr?.message}`)
    runId = (run as { id: string }).id

    const rows = SEED.map((s) => {
      const payload = {
        temp_id: s.temp,
        parent_temp_id: s.parent,
        kind: s.kind,
        title: s.title,
        description: null,
        confidence: "medium",
      }
      return {
        tenant_id: E2E_TENANT_ID,
        project_id: PROJECT_ID,
        ki_run_id: runId,
        purpose: "proposal_from_context",
        payload,
        original_payload: payload,
        is_modified: false,
        status: "draft",
        created_by: E2E_USER_ID,
      }
    })
    const { data: inserted, error: sugErr } = await admin!
      .from("ki_suggestions")
      .insert(rows)
      .select("id")
    if (sugErr || !inserted) {
      throw new Error(`ki_suggestions seed failed: ${sugErr?.message}`)
    }
    suggestionIds.push(...(inserted as Array<{ id: string }>).map((r) => r.id))
  })

  test.afterAll(async () => {
    if (!admin) return
    try {
      if (suggestionIds.length > 0) {
        await admin
          .from("ki_provenance")
          .delete()
          .in("ki_suggestion_id", suggestionIds)
      }
      await admin.from("work_items").delete().eq("project_id", PROJECT_ID)
      await admin.from("ki_suggestions").delete().eq("project_id", PROJECT_ID)
      if (runId) await admin.from("ki_runs").delete().eq("id", runId)
      await admin.from("project_members").delete().eq("project_id", PROJECT_ID)
      await admin.from("projects").delete().eq("id", PROJECT_ID)
    } catch {
      // best-effort
    }
  })

  test("ε — deep-link Backlog tab → Accept-All → 5 work_items with method (AC-ε7)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage
    // Open the deep-link WITHOUT contextSource so no auto-gen runs — we
    // accept the pre-seeded drafts to assert the work_items hierarchy.
    await page.goto(
      `/projects/${PROJECT_ID}/graph?mode=trajectory&aiDrawer=backlog`,
      { timeout: 120_000 },
    )

    // The tree rendered (root epic visible). NOTE: the tree viewport
    // height is derived from the ROOT-node count, so a single-root tree
    // (1 epic + nested children) renders a short, virtualized list —
    // only ~4 of 5 rows are in the DOM without scrolling (F-ε1, LOW).
    // Accept-All operates on ALL draft ids regardless of scroll, so the
    // authoritative check is the work_items count in the DB below.
    await expect(page.locator('[data-temp-id="ep1"]')).toBeVisible({
      timeout: 60_000,
    })
    const acceptAll = page.getByTestId("backlog-proposal-accept-all")
    await expect(acceptAll).toContainText("(5)")

    // Accept-All.
    await acceptAll.click()
    await expect(
      page.getByText(/Vorschläge akzeptiert|Vorschlag akzeptiert/).first(),
    ).toBeVisible({ timeout: 15_000 })

    // DB: 5 work_items created for the project, scrum kinds preserved, and
    // the hierarchy (story→epic, task→story) intact.
    await expect
      .poll(
        async () => {
          const { data } = await admin!
            .from("work_items")
            .select("id, kind, parent_id, title")
            .eq("project_id", PROJECT_ID)
          return (data ?? []).length
        },
        { timeout: 20_000, intervals: [1_000] },
      )
      .toBe(5)

    const { data: items } = await admin!
      .from("work_items")
      .select("id, kind, parent_id, title")
      .eq("project_id", PROJECT_ID)
    const rows = (items ?? []) as Array<{
      id: string
      kind: string
      parent_id: string | null
      title: string
    }>
    const byTitle = new Map(rows.map((r) => [r.title, r]))
    const epic = byTitle.get("[E2E ε] Epic 1")
    const story1 = byTitle.get("[E2E ε] Story 1")
    const task1 = byTitle.get("[E2E ε] Task 1")
    expect(epic?.kind).toBe("epic")
    expect(epic?.parent_id).toBeNull()
    expect(story1?.parent_id).toBe(epic?.id)
    expect(task1?.parent_id).toBe(story1?.id)

    // The project method is set (AC-ε7 "project_method gesetzt").
    const { data: proj } = await admin!
      .from("projects")
      .select("project_method")
      .eq("id", PROJECT_ID)
      .single()
    expect((proj as { project_method: string | null } | null)?.project_method).toBe(
      "scrum",
    )
  })
})
