// @vitest-environment node
//
// PROJ-Y-45q — der Ordner wird hier nur noch GELESEN.
//
// Das Anlegen ist nach `create_construction_photo_node` gewandert: über den
// Sitzungs-Client dürfen nur `lead`/`editor`/Admin in den Dokumentenbaum
// schreiben, womit ein Betrachter kein Foto hätte hinzufügen können (QA-Befund
// F-1). Die Wettlauf- und Idempotenz-Fälle liegen damit in der Datenbank und
// werden vom Live-Pentest belegt, nicht mehr hier.

import { describe, expect, it, vi } from "vitest"

import { PHOTO_FOLDER_SLUG, findPhotoFolder } from "./photo-folder"

function client(row: { id: string } | null, error?: { message: string }) {
  const calls: Record<string, unknown>[] = []
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is"]) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push({ m, args })
      return chain
    })
  }
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: error ?? null }))
  return { supabase: { from: vi.fn(() => chain) } as never, calls }
}

describe("findPhotoFolder", () => {
  it("liefert die Kennung eines vorhandenen Ordners", async () => {
    const { supabase } = client({ id: "f1" })
    expect(await findPhotoFolder(supabase, "p1")).toBe("f1")
  })

  it("liefert null, wenn es den Ordner noch nicht gibt", async () => {
    // Wichtig als eigener Fall: „kein Ordner" ist kein Fehler, sondern heisst
    // „auch keine Geschwister" — der Aufrufer muss dann nichts eindeutig machen.
    const { supabase } = client(null)
    expect(await findPhotoFolder(supabase, "p1")).toBeNull()
  })

  it("sucht nach Wurzel, Kennung und nicht gelöscht", async () => {
    const { supabase, calls } = client({ id: "f1" })
    await findPhotoFolder(supabase, "p1")
    const flat = JSON.stringify(calls)
    expect(flat).toContain(PHOTO_FOLDER_SLUG)
    expect(flat).toContain("parent_id")
    expect(flat).toContain("deleted_at")
  })

  it("ein Datenbankfehler wird nicht als „kein Ordner“ verkauft", async () => {
    const { supabase } = client(null, { message: "boom" })
    await expect(findPhotoFolder(supabase, "p1")).rejects.toThrow("boom")
  })
})
