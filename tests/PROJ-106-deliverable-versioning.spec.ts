/**
 * PROJ-106 — deliverable document versioning auth-gates.
 *
 * Unauthenticated probes on the two new version endpoints. Authorization DEPTH
 * (atomic supersede + is_current flip, immutability guard, audit of the flip,
 * approval-link stamp + foreign-event rejection, need-to-know on the RPC) is
 * proven by the live pentest tests/sql/PROJ-106-deliverable-versioning-pentest.sql
 * (A–I 9/9) on the SECURITY DEFINER RPCs. This spec guards the HTTP surface so
 * nothing is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-106 / deliverable-versioning auth-gates", () => {
  test("POST .../documents/versions is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/documents/versions`,
      {
        data: { title: "v2", url: "https://x/2" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../documents/stamp is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/documents/stamp`,
      {
        data: { document_id: DUMMY, event_id: DUMMY },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../documents/versions with a malformed id is still auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/not-a-uuid/deliverables/${DUMMY}/documents/versions`,
      { data: {}, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })
})