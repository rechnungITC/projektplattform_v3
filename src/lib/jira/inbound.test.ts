/**
 * PROJ-50 — unit tests for the Jira inbound service.
 *
 * Covers the pure helpers (token hashing, payload parse) and the
 * processInboundEvent conflict/fast-forward engine with a configurable
 * Supabase mock: unknown issue key → ignored, clean fast-forward → applied,
 * concurrent local change → conflict recorded (no overwrite).
 */

import { describe, expect, it, vi } from "vitest"

import {
  buildPayloadDigest,
  generateWebhookToken,
  hashWebhookToken,
  parseJiraWebhook,
  processInboundEvent,
} from "./inbound"

describe("token helpers", () => {
  it("generates a 64-hex-char token and a stable sha256 hash", () => {
    const raw = generateWebhookToken()
    expect(raw).toMatch(/^[0-9a-f]{64}$/)
    const h1 = hashWebhookToken(raw)
    const h2 = hashWebhookToken(raw)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(h1).not.toBe(raw)
  })

  it("different tokens hash differently", () => {
    expect(hashWebhookToken("a")).not.toBe(hashWebhookToken("b"))
  })
})

describe("parseJiraWebhook", () => {
  it("extracts issue key, fields, and uses the header delivery id", () => {
    const payload = {
      webhookEvent: "jira:issue_updated",
      issue: {
        key: "PROJ-7",
        fields: { summary: "New title", description: "desc", status: { name: "Done" } },
      },
    }
    const parsed = parseJiraWebhook(payload, "deliv-123", JSON.stringify(payload))
    expect(parsed.issueKey).toBe("PROJ-7")
    expect(parsed.deliveryId).toBe("deliv-123")
    expect(parsed.eventType).toBe("jira:issue_updated")
    expect(parsed.fields).toEqual({ summary: "New title", description: "desc", status: "Done" })
  })

  it("falls back to a body hash when no delivery header", () => {
    const body = JSON.stringify({ issue: { key: "X-1" } })
    const a = parseJiraWebhook(JSON.parse(body), null, body)
    const b = parseJiraWebhook(JSON.parse(body), null, body)
    expect(a.deliveryId).toMatch(/^[0-9a-f]{64}$/)
    expect(a.deliveryId).toBe(b.deliveryId) // stable → idempotent
  })

  it("ignores non-string (ADF) descriptions and missing fields", () => {
    const parsed = parseJiraWebhook(
      { issue: { key: "X-2", fields: { description: { type: "doc" }, summary: "s" } } },
      "d",
      "{}",
    )
    expect(parsed.fields.description).toBeNull()
    expect(parsed.fields.summary).toBe("s")
    expect(parsed.fields.status).toBeNull()
  })

  it("returns null issueKey for an empty body", () => {
    expect(parseJiraWebhook({}, "d", "{}").issueKey).toBeNull()
  })

  it("buildPayloadDigest carries only safe non-secret fields", () => {
    const parsed = parseJiraWebhook(
      { webhookEvent: "e", issue: { key: "K-1", fields: { summary: "s" } } },
      "d",
      "{}",
    )
    const digest = buildPayloadDigest(parsed)
    expect(digest).toEqual({ issue_key: "K-1", event_type: "e", fields: parsed.fields })
  })
})

// --- processInboundEvent engine ------------------------------------------

type MaybeSingle = { data: unknown; error: unknown }

/**
 * Minimal chainable Supabase mock. `refResult` and `wiResult` set what the
 * two `.maybeSingle()` reads return; inserts/updates are captured.
 */
