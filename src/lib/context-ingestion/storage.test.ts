/**
 * PROJ-70-γ — storage helper tests.
 *
 * Verifies sanitizeFilename + uploadContextSourceFile + deleteContextSourceFile
 * behaviour with mocked Supabase storage client.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  deleteContextSourceFile,
  sanitizeFilename,
  STORAGE_BUCKET_ID,
  uploadContextSourceFile,
} from "./storage"

const TENANT = "00000000-0000-0000-0000-000000000001"
const CS_ID = "11111111-1111-4111-8111-111111111111"

const uploadMock = vi.fn()
const removeMock = vi.fn()
const fromMock = vi.fn(() => ({ upload: uploadMock, remove: removeMock }))

const supabase: SupabaseClient = {
  storage: {
    from: fromMock,
  },
} as unknown as SupabaseClient

beforeEach(() => {
  vi.clearAllMocks()
})

describe("sanitizeFilename", () => {
  it("keeps a clean filename intact", () => {
    expect(sanitizeFilename("kickoff.pdf")).toBe("kickoff.pdf")
  })

  it("strips path components (anti path-traversal)", () => {
    expect(sanitizeFilename("../etc/passwd")).toBe("passwd")
    expect(sanitizeFilename("C:\\\\Users\\\\me\\\\doc.docx")).toBe("doc.docx")
  })

  it("replaces reserved chars with underscore", () => {
    expect(sanitizeFilename('weird:name?.pdf')).toMatch(/^weird_name_\.pdf$/)
  })

  it("returns upload.bin for empty or dot-only filenames", () => {
    expect(sanitizeFilename("")).toBe("upload.bin")
    expect(sanitizeFilename(".")).toBe("upload.bin")
    expect(sanitizeFilename("..")).toBe("upload.bin")
  })

  it("caps filename length at 200 chars", () => {
    const huge = "x".repeat(500) + ".pdf"
    const result = sanitizeFilename(huge)
    expect(result.length).toBe(200)
  })
})

describe("uploadContextSourceFile", () => {
  it("uploads at the tenant-scoped path and returns the storage pointer", async () => {
    uploadMock.mockResolvedValueOnce({ data: { path: "p" }, error: null })

    const result = await uploadContextSourceFile({
      supabase,
      tenantId: TENANT,
      contextSourceId: CS_ID,
      buffer: Buffer.from("hello"),
      mimeType: "application/pdf",
      filename: "kickoff.pdf",
    })

    expect(fromMock).toHaveBeenCalledWith(STORAGE_BUCKET_ID)
    expect(uploadMock).toHaveBeenCalledWith(
      `${TENANT}/${CS_ID}/kickoff.pdf`,
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "application/pdf",
        upsert: false,
      }),
    )
    expect(result.path).toBe(`${TENANT}/${CS_ID}/kickoff.pdf`)
    expect(result.pointer).toBe(
      `storage://${STORAGE_BUCKET_ID}/${TENANT}/${CS_ID}/kickoff.pdf`,
    )
  })

  it("sanitises the filename before upload", async () => {
    uploadMock.mockResolvedValueOnce({ data: { path: "p" }, error: null })

    const result = await uploadContextSourceFile({
      supabase,
      tenantId: TENANT,
      contextSourceId: CS_ID,
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
      filename: "../../../etc/passwd",
    })

    expect(result.path).toBe(`${TENANT}/${CS_ID}/passwd`)
  })

  it("throws when Supabase storage returns an error", async () => {
    uploadMock.mockResolvedValueOnce({
      data: null,
      error: { message: "disk full" },
    })

    await expect(
      uploadContextSourceFile({
        supabase,
        tenantId: TENANT,
        contextSourceId: CS_ID,
        buffer: Buffer.from("x"),
        mimeType: "application/pdf",
        filename: "f.pdf",
      }),
    ).rejects.toThrow(/disk full/)
  })
})

describe("deleteContextSourceFile", () => {
  it("removes the path from the bucket", async () => {
    removeMock.mockResolvedValueOnce({ data: [], error: null })
    await deleteContextSourceFile(supabase, `${TENANT}/${CS_ID}/f.pdf`)
    expect(removeMock).toHaveBeenCalledWith([`${TENANT}/${CS_ID}/f.pdf`])
  })

  it("throws when storage returns an error", async () => {
    removeMock.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    })
    await expect(
      deleteContextSourceFile(supabase, "missing/path"),
    ).rejects.toThrow(/not found/)
  })
})
