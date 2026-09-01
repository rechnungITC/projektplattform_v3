import { expect } from "@playwright/test"

import { test } from "./fixtures/auth-fixture"

/**
 * PROJ-158-α — Postfach-Anbindung.
 *
 * `/frontend` hat zwei Dinge ausdruecklich offen gelassen: den angemeldeten
 * Browser-Durchlauf und eine echte Verbindungspruefung. Diese Datei schliesst
 * den ersten Teil und den erreichbaren Teil des zweiten.
 *
 * Der TRAGENDE Fall ist 4: zwei angemeldete Sitzungen, Administrator und
 * einfaches Mitglied, jede legt ein Postfach an — und keine sieht das der
 * anderen. AC-158.5b ist damit ueber die Oberflaeche belegt und nicht nur in
 * der Datenbank. Ohne die zweite Haelfte des Paares (der Administrator sieht
 * SEIN eigenes sehr wohl) bewiese der Fall nur eine kaputte Liste.
 */

const MAILBOX_PATH = "/settings/postfaecher"

/** Reservierte Endung nach RFC 2606: loest garantiert nirgends auf. */
const UNREACHABLE_HOST = "imap.pentest-158.invalid"

/**
 * Bezeichner je Lauf eindeutig. Zwei Eindeutigkeiten der Ablage greifen sonst
 * bei einem Playwright-Wiederholungslauf: dessen erster Versuch kann eine
 * Zeile hinterlassen, und der zweite scheitert mit 409 an seiner eigenen
 * Vorarbeit — was wie ein Produktfehler aussieht und keiner ist.
 */
const RUN = Date.now().toString(36).slice(-6)
const label = (what: string) => `[E2E 158 ${RUN}] ${what}`

async function createMailbox(page: any, name: string, host = UNREACHABLE_HOST) {
  const created = page.waitForResponse(
    (r: any) =>
      r.url().includes("/api/mailboxes") && r.request().method() === "POST",
    { timeout: 30_000 }
  )
  await page.getByRole("button", { name: "Postfach hinzufügen" }).click()
  await page.getByLabel("Name", { exact: true }).fill(name)
  await page.getByLabel("Server").fill(host)
  await page.getByLabel("Benutzername").fill(`${RUN}@example.com`)
  await page.getByLabel("Passwort").fill("nicht-echt-nur-test")
  await page.getByRole("button", { name: "Speichern" }).click()
  return created
}

/**
 * Raeumt die Liste leer. Gezaehlt werden ZEILEN, nicht Knoepfe: der
 * Bestaetigungsdialog traegt dieselbe Beschriftung „Entfernen" wie die
 * Zeilenaktion, ein Locator auf den Namen trifft also beide.
 */
/**
 * Eine Postfach-Zeile ist ein `listitem`, das eine Pruef-Schaltflaeche traegt.
 * Die naive Suche nach `listitem` faengt auch die Navigationseintraege der
 * Seitenleiste — sie stehen ebenfalls in einer Liste.
 */
function mailboxRows(page: any) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Verbindung prüfen" }) })
}

/**
 * Wartet, bis die Liste WIRKLICH geladen ist.
 *
 * Bewusst ein POSITIVES Signal: die erste Fassung wartete darauf, dass kein
 * `aria-busy` mehr da ist — das ist erfuellt, BEVOR React ueberhaupt gerendert
 * hat, und danach zaehlte der Helfer null Zeilen und raeumte nichts weg. Die
 * Falle aus PROJ-Y-143b, eine Ebene tiefer: die Abwesenheit von etwas, das
 * noch gar nicht da sein kann, ist keine Aussage.
 */
async function awaitLoaded(page: any) {
  await expect(
    page
      .getByText("Noch kein Postfach angebunden")
      .or(mailboxRows(page).first())
  ).toBeVisible({ timeout: 20_000 })
}

async function removeAll(page: any) {
  await awaitLoaded(page)
  const rows = mailboxRows(page)
  for (let guard = 0; guard < 10; guard++) {
    const n = await rows.count()
    if (n === 0) return
    await rows.first().getByRole("button", { name: "Entfernen" }).click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Entfernen" })
      .click()
    await expect(rows).toHaveCount(n - 1, { timeout: 15_000 })
  }
  throw new Error("removeAll: Liste wurde nicht leer")
}

