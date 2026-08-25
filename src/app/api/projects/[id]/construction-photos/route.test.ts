// @vitest-environment node
//
// PROJ-45-ε — Routentests der Fotoflächen.
//
// Gemockt sind nur Sitzung, Projektzugriff, Modul-Tor, Sniffer, Bildlib und der
// Aufnahmekern. ECHT bleiben die Anker-Regel, die Rechteweiche, die
// Mehrfach-Buchhaltung und die Quota-Fortschreibung — also genau das, was diese
// Routen selbst entscheiden.

import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  getAuthMock,
  accessMock,
  moduleMock,
  sniffMock,
  probeMock,
  renderMock,
  ingestMock,
  quotaMock,
  folderMock,
  exifMock,
  downloadMock,
  FakeMimeError,
  FakeImageError,
} = vi.hoisted(() => {
  class FakeMimeError extends Error {
    code: string
    constructor(code: string, msg: string) {
      super(msg)
      this.code = code
      this.name = "DmsMimeError"
    }
  }
  class FakeImageError extends Error {
    code: string
    constructor(code: string, msg: string) {
      super(msg)
      this.code = code
      this.name = "PhotoImageError"
    }
  }
  return {
    getAuthMock: vi.fn(),
    accessMock: vi.fn(),
    moduleMock: vi.fn(),
    sniffMock: vi.fn(),
    probeMock: vi.fn(),
    renderMock: vi.fn(),
    ingestMock: vi.fn(),
    quotaMock: vi.fn(),
    folderMock: vi.fn(),
    exifMock: vi.fn(),
    downloadMock: vi.fn(),
    FakeMimeError,
    FakeImageError,
  }
})

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})
vi.mock("../../../_lib/route-helpers", async (orig) => {
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
vi.mock("@/lib/dms/mime", () => ({
  sniffDocumentMime: sniffMock,
  DmsMimeError: FakeMimeError,
}))
vi.mock("@/lib/construction/photo-image", () => ({
  probePhoto: probeMock,
  renderVariant: renderMock,
  derivedObjectPath: (p: string, v: string) => `${p}::${v}`,
  PhotoImageError: FakeImageError,
}))
vi.mock("@/lib/dms/ingest", () => ({
  ingestDocumentFile: ingestMock,
  fetchDocumentQuota: quotaMock,
  wouldExceedQuota: (
    q: { current_usage_bytes: number; max_bytes: number } | null,
    add: number,
  ) => (q ? q.current_usage_bytes + add > q.max_bytes : false),
}))
vi.mock("@/lib/construction/photo-folder", () => ({
  ensurePhotoFolder: folderMock,
  PHOTO_FOLDER_NAME: "Baufotos",
  PHOTO_FOLDER_SLUG: "baufotos",
}))
vi.mock("@/lib/construction/photo-exif", () => ({ readCaptureDate: exifMock }))
vi.mock("@/lib/dms/pipeline", () => ({ runDocumentPipeline: vi.fn() }))
vi.mock("@/lib/dms/storage", () => ({ downloadDocumentFile: downloadMock }))

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const OTHER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const DEFECT = "dddddddd-4444-4444-8444-dddddddddddd"
const ACCEPT = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

function client(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "order", "limit"]) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }))
  chain.then = (resolve: (r: unknown) => unknown) =>
    resolve({ data: rows, error: null })
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      if (fn === "link_construction_photo") {
        return { data: { id: "photo-1", ...args }, error: null }
      }
      return { data: null, error: null }
    }),
  }
}

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function req(files: Array<[string, string]>, fields: Record<string, string> = {}) {
  const fd = new FormData()
  for (const [name, body] of files) {
    fd.append("file", new File([body], name, { type: "image/jpeg" }))
  }
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new Request("http://t/construction-photos", { method: "POST", body: fd })
}

beforeEach(() => {
  rpcCalls.length = 0
  for (const m of [
    getAuthMock, accessMock, moduleMock, sniffMock, probeMock, renderMock,
    ingestMock, quotaMock, folderMock, exifMock, downloadMock,
  ]) {
    m.mockReset()
  }
  moduleMock.mockResolvedValue(null)
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
  sniffMock.mockResolvedValue({ mime: "image/jpeg", mime_unsupported_for_rag: true })
  probeMock.mockResolvedValue({ width: 100, height: 80, exif: null })
  renderMock.mockResolvedValue(Buffer.from("derived"))
  exifMock.mockReturnValue(null)
  folderMock.mockResolvedValue({ nodeId: "folder-1", created: true })
  quotaMock.mockResolvedValue({
    quota: { max_bytes: 1_000_000, current_usage_bytes: 0, soft_warning_pct: 80 },
  })
  let n = 0
  ingestMock.mockImplementation(async () => ({
    ok: true,
    node: { id: `n${++n}` },
    document: { id: `d${n}` },
    nodeId: `n${n}`,
    documentId: `d${n}`,
    storagePath: `t1/${PROJECT}/n${n}/f.jpg`,
    derivedPaths: [],
  }))
})

