// @vitest-environment node
//
// PROJ-45-ε — die drei Entscheidungen der Fotostrecke, getrennt von der
// Oberfläche prüfbar.

import { describe, expect, it } from "vitest"

import {
  formatPhotoSize,
  offeredPhotoActions,
  planPhotoSwap,
  summarizeUploads,
} from "./photo-strip"
import type { ConstructionPhoto } from "@/types/construction-photo"

function photo(id: string, sortOrder: number): ConstructionPhoto {
  return {
    id,
    project_id: "p",
    document_id: `d-${id}`,
    defect_id: "def",
    acceptance_id: null,
    section_id: null,
    caption: null,
    taken_on: null,
    sort_order: sortOrder,
    created_by: null,
    created_at: "2026-08-25T00:00:00Z",
    original_filename: `${id}.jpg`,
    mime_type: "image/jpeg",
    size_bytes: 1024,
  }
}

describe("summarizeUploads", () => {
  it("benennt jede abgewiesene Datei, statt nur zu zählen (AC-45ε.2)", () => {
    const s = summarizeUploads([
      { filename: "a.jpg", ok: true },
      { filename: "b.heic", ok: false, code: "heif_not_supported", message: "HEIC" },
      { filename: "c.jpg", ok: true },
    ])
    expect(s.okCount).toBe(2)
    expect(s.failedCount).toBe(1)
    // Der Dateiname MUSS in der Zusammenfassung stehen — „2 von 3" verschweigt,
    // welche fehlt.
    expect(s.failures).toEqual([{ filename: "b.heic", message: "HEIC" }])
    expect(s.headline).toBe("2 hinzugefügt, 1 abgewiesen")
  })

  it("Einzahl und Mehrzahl im Erfolgsfall", () => {
    expect(summarizeUploads([{ filename: "a", ok: true }]).headline).toBe(
      "Foto hinzugefügt",
    )
    expect(
      summarizeUploads([
        { filename: "a", ok: true },
        { filename: "b", ok: true },
      ]).headline,
    ).toBe("2 Fotos hinzugefügt")
  })

  it("kein Erfolg: die Überschrift behauptet keinen", () => {
    const s = summarizeUploads([
      { filename: "b.heic", ok: false, message: "HEIC" },
    ])
    expect(s.headline).toBe("Datei abgewiesen")
    expect(s.okCount).toBe(0)
  })

  it("fehlt der Grund, wird er benannt statt weggelassen", () => {
    const s = summarizeUploads([{ filename: "x", ok: false }])
    expect(s.failures[0].message).toBe("Unbekannter Grund")
  })
})

describe("planPhotoSwap", () => {
  const list = [photo("a", 0), photo("b", 1), photo("c", 2)]

  it("tauscht die Reihenfolge zweier Nachbarn", () => {
    expect(planPhotoSwap(list, "b", "up")).toEqual({
      a: { id: "b", sort_order: 0 },
      b: { id: "a", sort_order: 1 },
    })
    expect(planPhotoSwap(list, "b", "down")).toEqual({
      a: { id: "b", sort_order: 2 },
      b: { id: "c", sort_order: 1 },
    })
  })

  it("am Rand gibt es keinen Tausch — die Fläche bietet ihn dort nicht an", () => {
    expect(planPhotoSwap(list, "a", "up")).toBeNull()
    expect(planPhotoSwap(list, "c", "down")).toBeNull()
  })

  it("bei gleichen Werten wird gezielt verschoben, statt wirkungslos zu tauschen", () => {
    // Lücken und Doppelungen entstehen durch Löschen; ein naiver Tausch wäre
    // hier ein Schreibvorgang ohne Wirkung.
    const same = [photo("a", 5), photo("b", 5)]
    expect(planPhotoSwap(same, "b", "up")).toEqual({
      a: { id: "b", sort_order: 4 },
      b: { id: "a", sort_order: 5 },
    })
  })

  it("unbekannte Kennung ergibt keinen Schreibvorgang", () => {
    expect(planPhotoSwap(list, "zz", "up")).toBeNull()
  })
})

describe("offeredPhotoActions", () => {
  it("Hinzufügen ist NIE gegated — β-Regel (AC-45ε.16/.17)", () => {
    expect(offeredPhotoActions(false).canAdd).toBe(true)
    expect(offeredPhotoActions(true).canAdd).toBe(true)
  })

  it("Betrachter sehen keine Änder- oder Entfernen-Handlung", () => {
    const a = offeredPhotoActions(false)
    expect(a.canEditMeta).toBe(false)
    expect(a.canReorder).toBe(false)
    expect(a.canUnlink).toBe(false)
    expect(a.canDeleteFile).toBe(false)
  })

  it("protokollierte Abnahme: ergänzen ja, entfernen nein (Q-ε7)", () => {
    const a = offeredPhotoActions(true, true)
    expect(a.canAdd).toBe(true)
    // Bildunterschrift und Reihenfolge bleiben — der Wächter hängt allein am
    // Löschen, und ein nachgetragener Bildtext ist die zugelassene Ergänzung.
    expect(a.canEditMeta).toBe(true)
    expect(a.canReorder).toBe(true)
    expect(a.canUnlink).toBe(false)
    expect(a.canDeleteFile).toBe(false)
  })
})

describe("formatPhotoSize", () => {
  it("keine Angabe wird nicht als 0 B gedruckt", () => {
    expect(formatPhotoSize(null)).toBe("—")
    expect(formatPhotoSize(0)).toBe("—")
  })
  it("skaliert bis MB", () => {
    expect(formatPhotoSize(512)).toBe("512 B")
    expect(formatPhotoSize(2048)).toBe("2 KB")
    expect(formatPhotoSize(3_500_000)).toBe("3.3 MB")
  })
})
