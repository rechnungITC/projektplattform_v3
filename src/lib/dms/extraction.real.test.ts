/**
 * @vitest-environment node
 *
 * PROJ-80-α.2 — die Kette EINMAL ungemockt, mit echten Dateien.
 *
 * Warum das nötig ist: `extraction.test.ts` prüft die Fehler-Abbildung und die
 * Kürzung, also Logik *um* den Parser herum. Der eigentliche Anspruch dieser
 * Slice ist aber, dass ein hochgeladenes Dokument **tatsächlich** klassifiziert
 * wird, bevor sein Text irgendwohin geht. Ein Test mit gemocktem Parser hätte
 * diese Zusage nicht geprüft — genau die Lücke, durch die `pdfjs-dist` in
 * PROJ-142 einen Major-Sprung überlebte und durch die der DMS-Pfad in PROJ-Y-142b
 * seinen Sniff-Fehler behielt.
 *
 * `node`-Umgebung, weil die Parser serverseitig laufen und `jsdom` bei
 * Realm-Prüfungen einzelner Bibliotheken stolpert (PROJ-Y-142b-Befund).
 */

import { describe, expect, it } from "vitest"

import { buildDocx, buildPdf } from "@/lib/context-ingestion/real-document-fixtures"

import { extractAndClassify } from "./extraction"

describe("PROJ-80 extractAndClassify — echte Dateien, keine Mocks", () => {
  it("liest ein PDF und stuft harmlosen Text NICHT als personenbezogen ein", async () => {
    const buffer = buildPdf("Quartalsbericht Bauabschnitt Nord. Fortschritt 60 Prozent.")
    const out = await extractAndClassify(buffer, "bericht.pdf", "application/pdf")

    expect(out.status).toBe("extracted")
    expect(out.extracted_text).toContain("Quartalsbericht")
    expect(out.char_count).toBeGreaterThan(0)
    // Kein PII -> Cloud-Anbieter zulässig. Wäre das fälschlich 3, wäre die
    // Quintessenz ohne Tenant-Ollama dauerhaft blockiert (der PROJ-86-Fall).
    expect(out.privacy_class).toBeLessThan(3)
    // Der DB-CHECK verlangt einen Zeitstempel, sobald 'extracted' gesetzt ist.
    expect(out.full_text_classified_at).not.toBeNull()
    expect(out.classification_unverified).toBe(false)
  })

  it("erkennt personenbezogene Daten in einem DOCX und sperrt damit die Cloud", async () => {
    const buffer = await buildDocx([
      "Protokoll der Begehung.",
      "Kontakt: max.mustermann@example.com, Telefon 0170 1234567.",
    ])
    const out = await extractAndClassify(
      buffer,
      "protokoll.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    expect(out.status).toBe("extracted")
    // Das ist die tragende Zusicherung der ganzen Slice: erkannte PII führt zu
    // Klasse 3, und Klasse 3 sperrt externe Anbieter (Invariante #3).
    expect(out.privacy_class).toBe(3)
    expect(out.full_text_classified_at).not.toBeNull()
  })

  it("klassifiziert über den VOLLTEXT, nicht über einen Auszug", async () => {
    // PROJ-75-Kern: PII jenseits der 8000-Zeichen-Auszugsgrenze muss trotzdem
    // gefunden werden. Ein Klassifizierer, der nur den Auszug sieht, würde
    // dieses Dokument als harmlos durchwinken und seinen Text an die Cloud geben.
    const filler = "Allgemeine Projektbeschreibung ohne Personenbezug. ".repeat(400)
    const buffer = await buildDocx([filler, "Ansprechpartner: erika.musterfrau@example.com"])
    const out = await extractAndClassify(
      buffer,
      "lang.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    expect(out.char_count).toBeGreaterThan(8_000)
    expect(out.privacy_class).toBe(3)
  })

  it("bucht ein PDF ohne Textebene als Fehler statt als leeren Erfolg", async () => {
    // Gescanntes PDF ist der häufigste Realfall (OCR ist ausdrücklich draußen,
    // PROJ-71). Eine leere "erfolgreiche" Extraktion wäre die unehrliche
    // Variante: sie sähe aus wie "das Dokument gibt nichts her".
    const buffer = buildPdf("")
    const out = await extractAndClassify(buffer, "scan.pdf", "application/pdf")

    expect(out.status).toBe("failed")
    expect(out.failure_code).toBe("no_text_layer")
    // Kein gelesener Text -> restriktivste Annahme, nicht "unbekannt".
    expect(out.privacy_class).toBe(3)
    expect(out.full_text_classified_at).toBeNull()
  })
})
