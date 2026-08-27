/**
 * PROJ-151-α — AC-151.10: die Class-3-Warnung darf kein Daueralarm sein.
 *
 * Der Korpus sind **echte Texte aus der Produktionsdatenbank** (Projekt-
 * beschreibungen, Arbeitspaket-Titel, Risiken des Kundenmandanten), nicht
 * erfundene Beispiele. Genau daran ist PROJ-86 gescheitert: dort galt jedes
 * deutsche Großschreib-Bigramm als Name, und alle neun Produktionsläufe wurden
 * fälschlich als Class-3 eingestuft — das Feature lieferte null Vorschläge.
 *
 * Der Test prüft BEIDE Richtungen. Nur "schlägt nicht an" wäre auch dann grün,
 * wenn der Detektor kaputt ist und nie anschlägt.
 */

import { describe, expect, it } from "vitest"

import { checkProjectChatInput, classifyProjectChatAutoContext } from "./classify-project-chat"
import type { ProjectChatAutoContext } from "./types"

/** Wörtlich aus Prod entnommen (Mandant „IT-Couch GmbH"), 2026-08-27. */
const ECHTE_PROJEKTTEXTE = [
  "Um ein wasserfall projekt",
  "Eds geht um die Einfürhung einer 10 mann vertriebseinheit die sollen im neuen Salesforce arbeiten",
  "Wir wollen ein neues ERP System auf Basis von MS Dynamics einführen",
  "DSGVO-Prüfung durchführen",
  "Vendor-Evaluation durchführen",
  "ISO 9001 Qualitäts-Check durchführen",
  "Cookie-/Consent-Prüfung integrieren",
  "ISO 27001 Informationssicherheits-Check",
  "Tracking-Erkennung umsetzen",
  "Prüfung von Datenschutzerklärung und Impressum",
  "Datenschutzseite und Impressum prüfen",
  "Risikobewertungssystem entwickeln",
  "Lead-Erstellung aus Auffälligkeiten",
  "Anforderungsanalyse und -spezifikation",
  "Systemarchitektur und Design",
  "Datenmigration aus Altsystemen",
  "Integration mit bestehenden Systemen",
  "Schulung und Change Management",
  "Webseiten-Erfassung implementieren",
  "Plattform zur Erkennung von Datenschutzverstößen entwickeln",
  "Prüfung der Datenschutzerklärung und des Impressums",
  "Testen und Qualitätssicherung",
  "Go-Live und Nachbetreuung",
  "Webseiten-Crawling und Analyse",
  "Risikobewertung implementieren",
]

/** Typische Chat-Fragen, wie sie auf dieser Fläche zu erwarten sind. */
const TYPISCHE_FRAGEN = [
  "Welche Arbeitspakete sind diese Woche fällig?",
  "Wie ist der Stand der Migration von MS Dynamics?",
  "Fasse mir bitte die offenen Risiken im Projekt Salesforce zusammen.",
  "Welche Phase ist gerade aktiv und was steht als Nächstes an?",
  "Gibt es Arbeitspakete ohne Verantwortlichen?",
  "Was blockiert den Go-Live aus heutiger Sicht?",
]

describe("AC-151.10 — Fehlalarmquote gegen echte Projekttexte", () => {
  it("schlägt bei KEINEM der 25 echten Prod-Texte an", () => {
    const treffer = ECHTE_PROJEKTTEXTE.filter(
      (t) => checkProjectChatInput(t).looks_personal,
    )
    expect(
      treffer,
      `Fehlalarm bei: ${treffer.join(" | ")}`,
    ).toEqual([])
  })

  it("schlägt bei keiner der typischen Chat-Fragen an", () => {
    const treffer = TYPISCHE_FRAGEN.filter((t) => checkProjectChatInput(t).looks_personal)
    expect(treffer, `Fehlalarm bei: ${treffer.join(" | ")}`).toEqual([])
  })

  // Gegenrichtung: ohne sie belegt der Test nur, dass der Detektor schweigt —
  // auch ein kaputter Detektor schweigt.
  it("schlägt bei echten personenbezogenen Angaben SEHR WOHL an", () => {
    const muss = [
      "Bitte melde dich bei max.mustermann@it-couch.de wegen der Freigabe.",
      "Rückruf unter +49 170 1234567 vereinbaren",
    ]
    for (const t of muss) {
      expect(checkProjectChatInput(t).looks_personal, t).toBe(true)
    }
  })
})

function ctx(over: Partial<ProjectChatAutoContext> = {}): ProjectChatAutoContext {
  return {
    project: {
      id: "p1", name: "ERP", description: null,
      project_type: "erp", project_method: "waterfall", lifecycle_status: "active",
    },
    phases: [], open_work_items: [], open_work_items_total: 0,
    history: [], history_truncated: false,
    skill_instructions: null, skill_names: [],
    ...over,
  }
}

describe("classifyProjectChatAutoContext", () => {
  it("prüft den GESAMTEN Verlauf, nicht nur die letzte Nachricht", () => {
    // Wer im dritten Satz eine Telefonnummer nennt, darf nicht dadurch an ein
    // externes Modell geraten, dass der vierte harmlos ist.
    const c = ctx({
      history: [
        { role: "user", content: "Rückruf unter +49 170 1234567" },
        { role: "assistant", content: "Notiert." },
        { role: "user", content: "Wie ist der Projektstand?" },
      ],
    })
    expect(classifyProjectChatAutoContext(c, 1)).toBe(3)
  })

  it("bezieht das Vorhaben mit ein — es geht mit in den Kontext", () => {
    const c = ctx({ project: { ...ctx().project, description: "Ansprechpartner: a@b.de" } })
    expect(classifyProjectChatAutoContext(c, 1)).toBe(3)
  })

  it("unterschreitet die Mandanten-Voreinstellung nie", () => {
    expect(classifyProjectChatAutoContext(ctx(), 2)).toBe(2)
  })

  it("stuft gewöhnliche Projektfragen NICHT hoch", () => {
    const c = ctx({
      project: { ...ctx().project, description: "Wir wollen ein neues ERP System auf Basis von MS Dynamics einführen" },
      history: [{ role: "user", content: "Welche Arbeitspakete sind diese Woche fällig?" }],
    })
    expect(classifyProjectChatAutoContext(c, 1)).toBe(1)
  })
})
