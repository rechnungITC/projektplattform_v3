/**
 * PROJ-135 — E2E: dialogic wizard clarifying questions.
 *
 * Four layers (mirroring the PROJ-70-ε strategy):
 *
 *   1. Auth-gate (no session): the new draft-scoped endpoint rejects
 *      unauthenticated callers (307/401/403) and validates the draft id.
 *
 *   2. UI gating (chromium auth): the clarifying step appears ONLY after a
 *      kickoff was uploaded (AC-135.3) — absent with just the toggle on,
 *      present (after KI-Backlog, before Review) once a file is uploaded.
 *
 *   3. Endpoint auto-generate (chromium auth + service-role): a draft with a
 *      real uploaded context source → POST clarifying-questions → a
 *      project-less `ki_runs` row (purpose=clarifying_questions_from_context,
 *      project_id NULL, wizard_draft_id set) is recorded (AC-135.6 audit +
 *      Option-1 bounded-null; stub provider yields 0 questions in the test
 *      tenant, which is environment-correct — the wiring is what we verify).
 *
 *   4. Finalize persist + re-link (chromium auth + service-role): a draft with
 *      an uploaded source + answered clarifying Q&A + a project-less clarifying
 *      ki_run → REAL finalize → the Q&A is appended to the kickoff
 *      content_excerpt + mirrored to source_metadata (AC-135.4) and the
 *      project-less ki_run is re-linked to the new project (AC-135.11).
 *
 * Auth-fixture tests are chromium-only (Mobile-Safari storage-state is flaky,
 * pre-existing PROJ-67). Service-role admin uses the ws-transport workaround.
 *
 * Coverage note: AC-135.10 (~20s AbortController bounded wait) is structural in
 * the client (`generateClarifyingQuestions`) and exercised by the unit layer;
 * it is not force-timed here (would require a hanging provider).
 */

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
  "Message-ID: <clarify-kickoff@example.com>",
  "From: Alice <alice@example.com>",
  "To: Bob <bob@example.com>",
  "Subject: ERP Kickoff PROJ-135",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hallo Team, das ERP soll Q3 live gehen. Budget und Zielsystem sind noch offen.",
].join("\r\n")

const VALID_UUID = "11111111-1111-4111-8111-111111111111"

// ---------------------------------------------------------------------------
// 1. Auth-gate — runs without a session
// ---------------------------------------------------------------------------

test.describe("PROJ-135 / clarifying-questions API auth-gate", () => {
  test("POST /api/wizard-drafts/[id]/clarifying-questions is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/wizard-drafts/${VALID_UUID}/clarifying-questions`,
      { data: { count: 5 }, failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("invalid draft UUID returns 400 or auth-gate", async ({ request }) => {
    const res = await request.post(
      "/api/wizard-drafts/not-a-uuid/clarifying-questions",
      { data: { count: 5 }, failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 400, 401, 403]).toContain(res.status())
  })
})

// ---------------------------------------------------------------------------
// 2. UI gating — the clarifying step appears only after a kickoff upload
// ---------------------------------------------------------------------------

test.describe("PROJ-135 / wizard UI gating (AC-135.3)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "auth storage-state is flaky on Mobile Safari (pre-existing, PROJ-67)",
  )
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  test("clarifying step is absent until a kickoff is uploaded, then appears (AC-135.3)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage
    await page.goto("/projects/new/wizard", { timeout: 120_000 })

    const stepper = page.locator('[aria-label="Wizard-Schritte"] button')
    await expect
      .poll(async () => stepper.count(), { timeout: 30_000 })
      .toBeGreaterThan(0)

    // Toggle KI-Backlog on → step appears, but NO clarifying yet (no upload).
    const toggle = page.getByRole("switch", { name: /KI-Backlog/ })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect.poll(async () => stepper.count(), { timeout: 5_000 }).toBe(6)
    expect((await stepper.allInnerTexts()).join(" ")).not.toContain("Rückfragen")

    // Navigate to the KI-Backlog step and upload a real kickoff file.
    await page.getByRole("button", { name: /KI-Backlog/ }).click()
    await page
      .getByTestId("wizard-ki-backlog-file-input")
      .setInputFiles({
        name: "clarify-kickoff.eml",
        mimeType: "message/rfc822",
        buffer: Buffer.from(EML_FIXTURE),
      })

    // Upload succeeded → the clarifying step now appears (7 steps), after
    // KI-Backlog and before Review.
    await expect
      .poll(async () => stepper.count(), { timeout: 60_000 })
      .toBe(7)
    const labels = (await stepper.allInnerTexts()).map((t) =>
      t.replace(/\s+/g, " ").trim(),
    )
    expect(labels[5]).toContain("Rückfragen")
    expect(labels[6]).toContain("Review")
  })
})