function makeAdmin(opts: {
  refResult: MaybeSingle
  wiResult?: MaybeSingle
}) {
  const conflictInserts: unknown[] = []
  const workItemUpdates: unknown[] = []
  const refUpdates: unknown[] = []

  const chain = (table: string) => {
    const builder: Record<string, unknown> = {}
    const ret = () => builder
    builder.select = ret
    builder.eq = ret
    builder.maybeSingle = async () =>
      table === "external_refs" ? opts.refResult : (opts.wiResult ?? { data: null, error: null })
    builder.insert = async (payload: unknown) => {
      if (table === "jira_sync_conflicts") conflictInserts.push(payload)
      return { error: null }
    }
    builder.update = (payload: unknown) => {
      if (table === "work_items") workItemUpdates.push(payload)
      if (table === "external_refs") refUpdates.push(payload)
      return { eq: () => ({ eq: async () => ({ error: null }), then: undefined, error: null }), error: null }
    }
    return builder
  }
  // external_refs.update only chains a single .eq; work_items.update chains two.
  const admin = {
    from: vi.fn((table: string) => {
      const b = chain(table)
      // make update().eq() resolve for the single-eq (external_refs) case
      const origUpdate = b.update as (p: unknown) => Record<string, unknown>
      b.update = (payload: unknown) => {
        if (table === "work_items") workItemUpdates.push(payload)
        if (table === "external_refs") refUpdates.push(payload)
        const eqResolvable = {
          eq: () => eqResolvable,
          then: (res: (v: { error: null }) => void) => res({ error: null }),
        }
        return eqResolvable
      }
      void origUpdate
      return b
    }),
  }
  return { admin, conflictInserts, workItemUpdates, refUpdates }
}

const EVENT = {
  id: "ev-1",
  tenant_id: "t-1",
  jira_issue_key: "PROJ-7",
  raw_payload_digest: { fields: { summary: "Jira title", description: null, status: null } },
}

describe("processInboundEvent", () => {
  it("ignores an unknown issue key (no external_ref)", async () => {
    const { admin } = makeAdmin({ refResult: { data: null, error: null } })
    const res = await processInboundEvent(admin as never, EVENT)
    expect(res.status).toBe("ignored")
    expect(res.applied).toEqual([])
  })

  it("fast-forwards when V3 is unchanged since last sync", async () => {
    const { admin, workItemUpdates } = makeAdmin({
      refResult: {
        data: {
          id: "ref-1",
          project_id: "p-1",
          entity_id: "wi-1",
          metadata: { inbound_last_synced: { title: "Old title" } },
        },
        error: null,
      },
      wiResult: {
        data: { id: "wi-1", tenant_id: "t-1", project_id: "p-1", title: "Old title", description: null },
        error: null,
      },
    })
    const res = await processInboundEvent(admin as never, EVENT)
    expect(res.status).toBe("processed")
    expect(res.applied).toEqual(["title"])
    expect(res.conflicts).toEqual([])
    expect(workItemUpdates).toEqual([{ title: "Jira title" }])
  })

  it("records a conflict when V3 also changed (no silent overwrite)", async () => {
    const { admin, conflictInserts, workItemUpdates } = makeAdmin({
      refResult: {
        data: {
          id: "ref-1",
          project_id: "p-1",
          entity_id: "wi-1",
          metadata: { inbound_last_synced: { title: "Old title" } },
        },
        error: null,
      },
      wiResult: {
        // V3 title diverged from the baseline AND from Jira → conflict.
        data: { id: "wi-1", tenant_id: "t-1", project_id: "p-1", title: "Locally edited", description: null },
        error: null,
      },
    })
    const res = await processInboundEvent(admin as never, EVENT)
    expect(res.status).toBe("processed")
    expect(res.conflicts).toEqual(["title"])
    expect(res.applied).toEqual([])
    expect(workItemUpdates).toEqual([]) // never overwrote
    expect(conflictInserts).toHaveLength(1)
    expect(conflictInserts[0]).toMatchObject({
      field: "title",
      v3_value: "Locally edited",
      jira_value: "Jira title",
      resolution: "pending",
    })
  })

  it("conflicts on first inbound when there is no baseline", async () => {
    const { admin, conflictInserts } = makeAdmin({
      refResult: {
        data: { id: "ref-1", project_id: "p-1", entity_id: "wi-1", metadata: {} },
        error: null,
      },
      wiResult: {
        data: { id: "wi-1", tenant_id: "t-1", project_id: "p-1", title: "V3 title", description: null },
        error: null,
      },
    })
    const res = await processInboundEvent(admin as never, EVENT)
    expect(res.conflicts).toEqual(["title"])
    expect(conflictInserts).toHaveLength(1)
  })
})