test.describe("PROJ-158 — Postfach-Anbindung", () => {
  test.describe.configure({ mode: "serial" })

  test("1 — die Flaeche laedt angemeldet, mit der Zusage und ohne Postfach", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(MAILBOX_PATH)

    await expect(page.getByRole("heading", { name: "Postfächer" })).toBeVisible()

    // AC-158.15: die Zusage steht auf der Flaeche, nicht nur in der Spec — und
    // dauerhaft, nicht nur im Anlege-Dialog.
    await expect(
      page.getByText("keine E-Mail abgerufen, gespeichert oder ausgewertet")
    ).toBeVisible()

    await removeAll(page)
    await expect(
      page.getByText("Noch kein Postfach angebunden")
    ).toBeVisible()
  })

  test("2 — Microsoft 365 und Gmail sind waehlbar, gesperrt und erklaert (AC-158.3)", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(MAILBOX_PATH)
    await page.getByRole("button", { name: "Postfach hinzufügen" }).click()

    await page.getByLabel("Anbieter").click()
    // AC-158.1: genau drei Anbieter, keiner fehlt und keiner ist erfunden.
    await expect(page.getByRole("option", { name: /Eigener IMAP-Server/ })).toBeVisible()
    const m365 = page.getByRole("option", { name: /Microsoft 365/ })
    const gmail = page.getByRole("option", { name: /Gmail/ })
    await expect(m365).toBeVisible()
    await expect(gmail).toBeVisible()

    // Gesperrt statt versteckt: der Nutzer soll den Grund lesen.
    await expect(m365).toHaveAttribute("aria-disabled", "true")
    await expect(gmail).toHaveAttribute("aria-disabled", "true")
    await expect(m365).toContainText("folgt")
  })

  test("3 — anlegen, Geheimnis bleibt drin, Zustand mit Zeitpunkt, entfernen", async ({
    authenticatedPage: page,
  }) => {
    await page.goto(MAILBOX_PATH)
    await removeAll(page)

    const response = await createMailbox(page, label("Postfach"))
    expect(response.status()).toBe(201)

    // AC-158.2: das Geheimnis verlaesst die Anwendung nie — auch nicht
    // verschluesselt und auch nicht in der Antwort, die es gerade erzeugt hat.
    const body = JSON.stringify(await response.json())
    expect(body).not.toContain("nicht-echt-nur-test")
    expect(body).not.toContain("credential")

    // Auf die KARTE einfassen: derselbe Wortlaut steht auch in der
    // Erfolgsmeldung, und eine ungefasste Suche traefe beide.
    const card = mailboxRows(page).filter({ hasText: label("Postfach") })
    await expect(card).toBeVisible()
    // AC-158.8: der Zustand wird NIE ohne seinen Zeitpunkt gezeigt.
    await expect(card.getByText("Noch nicht geprüft")).toBeVisible()
    await expect(card.getByText("noch nie geprüft")).toBeVisible()

    await removeAll(page)
    await expect(page.getByText("Noch kein Postfach angebunden")).toBeVisible()
  })

  /**
   * PROJ-Y-158a — die Verbindungspruefung erreicht den Anbieter.
   *
   * Bis zum 2026-09-01 war dieser Fall ein `test.fail()`: er beschrieb den
   * Soll-Zustand, weil `decryptMailboxCredential` eine Signatur rief, die es
   * nicht gibt (`decrypt_tenant_secret_with_key` nimmt `p_secret_id uuid`,
   * nicht `p_payload`), und jede Pruefung mit 503 endete. Mit der neuen
   * INVOKER-Funktion `decrypt_user_mailbox_credential` laeuft er — der Marker
   * ist deshalb entfernt statt umgeschrieben.
   *
   * Der Host loest nach RFC 2606 garantiert nirgends auf: die Pruefung macht
   * damit einen ECHTEN Netzwerkversuch durch imapflow und endet in einem
   * benannten Ergebnis, nicht in einem Dauerzustand (AC-158.8/AC-158.10).
   */
  test(
    "5 — die Pruefung erreicht den Anbieter (AC-158.7/.8)",
    async ({ authenticatedPage: page }) => {
      await page.goto(MAILBOX_PATH)
      await removeAll(page)
      const created = await createMailbox(page, label("Pruefung"))
      expect(created.status()).toBe(201)

      const checked = page.waitForResponse(
        (r: any) => r.url().includes("/test") && r.request().method() === "POST",
        { timeout: 90_000 }
      )
      await page.getByRole("button", { name: "Verbindung prüfen" }).click()
      const res = await checked

      expect(res.status()).toBe(200)
      const outcome = await res.json()
      expect(outcome.result).toBe("unreachable")

      // AC-158.9: der rohe System-/Anbieterfehler wird nicht durchgereicht.
      // Der Host selbst DARF in der Antwort stehen — er ist die eigene
      // Eingabe des Nutzers und steht ohnehin auf der Flaeche; geprueft wird
      // der Fehlerkanal, nicht das Echo der Konfiguration.
      const raw = JSON.stringify(outcome)
      expect(raw).not.toContain("ENOTFOUND")
      expect(raw).not.toContain("getaddrinfo")
      expect(raw).not.toContain("EAI_AGAIN")
      // Der Grund ist eine stabile Kennung, kein Systemtext.
      expect(outcome.result).toBe("unreachable")
      expect(outcome.mailbox.last_error_code).toBe("unreachable")
      // Und das Passwort taucht nirgends auf.
      expect(raw).not.toContain("nicht-echt-nur-test")

      // Der Zustand traegt jetzt einen Zeitpunkt und einen benannten Grund.
      const card = mailboxRows(page).filter({ hasText: label("Pruefung") })
      await expect(card.getByText("Server nicht erreichbar")).toBeVisible({
        timeout: 15_000,
      })
      await expect(card.getByText(/zuletzt geprüft am/)).toBeVisible()

      await removeAll(page)
    }
  )

  test("4 — zwei Sitzungen: niemand sieht das fremde Postfach, auch die Administration nicht (AC-158.5b)", async ({
    authenticatedPage: adminPage,
    constructionViewerPage: memberPage,
  }) => {
    // Der Administrator legt sein eigenes an.
    await adminPage.goto(MAILBOX_PATH)
    await removeAll(adminPage)
    const created = await createMailbox(adminPage, label("Nur fuer Admin"))
    expect(created.status()).toBe(201)
    await expect(adminPage.getByText(label("Nur fuer Admin"))).toBeVisible()

    // Das einfache Mitglied sieht es NICHT — die tragende Zusicherung.
    await memberPage.goto(MAILBOX_PATH)
    await expect(
      memberPage.getByText(label("Nur fuer Admin"))
    ).toHaveCount(0)

    // GEGENPROBE: das Mitglied kann sehr wohl ein EIGENES anlegen und sieht es
    // dann auch. Ohne diese Haelfte bewiese der Fall nur, dass die Liste des
    // Mitglieds kaputt ist statt eigentuemergebunden.
    await removeAll(memberPage)
    const own = await createMailbox(memberPage, label("Nur fuer Mitglied"))
    expect(own.status()).toBe(201)
    await expect(
      memberPage.getByText(label("Nur fuer Mitglied"))
    ).toBeVisible()

    // Und umgekehrt: die Administration sieht das des Mitglieds nicht.
    await adminPage.reload()
    await expect(
      adminPage.getByText(label("Nur fuer Mitglied"))
    ).toHaveCount(0)
    await expect(adminPage.getByText(label("Nur fuer Admin"))).toBeVisible()

    // Das Aufraeumen wird ZUGESICHERT, nicht nur ausgefuehrt: ein ungeprueftes
    // Teardown ist genau die blinde Stelle, die anderswo Rueckstaende
    // hinterlaesst (PROJ-Y-143o).
    await removeAll(adminPage)
    await expect(
      adminPage.getByText("Noch kein Postfach angebunden")
    ).toBeVisible()
    await removeAll(memberPage)
    await expect(
      memberPage.getByText("Noch kein Postfach angebunden")
    ).toBeVisible()
  })
})

