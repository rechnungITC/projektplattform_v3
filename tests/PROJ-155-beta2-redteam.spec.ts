import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, test } from "./fixtures/auth-fixture"
import {
  E2E_GANTT_DATES,
  E2E_GANTT_PROJECT_ID,
  E2E_GANTT_WP_DATED_ID,
  E2E_PROJECT_ID,
  E2E_TENANT_ID,
  E2E_USER_ID,
  E2E_VISUAL_PROJECT_ID,
} from "./fixtures/constants"

/**
 * PROJ-155-β.2 — `/qa`, Rot-Team über HTTP.
 *
 * Die Datenschicht ist im Live-Pentest gedeckt (V0–V8b, 12 Zusicherungen gegen
 * Prod: Nicht-Mitglied, fremdes Projekt, kaputte Kennung, Atomizität). Ungedeckt
 * war die **Route**: `POST …/schedule/apply` ist mit β.2 neu und hatte keinen
 * einzigen Auth-Gate-Test — dieselbe Lücke, die PROJ-45-βs QA an seinen fünf
 * neuen Routen fand.
 */

async function createAdminClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const APPLY = `/api/projects/${E2E_GANTT_PROJECT_ID}/schedule/apply`

const gueltigerRumpf = {
  kind: "work_item" as const,
  id: E2E_GANTT_WP_DATED_ID,
  start: "2026-03-16",
  end: "2026-03-24",
}

