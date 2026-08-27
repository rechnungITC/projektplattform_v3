import { createClient } from "@supabase/supabase-js"
import { expect, test } from "./fixtures/auth-fixture"
import {
  E2E_CHAT_PROJECT_ID,
  E2E_CHAT_TENANT_ID,
  E2E_USER_ID,
} from "./fixtures/constants"

/**
 * PROJ-Y-151b — die authentifizierte Kette des Projekt-Chats durch die
 * Oberfläche.
 *
 * ABGRENZUNG, damit klar ist, was dieser Spec belegt und was nicht: die Lane
 * hat bewusst KEINEN KI-Anbieter (siehe `E2E_CHAT_TENANT_ID` in constants.ts).
 * Der echte Anbieter-Durchlauf ist `scripts/verify-prod-chat-roundtrip.mjs`,
 * auf Zuruf und gegen die deployte Anwendung. Hier geht es um den Weg:
 * erreichbare Fläche, angelegte Unterhaltung, gesendete Frage, persistierte
 * Nachricht — und darum, dass eine LEERE Antwort erklärt wird statt als
 * stille Leerfläche zu erscheinen (AC-151H.4, PROJ-137-Erbe).
 */

const CHAT_URL = `/projects/${E2E_CHAT_PROJECT_ID}/ki-chat`

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

test.describe("PROJ-Y-151b — KI-Chat, authentifizierte Kette", () => {
  test.afterAll(async () => {
    // Laufbezogene Zeilen entfernen. Der Lane-Mandant bleibt (Fixture).
    const db = admin()
    if (!db) return
    await db.from("ai_chat_messages").delete().eq("tenant_id", E2E_CHAT_TENANT_ID)
    await db.from("ai_chat_conversations").delete().eq("tenant_id", E2E_CHAT_TENANT_ID)
    await db.from("ki_runs").delete().eq("tenant_id", E2E_CHAT_TENANT_ID)
  })

  test("Reiter erreichbar, Vertraulichkeit ausgesprochen", async ({
    chatTenantPage: page,
  }) => {
    await page.goto(CHAT_URL)
    // L2 steht in der Oberfläche, nicht nur in der Datenbank — ein Nutzer, der
    // nicht weiß, dass niemand mitliest, benutzt die Fläche anders.
    await expect(
      page.getByText("Nur für dich sichtbar — auch nicht für die Projektleitung."),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Neue Unterhaltung" })).toBeVisible()
  })

  test("Frage senden: Nachricht persistiert, leere Antwort wird erklärt", async ({
    chatTenantPage: page,
  }) => {
    await page.goto(CHAT_URL)
    await page.getByRole("button", { name: "Neue Unterhaltung" }).click()

    const question = "Worum geht es in diesem Projekt?"
    await page.getByPlaceholder("Frage zu diesem Projekt …").fill(question)
    await page.getByRole("button", { name: "Frage senden" }).click()

    // Die eigene Frage erscheint im Verlauf …
    await expect(page.getByText(question)).toBeVisible({ timeout: 30_000 })
    // … und die leere Antwort wird BENANNT. Ohne diese Zusicherung wäre der
    // Test auch mit einer stillen Leerfläche grün — genau der Zustand, gegen
    // den PROJ-137 angetreten ist.
    await expect(page.getByText("Keine Antwort erhalten")).toBeVisible({
      timeout: 30_000,
    })

    // Gegenprobe in der Datenbank: die Zeile gehört wirklich diesem Nutzer und
    // diesem Projekt. Der Bildschirm allein belegt keine Persistenz.
    const db = admin()
    test.skip(!db, "SUPABASE_SERVICE_ROLE_KEY fehlt")
    const { data } = await db!
      .from("ai_chat_messages")
      .select("role, content, user_id, project_id")
      .eq("tenant_id", E2E_CHAT_TENANT_ID)
      .eq("role", "user")
    expect(data?.length ?? 0).toBeGreaterThan(0)
    expect(data![0].content).toBe(question)
    expect(data![0].user_id).toBe(E2E_USER_ID)
    expect(data![0].project_id).toBe(E2E_CHAT_PROJECT_ID)
  })

  test("Class-3-Hinweis warnt, sperrt aber nicht (L3)", async ({
    chatTenantPage: page,
  }) => {
    await page.goto(CHAT_URL)
    await page.getByRole("button", { name: "Neue Unterhaltung" }).click()

    await page
      .getByPlaceholder("Frage zu diesem Projekt …")
      .fill("Was hat thomas.meier@example.com dazu gesagt?")

    await expect(
      page.getByText("Möglicherweise personenbezogene Daten"),
    ).toBeVisible({ timeout: 30_000 })

    // Die tragende Hälfte: der Hinweis ist ein HINWEIS. Wäre „Senden" hier
    // gesperrt, belegte der Test das Gegenteil des Locks — L3 sagt
    // ausdrücklich warnen, nicht riegeln, und die Entscheidung bleibt beim
    // Nutzer. Die Klassifikation wirkt danach im Router, nicht in der Maske.
    await expect(page.getByRole("button", { name: "Frage senden" })).toBeEnabled()
  })
})
