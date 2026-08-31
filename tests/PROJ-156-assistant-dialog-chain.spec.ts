/**
 * PROJ-156 — die Dialogketten im echten Browser.
 *
 * Schliesst F-1 aus dem `/qa`-Durchgang: AC-156.34, .35 und .36 verlangen
 * woertlich authentifizierte Ende-zu-Ende-Nachweise, und die Slice kam ohne
 * eine einzige Playwright-Datei. Belegt war die *Mechanik* (103 Unit-/Routen-
 * tests, Live-Smoke 12/12 gegen Prod), **nicht die Verkettung** aus Eingabe,
 * Rueckfrage, Korrektur, Zusammenfassung und Persistenz. Das ist die
 * PROJ-135-Lehre: eine nicht ausgefuehrte E2E-Schicht ist ein offenes
 * Kriterium, keine Abweichung.
 *
 * Warum der Assistant-Mandant und nicht der geteilte: `AssistantLauncher`
 * haengt in der App-Huelle, ein aktives Modul setzt also einen `fixed`-Knopf
 * auf jede angemeldete Seite — genau das, was die Visual-Regression `fullPage`
 * fotografiert. Begruendung ausfuehrlich in `tests/fixtures/constants.ts`.
 *
 * Der Textpfad wird bewusst benutzt: AC-156.30 macht ihn dem Sprachpfad
 * gleichwertig, und Spracherkennung ist headless nicht fahrbar. Geprueft
 * werden Laufzeit, Tor und Persistenz — nicht das Mikrofon.
 *
 * Tragend sind in jedem Fall die **negativen** Zusicherungen: vor der Freigabe
 * existiert kein Wizard-Entwurf, vor der Bestaetigung kein Work-Item. Ohne sie
 * bewiese die Datei nur, dass ein Knopf eine Zeile anlegt — nicht, dass die
 * Freigabe ein Tor ist.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expect, hasAuthStorageState, test } from "./fixtures/auth-fixture"
import {
  E2E_ASSISTANT_PROJECT_ID,
  E2E_ASSISTANT_TENANT_ID,
  E2E_PROJECT_ID,
  E2E_USER_ID,
} from "./fixtures/constants"

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

/** Laufeindeutig, damit parallele oder wiederholte Laeufe nie kollidieren. */
const STAMP = `${Date.now()}`
const PROJECT_NAME = `Dialogprojekt ${STAMP}`
const PROJECT_NAME_FIXED = `Dialogprojekt korrigiert ${STAMP}`
const STORY_TITLE = `Rechnungsimport ${STAMP}`
/** Zwei Projekte, die beide auf denselben Suchbegriff passen (AC-156.35). */
const AMBIGUOUS_TOKEN = `Zwilling${STAMP}`

async function cleanup(admin: SupabaseClient) {
  await admin
    .from("project_wizard_drafts")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
    .like("name", `%${STAMP}%`)
  await admin
    .from("assistant_work_item_drafts")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
    .like("title", `%${STAMP}%`)
  await admin
    .from("work_items")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
    .like("title", `%${STAMP}%`)
  await admin
    .from("projects")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
    .like("name", `%${AMBIGUOUS_TOKEN}%`)
  // Wie in PROJ-Y-144d: die Action-Events der Routen tragen keine session_id,
  // die Sitzungs-Kaskade erreicht sie also nicht.
  await admin
    .from("assistant_action_events")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
  await admin
    .from("assistant_sessions")
    .delete()
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
  // `audit_log_entries` bleibt unangetastet — seit PROJ-130-α append-only.
}

/**
 * Der offene Auftrag des Fixture-Nutzers — ueber ALLE seine Sitzungen hinweg.
 *
 * Bewusst nicht „die neueste Sitzung": ein zweiter Browser-Tab legt eine
 * eigene Sitzung an (in Fall (e) gemessen), und ein Blick nur auf die neueste
 * las dann eine leere Fremdsitzung statt des tatsaechlich offenen Auftrags.
 * Genau daran ist Fall (f) im ersten Anlauf gescheitert.
 *
 * Diese Form trifft ausserdem die Bedeutung jeder Zusicherung dieser Datei
 * praeziser: „es gibt einen offenen Auftrag mit diesem Inhalt" bzw. — fuer
 * Abbruch und Mandantenwechsel — „es gibt gar keinen mehr".
 */
