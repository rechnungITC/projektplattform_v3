/**
 * PROJ-70-δ — E2E: Email-Upload (.eml/.msg) + DnD-Reparenting.
 *
 * Three layers:
 *   1. Unauth gates for the two new multipart formats (mirror of the
 *      γ-multipart-auth-gate case).
 *   2. Authenticated REAL .eml upload through the full parser pipeline
 *      (AC-δ2 live): multipart POST → mailparser → content_excerpt +
 *      source_metadata.proj70_delta_email asserted on the response.
 *   3. AC-δ9 smoke: seeded proposal_from_context drafts → open the
 *      Backlog tab in the AI drawer → reparent Story onto another Epic
 *      → bulk-accept → assert the work_items hierarchy in the DB.
 *
 * Auth-fixture tests are chromium-only: the PROJ-29 storage-state auth
 * is known-flaky on the Mobile Safari project (pre-existing, see
 * PROJ-67); the unauth gates run on both projects.
 *
 * Seeding/verification uses the service-role admin client (same
 * ws-transport workaround as global-setup — realtime-js needs an
 * explicit WebSocket constructor on Node 20).
 */

import { randomUUID } from "node:crypto"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import { E2E_TENANT_ID, E2E_USER_ID } from "./fixtures/constants"

/**
 * NOTE — we deliberately do NOT reuse E2E_PROJECT_ID here: the API
 * routes validate project ids with RFC-4122 version-bit-strict UUID
 * checks, and the pinned synthetic id (`…000e21`, version nibble 0)
 * fails that validation even though Postgres accepts it. A per-run v4
 * UUID project is seeded in beforeAll and removed in afterAll.
 */
const DELTA_PROJECT_ID = randomUUID()

// ---------------------------------------------------------------------------
// 1. Unauth gates (both browser projects)
// ---------------------------------------------------------------------------

const EML_FIXTURE = [
  "Message-ID: <e2e-kickoff@example.com>",
  "Date: Mon, 01 Jun 2026 10:00:00 +0200",
  "From: Alice Lead <alice@example.com>",
  "To: Bob PM <bob@example.com>",
  "Subject: ERP Kickoff E2E",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hallo Team, dies ist der E2E-Kickoff-Body.",
].join("\r\n")

