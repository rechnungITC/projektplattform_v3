/**
 * PROJ-75 — vitest for the one-shot Class-3 re-classification backfill sweep.
 *
 * Covers: auth guard, full-text upgrade (monotone), fail-safe unverified flag,
 * non-truncated "mark screened" path, and monotone no-downgrade.
 *
 * parseStoragePointer + FileParseError are kept REAL (pure logic); parseFile
 * and downloadContextSourceFile are mocked; the privacy classifier is REAL so
 * the full_text → Class-3 inference is genuinely exercised.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface UpdateCall {
  id: string
  patch: Record<string, unknown>
}

const state: {
  rows: unknown[]
  selErr: { message: string } | null
  remaining: number
  updates: UpdateCall[]
} = { rows: [], selErr: null, remaining: 0, updates: [] }

const adminClient = {
  from: vi.fn(() => ({
    select: (_cols: string, opts?: { head?: boolean }) => {
      if (opts?.head) {
        return { is: () => Promise.resolve({ count: state.remaining }) }
      }
      return {
        is: () => ({
          order: () => ({
            limit: () =>
              Promise.resolve({ data: state.rows, error: state.selErr }),
          }),
        }),
      }
    },
    update: (patch: Record<string, unknown>) => ({
      eq: (_col: string, id: string) => {
        state.updates.push({ id, patch })
        return Promise.resolve({ error: null })
      },
    }),
  })),
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminClient),
}))

const parseFileMock = vi.fn()
vi.mock("@/lib/context-ingestion/file-parser", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/context-ingestion/file-parser")
  >("@/lib/context-ingestion/file-parser")
  return { ...actual, parseFile: (...a: unknown[]) => parseFileMock(...a) }
})

const downloadMock = vi.fn()
vi.mock("@/lib/context-ingestion/storage", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/context-ingestion/storage")
  >("@/lib/context-ingestion/storage")
  return {
    ...actual,
    downloadContextSourceFile: (...a: unknown[]) => downloadMock(...a),
  }
})

import { POST } from "./route"
import { FileParseError } from "@/lib/context-ingestion/file-parser"

const ORIGINAL = process.env.CRON_SECRET
const POINTER = "storage://context-source-uploads/t1/cs1/kickoff.pdf"

function makePost(auth?: string, body?: unknown): Request {
  return new Request(
    "http://localhost/api/context-sources/reclassify-backfill",
    {
      method: "POST",
      headers: {
        ...(auth ? { authorization: auth } : {}),
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  )
}

function parsed(fullText: string) {
  return {
    result: {
      excerpt: fullText.slice(0, 8000),
      full_text: fullText,
      raw_length: fullText.length,
      page_count: 1,
      truncated: fullText.length > 8000,
    },
    mime: "application/pdf",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.rows = []
  state.selErr = null
  state.remaining = 0
  state.updates = []
  process.env.CRON_SECRET = "secret-xyz"
})
afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL
})

describe("POST /api/context-sources/reclassify-backfill", () => {
  it("500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET
    const res = await POST(makePost("Bearer secret-xyz"))
    expect(res.status).toBe(500)
  })

  it("401 on missing auth header", async () => {
    const res = await POST(makePost())
    expect(res.status).toBe(401)
  })

  it("401 on wrong secret", async () => {
    const res = await POST(makePost("Bearer nope"))
    expect(res.status).toBe(401)
  })

  it("upgrades a truncated row to Class-3 when PII lives beyond the excerpt (AC-75.2/75.7)", async () => {
    state.rows = [
      {
        id: "cs1",
        privacy_class: 1,
        content_full_url: POINTER,
        mime_type: "application/pdf",
        source_metadata: { proj70_gamma_parse: { truncated: true } },
        title: "Kickoff",
      },
    ]
    downloadMock.mockResolvedValueOnce(Buffer.from("pdf-bytes"))
    // Clean 8100 chars, then an email at ~char 8100 → only visible in full_text.
    parseFileMock.mockResolvedValueOnce(
      parsed("x".repeat(8100) + " kontakt: person@example.com"),
    )

    const res = await POST(makePost("Bearer secret-xyz"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { upgraded: number; checked: number }
    expect(body.checked).toBe(1)
    expect(body.upgraded).toBe(1)

    const patch = state.updates.find((u) => u.id === "cs1")?.patch
    expect(patch).toMatchObject({
      privacy_class: 3,
      classification_unverified: false,
    })
    expect(patch?.full_text_classified_at).toBeTruthy()
  })

  it("does NOT downgrade: full text is cleaner than the existing class (AC-75.4)", async () => {
    state.rows = [
      {
        id: "cs2",
        privacy_class: 3, // e.g. manually stamped
        content_full_url: POINTER,
        mime_type: "application/pdf",
        source_metadata: { proj70_gamma_parse: { truncated: true } },
        title: "Doc",
      },
    ]
    downloadMock.mockResolvedValueOnce(Buffer.from("pdf-bytes"))
    parseFileMock.mockResolvedValueOnce(parsed("totally harmless content"))

    const res = await POST(makePost("Bearer secret-xyz"))
    const body = (await res.json()) as { upgraded: number }
    expect(body.upgraded).toBe(0)
    const patch = state.updates.find((u) => u.id === "cs2")?.patch
    expect(patch?.privacy_class).toBe(3) // kept, not lowered to 1
    expect(patch?.full_text_classified_at).toBeTruthy()
  })

  it("fail-safe: flags classification_unverified when the file cannot be re-parsed (AC-75.8)", async () => {
    state.rows = [
      {
        id: "cs3",
        privacy_class: 2,
        content_full_url: POINTER,
        mime_type: "application/pdf",
        source_metadata: { proj70_gamma_parse: { truncated: true } },
        title: "Broken",
      },
    ]
    downloadMock.mockRejectedValueOnce(new Error("not found"))

    const res = await POST(makePost("Bearer secret-xyz"))
    const body = (await res.json()) as { unverified: number }
    expect(body.unverified).toBe(1)
    const patch = state.updates.find((u) => u.id === "cs3")?.patch
    expect(patch).toEqual({ classification_unverified: true })
    // class NOT changed, NOT marked screened → retried on later runs
    expect(patch).not.toHaveProperty("privacy_class")
    expect(patch).not.toHaveProperty("full_text_classified_at")
  })

  it("marks a non-truncated / no-file row screened without a re-parse", async () => {
    state.rows = [
      {
        id: "cs4",
        privacy_class: 1,
        content_full_url: null,
        mime_type: null,
        source_metadata: {}, // no truncated flag → excerpt WAS the full text
        title: "JSON-origin",
      },
    ]

    const res = await POST(makePost("Bearer secret-xyz"))
    const body = (await res.json()) as {
      screened_unchanged: number
      unverified: number
    }
    expect(body.screened_unchanged).toBe(1)
    expect(body.unverified).toBe(0)
    expect(downloadMock).not.toHaveBeenCalled()
    const patch = state.updates.find((u) => u.id === "cs4")?.patch
    expect(patch?.full_text_classified_at).toBeTruthy()
  })

  it("propagates a FileParseError as unverified (not a 500)", async () => {
    state.rows = [
      {
        id: "cs5",
        privacy_class: 1,
        content_full_url: POINTER,
        mime_type: "application/pdf",
        source_metadata: { proj70_gamma_parse: { truncated: true } },
        title: "TooBig",
      },
    ]
    downloadMock.mockResolvedValueOnce(Buffer.from("pdf-bytes"))
    parseFileMock.mockRejectedValueOnce(
      new FileParseError("raw_text_cap_exceeded", "too big"),
    )

    const res = await POST(makePost("Bearer secret-xyz"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { unverified: number }
    expect(body.unverified).toBe(1)
    expect(state.updates.find((u) => u.id === "cs5")?.patch).toEqual({
      classification_unverified: true,
    })
  })
})
