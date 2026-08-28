/**
 * PROJ-153-α — Tests für die Klassifizierung.
 *
 * Der tragende Fall ist **A-1**: Skill-Anweisungen werden mitgelesen. Der
 * CIA-Pass hat gemessen, dass PROJ-151 genau das nicht tut — dort geht
 * Skill-Text an den Anbieter, ohne durch die Klassifizierung gelaufen zu sein
 * (registriert als PROJ-Y-151d). Dieser Zweck erbt den Fehler nicht, und der
 * Fall unten ist der Grund, warum das so bleibt.
 */

import { describe, expect, it } from "vitest"

import {
  classifyWorkItemsFromIntentAutoContext,
  type WorkItemsFromIntentAutoContext,
} from "./classify-work-items-from-intent"

const base: WorkItemsFromIntentAutoContext = {
  project: {
    id: "p1",
    name: "ERP-Einführung",
    description:
      "Ablösung des Altsystems in drei Werken mit Fokus auf Materialwirtschaft.",
    project_type: "erp",
    project_method: "waterfall",
  },
  answers: [],
  skill_instructions: null,
}

describe("classifyWorkItemsFromIntentAutoContext", () => {
  it("lässt ein sauberes Vorhaben auf der Mandanten-Voreinstellung", () => {
    expect(classifyWorkItemsFromIntentAutoContext(base, 2)).toBe(2)
  })

  it("hebt auf 3, wenn das Vorhaben Personendaten trägt", () => {
    const ctx = {
      ...base,
      project: { ...base.project, description: "Ansprechpartner: max@kunde.de" },
    }
    expect(classifyWorkItemsFromIntentAutoContext(ctx, 2)).toBe(3)
  })

  it("hebt auf 3, wenn eine Dialogantwort Personendaten trägt", () => {
    const ctx = {
      ...base,
      answers: [{ question: "Wer entscheidet?", answer: "Frau: Schmidt, 0151 2345678" }],
    }
    expect(classifyWorkItemsFromIntentAutoContext(ctx, 2)).toBe(3)
  })

  it("hebt auf 3, wenn ein SKILL Personendaten trägt — CIA-Auflage A-1", () => {
    // Der Kernfall. Ohne die Skill-Anweisungen in der Aufzählung bliebe das
    // hier 2, und der Text ginge trotzdem an ein Cloud-Modell — genau der
    // Pfad, den der CIA-Pass in PROJ-151 gefunden hat.
    const ctx = {
      ...base,
      skill_instructions:
        "Nutze unsere Hausgliederung. Ansprechpartner: schmidt@kunde.de",
    }
    expect(classifyWorkItemsFromIntentAutoContext(ctx, 2)).toBe(3)
  })

  it("unterschreitet die Mandanten-Voreinstellung nie", () => {
    // Untergrenze, nicht Schätzung (Muster PROJ-89): ein Mandant, der auf 3
    // steht, bleibt auf 3, auch wenn nichts auffällig aussieht.
    expect(classifyWorkItemsFromIntentAutoContext(base, 3)).toBe(3)
  })

  it("liest alle drei Quellen, nicht nur die erste", () => {
    // Gegenprobe zur Reihenfolge: läge der Fund nur an Position 1, wäre der
    // A-1-Fall oben auch bei einer nachlässigen Implementierung grün.
    const ctx = {
      ...base,
      project: { ...base.project, description: "Sauberer Zieltext ohne alles." },
      answers: [{ question: "Umfang?", answer: "Drei Werke." }],
      skill_instructions: "Kontakt: a.b@c.de",
    }
    expect(classifyWorkItemsFromIntentAutoContext(ctx, 1)).toBe(3)
  })
})
