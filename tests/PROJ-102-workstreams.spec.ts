/**
 * PROJ-102 — Workstreams auth-gates.
 *
 * Guards the HTTP surface: the /projects/[id]/workstreams page + the 4 API
 * routes (list/create, detail/patch/delete, phases PUT, dashboard) must all be
 * unreachable without a session. Need-to-know DEPTH (RESTRICTIVE
 * can_access_classified: non-cleared member can't see strict workstreams/phases,
 * clearance flips it, non-member isolation) is proven by the live SQL pentest
 * (A-F 6/6, 0 residue) + the audit-CHECK regression guard (committees + workstreams).
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-102 / Workstreams auth-gates", () => {
  test("the /workstreams page route is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/workstreams`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../workstreams is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/workstreams`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../workstreams is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/workstreams`, {
      data: { workstream_key: "legal", label: "Legal" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../workstreams/[wsid] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/workstreams/${DUMMY}`,
      {
        data: { rag_status: "red" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("PUT .../workstreams/[wsid]/phases is auth-gated", async ({ request }) => {
    const res = await request.put(
      `/api/projects/${DUMMY}/workstreams/${DUMMY}/phases`,
      {
        data: { phase_ids: [] },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../workstreams/dashboard is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/workstreams/dashboard`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })
})