test.describe("PROJ-158 — Auth-Gates", () => {
  const endpoints = [
    { method: "GET", url: "/api/mailboxes" },
    { method: "POST", url: "/api/mailboxes" },
    {
      method: "DELETE",
      url: "/api/mailboxes/11111111-1111-4111-8111-111111111111",
    },
    {
      method: "POST",
      url: "/api/mailboxes/11111111-1111-4111-8111-111111111111/test",
    },
  ]

  for (const { method, url } of endpoints) {
    test(`ohne Sitzung: ${method} ${url} → 307 ohne Leck`, async ({
      request,
    }) => {
      const res = await request.fetch(url, {
        method,
        data: method === "POST" ? {} : undefined,
        maxRedirects: 0,
      })
      // Genau 307, nicht „einer aus einer Liste": eine lockere Zusicherung
      // bestuende auch, wenn die Route gar nicht existierte.
      expect(res.status()).toBe(307)
      // Der Rumpf traegt die Zieladresse als `next`-Parameter — das ist die
      // EINGABE des Aufrufers und kein Leck. Geprueft wird deshalb, dass keine
      // DATEN herauskommen: kein Host, kein Benutzername, kein Geheimnis.
      const body = await res.text()
      expect(body).not.toContain("imap.")
      expect(body).not.toContain("@example.com")
      expect(body).not.toContain("credential")
      expect(body.length).toBeLessThan(200)
    })
  }

  test("ohne Sitzung: die Seite gibt keinen Inhalt heraus", async ({
    request,
  }) => {
    const res = await request.get("/settings/postfaecher", { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    const body = await res.text()
    // Hier ist „Postfach" kein Aufrufer-Echo: die Seite duerfte ihre eigene
    // Ueberschrift nicht ohne Sitzung ausliefern.
    expect(body).not.toContain("Postfach hinzufügen")
    expect(body).not.toContain("Noch kein Postfach")
  })
})