// ---------------------------------------------------------------------------
// 3 + 4. Endpoint auto-generate + finalize persist/re-link (service-role)
// ---------------------------------------------------------------------------

test.describe.serial("PROJ-135 / endpoint + finalize persist", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "auth storage-state is flaky on Mobile Safari (pre-existing, PROJ-67)",
  )
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null
  let contextSourceId: string | null = null
  let storagePath: string | null = null
  let genDraftId: string | null = null
  let finDraftId: string | null = null
  let finContextSourceId: string | null = null
  let projectId: string | null = null
  let relinkRunId: string | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")
  })

  test.afterAll(async () => {
    if (!admin) return
    const safe = async (p: Promise<unknown>) => p.then(() => undefined, () => undefined)
    if (storagePath) {
      await safe(admin.storage.from("context-source-uploads").remove([storagePath]))
    }
    if (projectId) {
      await safe(admin.from("ki_runs").delete().eq("project_id", projectId))
      await safe(admin.from("context_sources").delete().eq("project_id", projectId))
      await safe(admin.from("project_members").delete().eq("project_id", projectId))
      await safe(admin.from("projects").delete().eq("id", projectId))
    }
    for (const id of [contextSourceId, finContextSourceId]) {
      if (id) await safe(admin.from("context_sources").delete().eq("id", id))
    }
    for (const id of [genDraftId, finDraftId]) {
      if (id) {
        await safe(admin.from("ki_runs").delete().eq("wizard_draft_id", id))
        await safe(admin.from("project_wizard_drafts").delete().eq("id", id))
      }
    }
  })

  test("auto-generate — endpoint records a project-less clarifying ki_run (AC-135.6/Option-1)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage

    // Real upload WITHOUT a project (wizard ki_backlog phase).
    const upload = await page.request.post("/api/context-sources", {
      multipart: {
        file: {
          name: "clarify-kickoff.eml",
          mimeType: "message/rfc822",
          buffer: Buffer.from(EML_FIXTURE),
        },
        kind: "email",
        title: "[E2E 135] Kickoff",
      },
    })
    expect(upload.status()).toBe(201)
    const uploadBody = (await upload.json()) as {
      context_source: { id: string; project_id: string | null }
    }
    contextSourceId = uploadBody.context_source.id
    storagePath = `${E2E_TENANT_ID}/${contextSourceId}/clarify-kickoff.eml`
    expect(uploadBody.context_source.project_id).toBeNull()

    // Seed a draft carrying the ki_backlog block (service-role; the draft
    // CREATE route rejects the synthetic E2E tenant id under Zod-4 strict-UUID,
    // PROJ-70 F-3 — the generation path under test runs for real).
    const { data: draft, error: draftErr } = await admin!
      .from("project_wizard_drafts")
      .insert({
        tenant_id: E2E_TENANT_ID,
        created_by: E2E_USER_ID,
        name: "[E2E 135] Clarify Project",
        project_type: "software",
        project_method: "scrum",
        data: {
          name: "[E2E 135] Clarify Project",
          project_type: "software",
          project_method: "scrum",
          responsible_user_id: E2E_USER_ID,
          description: "ERP-System einführen.",
          ki_backlog: {
            enabled: true,
            context_source_id: contextSourceId,
            filename: "clarify-kickoff.eml",
          },
        },
      })
      .select("id")
      .single()
    if (draftErr || !draft) throw new Error(`draft seed failed: ${draftErr?.message}`)
    genDraftId = (draft as { id: string }).id

    // Real generation endpoint.
    const res = await page.request.post(
      `/api/wizard-drafts/${genDraftId}/clarifying-questions`,
      { data: { count: 5 } },
    )
    expect(res.status()).toBe(200)

    // A project-less clarifying ki_run was recorded for this draft.
    await expect
      .poll(
        async () => {
          const { count } = await admin!
            .from("ki_runs")
            .select("id", { count: "exact", head: true })
            .eq("wizard_draft_id", genDraftId!)
            .eq("purpose", "clarifying_questions_from_context")
            .is("project_id", null)
          return count ?? 0
        },
        { timeout: 30_000, intervals: [1_000] },
      )
      .toBeGreaterThan(0)
  })

  test("finalize — answered Q&A appended to content_excerpt + ki_run re-linked (AC-135.4/4b/11)", async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage

    // Seed a project-less kickoff context_source with a known excerpt.
    const { data: cs, error: csErr } = await admin!
      .from("context_sources")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: null,
        kind: "document",
        title: "[E2E 135] Finalize Kickoff",
        content_excerpt: "Das ERP-Projekt startet im Q3.",
        privacy_class: 2,
        created_by: E2E_USER_ID,
      })
      .select("id")
      .single()
    if (csErr || !cs) throw new Error(`context_source seed failed: ${csErr?.message}`)
    finContextSourceId = (cs as { id: string }).id

    // Seed a draft with the uploaded source + answered clarifying Q&A.
    const { data: draft, error: draftErr } = await admin!
      .from("project_wizard_drafts")
      .insert({
        tenant_id: E2E_TENANT_ID,
        created_by: E2E_USER_ID,
        name: "[E2E 135] Finalize Project",
        project_type: "software",
        project_method: "scrum",
        data: {
          name: "[E2E 135] Finalize Project",
          project_type: "software",
          responsible_user_id: E2E_USER_ID,
          ki_backlog: {
            enabled: true,
            context_source_id: finContextSourceId,
            filename: "finalize-kickoff.eml",
          },
          clarifying: {
            answers: [
              {
                question: "Go-Live-Termin?",
                answer: "Q4 2026 (verbindlich).",
                gap_tag: "schedule",
              },
            ],
          },
        },
      })
      .select("id")
      .single()
    if (draftErr || !draft) throw new Error(`draft seed failed: ${draftErr?.message}`)
    finDraftId = (draft as { id: string }).id

    // Seed a project-less clarifying ki_run tied to this draft (as the wizard
    // step would have recorded) so finalize can re-link it (AC-135.11).
    const { data: run, error: runErr } = await admin!
      .from("ki_runs")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: null,
        wizard_draft_id: finDraftId,
        purpose: "clarifying_questions_from_context",
        classification: 2,
        provider: "stub",
        status: "success",
      })
      .select("id")
      .single()
    if (runErr || !run) throw new Error(`ki_run seed failed: ${runErr?.message}`)
    relinkRunId = (run as { id: string }).id

    // Real finalize.
    const finalize = await page.request.post(
      `/api/wizard-drafts/${finDraftId}/finalize`,
    )
    expect(finalize.status()).toBe(201)
    projectId = ((await finalize.json()) as { project: { id: string } }).project.id

    // (a) AC-135.4 — the Q&A is appended to content_excerpt + mirrored.
    const { data: csAfter } = await admin!
      .from("context_sources")
      .select("content_excerpt, source_metadata, project_id, privacy_class")
      .eq("id", finContextSourceId!)
      .single()
    const row = csAfter as {
      content_excerpt: string | null
      source_metadata: Record<string, unknown> | null
      project_id: string | null
      privacy_class: number
    } | null
    expect(row?.project_id).toBe(projectId)
    expect(row?.content_excerpt).toContain("Das ERP-Projekt startet im Q3.")
    expect(row?.content_excerpt).toContain("Go-Live-Termin?")
    expect(row?.content_excerpt).toContain("Q4 2026")
    expect(row?.source_metadata?.proj135_clarifying_qa).toBeTruthy()
    // Clean business answer → privacy_class stays 2 (AC-135.4b: raise-only).
    expect(row?.privacy_class).toBe(2)

    // (b) AC-135.11 — the project-less clarifying ki_run is now re-linked.
    const { data: runAfter } = await admin!
      .from("ki_runs")
      .select("project_id")
      .eq("id", relinkRunId!)
      .single()
    expect((runAfter as { project_id: string | null } | null)?.project_id).toBe(
      projectId,
    )
  })
})