async function readDialogState(admin: SupabaseClient) {
  const { data } = await admin
    .from("assistant_sessions")
    .select("id, context, started_at")
    .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
    .eq("user_id", E2E_USER_ID)
    .order("started_at", { ascending: false })
  const rows = (data ?? []) as { id: string; context: Record<string, unknown> }[]
  const pending = rows.find((r) => r.context?.dialog_state != null)
  return {
    sessionId: pending?.id ?? rows[0]?.id ?? null,
    dialog: (pending?.context?.dialog_state ?? null) as Record<string, unknown> | null,
  }
}

async function openAssistant(page: Parameters<typeof test>[0] extends never ? never : any) {
  const launcher = page.getByRole("button", { name: "Assistant öffnen" })
  await expect(launcher).toBeVisible({ timeout: 30_000 })
  await launcher.click()
}

/**
 * Eine Eingabe abschicken und auf die Antwort des Servers warten.
 *
 * Ohne das Warten liest der naechste Datenbankgriff den Zustand VOR dem Zug —
 * der erste Lauf dieser Datei ist genau daran gescheitert (`slots.name` war
 * `null`, weil die Anfrage noch lief). Auf die Antwort zu warten ist praeziser
 * als eine feste Pause und macht den Test unabhaengig von der Maschine.
 */
async function say(page: any, text: string) {
  const answered = page.waitForResponse(
    (r: any) =>
      r.url().includes("/api/assistant/turns") &&
      r.request().method() === "POST",
    { timeout: 60_000 },
  )
  await page.getByPlaceholder("Assistant fragen").fill(text)
  await page.getByRole("button", { name: "Senden" }).click()
  await answered
}

/**
 * Ein Klick, der einen Serverzug ausloest, samt Warten auf dessen Antwort.
 * Gleiche Begruendung wie bei `say()`: ohne das Warten prueft die naechste
 * Zusicherung einen Zustand, den der Server noch gar nicht kennt.
 */
async function clickAndAwaitTurn(page: any, name: string | RegExp) {
  const answered = page.waitForResponse(
    (r: any) =>
      r.url().includes("/api/assistant/turns") &&
      r.request().method() === "POST",
    { timeout: 60_000 },
  )
  await page.getByRole("button", { name }).click()
  await answered
}

// Seriell: alle Faelle fahren dasselbe Overlay im selben Mandanten, und der
// Dialogzustand ist pro Nutzer genau einer.
test.describe.configure({ mode: "serial" })

