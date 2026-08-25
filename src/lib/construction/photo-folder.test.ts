// @vitest-environment node
//
// PROJ-45-ε / AC-45εH-16 — der automatische Ordner wird wiedergefunden, auch
// wenn zwei Uploads gleichzeitig laufen.

import { describe, expect, it, vi } from "vitest"

import { PHOTO_FOLDER_SLUG, ensurePhotoFolder } from "./photo-folder"

type Row = { id: string } | null

function client(opts: {
  finds: Row[]
  insert?: { data?: { id: string }; error?: { code: string; message: string } }
}) {
  let findIdx = 0
  const inserted: Record<string, unknown>[] = []
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ["select", "eq", "is"]) c[m] = vi.fn(() => c)
    c.insert = vi.fn((payload: Record<string, unknown>) => {
      inserted.push(payload)
      return c
    })
    c.maybeSingle = vi.fn(async () => ({
      data: opts.finds[Math.min(findIdx++, opts.finds.length - 1)],
      error: null,
    }))
    c.single = vi.fn(async () => ({
      data: opts.insert?.data ?? null,
      error: opts.insert?.error ?? null,
    }))
    return c
  }
  return {
    supabase: { from: vi.fn(() => chain()) } as never,
    inserted,
  }
}

describe("ensurePhotoFolder", () => {
  it("findet einen vorhandenen Ordner und legt keinen zweiten an", async () => {
    const { supabase, inserted } = client({ finds: [{ id: "f1" }] })
    const res = await ensurePhotoFolder(supabase, "t1", "p1", "u1")
    expect(res).toEqual({ nodeId: "f1", created: false })
    expect(inserted).toHaveLength(0)
  })

  it("legt beim ersten Foto einen Wurzelordner mit festem Kennzeichen an", async () => {
    const { supabase, inserted } = client({
      finds: [null],
      insert: { data: { id: "f2" } },
    })
    const res = await ensurePhotoFolder(supabase, "t1", "p1", "u1")
    expect(res).toEqual({ nodeId: "f2", created: true })
    expect(inserted[0]).toMatchObject({
      tenant_id: "t1",
      project_id: "p1",
      parent_id: null,
      node_type: "folder",
      slug: PHOTO_FOLDER_SLUG,
    })
  })

  it("bei gleichzeitigem Upload gewinnt einer, der andere liest ihn (23505)", async () => {
    // Erster Blick: leer. Einfügen scheitert am Unique-Index. Zweiter Blick
    // findet den Ordner des Gewinners — kein Fehlschlag für den Nutzer.
    const { supabase } = client({
      finds: [null, { id: "winner" }],
      insert: { error: { code: "23505", message: "duplicate key" } },
    })
    const res = await ensurePhotoFolder(supabase, "t1", "p1", "u1")
    expect(res).toEqual({ nodeId: "winner", created: false })
  })

  it("ein anderer Einfügefehler wird nicht als Ordner verkauft", async () => {
    const { supabase } = client({
      finds: [null, null],
      insert: { error: { code: "23503", message: "fk violation" } },
    })
    await expect(ensurePhotoFolder(supabase, "t1", "p1", "u1")).rejects.toThrow(
      "fk violation",
    )
  })
})
