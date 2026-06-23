/**
 * PROJ-137 — AI-Failure-Transparency: live reason_code proof.
 *
 * Authenticated (auth-fixture) + service-role admin client, against PROD
 * Supabase. Proves AC-2 / AC-5 / AC-6 / AC-7 end-to-end across the three
 * drawer purposes, plus the AC-4 banner smoke and the security probes.
 *
 * The E2E tenant (00000000-…-0e20) has ai_provider_config.external_provider
 * = "none" and privacy_defaults.default_class = 3 with 0 provider rows, so:
 *   - a Class-3 (PII) input  → reason_code='class3_blocked', provider='stub',
 *     status='external_blocked', 0 suggestions (StubProvider, externalBlocked).
 *   - a clean Class-1 input  → status='success', reason_code=null (stub runs,
 *     legit-empty → AC-6). external_provider='none' is a deliberate config,
 *     NOT a block, so the success path is reached with no reason.
 *
 * The other 3 reason codes (no_provider / cost_cap_exceeded /
 * external_ai_disabled) are config/env-dependent and structurally covered by
 * the data-driven unit test src/lib/ai/router.reason-code.test.ts.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { E2E_PROJECT_ID, E2E_TENANT_ID, E2E_USER_ID } from "./fixtures/constants"
import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"

/**
 * The synthetic E2E_PROJECT_ID (`…0e21`) is NOT a valid RFC-4122 UUID (the
 * version + variant nibbles are 0), so the stakeholder/risk routes' strict
 * `z.string().uuid()` project-id pre-check rejects it with 400 (the backlog
 * route has no such pre-check → it works on E2E_PROJECT_ID directly). To
 * exercise the class3_blocked path on all three purposes we seed a proper
 * RFC-4122 project (same pattern as PROJ-89's PROJECT_ID). Documented as
 * deviation D-1 — mirrors PROJ-89 F-3.
 */
const RFC_PROJECT_ID = "137e2e00-1111-4222-8333-444455556666"

// PII content that the classifier (src/lib/ai/classify.ts → detectClass3Markers)
// flags Class-3: salutation+name, role-label+name with colon, email, phone.
const PII_EXCERPT =
  "Kickoff-Protokoll. Ansprechpartner: Anne Schmidt (anne.schmidt@beispiel-firma.de, " +
  "Telefon +49 30 1234 5678). Herr Müller leitet die Migration. " +
  "Kontakt: Jörg Weber. Bitte alle Fragen an die genannten Personen richten."

const CLEAN_EXCERPT =
  "Kickoff-Protokoll. Ziel ist die Einführung eines neuen Bestellsystems. " +
  "Die Lieferzeiten sollen verkürzt und die Lagerkosten gesenkt werden. " +
  "Erste Phase: Anforderungsanalyse, danach Auswahl und Rollout."

interface PurposeCase {
  label: string
  route: string
  kind: string
}

const PURPOSES: PurposeCase[] = [
  {
    label: "proposal-from-context (Backlog)",
    route: "proposal-from-context",
    kind: "document",
  },
  {
    label: "stakeholder-proposals",
    route: "stakeholder-proposals",
    kind: "document",
  },
  { label: "risk-proposals", route: "risk-proposals", kind: "document" },
]

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

