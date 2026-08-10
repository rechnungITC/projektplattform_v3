/**
 * @vitest-environment node
 *
 * PROJ-Y-142c — the multipart upload path of `POST /api/context-sources`,
 * driven with REAL bytes through the REAL sniffer and the REAL parsers.
 *
 * PROJ-Y-142b fixed `sniffMagic` to hand `file-type` the full buffer instead
 * of a 4100-byte head slice, because a valid `.docx` whose first stored ZIP
 * entry exceeds that window was detected as `application/zip`, fell off the
 * allowlist and was rejected. That fix was proven at library level; this suite
 * is the missing route-level confirmation, since `unsupported_mime` maps to a
 * user-visible **415** here (`route.ts` statusByCode) — the actual symptom a
 * pilot would have reported.
 *
 * Mocked: auth, tenant resolution, the Supabase client and the storage upload
 * — i.e. everything that would need a live backend. Deliberately NOT mocked:
 * `parseFile`, `file-type`, `mammoth`, and the privacy classifier, so the
 * bytes really travel sniff → parser → persistence.
 *
 * Runs in the `node` environment: this is a server route, and the parsers it
 * calls are server-only (see the realm note in `msg-parser.real.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildDocx } from "@/lib/context-ingestion/real-document-fixtures"

const { getAuthMock, resolveTenantMock, uploadMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  uploadMock: vi.fn(),
}))

vi.mock("../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock }
})
vi.mock("../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("@/lib/context-ingestion/storage", () => ({
  uploadContextSourceFile: uploadMock,
}))

import { POST } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const TENANT = "11111111-1111-4111-8111-111111111111"
const ROW_ID = "22222222-2222-4222-8222-222222222222"

/** Captures the row handed to `.insert()` so we can assert what was persisted. */
let insertedRow: Record<string, unknown> | null = null

function supa() {
  const chain = () => {
    const c: Record<string, unknown> = {}
    c.insert = vi.fn((row: Record<string, unknown>) => {
      insertedRow = row
      return c
    })
    c.update = vi.fn(() => c)
    c.delete = vi.fn(() => c)
    c.select = vi.fn(() => c)
    c.eq = vi.fn(() => c)
    c.single = vi.fn(async () => ({
      data: { id: ROW_ID, ...(insertedRow ?? {}) },
      error: null,
    }))
    return c
  }
  return {
    from: vi.fn(() => chain()),
    storage: { from: vi.fn(() => ({ remove: vi.fn(async () => ({})) })) },
  }
}

async function uploadReq(file: Buffer, filename: string, mime: string) {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(file)], filename, { type: mime }), filename)
  form.append("kind", "document")
  form.append("title", "Kickoff")
  return new Request("http://t/api/context-sources", { method: "POST", body: form })
}

/**
 * A valid .docx whose first stored entry is larger than the old 4100-byte
 * sniff window — the exact shape that used to 415.
 */
async function buildDocxWithLeadingBlob(): Promise<Buffer> {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()

  const media = Buffer.alloc(9_000)
  for (let i = 0; i < media.length; i++) media[i] = (i * 2654435761) & 0xff
  zip.folder("word")!.folder("media")!.file("image1.bin", media)

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  )
  zip.folder("word")!.file(
    "document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Angebot bis Freitag prüfen.</w:t></w:r></w:p></w:body></w:document>`,
  )
  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

beforeEach(() => {
  insertedRow = null
  getAuthMock.mockReset()
  resolveTenantMock.mockReset()
  uploadMock.mockReset()
  getAuthMock.mockResolvedValue({ userId: ME, supabase: supa() })
  resolveTenantMock.mockResolvedValue(TENANT)
  uploadMock.mockResolvedValue({
    path: `${TENANT}/${ROW_ID}/kickoff.docx`,
    pointer: `storage://context-source-uploads/${TENANT}/${ROW_ID}/kickoff.docx`,
  })
})

describe("POST /api/context-sources — real multipart upload", () => {
  it("accepts an ordinary .docx and persists the extracted text", async () => {
    const res = await POST(
      await uploadReq(await buildDocx(["Kickoff ERP Migration 2026"]), "kickoff.docx", DOCX_MIME),
    )

    expect(res.status).toBe(201)
    expect(insertedRow?.mime_type).toBe(DOCX_MIME)
    expect(String(insertedRow?.content_excerpt)).toContain("Kickoff ERP Migration 2026")
  })

  it("accepts a .docx whose first ZIP entry exceeds the old sniff window (no 415)", async () => {
    // The PROJ-Y-142b regression, now asserted at the status-code level the
    // user would actually have seen. Pre-fix this returned 415
    // `unsupported_mime` because the head slice reported `application/zip`.
    const docx = await buildDocxWithLeadingBlob()
    expect(docx.length).toBeGreaterThan(4_100)

    const res = await POST(await uploadReq(docx, "kickoff.docx", DOCX_MIME))

    expect(res.status).toBe(201)
    expect(insertedRow?.mime_type).toBe(DOCX_MIME)
    expect(String(insertedRow?.content_excerpt)).toContain("Angebot bis Freitag prüfen.")
  })

  it("still rejects a real non-allowlisted format with 415", async () => {
    // Negative control: the full-buffer change must not have loosened the
    // allowlist gate. A GIF is genuinely detected, then refused.
    const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(32)])

    const res = await POST(await uploadReq(gif, "sneaky.docx", DOCX_MIME))

    expect(res.status).toBe(415)
    expect(insertedRow).toBeNull()
  })

  it("rejects undetectable bytes with 415 and persists nothing", async () => {
    const res = await POST(
      await uploadReq(Buffer.from("plain bytes, no magic"), "x.docx", DOCX_MIME),
    )

    expect(res.status).toBe(415)
    expect(insertedRow).toBeNull()
  })
})