test.describe("PROJ-155-β.2 — Rot-Team über HTTP", () => {
  test.describe.configure({ mode: "serial" })

  test("R1: ohne Sitzung genau 307, und der Rumpf verrät nichts", async ({
    playwright,
    baseURL,
  }) => {
    const anon = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
      maxRedirects: 0,
    })
    try {
      const res = await anon.post(APPLY, { data: gueltigerRumpf })
      expect(res.status()).toBe(307)
      const body = await res.text()
      // Der Rumpf darf weder Projekt- noch Arbeitspaket-Kennung tragen.
      expect(body).not.toContain(E2E_GANTT_WP_DATED_ID)
      expect(body).not.toContain("shifts")
    } finally {
      await anon.dispose()
    }
  })

  /**
   * R2 — das Ziel muss ein **wirklich** fremdes Projekt sein.
   *
   * Live gemessen statt angenommen: der geteilte E2E-Nutzer ist Mandanten-Admin
   * in vier von fuenf Test-Mandanten (und Mandanten-Admins bekommen per
   * `isProjectEditAllowed` in **jedem** Projekt Schreibrecht). Der einzige
   * fremde Mandant ist die Visual-Spur aus PROJ-Y-143l — mit `E2E_PROJECT_ID`
   * haette der Vektor nur belegt, dass ein Berechtigter schreiben darf
   * (Klasse B-γ2 / PROJ-Y-114a).
   */
  test("R2: ein wirklich fremdes Projekt liefert 404 und schreibt nichts", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    const kontrolle = await admin!
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", "e2e00000-0000-4e2e-8e2e-000000000007")
      .eq("user_id", "e2e00000-0000-4e2e-8e2e-000000000001")
    // Ohne diese Vorbedingung wuerde der Vektor stillschweigend das Falsche pruefen.
    expect(kontrolle.data ?? []).toHaveLength(0)

    const vorher = await admin!
      .from("projects")
      .select("planned_start_date")
      .eq("id", E2E_VISUAL_PROJECT_ID)
      .maybeSingle()

    const res = await page.request.post(
      `/api/projects/${E2E_VISUAL_PROJECT_ID}/schedule/apply`,
      { data: gueltigerRumpf, failOnStatusCode: false },
    )
    // Lese-Absicht wird nicht verraten: 404, nicht 403.
    expect([403, 404], await res.text()).toContain(res.status())

    const nachher = await admin!
      .from("projects")
      .select("planned_start_date")
      .eq("id", E2E_VISUAL_PROJECT_ID)
      .maybeSingle()
    expect(nachher.data?.planned_start_date).toBe(
      vorher.data?.planned_start_date,
    )
  })

  test("R3: eine kaputte Projekt-Kennung wird abgewiesen, nicht geraten", async ({
    ganttTenantPage: page,
  }) => {
    const res = await page.request.post(
      "/api/projects/nicht-eine-uuid/schedule/apply",
      { data: gueltigerRumpf, failOnStatusCode: false },
    )
    expect(res.status()).toBe(400)
  })

  test("R4/R5/R6: Rumpf-Validierung — kein JSON, Injektion im Datum, fehlendes Zieldatum", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    const kaputt = await page.request.post(APPLY, {
      data: "kein json",
      headers: { "Content-Type": "application/json" },
      failOnStatusCode: false,
    })
    expect(kaputt.status()).toBe(400)

    // R5: Injektionsversuch im Datum. Erwartet wird eine Abweisung durch das
    // Schema — nicht, dass die Datenbank es „schon abfängt".
    const injektion = await page.request.post(APPLY, {
      data: {
        ...gueltigerRumpf,
        start: "2026-03-16'; update work_items set planned_start = null; --",
      },
      failOnStatusCode: false,
    })
    expect(injektion.status()).toBe(400)

    // R6: Meilenstein ohne Zieldatum (die `refine`-Regel).
    const ohneZiel = await page.request.post(APPLY, {
      data: { kind: "milestone", id: E2E_GANTT_WP_DATED_ID },
      failOnStatusCode: false,
    })
    expect(ohneZiel.status()).toBe(400)

    // Gegenprobe: nichts von den drei Versuchen hat geschrieben.
    const nachher = await admin!
      .from("work_items")
      .select("planned_start, planned_end")
      .eq("id", E2E_GANTT_WP_DATED_ID)
      .single()
    expect(nachher.data!.planned_start).toBe(E2E_GANTT_DATES.wpDated.start)
    expect(nachher.data!.planned_end).toBe(E2E_GANTT_DATES.wpDated.end)
  })

  /**
   * R7 — die Projekt-Kennung in der Adresse darf nicht dekorativ sein.
   *
   * Der Fall wird **geseedet**, weil live gemessen kein anderes Test-Projekt
   * Arbeitspakete traegt (fuenf geprueft, alle leer) — und danach wieder
   * entfernt, mit lautem Fehlschlag statt verschluckter Antwort (PROJ-Y-143o).
   */
  test("R7: ein projektfremder Knoten wird abgewiesen — die Adresse ist nicht dekorativ", async ({
    ganttTenantPage: page,
  }) => {
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt.")

    const angelegt = await admin!
      .from("work_items")
      .insert({
        tenant_id: E2E_TENANT_ID,
        project_id: E2E_PROJECT_ID,
        kind: "work_package",
        title: "[QA β.2] projektfremdes Ziel",
        status: "todo",
        planned_start: "2026-05-04",
        planned_end: "2026-05-08",
        created_by: E2E_USER_ID,
      })
      .select("id, planned_start")
      .single()
    expect(angelegt.error, JSON.stringify(angelegt.error)).toBeNull()
    const fremdId = angelegt.data!.id

    try {
      const res = await page.request.post(APPLY, {
        data: {
          kind: "work_item",
          id: fremdId,
          start: "2026-03-16",
          end: "2026-03-24",
        },
        failOnStatusCode: false,
      })
      expect(res.status(), await res.text()).toBeGreaterThanOrEqual(400)

      const nachher = await admin!
        .from("work_items")
        .select("planned_start")
        .eq("id", fremdId)
        .single()
      expect(nachher.data!.planned_start).toBe("2026-05-04")
    } finally {
      const weg = await admin!.from("work_items").delete().eq("id", fremdId)
      expect(weg.error, JSON.stringify(weg.error)).toBeNull()
    }
  })
})