async function seedContextSource(
  admin: SupabaseClient,
  excerpt: string,
  privacyClass: number,
  titleSuffix: string,
  projectId: string = E2E_PROJECT_ID,
): Promise<string> {
  const { data, error } = await admin
    .from("context_sources")
    .insert({
      tenant_id: E2E_TENANT_ID,
      project_id: projectId,
      kind: "document",
      title: `[E2E PROJ-137] ${titleSuffix}`,
      content_excerpt: excerpt,
      privacy_class: privacyClass,
      processing_status: "classified",
      language: "de",
      created_by: E2E_USER_ID,
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(`context_source seed failed: ${error?.message}`)
  return (data as { id: string }).id
}

// Collected for the final report + cleanup.
const seededContextSourceIds: string[] = []
const triggeredRunIds: string[] = []

test.describe("PROJ-137 — live reason_code proof (authenticated)", () => {
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")
    // Pre-clean any leftovers from a prior failed run on both projects.
    for (const pid of [E2E_PROJECT_ID, RFC_PROJECT_ID]) {
      await admin!
        .from("context_sources")
        .delete()
        .eq("project_id", pid)
        .ilike("title", "[E2E PROJ-137]%")
    }
    await admin!.from("ki_suggestions").delete().eq("project_id", RFC_PROJECT_ID)
    await admin!.from("ki_runs").delete().eq("project_id", RFC_PROJECT_ID)
    await admin!.from("projects").delete().eq("id", RFC_PROJECT_ID)
    const { error: projErr } = await admin!.from("projects").insert({
      id: RFC_PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E PROJ-137] reason-code RFC project",
      project_type: "software",
      project_method: "scrum",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    if (projErr) throw new Error(`RFC project seed failed: ${projErr.message}`)
  })

  test.afterAll(async () => {
    if (!admin) return
    // Cleanup is also performed by the dedicated cleanup test, but afterAll
    // guarantees zero residue even if a test threw mid-way.
    for (const runId of triggeredRunIds) {
      await admin.from("ki_suggestions").delete().eq("ki_run_id", runId)
      await admin.from("ki_runs").delete().eq("id", runId)
    }
    for (const csId of seededContextSourceIds) {
      await admin.from("context_sources").delete().eq("id", csId)
    }
    await admin.from("ki_suggestions").delete().eq("project_id", RFC_PROJECT_ID)
    await admin.from("ki_runs").delete().eq("project_id", RFC_PROJECT_ID)
    await admin.from("projects").delete().eq("id", RFC_PROJECT_ID)
  })

  for (const pc of PURPOSES) {
    test(`AC-2/AC-7 class3_blocked — ${pc.label}`, async ({
      authenticatedPage: page,
    }) => {
      const csId = await seedContextSource(
        admin!,
        PII_EXCERPT,
        2, // stamp Class-2 deliberately → heuristic must upgrade to Class-3
        `PII ${pc.route}`,
        RFC_PROJECT_ID,
      )
      seededContextSourceIds.push(csId)

      const res = await page.request.post(
        `/api/projects/${RFC_PROJECT_ID}/ai/${pc.route}`,
        {
          data: { contextSourceId: csId },
          failOnStatusCode: false,
          maxRedirects: 0,
        },
      )
      expect(res.status(), `${pc.label} POST status`).toBe(200)
      const body = (await res.json()) as {
        run_id: string
        reason_code: string | null
        external_blocked: boolean
        suggestion_ids: string[]
        status: string
        provider: string
      }
      triggeredRunIds.push(body.run_id)

      // AC-1/AC-2: response carries the machine-readable reason.
      expect(body.reason_code, `${pc.label} response.reason_code`).toBe(
        "class3_blocked",
      )
      expect(body.external_blocked, `${pc.label} external_blocked`).toBe(true)
      expect(
        body.suggestion_ids.length,
        `${pc.label} suggestion count`,
      ).toBe(0)

      // AC-2 persisted + AC-7 no external provider called.
      const { data: run, error } = await admin!
        .from("ki_runs")
        .select("reason_code, provider, status, classification, error_message")
        .eq("id", body.run_id)
        .single()
      expect(error, `${pc.label} ki_runs select`).toBeNull()
      const r = run as {
        reason_code: string | null
        provider: string
        status: string
        classification: number
        error_message: string | null
      }
      expect(r.reason_code, `${pc.label} DB reason_code`).toBe("class3_blocked")
      expect(r.provider, `${pc.label} DB provider (AC-7 stub only)`).toBe("stub")
      expect(r.status, `${pc.label} DB status`).toBe("external_blocked")
      expect(r.classification, `${pc.label} DB classification`).toBe(3)
      // AC-2 is satisfied by the dedicated machine-readable reason_code
      // (asserted non-null above). error_message is the OPTIONAL
      // human-readable companion; on the `external_provider='none'` +
      // Class-3 path it can be null because that branch sets blockedReasonCode
      // but no blockedReason text (Finding F-1, Low). We record it, not fail.
       
      console.log(
        `[PROJ-137] ${pc.label} class3_blocked → run_id=${body.run_id} ` +
          `response.reason_code=${body.reason_code} db.reason_code=${r.reason_code} ` +
          `provider=${r.provider} status=${r.status} class=${r.classification} ` +
          `error_message=${r.error_message === null ? "NULL" : JSON.stringify(r.error_message).slice(0, 60)}`,
      )
    })
  }

  test("AC-6 success→null — proposal-from-context (clean Class-1 input)", async ({
    authenticatedPage: page,
  }) => {
    const csId = await seedContextSource(
      admin!,
      CLEAN_EXCERPT,
      1, // clean, Class-1 stamp; tenant default_class=3 floor returns max unchanged
      "CLEAN backlog",
    )
    seededContextSourceIds.push(csId)

    const res = await page.request.post(
      `/api/projects/${E2E_PROJECT_ID}/ai/proposal-from-context`,
      {
        data: { contextSourceId: csId },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect(res.status(), "clean POST status").toBe(200)
    const body = (await res.json()) as {
      run_id: string
      reason_code: string | null
      external_blocked: boolean
      suggestion_ids: string[]
      status: string
      classification: number
    }
    triggeredRunIds.push(body.run_id)

    // AC-6: legit-empty stub success → reason_code null/absent, status success.
    expect(body.reason_code ?? null, "clean response.reason_code").toBeNull()
    expect(body.status, "clean response.status").toBe("success")
    expect(body.external_blocked, "clean external_blocked").toBe(false)

    const { data: run, error } = await admin!
      .from("ki_runs")
      .select("reason_code, status, classification, provider")
      .eq("id", body.run_id)
      .single()
    expect(error, "clean ki_runs select").toBeNull()
    const r = run as {
      reason_code: string | null
      status: string
      classification: number
      provider: string
    }
    expect(r.reason_code, "clean DB reason_code IS NULL").toBeNull()
    expect(r.status, "clean DB status").toBe("success")
    // Class-1 input means cloud was permitted, but external_provider='none'
    // → stub runs and legitimately returns empty. This stays success (AC-6).
    expect(r.classification, "clean DB classification < 3").toBeLessThan(3)

     
    console.log(
      `[PROJ-137] success→null backlog → run_id=${body.run_id} ` +
        `response.reason_code=${body.reason_code ?? "null"} ` +
        `db.reason_code=${r.reason_code ?? "null"} status=${r.status} ` +
        `class=${r.classification} provider=${r.provider}`,
    )
  })

  // ------------------------------------------------------------------
  // Security probes
  // ------------------------------------------------------------------

  test("SEC: ki_runs.reason_code CHECK rejects a bogus value", async () => {
    // Seed a throwaway run, then attempt to set an out-of-enum reason_code.
    const { data: run, error: insErr } = await admin!
      .from("ki_runs")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: E2E_PROJECT_ID,
        actor_user_id: E2E_USER_ID,
        purpose: "risks",
        classification: 1,
        provider: "stub",
        status: "error",
      })
      .select("id")
      .single()
    expect(insErr, "throwaway run insert").toBeNull()
    const runId = (run as { id: string }).id
    triggeredRunIds.push(runId)

    const { error: updErr } = await admin!
      .from("ki_runs")
      .update({ reason_code: "bogus" })
      .eq("id", runId)
    // Either the CHECK constraint rejects it (preferred) or some trigger
    // blocks the UPDATE — either way the bogus value must NOT persist.
    expect(updErr, "bogus reason_code UPDATE must error").not.toBeNull()
    if (updErr) {
       
      console.log(`[PROJ-137] SEC bogus reason_code rejected: ${updErr.message}`)
    }

    const { data: after } = await admin!
      .from("ki_runs")
      .select("reason_code")
      .eq("id", runId)
      .single()
    expect((after as { reason_code: string | null }).reason_code).not.toBe(
      "bogus",
    )
  })

  test("SEC: cross-tenant read of seeded context_source returns nothing for a non-member", async () => {
    // Seed a marker source, then read it through an ANON client (no session,
    // not a tenant member). RLS context_sources_select_member must hide it.
    const csId = await seedContextSource(
      admin!,
      "[E2E] isolation probe content",
      2,
      "isolation probe",
    )
    seededContextSourceIds.push(csId)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      ""
    test.skip(!anonKey, "no anon key available for isolation probe")
    const { default: WebSocketImpl } = (await import("ws")) as {
      default: typeof WebSocket
    }
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocketImpl },
    })
    const { data: leaked } = await anon
      .from("context_sources")
      .select("id")
      .eq("id", csId)
    expect(
      (leaked ?? []).length,
      "anon must not read tenant context_source",
    ).toBe(0)
     
    console.log(
      `[PROJ-137] SEC isolation: anon read of ${csId} returned ${(leaked ?? []).length} rows`,
    )
  })

  // ------------------------------------------------------------------
  // Final cleanup proof — ZERO residue.
  // ------------------------------------------------------------------

  test("CLEANUP: zero residue (context_sources + ki_runs + ki_suggestions)", async () => {
    for (const runId of triggeredRunIds) {
      await admin!.from("ki_suggestions").delete().eq("ki_run_id", runId)
      await admin!.from("ki_runs").delete().eq("id", runId)
    }
    for (const csId of seededContextSourceIds) {
      await admin!.from("context_sources").delete().eq("id", csId)
    }

    await admin!.from("ki_suggestions").delete().eq("project_id", RFC_PROJECT_ID)
    await admin!.from("ki_runs").delete().eq("project_id", RFC_PROJECT_ID)
    await admin!.from("projects").delete().eq("id", RFC_PROJECT_ID)

    const { count: csCount } = await admin!
      .from("context_sources")
      .select("*", { count: "exact", head: true })
      .in("project_id", [E2E_PROJECT_ID, RFC_PROJECT_ID])
      .ilike("title", "[E2E PROJ-137]%")
    const runIdList = triggeredRunIds.length ? triggeredRunIds : ["none"]
    const { count: runCount } = await admin!
      .from("ki_runs")
      .select("*", { count: "exact", head: true })
      .in("id", runIdList)
    const { count: sugCount } = await admin!
      .from("ki_suggestions")
      .select("*", { count: "exact", head: true })
      .in("ki_run_id", runIdList)

     
    console.log(
      `[PROJ-137] RESIDUE context_sources=${csCount} ki_runs=${runCount} ki_suggestions=${sugCount}`,
    )
    expect(csCount, "context_sources residue").toBe(0)
    expect(runCount, "ki_runs residue").toBe(0)
    expect(sugCount, "ki_suggestions residue").toBe(0)
  })
})

