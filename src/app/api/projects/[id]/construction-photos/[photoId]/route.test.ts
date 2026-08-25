// @vitest-environment node
//
// PROJ-45-ε — ein einzelnes Foto: Ändern, Lösen, Löschen, Bytes.

import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock, moduleMock, downloadMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
  moduleMock: vi.fn(),
  downloadMock: vi.fn(),
}))

// `vi.mock` wird hochgezogen: weder Schleifen-Bezeichner noch eine `const`
// darüber existieren zu diesem Zeitpunkt. Beide Routen dieser Datei greifen den
// Helfer über verschieden tiefe relative Wege, deshalb wörtlich beide.
vi.mock("../../../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})
vi.mock("../../../../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})
vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: moduleMock,
}))
vi.mock("@/lib/dms/storage", () => ({ downloadDocumentFile: downloadMock }))

import { DELETE, PATCH } from "./route"
import { GET as FILE } from "./file/route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const OTHER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const PHOTO = "dddddddd-4444-4444-8444-dddddddddddd"

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

function client(row: unknown, rpc?: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "order", "limit"]) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }))
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return { data: rpc?.data ?? null, error: rpc?.error ?? null }
    }),
  }
}
function ctx(photoId = PHOTO) {
  return { params: Promise.resolve({ id: PROJECT, photoId }) }
}
function patchReq(body: unknown) {
  return new Request("http://t/p", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  rpcCalls.length = 0
  getAuthMock.mockReset()
  accessMock.mockReset()
  moduleMock.mockReset()
  downloadMock.mockReset()
  moduleMock.mockResolvedValue(null)
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
})

describe("PATCH /construction-photos/[photoId]", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: client(null) })
    expect((await PATCH(patchReq({ caption: "x" }), ctx())).status).toBe(401)
  })

  it("404 wenn das Foto zu einem anderen Projekt gehört", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client({ id: PHOTO, project_id: OTHER }),
    })
    const res = await PATCH(patchReq({ caption: "x" }), ctx())
    expect(res.status).toBe(404)
    // Die Adresse darf nicht dekorativ sein: es wurde nichts geschrieben.
    expect(rpcCalls).toHaveLength(0)
  })

  it("422 wenn Setzen und Leeren zusammen kommen", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client({ id: PHOTO, project_id: PROJECT }),
    })
    const res = await PATCH(
      patchReq({ caption: "x", clear_caption: true }),
      ctx(),
    )
    expect(res.status).toBe(422)
    expect(rpcCalls).toHaveLength(0)
  })

  it("422 bei leerer Änderung — kein Rundlauf ohne Grund", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client({ id: PHOTO, project_id: PROJECT }),
    })
    expect((await PATCH(patchReq({}), ctx())).status).toBe(422)
    expect(rpcCalls).toHaveLength(0)
  })

  it("Leeren wird als Schalter gesendet, nicht als weggelassenes Feld", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client({ id: PHOTO, project_id: PROJECT }, { data: { id: PHOTO } }),
    })
    await PATCH(patchReq({ clear_taken_on: true }), ctx())
    const call = rpcCalls.find((c) => c.fn === "set_construction_photo_meta")
    expect(call?.args.p_clear_taken_on).toBe(true)
    expect(call?.args.p_taken_on).toBeNull()
    // caption bleibt unangetastet: weder Wert noch Leeren-Schalter.
    expect(call?.args.p_caption).toBeNull()
    expect(call?.args.p_clear_caption).toBe(false)
  })

  it("403 wenn die Funktion die Rolle abweist (γ-Regel greift nicht, β schon)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client(
        { id: PHOTO, project_id: PROJECT },
        { error: { code: "42501", message: "nur Projektleitung" } },
      ),
    })
    expect((await PATCH(patchReq({ caption: "x" }), ctx())).status).toBe(403)
  })
})

