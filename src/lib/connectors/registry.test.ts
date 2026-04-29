import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { listConnectors } from "./registry"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"

interface MetaRow {
  id: string
  tenant_id: string
  connector_key: string
  created_by: string
  created_at: string
  updated_at: string
}

function makeSupabase(opts: {
  meta?: MetaRow[]
  metaError?: { message: string } | null
}) {
  const data: MetaRow[] = opts.meta ?? []
  const error = opts.metaError ?? null
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data, error }),
  }
  return {
    from: vi.fn((table: string) => {
      if (table === "tenant_secrets") return chain
      throw new Error(`unexpected table ${table}`)
    }),
    rpc: vi.fn(),
  } as unknown as Parameters<typeof listConnectors>[0]
}

describe("listConnectors", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    process.env.SECRETS_ENCRYPTION_KEY = "test-key-32-chars-minimum-1234567"
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.SECRETS_ENCRYPTION_KEY
  })

  it("returns one entry per descriptor with credential_source=none when nothing is configured", async () => {
    const supabase = makeSupabase({ meta: [] })
    const entries = await listConnectors(supabase, TENANT_ID)
    expect(entries).toHaveLength(6)
    for (const e of entries) {
      expect(e.status.credential_source).toBe("none")
    }
  })

  it("reports adapter_ready_configured for email when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_xxx"
    const supabase = makeSupabase({ meta: [] })
    const entries = await listConnectors(supabase, TENANT_ID)
    const email = entries.find((e) => e.descriptor.key === "email")!
    expect(email.status.health.status).toBe("adapter_ready_configured")
    expect(email.status.credential_source).toBe("env")
  })

  it("prefers tenant_secret over env for credential_source", async () => {
    process.env.RESEND_API_KEY = "re_xxx"
    const supabase = makeSupabase({
      meta: [
        {
          id: "1",
          tenant_id: TENANT_ID,
          connector_key: "email",
          created_by: "u",
          created_at: "2026-04-29T00:00:00Z",
          updated_at: "2026-04-29T00:00:00Z",
        },
      ],
    })
    const entries = await listConnectors(supabase, TENANT_ID)
    const email = entries.find((e) => e.descriptor.key === "email")!
    expect(email.status.credential_source).toBe("tenant_secret")
    expect(email.status.health.status).toBe("adapter_ready_configured")
  })

  it("flags every editable connector as error when SECRETS_ENCRYPTION_KEY is missing", async () => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    const supabase = makeSupabase({ meta: [] })
    const entries = await listConnectors(supabase, TENANT_ID)
    const email = entries.find((e) => e.descriptor.key === "email")!
    expect(email.status.health.status).toBe("error")
    expect(email.status.health.detail).toMatch(/encryption_unavailable/)
    // Non-editable connectors keep their original status
    const slack = entries.find((e) => e.descriptor.key === "slack")!
    expect(slack.status.health.status).toBe("adapter_missing")
  })

  it("reports adapter_missing for jira/mcp/slack/teams in this slice", async () => {
    const supabase = makeSupabase({ meta: [] })
    const entries = await listConnectors(supabase, TENANT_ID)
    for (const k of ["slack", "teams", "jira", "mcp"]) {
      const e = entries.find((x) => x.descriptor.key === k)!
      expect(e.status.health.status).toBe("adapter_missing")
    }
  })

  it("returns adapter_ready_unconfigured for anthropic without env key", async () => {
    const supabase = makeSupabase({ meta: [] })
    const entries = await listConnectors(supabase, TENANT_ID)
    const anthropic = entries.find((e) => e.descriptor.key === "anthropic")!
    expect(anthropic.status.health.status).toBe("adapter_ready_unconfigured")
  })
})