describe("POST /api/projects/[id]/construction-photos", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: client() })
    expect((await POST(req([["a.jpg", "x"]]), ctx())).status).toBe(401)
  })

  it("erfassen ist mit der Leserolle erlaubt (β-Regel, AC-45ε.16/.17)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    const res = await POST(req([["a.jpg", "x"]], { defect_id: DEFECT }), ctx())
    expect(res.status).toBe(201)
    // Die Absicht ist "view" — NICHT "edit". Wäre hier "edit" gefordert, könnte
    // ein Betrachter nicht fotografieren, und AC-45ε.17 wäre gebrochen.
    expect(accessMock).toHaveBeenCalledWith(
      expect.anything(), PROJECT, ME, "view",
    )
  })

  it("weist ohne Anker ab und mit zwei Ankern ebenso (L32)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    expect((await POST(req([["a.jpg", "x"]]), ctx())).status).toBe(400)
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    const two = await POST(
      req([["a.jpg", "x"]], { defect_id: DEFECT, acceptance_id: ACCEPT }),
      ctx(),
    )
    expect(two.status).toBe(400)
  })

  it("eine abgewiesene Datei bricht die übrigen nicht ab (AC-45ε.2)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    sniffMock
      .mockResolvedValueOnce({ mime: "image/jpeg", mime_unsupported_for_rag: true })
      .mockRejectedValueOnce(new FakeMimeError("heif_not_supported", "HEIC"))
      .mockResolvedValueOnce({ mime: "image/jpeg", mime_unsupported_for_rag: true })
    const res = await POST(
      req([["a.jpg", "x"], ["b.heic", "y"], ["c.jpg", "z"]], { defect_id: DEFECT }),
      ctx(),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      results: Array<{ filename: string; ok: boolean; code?: string }>
    }
    expect(body.results.map((r) => r.ok)).toEqual([true, false, true])
    expect(body.results[1].code).toBe("heif_not_supported")
    // Zwei Verknüpfungen, nicht drei und nicht null.
    expect(rpcCalls.filter((c) => c.fn === "link_construction_photo")).toHaveLength(2)
  })

  it("422 wenn keine einzige Datei durchgeht", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    sniffMock.mockRejectedValue(new FakeMimeError("heif_not_supported", "HEIC"))
    const res = await POST(req([["b.heic", "y"]], { defect_id: DEFECT }), ctx())
    expect(res.status).toBe(422)
  })

  it("die Quota wird je Datei fortgeschrieben, nicht je Vorgang", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    // Zwei Dateien à 6 Byte bei 10 Byte Rest: die erste passt, die zweite nicht.
    quotaMock.mockResolvedValue({
      quota: { max_bytes: 10, current_usage_bytes: 0, soft_warning_pct: 80 },
    })
    const res = await POST(
      req([["a.jpg", "123456"], ["b.jpg", "123456"]], { defect_id: DEFECT }),
      ctx(),
    )
    const body = (await res.json()) as {
      results: Array<{ ok: boolean; code?: string }>
    }
    expect(body.results.map((r) => r.ok)).toEqual([true, false])
    expect(body.results[1].code).toBe("quota_exceeded")
  })

  it("weist ab, was gar kein Bild ist — auch bei Bild-Endung (AC-45εH-8)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    sniffMock.mockResolvedValue({
      mime: "application/pdf",
      mime_unsupported_for_rag: false,
    })
    const res = await POST(req([["a.jpg", "%PDF-"]], { defect_id: DEFECT }), ctx())
    const body = (await res.json()) as { results: Array<{ code?: string }> }
    expect(res.status).toBe(422)
    expect(body.results[0].code).toBe("unsupported_media_type")
    // Es darf nicht einmal verkleinert worden sein.
    expect(renderMock).not.toHaveBeenCalled()
  })

  it("die Pixelgrenze greift vor dem Verkleinern (AC-45εH-7)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    probeMock.mockRejectedValue(
      new FakeImageError("too_many_pixels", "zu viele Pixel"),
    )
    const res = await POST(req([["a.jpg", "x"]], { defect_id: DEFECT }), ctx())
    expect((await res.json()).results[0].code).toBe("too_many_pixels")
    expect(renderMock).not.toHaveBeenCalled()
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it("das Aufnahmedatum wird nicht erfunden (AC-45ε.7)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    exifMock.mockReturnValue(null)
    await POST(req([["a.jpg", "x"]], { defect_id: DEFECT }), ctx())
    const link = rpcCalls.find((c) => c.fn === "link_construction_photo")
    expect(link?.args.p_taken_on).toBeNull()
  })

  it("das Aufnahmedatum aus EXIF wird übernommen (L36)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    exifMock.mockReturnValue("2026-03-14")
    await POST(req([["a.jpg", "x"]], { section_id: ACCEPT }), ctx())
    const link = rpcCalls.find((c) => c.fn === "link_construction_photo")
    expect(link?.args.p_taken_on).toBe("2026-03-14")
    expect(link?.args.p_section_id).toBe(ACCEPT)
    expect(link?.args.p_defect_id).toBeNull()
  })

  it("nimmt das Dokument zurück, wenn die Verknüpfung scheitert", async () => {
    const c = client()
    c.rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      if (fn === "link_construction_photo") {
        return { data: null, error: { code: "42501", message: "kein Mitglied" } }
      }
      return { data: null, error: null }
    }) as never
    getAuthMock.mockResolvedValue({ userId: ME, supabase: c })
    const res = await POST(req([["a.jpg", "x"]], { defect_id: DEFECT }), ctx())
    expect(res.status).toBe(422)
    // Kein Dokument bleibt stehen, das niemand angefordert hat.
    expect(rpcCalls.map((r) => r.fn)).toContain("dms_soft_delete_subtree")
  })

  it("abgeleitete Größen entstehen als Geschwister ohne eigene Zeile (AC-45εH-17)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    await POST(req([["a.jpg", "x"]], { defect_id: DEFECT }), ctx())
    const derive = ingestMock.mock.calls[0][0].deriveObjects as (
      p: string,
    ) => Promise<Array<{ path: string; contentType: string }>>
    const objects = await derive("t1/p/n1/a.jpg")
    expect(objects.map((o) => o.path)).toEqual([
      "t1/p/n1/a.jpg::preview",
      "t1/p/n1/a.jpg::print",
    ])
    expect(objects.every((o) => o.contentType === "image/jpeg")).toBe(true)
  })

  it("Modul aus: die Fläche antwortet, als gäbe es sie nicht (AC-45ε.18)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    moduleMock.mockResolvedValue(
      new Response(null, { status: 404 }) as never,
    )
    expect((await POST(req([["a.jpg", "x"]], { defect_id: DEFECT }), ctx())).status).toBe(404)
  })
})