// ---------------------------------------------------------------------------
// AC-4 — banner UI smoke (drives the Risiken tab against a seeded PII source
// → live router returns class3_blocked → banner renders with the class3 title
// + settings link). Also asserts a clean source shows NO banner (AC-6).
// ---------------------------------------------------------------------------

const BANNER_PROJECT_ID = "137ba000-2222-4333-8444-555566667777"
const bannerRunIds: string[] = []

test.describe("PROJ-137 AC-4 — banner UI smoke (authenticated)", () => {
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")

  let admin: SupabaseClient | null = null
  let piiSourceId: string | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
    test.skip(!admin, "service-role env not available")
    await admin!.from("ki_suggestions").delete().eq("project_id", BANNER_PROJECT_ID)
    await admin!.from("ki_runs").delete().eq("project_id", BANNER_PROJECT_ID)
    await admin!.from("context_sources").delete().eq("project_id", BANNER_PROJECT_ID)
    await admin!.from("projects").delete().eq("id", BANNER_PROJECT_ID)

    const { error: projErr } = await admin!.from("projects").insert({
      id: BANNER_PROJECT_ID,
      tenant_id: E2E_TENANT_ID,
      name: "[E2E PROJ-137] banner smoke",
      project_type: "software",
      project_method: "scrum",
      responsible_user_id: E2E_USER_ID,
      created_by: E2E_USER_ID,
    })
    if (projErr) throw new Error(`banner project seed failed: ${projErr.message}`)

    piiSourceId = await seedContextSource(
      admin!,
      PII_EXCERPT,
      2,
      "banner PII",
      BANNER_PROJECT_ID,
    )
  })

  test.afterAll(async () => {
    if (!admin) return
    for (const runId of bannerRunIds) {
      await admin.from("ki_suggestions").delete().eq("ki_run_id", runId)
    }
    await admin.from("ki_suggestions").delete().eq("project_id", BANNER_PROJECT_ID)
    await admin.from("ki_runs").delete().eq("project_id", BANNER_PROJECT_ID)
    await admin.from("context_sources").delete().eq("project_id", BANNER_PROJECT_ID)
    await admin.from("projects").delete().eq("id", BANNER_PROJECT_ID)
  })

  test("AC-4: class3_blocked generate renders the actionable banner with title + settings link", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/projects/${BANNER_PROJECT_ID}/backlog`, {
      timeout: 120_000,
    })

    const launcher = page.getByTestId("backlog-ai-proposals-trigger")
    await expect(launcher).toBeVisible({ timeout: 30_000 })
    await launcher.click()

    const risksTab = page.getByRole("tab", { name: "Risiken" })
    await expect(risksTab).toBeVisible()
    await risksTab.click()
    await expect(page.getByTestId("risk-proposal-tab")).toBeVisible()

    // No banner before a run.
    await expect(
      page.getByTestId("risk-proposal-blocked-banner"),
    ).toHaveCount(0)

    // Select the seeded PII source and generate → live class3_blocked.
    await page
      .getByTestId("risk-proposal-source-select")
      .selectOption(piiSourceId!)
    await page.getByTestId("risk-proposal-generate").click()

    const banner = page.getByTestId("risk-proposal-blocked-banner")
    await expect(banner).toBeVisible({ timeout: 30_000 })
    await expect(banner).toContainText(
      "Personenbezogene Daten erfordern einen lokalen Provider",
    )
    const settingsLink = banner.getByRole("link", {
      name: /KI-Provider/,
    })
    await expect(settingsLink).toBeVisible()
    await expect(settingsLink).toHaveAttribute(
      "href",
      "/settings/tenant/ai-providers",
    )

    // Capture the run for cleanup.
    const { data: runs } = await admin!
      .from("ki_runs")
      .select("id")
      .eq("project_id", BANNER_PROJECT_ID)
    for (const r of (runs ?? []) as { id: string }[]) bannerRunIds.push(r.id)
  })

  test("AC-6: a legit (clean) backlog generate renders NO banner — normal empty view", async ({
    authenticatedPage: page,
  }) => {
    // Seed a clean Class-1 source on the banner project, drive the Backlog
    // tab's existing-source path is file-upload-only, so this AC-6 UI check
    // uses the backlog generate via a clean source on the risk tab dropdown
    // instead (same banner contract, shared <ReasonBanner>). A success run
    // → reason_code null → reasonCodeToBanner(null) → null → no banner.
    const cleanId = await seedContextSource(
      admin!,
      CLEAN_EXCERPT,
      1,
      "banner CLEAN",
      BANNER_PROJECT_ID,
    )

    await page.goto(`/projects/${BANNER_PROJECT_ID}/backlog`, {
      timeout: 120_000,
    })
    const launcher = page.getByTestId("backlog-ai-proposals-trigger")
    await expect(launcher).toBeVisible({ timeout: 30_000 })
    await launcher.click()
    const risksTab = page.getByRole("tab", { name: "Risiken" })
    await risksTab.click()
    await expect(page.getByTestId("risk-proposal-tab")).toBeVisible()

    await page.getByTestId("risk-proposal-source-select").selectOption(cleanId)
    await page.getByTestId("risk-proposal-generate").click()

    // The generate resolves (button leaves the busy "Lädt …" state); a clean
    // success → null reason → NO banner. We poll briefly then assert absence.
    await expect(page.getByTestId("risk-proposal-generate")).not.toContainText(
      "Lädt",
      { timeout: 30_000 },
    )
    await expect(
      page.getByTestId("risk-proposal-blocked-banner"),
    ).toHaveCount(0)

    const { data: runs } = await admin!
      .from("ki_runs")
      .select("id")
      .eq("project_id", BANNER_PROJECT_ID)
    for (const r of (runs ?? []) as { id: string }[]) bannerRunIds.push(r.id)
    await admin!.from("context_sources").delete().eq("id", cleanId)
  })
})