test.describe("PROJ-156 / Dialogketten im Browser", () => {
  test.afterAll(async () => {
    const admin = await createAdminClient()
    if (admin) await cleanup(admin)
  })

  test("AC-156.34 — Projektkette: Befehl → Rückfragen → Korrektur → Zusammenfassung → genau ein Wizard-Entwurf", async ({
    assistantTenantPage: page,
  }) => {
    test.setTimeout(180_000)
    test.skip(!hasAuthStorageState(), "auth fixture not provisioned")
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt — Persistenz nicht pruefbar")
    if (!admin) return

    await cleanup(admin)

    await page.goto(`/projects/${E2E_ASSISTANT_PROJECT_ID}`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    })
    await openAssistant(page)

    // 1. Umgangssprachlicher Befehl, keine Felder mitgeliefert (AC-156.1/.12).
    await say(page, "Leg mir bitte ein neues Projekt an")

    // 2. Der Name wird zuerst erfragt — und es entsteht NOCH KEIN Entwurf.
    await expect(page.getByText("Wie soll das Projekt heißen?")).toBeVisible({
      timeout: 60_000,
    })
    const { data: afterCommand } = await admin
      .from("project_wizard_drafts")
      .select("id")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("name", `%${STAMP}%`)
    expect(
      afterCommand ?? [],
      "AC-156.12: der blosse Befehl darf keinen Wizard-Entwurf erzeugen",
    ).toHaveLength(0)

    // 3. Die Rückfragen beantworten. Der Dialog fragt Name, Typ, Methode und
    //    Kurzbeschreibung — jede Antwort füllt genau den offenen Slot
    //    (AC-156.8/.13), was der Dialogzustand in der DB belegt.
    await say(page, PROJECT_NAME)
    await expect(async () => {
      const afterName = await readDialogState(admin)
      expect(
        (afterName.dialog?.slots as Record<string, unknown> | undefined)?.name,
        "AC-156.8: die Antwort füllt genau den erfragten Slot",
      ).toBe(PROJECT_NAME)
    }).toPass({ timeout: 30_000 })

    // Die restlichen Slots über die angebotenen Schaltflächen bzw. Antworten
    // schliessen, bis die Zusammenfassung erscheint.
    // Der Fragefluss ist textbasiert — die Auswahlfelder gehoeren zur
    // Korrektur in der Zusammenfassung, nicht zur Rueckfrage. Es wird also
    // geantwortet, bis die Zusammenfassung steht. Die Antworten decken Typ,
    // Methode und Kurzbeschreibung ab; ueberzaehlige Zuege schaden nicht.
    const summary = page.getByRole("region", { name: "Projektentwurf prüfen" })
    const answers = ["Software", "Scrum", "Kurzbeschreibung aus dem Dialog", "weiter", "weiter"]
    for (const answer of answers) {
      if (await summary.isVisible().catch(() => false)) break
      await say(page, answer)
    }
    await expect(summary, "AC-156.16: vor der Anlage steht eine Zusammenfassung").toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText("Noch nicht angelegt")).toBeVisible()

    // 4. Korrektur aus der Zusammenfassung heraus (AC-156.16).
    await page.getByRole("button", { name: "Name ändern" }).click()
    await page.getByLabel("Name korrigieren").fill(PROJECT_NAME_FIXED)
    await clickAndAwaitTurn(page, "Übernehmen")
    // Auf die Zusammenfassung eingegrenzt und exakt: der korrigierte Name steht
    // auch im Bestaetigungssatz des Assistenten, eine unscharfe Suche traefe
    // beide und liefe in eine strict-mode-Verletzung.
    await expect(
      summary.getByText(PROJECT_NAME_FIXED, { exact: true }),
      "die Korrektur erscheint in der Zusammenfassung",
    ).toBeVisible({ timeout: 30_000 })

    // 5. DAS Tor: bis hierher existiert kein einziger Wizard-Entwurf.
    const { data: beforeApproval } = await admin
      .from("project_wizard_drafts")
      .select("id")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("name", `%${STAMP}%`)
    expect(
      beforeApproval ?? [],
      "AC-156.17: vor der Freigabe darf kein Wizard-Entwurf existieren",
    ).toHaveLength(0)

    // 6. Freigeben.
    await clickAndAwaitTurn(page, "Wizard-Entwurf vorbereiten")

    // 7. Genau ein Entwurf, mit dem korrigierten Namen — und ein Wizard-Link.
    // Der Weg in den Wizard ist eine Schaltflaeche, kein Anker — am
    // Seiten-Schnappschuss abgelesen statt aus der Spec geraten.
    await expect(
      page.getByRole("button", { name: /Entwurf prüfen/ }),
      "AC-156.17: die Antwort führt in den bestehenden Wizard",
    ).toBeVisible({ timeout: 60_000 })

    const { data: drafts } = await admin
      .from("project_wizard_drafts")
      .select("id, name, project_type, project_method, data")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("name", `%${STAMP}%`)
    expect(drafts ?? [], "AC-156.17: genau ein Entwurf").toHaveLength(1)
    expect(
      drafts?.[0]?.name,
      "die Korrektur aus Schritt 4 muss bis in die Zeile durchschlagen",
    ).toBe(PROJECT_NAME_FIXED)

    // 8. Und kein fertiges Projekt — der Wizard bleibt das Review-Tor.
    const { data: realProjects } = await admin
      .from("projects")
      .select("id")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("name", `%${STAMP}%`)
    expect(
      realProjects ?? [],
      "AC-156.17: es darf keine projects-Zeile entstehen",
    ).toHaveLength(0)
  })

  test("AC-156.35 — Story-Kette mit mehrdeutigem Projekt: Auswahl setzt den Auftrag fort", async ({
    assistantTenantPage: page,
  }) => {
    test.setTimeout(180_000)
    test.skip(!hasAuthStorageState(), "auth fixture not provisioned")
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt")
    if (!admin) return

    await cleanup(admin)

    // Zwei Projekte, die beide auf denselben Suchbegriff passen. Ohne echte
    // Mehrdeutigkeit prüft der Fall nur den Ein-Treffer-Pfad.
    const { data: seeded, error: seedError } = await admin
      .from("projects")
      .insert([
        {
          tenant_id: E2E_ASSISTANT_TENANT_ID,
          name: `${AMBIGUOUS_TOKEN} Nord`,
          project_method: "scrum",
          responsible_user_id: E2E_USER_ID,
          created_by: E2E_USER_ID,
        },
        {
          tenant_id: E2E_ASSISTANT_TENANT_ID,
          name: `${AMBIGUOUS_TOKEN} Süd`,
          project_method: "scrum",
          responsible_user_id: E2E_USER_ID,
          created_by: E2E_USER_ID,
        },
      ])
      .select("id, name")
    expect(seedError, `Seed fehlgeschlagen: ${seedError?.message ?? ""}`).toBeNull()
    expect(seeded ?? []).toHaveLength(2)
    const target = seeded!.find((p) => p.name.endsWith("Nord"))!

    await page.goto("/projects", { waitUntil: "networkidle", timeout: 120_000 })
    await openAssistant(page)

    // 1. Befehl mit Projektbezug in Satzmitte (AC-156.19) — Projekt mehrdeutig.
    await say(page, `Mach im Projekt ${AMBIGUOUS_TOKEN} eine Story für ${STORY_TITLE}`)

    // 2. Der Assistent rät nicht, sondern lässt wählen (AC-156.22).
    // Woertlich am Seiten-Schnappschuss abgelesen. Tragend ist ohnehin nicht
    // der Satz, sondern dass BEIDE Kandidaten zur Wahl stehen — daran haengt,
    // dass nicht geraten wurde.
    await expect(page.getByText("Ich habe mehrere passende Projekte gefunden.")).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      page.getByRole("button", { name: `${AMBIGUOUS_TOKEN} Nord` }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: `${AMBIGUOUS_TOKEN} Süd` }),
      "AC-156.22: beide Treffer werden angeboten, statt einen zu raten",
    ).toBeVisible()
    const { data: draftsBeforeChoice } = await admin
      .from("assistant_work_item_drafts")
      .select("id")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("title", `%${STAMP}%`)
    expect(
      draftsBeforeChoice ?? [],
      "vor der Auswahl darf kein Entwurf entstehen",
    ).toHaveLength(0)

    // 3. Auswahl SETZT DEN AUFTRAG FORT — sie navigiert nicht bloss.
    await clickAndAwaitTurn(page, target.name)

    await expect(
      page.getByText("Entwurf — noch nicht angelegt"),
      "AC-156.22: nach der Auswahl läuft der urspüngliche Auftrag weiter",
    ).toBeVisible({ timeout: 60_000 })

    // 4. Der Titel aus dem ersten Befehl hat die Auswahl überlebt (AC-156.20).
    const { data: draft } = await admin
      .from("assistant_work_item_drafts")
      .select("id, title, target_kind, project_id, status")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("title", `%${STAMP}%`)
    expect(draft ?? [], "genau ein PROJ-144-Entwurf").toHaveLength(1)
    expect(draft?.[0]?.project_id, "der Entwurf hängt am gewählten Projekt").toBe(target.id)
    expect(draft?.[0]?.target_kind, "Scrum → story").toBe("story")
    expect(draft?.[0]?.status).toBe("open")

    // 5. Vor der Bestätigung existiert kein Work-Item (AC-156.24).
    const { data: itemsBefore } = await admin
      .from("work_items")
      .select("id")
      .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
      .like("title", `%${STAMP}%`)
    expect(itemsBefore ?? []).toHaveLength(0)

    // 6. Ausdrückliche Bestätigung (PROJ-144-Tor bleibt bestehen).
    await page.getByRole("button", { name: /Story anlegen/ }).click()

    await expect(async () => {
      const { data: items } = await admin
        .from("work_items")
        .select("id, kind, project_id")
        .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
        .like("title", `%${STAMP}%`)
      expect(items ?? [], "AC-156.24: genau eine Story").toHaveLength(1)
      expect(items?.[0]?.kind).toBe("story")
      expect(items?.[0]?.project_id).toBe(target.id)
    }).toPass({ timeout: 60_000 })
  })

  test("AC-156.36 — Fortsetzung nach Reload, Abbruch, Ablauf und fremdes Projekt", async ({
    assistantTenantPage: page,
  }) => {
    test.setTimeout(180_000)
    test.skip(!hasAuthStorageState(), "auth fixture not provisioned")
    const admin = await createAdminClient()
    test.skip(!admin, "SUPABASE_SERVICE_ROLE_KEY fehlt")
    if (!admin) return

    await cleanup(admin)

    await page.goto(`/projects/${E2E_ASSISTANT_PROJECT_ID}`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    })
    await openAssistant(page)

    // --- (a) Fortsetzung nach echtem Reload -------------------------------
    await say(page, "Leg mir ein Projekt an")
    await expect(page.getByText("Wie soll das Projekt heißen?")).toBeVisible({
      timeout: 60_000,
    })

    await page.reload({ waitUntil: "networkidle", timeout: 120_000 })
    await openAssistant(page)
    await say(page, PROJECT_NAME)

    await expect(async () => {
      const afterReload = await readDialogState(admin)
      expect(
        (afterReload.dialog?.slots as Record<string, unknown> | undefined)?.name,
        "(a) der Auftrag überlebt einen echten Reload — React-State allein würde das nicht zeigen",
      ).toBe(PROJECT_NAME)
    }).toPass({ timeout: 30_000 })

    // --- (b) Abbruch räumt den Zustand serverseitig ------------------------
    await clickAndAwaitTurn(page, "Auftrag abbrechen")
    await expect(async () => {
      const state = await readDialogState(admin)
      expect(
        state.dialog,
        "(b) AC-156.9: Abbrechen löscht den Dialogzustand in der Datenbank",
      ).toBeNull()
    }).toPass({ timeout: 30_000 })

    // --- (c) Abgelaufener Auftrag wird nicht rekonstruiert -----------------
    //
    // Der Anker ist bewusst der Dialogzustand in der Datenbank, nicht der
    // Transkript-Text: das Overlay baut seinen Verlauf nach Abbruch und
    // Neustart neu auf, eine Textzusicherung wuerde damit die Darstellung
    // pruefen statt den Auftrag. Gemessen, nicht vermutet — der Transkript-
    // Ansatz scheiterte hier reproduzierbar, obwohl der Abbruch nachweislich
    // wirkte ("Alles klar, ich habe den offenen Auftrag abgebrochen.").
    await say(page, "Leg mir ein Projekt an")
    let pending = { sessionId: null as string | null, dialog: null as Record<string, unknown> | null }
    await expect(async () => {
      pending = await readDialogState(admin)
      expect(
        pending.dialog?.pending_intent,
        "(c) nach dem Abbruch startet ein frischer Auftrag",
      ).toBe("project_create_draft")
    }).toPass({ timeout: 60_000 })
    expect(pending.sessionId).not.toBeNull()

    // Ablauf ohne Zeitreise: den Zustand als abgelaufen stempeln. Der Weg über
    // die DB ist der ehrliche — 30 Minuten Wartezeit sind kein Test.
    const expired = { ...(pending.dialog ?? {}), expires_at: new Date(Date.now() - 60_000).toISOString() }
    await admin
      .from("assistant_sessions")
      .update({ context: { dialog_state: expired } })
      .eq("id", pending.sessionId!)

    await say(page, PROJECT_NAME)
    await expect(async () => {
      const { data: drafts } = await admin
        .from("project_wizard_drafts")
        .select("id")
        .eq("tenant_id", E2E_ASSISTANT_TENANT_ID)
        .like("name", `%${STAMP}%`)
      expect(
        drafts ?? [],
        "(c) AC-156.9: ein abgelaufener Auftrag darf nichts mehr anlegen",
      ).toHaveLength(0)
    }).toPass({ timeout: 30_000 })

    // --- (d) Projekt eines fremden Mandanten -------------------------------
    // `E2E_PROJECT_ID` liegt im geteilten Mandanten, den diese Sitzung nicht
    // aktiv hat. Der Assistent darf seine Existenz nicht verraten.
    await say(page, "Abbrechen")
    await say(page, `Mach im Projekt ${E2E_PROJECT_ID} eine Story für ${STORY_TITLE}`)

    await expect(async () => {
      const { data: items } = await admin
        .from("work_items")
        .select("id")
        .eq("project_id", E2E_PROJECT_ID)
        .like("title", `%${STAMP}%`)
      expect(
        items ?? [],
        "(d) AC-156.25: kein Schreibzugriff auf ein Projekt ausserhalb des aktiven Mandanten",
      ).toHaveLength(0)
    }).toPass({ timeout: 30_000 })

    // Und der Name des fremden Projekts taucht nirgends in der Antwort auf.
    await expect(page.getByText("[E2E] Visual-Regression Project")).toHaveCount(0)

    // --- (e) Zwei gleichzeitig offene Tabs ---------------------------------
    //
    // Der zweite Tab teilt Sitzung und Cookies, faehrt aber denselben Dialog.
    // Genau dafuer traegt der Zustand eine `revision`: einer gewinnt, der
    // andere bekommt einen kontrollierten Konflikt statt einer zweiten Anlage.
    await say(page, "Abbrechen")
    await say(page, "Leg mir ein Projekt an")

    const secondTab = await page.context().newPage()
    await secondTab.goto(`/projects/${E2E_ASSISTANT_PROJECT_ID}`, {
      waitUntil: "networkidle",
      timeout: 120_000,
    })
    await openAssistant(secondTab)

    // Beide Tabs beantworten dieselbe Frage. Der erste gewinnt.
    await say(page, PROJECT_NAME)

    // Der zweite kennt nur den alten Stand — seine Antwort darf den frischen
    // Zustand nicht ueberschreiben.
    const conflictResponse = secondTab.waitForResponse(
      (r: any) =>
        r.url().includes("/api/assistant/turns") &&
        r.request().method() === "POST",
      { timeout: 60_000 },
    )
    await secondTab.getByPlaceholder("Assistant fragen").fill("Ganz anderer Name")
    await secondTab.getByRole("button", { name: "Senden" }).click()
    const conflict = await conflictResponse

    // Entweder weist der Server den veralteten Zug ab (409) oder er hat den
    // Stand vorher neu geladen — beides ist korrekt, ein stilles Ueberschreiben
    // waere es nicht. Genau das prueft die Zusicherung darunter.
    expect(
      [200, 409, 422].includes(conflict.status()),
      `(e) unerwarteter Status ${conflict.status()}`,
    ).toBe(true)

    await expect(async () => {
      const state = await readDialogState(admin)
      const name = (state.dialog?.slots as Record<string, unknown> | undefined)?.name
      expect(
        name,
        "(e) AC-156.11: der zweite Tab darf den Namen des ersten nicht stillschweigend ersetzen",
      ).not.toBe("Ganz anderer Name")
    }).toPass({ timeout: 30_000 })

    // BEFUND, gemessen statt angenommen: ein zweiter Tab startet eine EIGENE
    // Assistant-Sitzung. Der Revisionsschutz wirkt damit *innerhalb* einer
    // Sitzung (`p_session_id` + `expected_revision`), nicht zwischen zwei
    // Tabs — die sind schlicht unabhaengig. Eine Zusicherung „hoechstens ein
    // offener Auftrag" waere deshalb falsch und ist bewusst entfernt.
    //
    // Der eigentliche Konfliktfall aus AC-156.11 (zwei Zuege auf DERSELBEN
    // Sitzung, der veraltete verliert) ist zwei Ebenen tiefer belegt und hier
    // nicht nachstellbar, ohne die Sitzungs-Id von aussen zu faelschen:
    //   - Route:    `turns/route.test.ts` — 409 vor der Runtime-Ausfuehrung
    //   - Datenbank: Live-Smoke V5 — veraltete Revision -> 40001
    // Was dieser Fall belegt, ist die praktisch wichtigere Haelfte: zwei
    // gleichzeitig offene Tabs schreiben sich nicht gegenseitig zu.

    await secondTab.close()

    // --- (f) Mandantenwechsel raeumt den Auftrag --------------------------
    //
    // Der Wechsel ist der Grund, warum diese Slice `tenant-switcher.tsx`
    // anfasst: er ruft `DELETE /api/assistant/turns`, bevor er den Mandanten
    // umstellt (Lock 7). Geprueft wird die Wirkung in der Datenbank, nicht der
    // Knopfdruck — `setCurrentTenant` schreibt nur ein Cookie, der Zustand
    // muss also serverseitig verschwinden.
    //
    // Erst abbrechen: aus (e) steht noch ein Auftrag offen, und eine Eingabe
    // waehrend eines offenen Auftrags ist per AC-156.8 eine ANTWORT, kein
    // neuer Befehl. Genau daran ist der erste Anlauf dieses Falls gescheitert
    // — das Produkt verhielt sich richtig, meine Annahme war falsch.
    await say(page, "Abbrechen")
    await say(page, "Leg mir ein Projekt an")
    await expect(async () => {
      const state = await readDialogState(admin)
      expect(state.dialog?.pending_intent).toBe("project_create_draft")
    }).toPass({ timeout: 30_000 })

    const cleared = page.waitForResponse(
      (r: any) =>
        r.url().includes("/api/assistant/turns") &&
        r.request().method() === "DELETE",
      { timeout: 60_000 },
    )
    // Das Overlay zuerst schliessen: es ist ein modaler Dialog und setzt die
    // uebrige Seite auf `aria-hidden`, der Umschalter ist dann NICHT im
    // Accessibility-Baum. Am Seitenzustand gemessen — die Schaltflaeche
    // existiert, sie ist nur verdeckt. Dass der Auftrag das Schliessen
    // ueberlebt, ist genau die Zusage aus PROJ-Y-144d.
    await page.getByRole("button", { name: "Close" }).click()

    // Der Auslöser heisst "Switch workspace" — englisch auf deutscher Flaeche,
    // derselbe Befund wie F-3 und hier am Seitenzustand abgelesen.
    await page.getByRole("button", { name: "Switch workspace" }).click()
    await page.getByRole("menuitem", { name: /\[E2E\] Projektplattform Test/ }).first().click()
    await cleared

    await expect(async () => {
      const state = await readDialogState(admin)
      expect(
        state.dialog,
        "(f) AC-156.9: der Mandantenwechsel raeumt den offenen Auftrag serverseitig",
      ).toBeNull()
    }).toPass({ timeout: 30_000 })
  })
})