describe("GET /api/projects/[id]/construction-photos", () => {
  it("verlangt genau einen Anker", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: client() })
    const res = await GET(
      new Request("http://t/construction-photos"),
      ctx(),
    )
    expect(res.status).toBe(400)
  })

  it("reicht den Ablageweg NICHT nach draußen", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client([
        {
          id: "p1",
          project_id: PROJECT,
          documents: {
            original_filename: "a.jpg",
            mime_type: "image/jpeg",
            size_bytes: 10,
            storage_path: "t1/p/n1/a.jpg",
            deleted_at: null,
          },
        },
      ]),
    })
    const res = await GET(
      new Request(`http://t/construction-photos?defect_id=${DEFECT}`),
      ctx(),
    )
    const body = (await res.json()) as { photos: Record<string, unknown>[] }
    expect(body.photos).toHaveLength(1)
    expect(body.photos[0].original_filename).toBe("a.jpg")
    expect(body.photos[0].storage_path).toBeUndefined()
    expect(body.photos[0].documents).toBeUndefined()
  })

  it("blendet Fotos aus, deren Datei im Papierkorb liegt", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: client([
        {
          id: "p1",
          project_id: PROJECT,
          documents: {
            original_filename: "a.jpg",
            mime_type: "image/jpeg",
            size_bytes: 10,
            storage_path: "x",
            deleted_at: "2026-08-24T00:00:00Z",
          },
        },
      ]),
    })
    const res = await GET(
      new Request(`http://t/construction-photos?section_id=${OTHER}`),
      ctx(),
    )
    expect((await res.json()).photos).toHaveLength(0)
  })
})
