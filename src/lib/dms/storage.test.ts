import { describe, expect, it, vi } from "vitest"

import {
  createDocumentSignedUrl,
  deleteDocumentFile,
  DMS_STORAGE_BUCKET_ID,
  sanitizeFilename,
  uploadDocumentFile,
} from "./storage"

describe("sanitizeFilename", () => {
  it("keeps a clean filename with extension", () => {
    expect(sanitizeFilename("Report 2026.pdf")).toBe("Report_2026.pdf")
  })
  it("strips path components (traversal defense)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd")
    expect(sanitizeFilename("C:\\Users\\x\\secret.docx")).toBe("secret.docx")
  })
  it("falls back to upload.bin for empty/dot results", () => {
    expect(sanitizeFilename("")).toBe("upload.bin")
    expect(sanitizeFilename("..")).toBe("upload.bin")
  })
  it("caps length at 200 chars", () => {
    expect(sanitizeFilename("a".repeat(300)).length).toBe(200)
  })
})

function storageMock(uploadResult: { error: unknown }, other: Record<string, unknown> = {}) {
  const bucket = {
    upload: vi.fn(async () => uploadResult),
    remove: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed" }, error: null })),
    ...other,
  }
  return { storage: { from: vi.fn(() => bucket) }, __bucket: bucket }
}

describe("uploadDocumentFile", () => {
  it("uploads to the tenant/project/node-prefixed path", async () => {
    const supa = storageMock({ error: null })
    const res = await uploadDocumentFile({
       
      supabase: supa as any,
      tenantId: "t",
      projectId: "p",
      nodeId: "n",
      buffer: Buffer.from("x"),
      mimeType: "application/pdf",
      filename: "doc.pdf",
    })
    expect(res.path).toBe("t/p/n/doc.pdf")
    expect(supa.__bucket.upload).toHaveBeenCalledWith(
      "t/p/n/doc.pdf",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf", upsert: false }),
    )
  })
  it("throws on storage error", async () => {
    const supa = storageMock({ error: { message: "boom" } })
    await expect(
      uploadDocumentFile({
         
        supabase: supa as any,
        tenantId: "t",
        projectId: "p",
        nodeId: "n",
        buffer: Buffer.from("x"),
        mimeType: "application/pdf",
        filename: "doc.pdf",
      }),
    ).rejects.toThrow(/boom/)
  })
})

describe("createDocumentSignedUrl", () => {
  it("returns the signed url", async () => {
    const supa = storageMock({ error: null })
     
    const url = await createDocumentSignedUrl(supa as any, "t/p/n/x.pdf", 120)
    expect(url).toBe("https://signed")
  })
  it("throws when signing fails", async () => {
    const supa = storageMock({ error: null }, {
      createSignedUrl: vi.fn(async () => ({ data: null, error: { message: "nope" } })),
    })
     
    await expect(createDocumentSignedUrl(supa as any, "p", 10)).rejects.toThrow(/nope/)
  })
})

describe("deleteDocumentFile", () => {
  it("uses the documents bucket", async () => {
    const supa = storageMock({ error: null })
     
    await deleteDocumentFile(supa as any, "t/p/n/x.pdf")
    expect(supa.storage.from).toHaveBeenCalledWith(DMS_STORAGE_BUCKET_ID)
    expect(supa.__bucket.remove).toHaveBeenCalledWith(["t/p/n/x.pdf"])
  })
})