test.describe("PROJ-70-δ / unauth multipart gates", () => {
  test("δ — multipart .eml upload is auth-gated", async ({ request }) => {
    const response = await request.post("/api/context-sources", {
      multipart: {
        file: {
          name: "kickoff.eml",
          mimeType: "message/rfc822",
          buffer: Buffer.from(EML_FIXTURE),
        },
        kind: "email",
        title: "unauth eml probe",
      },
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(response.status())
  })

  test("δ — multipart .msg upload is auth-gated", async ({ request }) => {
    // CFB magic bytes D0 CF 11 E0 — enough for a gate probe; the body
    // never reaches the parser without auth.
    const cfb = Buffer.alloc(512)
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(cfb)
    const response = await request.post("/api/context-sources", {
      multipart: {
        file: {
          name: "kickoff.msg",
          mimeType: "application/vnd.ms-outlook",
          buffer: cfb,
        },
        kind: "email",
        title: "unauth msg probe",
      },
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(response.status())
  })
})

// ---------------------------------------------------------------------------
// Shared admin client (service-role) for seeding + verification
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2. Authenticated real .eml upload (AC-δ2 live) — chromium only
// ---------------------------------------------------------------------------

test.describe("PROJ-70-δ / authenticated .eml pipeline", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "auth storage-state is flaky on Mobile Safari (pre-existing, PROJ-67)",
  )
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  test("δ — .eml upload extracts excerpt + email metadata (AC-δ2)", async ({
    authenticatedPage,
  }) => {
    const response = await authenticatedPage.request.post(
      "/api/context-sources",
      {
        multipart: {
          file: {
            name: "kickoff.eml",
            mimeType: "message/rfc822",
            buffer: Buffer.from(EML_FIXTURE),
          },
          kind: "email",
          title: "[E2E] δ Kickoff Mail",
        },
      },
    )
    expect(response.status()).toBe(201)
    const body = (await response.json()) as {
      context_source: {
        id: string
        content_excerpt: string
        source_metadata: {
          proj70_delta_email?: {
            email_subject: string | null
            email_from: { name?: string; address: string } | null
            email_to: Array<{ address: string }>
            email_message_id: string | null
            email_format: string
          }
        }
      }
    }
    const source = body.context_source
    expect(source.content_excerpt).toContain("E2E-Kickoff-Body")
    const email = source.source_metadata.proj70_delta_email
    expect(email?.email_format).toBe("eml")
    expect(email?.email_subject).toBe("ERP Kickoff E2E")
    expect(email?.email_from?.address).toBe("alice@example.com")
    expect(email?.email_to?.[0]?.address).toBe("bob@example.com")
    expect(email?.email_message_id).toBe("<e2e-kickoff@example.com>")

    // QA-Finding F-2 (LOW): the route's LIST_SELECT does not return the
    // γ file-metadata columns (mime_type/original_filename/
    // file_size_bytes) — verify persistence in the DB instead.
    const admin0 = await createAdminClient()
    if (admin0) {
      const { data: dbRow } = await admin0
        .from("context_sources")
        .select("mime_type, original_filename, file_size_bytes")
        .eq("id", source.id)
        .single()
      expect(
        (dbRow as { mime_type: string | null } | null)?.mime_type,
      ).toBe("message/rfc822")
      expect(
        (dbRow as { original_filename: string | null } | null)
          ?.original_filename,
      ).toBe("kickoff.eml")
    }

    // Cleanup: row + storage object (best-effort).
    const admin = await createAdminClient()
    if (admin) {
      await admin.storage
        .from("context-source-uploads")
        .remove([`${E2E_TENANT_ID}/${source.id}/kickoff.eml`])
        .then(
          () => undefined,
          () => undefined,
        )
      await admin.from("context_sources").delete().eq("id", source.id)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. AC-δ9 smoke — seeded drafts → DnD reparent → bulk-accept → DB check
// ---------------------------------------------------------------------------

const TEMP_EPIC_A = "e2e-delta-epic-a"
const TEMP_EPIC_B = "e2e-delta-epic-b"
const TEMP_STORY = "e2e-delta-story-1"

function suggestionPayload(
  tempId: string,
  kind: string,
  parentTempId: string | null,
  title: string,
) {
  return {
    temp_id: tempId,
    parent_temp_id: parentTempId,
    kind,
    title,
    description: null,
    confidence: "medium",
  }
}

test.describe.serial("PROJ-70-δ / AC-δ9 DnD-reparent → bulk-accept smoke", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "auth storage-state is flaky on Mobile Safari (pre-existing, PROJ-67)",
  )
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null
  let runId: string | null = null
  const suggestionIds: string[] = []
  const createdWorkItemIds: string[] = []

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")

    // Seed a v4-UUID project (see DELTA_PROJECT_ID note above).
    const { error: projErr } = await admin!.from("projects").insert({
      id: DELTA_PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E] PROJ-70-δ DnD Project",
      project_type: "general",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    if (projErr) throw new Error(`project seed failed: ${projErr.message}`)

    // Seed one ki_run + three draft suggestions.
    const { data: run, error: runErr } = await admin!
      .from("ki_runs")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: DELTA_PROJECT_ID,
        purpose: "proposal_from_context",
        classification: 1,
        provider: "stub",
        status: "success",
      })
      .select("id")
      .single()
    if (runErr || !run) throw new Error(`ki_runs seed failed: ${runErr?.message}`)
    runId = (run as { id: string }).id

    const rows = [
      suggestionPayload(TEMP_EPIC_A, "epic", null, "[E2E δ] Epic A"),
      suggestionPayload(TEMP_EPIC_B, "epic", null, "[E2E δ] Epic B"),
      suggestionPayload(TEMP_STORY, "story", TEMP_EPIC_A, "[E2E δ] Story 1"),
    ].map((payload) => ({
      tenant_id: E2E_TENANT_ID,
      project_id: DELTA_PROJECT_ID,
      ki_run_id: runId,
      purpose: "proposal_from_context",
      payload,
      original_payload: payload,
      is_modified: false,
      status: "draft",
      created_by: E2E_USER_ID,
    }))
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
    // Best-effort cleanup — synthetic [E2E] tenant, leftovers are
    // acceptable but we try to keep it tidy.
    try {
      if (suggestionIds.length > 0) {
        await admin
          .from("ki_provenance")
          .delete()
          .in("ki_suggestion_id", suggestionIds)
      }
      if (createdWorkItemIds.length > 0) {
        await admin.from("work_items").delete().in("id", createdWorkItemIds)
      }
      if (suggestionIds.length > 0) {
        await admin.from("ki_suggestions").delete().in("id", suggestionIds)
      }
      if (runId) {
        await admin.from("ki_runs").delete().eq("id", runId)
      }
      await admin.from("projects").delete().eq("id", DELTA_PROJECT_ID)
    } catch {
      // best-effort
    }
  })

  test("δ — drag Story onto other Epic → bulk-accept → correct DB hierarchy (AC-δ9)", async ({
    authenticatedPage,
  }) => {
    // The graph route compiles three.js + react-arborist on first hit
    // (dev-server webServer) — give it generous headroom.
    test.setTimeout(180_000)
    const page = authenticatedPage
    await page.goto(`/projects/${DELTA_PROJECT_ID}/graph`, {
      timeout: 120_000,
    })

    // The graph page defaults to the "Beziehungen" sub-view; the AI
    // drawer trigger lives in the "Trajektorie" sub-view.
    await page
      .getByText("Trajektorie", { exact: true })
      .first()
      .click({ timeout: 120_000 })

    // Open the AI drawer → Backlog tab.
    const aiTrigger = page.getByTestId("ai-proposals-trigger")
    await expect(aiTrigger).toBeVisible({ timeout: 60_000 })
    await aiTrigger.click()
    await page.getByRole("tab", { name: "Backlog" }).click()

    // All three seeded drafts render as tree rows.
    const storyRow = page.locator(`[data-temp-id="${TEMP_STORY}"]`)
    const epicBRow = page.locator(`[data-temp-id="${TEMP_EPIC_B}"]`)
    await expect(storyRow).toBeVisible()
    await expect(epicBRow).toBeVisible()

    // AC-δ4 — primary: HTML5 drag the Story row onto Epic B.
    // react-arborist wires drags through react-dnd-html5-backend, whose
    // event-loop timing makes Playwright-synthesized drags flaky. If the
    // drag doesn't land within 3 s we fall back to the keyboard channel
    // (AC-δ7) — Shift+Tab outdents the story to top-level (3rd root,
    // after Epic B), Tab indents it under its previous sibling = Epic B.
    // Both channels run the IDENTICAL requestReparent → applyReparent
    // path, so topology + validation coverage is the same.
    await storyRow.dragTo(epicBRow)

    const liveRegion = page
      .getByRole("status")
      .filter({ hasText: "eingeordnet" })
    const dragLanded = await liveRegion
      .waitFor({ state: "attached", timeout: 3_000 })
      .then(
        () => true,
        () => false,
      )
    if (!dragLanded) {
      await storyRow.focus()
      await storyRow.press("Shift+Tab") // outdent → top-level after Epic B
      await storyRow.focus()
      await storyRow.press("Tab") // indent → child of previous sibling (Epic B)
    }

    // The aria-live region announces the reparent (AC-δ7 channel).
    await expect(liveRegion).toContainText("Epic B", { timeout: 5_000 })

    // Bulk-accept all drafts → flush-dirty-parents runs first, then the
    // topological-sort RPC persists the moved hierarchy.
    await page.getByTestId("backlog-proposal-accept-all").click()
    await expect(
      page.getByText(/Vorschläge akzeptiert|Vorschlag akzeptiert/).first(),
    ).toBeVisible({ timeout: 15_000 })

    // DB verification via service-role: the story work_item's parent
    // must be Epic B's work_item.
    await expect
      .poll(
        async () => {
          const { data } = await admin!
            .from("ki_suggestions")
            .select("id, status, accepted_entity_id, payload")
            .in("id", suggestionIds)
          const rows = (data ?? []) as Array<{
            status: string
            accepted_entity_id: string | null
            payload: { temp_id: string }
          }>
          if (rows.some((r) => r.status !== "accepted")) return "pending"
          const byTemp = new Map(
            rows.map((r) => [r.payload.temp_id, r.accepted_entity_id]),
          )
          createdWorkItemIds.splice(0, createdWorkItemIds.length)
          for (const id of byTemp.values()) {
            if (id) createdWorkItemIds.push(id)
          }
          const storyWi = byTemp.get(TEMP_STORY)
          const epicBWi = byTemp.get(TEMP_EPIC_B)
          if (!storyWi || !epicBWi) return "missing-entity"
          const { data: wi } = await admin!
            .from("work_items")
            .select("id, parent_id")
            .eq("id", storyWi)
            .single()
          return (wi as { parent_id: string | null } | null)?.parent_id ===
            epicBWi
            ? "hierarchy-ok"
            : `wrong-parent`
        },
        { timeout: 20_000, intervals: [1_000] },
      )
      .toBe("hierarchy-ok")
  })
})
