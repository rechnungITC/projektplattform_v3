/**
 * PROJ-79-α — DMS Foundation auth-gates.
 *
 * Guards the HTTP surface: the /projects/[id]/dokumente page + the 6 API
 * routes (tree list, node create, node rename/move+delete, upload, download,
 * storage-quota). Every route must reject an unauthenticated caller before it
 * runs any DB work.
 *
 * DB-layer DEPTH (cross-tenant-404, cycle-move-409, quota-413,
 * soft-delete-cascade, viewer read-only via RLS) is proven by the live SQL
 * smoke `tests/sql/PROJ-79-dms-pentest.sql`. Real OOXML magic-byte detection
 * (MIME-spoof-415 + full-buffer fix) is proven by
 * `src/lib/dms/mime.ooxml.test.ts` (non-mocked file-type + jszip).
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-79 / DMS auth-gates", () => {
  test("the /dokumente page route is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/dokumente`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../documents/tree is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/documents/tree?all=true`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../tree/nodes is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/tree/nodes`, {
      data: { name: "Ordner" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../tree/nodes/[nodeId] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/tree/nodes/${DUMMY}`,
      { data: { name: "Neu" }, failOnStatusCode: false, maxRedirects: 0 },
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../tree/nodes/[nodeId] is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/tree/nodes/${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../documents (upload) is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/documents`, {
      multipart: {
        file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hi") },
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../documents/[docId]/download is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/documents/${DUMMY}/download`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../storage-quota is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/storage-quota`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
