import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import { E2E_TENANT_ID, E2E_USER_ID } from "./fixtures/constants"

const PROJECT_NAME = "[E2E Y5a] Vollständiger Wizard-Flow"
const MANUAL_CONTEXT =
  "Die Einführung erfolgt in zwei Wellen; Abnahme und Datenmigration bleiben getrennte Entscheidungen."

async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

test.describe("PROJ-Y-5a / vollständiger Projektkontext-Flow", () => {
  test.skip(!hasAuthStorageState(), "no auth storage state provisioned")
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Der schreibende Live-Flow läuft genau einmal; responsive/cross-browser bleibt read-only.",
  )

  let admin: SupabaseClient | null = null
  let draftId: string | null = null
  let projectId: string | null = null

  test.beforeAll(async () => {
    admin = await createAdminClient()
  })

  test.afterAll(async () => {
    if (!admin) return
    if (projectId) {
      await admin.from("ki_runs").delete().eq("project_id", projectId)
      await admin.from("projects").delete().eq("id", projectId)
    }
    if (draftId) {
      await admin.from("project_wizard_drafts").delete().eq("id", draftId)
    }
  })

  test("manuell erfassen → Review → atomar anlegen → Projektdokument lesen", async ({
    authenticatedPage,
  }) => {
    test.setTimeout(240_000)
    test.skip(!admin, "service-role env not available")

    const { data: draft, error } = await admin!
      .from("project_wizard_drafts")
      .insert({
        tenant_id: E2E_TENANT_ID,
        created_by: E2E_USER_ID,
        name: PROJECT_NAME,
        project_type: "general",
        project_method: null,
        data: {
          name: PROJECT_NAME,
          description: "QA-Projekt für den vollständigen PROJ-Y-5a-Browserfluss.",
          project_type: "general",
          project_method: null,
          responsible_user_id: E2E_USER_ID,
          type_specific_data: {},
          skills: { assignments: [] },
          ki_backlog: { enabled: false, context_source_id: null, filename: null },
        },
      })
      .select("id")
      .single()
    if (error || !draft) throw new Error(`draft seed failed: ${error?.message}`)
    draftId = draft.id

    const page = authenticatedPage
    await page.goto(`/projects/new/wizard?draftId=${draftId}`, { timeout: 120_000 })
    await expect(page.getByLabel(/Projektname/)).toHaveValue(PROJECT_NAME, {
      timeout: 120_000,
    })

    const currentStep = () =>
      page.locator('[aria-label="Wizard-Schritte"] button[aria-current="step"]')
    const next = async () => {
      await page.getByRole("button", { name: "Weiter", exact: true }).click()
    }

    await next()
    await expect(currentStep()).toContainText("Projekttyp")
    await next()
    await expect(currentStep()).toContainText("Methode")
    await next()
    await expect(currentStep()).toContainText("Detail-Fragen")
    await next()
    await expect(currentStep()).toContainText("Skills")
    await next()

    await expect(currentStep()).toContainText("Projektkontext")
    await expect(page.getByTestId("project-context-manual-status")).toContainText(
      /erfasst, nicht KI-analysiert/i,
    )
    await expect(page.getByText("Keine Skills ausgewählt")).toBeVisible()
    await page.getByLabel("Projektkontext ergänzen").fill(MANUAL_CONTEXT)
    await page.getByRole("button", { name: "Aussage übernehmen" }).click()
    await expect(page.getByText(MANUAL_CONTEXT)).toBeVisible()
    await page.getByRole("button", { name: "Kontextdialog abschließen" }).click()
    await next()

    await expect(currentStep()).toContainText("Prüfen")
    await expect(page.getByTestId("wizard-review-project-context")).toContainText(
      "Erfasst, nicht KI-analysiert",
    )
    await expect(page.getByLabel("Bestätigte Zusammenfassung")).toHaveValue(
      MANUAL_CONTEXT,
    )

    await page.getByRole("button", { name: "Projekt anlegen" }).click()
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+/, { timeout: 120_000 })
    projectId = /\/projects\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? null
    expect(projectId).toBeTruthy()
    draftId = null

    await page.goto(`/projects/${projectId}/project-context`, { timeout: 120_000 })
    await expect(page.getByRole("heading", { name: "Projektkontext" })).toBeVisible()
    await expect(page.getByText(MANUAL_CONTEXT)).toBeVisible()
    await expect(page.getByText(/erfasst, nicht KI-analysiert/i)).toBeVisible()
  })
})