describe("DELETE /construction-photos/[photoId]", () => {
  it("löst ohne Parameter nur die Verknüpfung (AC-45ε.10)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client({ id: PHOTO, project_id: PROJECT }, { data: 0 }),
    })
    const res = await DELETE(new Request("http://t/p", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ unlinked: true, file_trashed: false })
    expect(
      rpcCalls.find((c) => c.fn === "remove_construction_photo")?.args
        .p_delete_file,
    ).toBe(false)
  })

  it("legt die Datei nur mit ausdrücklichem Parameter in den Papierkorb", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client({ id: PHOTO, project_id: PROJECT }, { data: 1 }),
    })
    const res = await DELETE(
      new Request("http://t/p?delete_file=true", { method: "DELETE" }),
      ctx(),
    )
    expect(await res.json()).toEqual({ unlinked: true, file_trashed: true })
    expect(
      rpcCalls.find((c) => c.fn === "remove_construction_photo")?.args
        .p_delete_file,
    ).toBe(true)
  })

  it("403 wenn die Datei noch woanders hängt", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client(
        { id: PHOTO, project_id: PROJECT },
        { error: { code: "42501", message: "haengt noch an 2 weiteren Stellen" } },
      ),
    })
    const res = await DELETE(
      new Request("http://t/p?delete_file=true", { method: "DELETE" }),
      ctx(),
    )
    expect(res.status).toBe(403)
    // Die Aussage steckt im Text, die Weiche im Code — auf Text wird nie geprüft.
    expect((await res.json()).error.code).toBe("forbidden")
  })
})

describe("GET /construction-photos/[photoId]/file", () => {
  const docRow = {
    project_id: PROJECT,
    documents: {
      storage_path: `t1/${PROJECT}/n1/a.jpg`,
      mime_type: "image/png",
      original_filename: "a.png",
      deleted_at: null,
    },
  }

  it("401 unauthenticated — keine Bytes ohne Sitzung (AC-45εH-6)", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: client(docRow) })
    const res = await FILE(new Request("http://t/f"), ctx())
    expect(res.status).toBe(401)
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it("liefert standardmäßig die Vorschau, nicht das Original (AC-45ε.9)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client(docRow) })
    downloadMock.mockResolvedValue(Buffer.from("preview-bytes"))
    const res = await FILE(new Request("http://t/f"), ctx())
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/jpeg")
    expect(res.headers.get("content-disposition")).toBe("inline")
    expect(downloadMock.mock.calls[0][1]).toContain("_derived/preview-")
  })

  it("liefert die Druckgröße für den Ausdruck (AC-45ε.13)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client(docRow) })
    downloadMock.mockResolvedValue(Buffer.from("print-bytes"))
    await FILE(new Request("http://t/f?size=print"), ctx())
    expect(downloadMock.mock.calls[0][1]).toContain("_derived/print-")
  })

  it("das Original kommt als Anhang mit seinem eigenen Format", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client(docRow) })
    downloadMock.mockResolvedValue(Buffer.from("orig"))
    const res = await FILE(new Request("http://t/f?size=original"), ctx())
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("content-disposition")).toContain("attachment")
    expect(downloadMock.mock.calls[0][1]).not.toContain("_derived")
  })

  it("fehlt eine abgeleitete Größe, gilt das Original als Rückfall", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client(docRow) })
    downloadMock
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(Buffer.from("orig"))
    const res = await FILE(new Request("http://t/f?size=preview"), ctx())
    expect(res.status).toBe(200)
    expect(downloadMock).toHaveBeenCalledTimes(2)
  })

  it("für das Original gibt es keinen Rückfall", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client(docRow) })
    downloadMock.mockRejectedValue(new Error("not found"))
    const res = await FILE(new Request("http://t/f?size=original"), ctx())
    expect(res.status).toBe(404)
    expect(downloadMock).toHaveBeenCalledTimes(1)
  })

  it("404 bei fremdem Projekt in der Adresse", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client({ ...docRow, project_id: OTHER }),
    })
    const res = await FILE(new Request("http://t/f"), ctx())
    expect(res.status).toBe(404)
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it("Antwort ist privat zwischengespeichert, nicht öffentlich", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client(docRow) })
    downloadMock.mockResolvedValue(Buffer.from("x"))
    const res = await FILE(new Request("http://t/f"), ctx())
    expect(res.headers.get("cache-control")).toContain("private")
  })
})
