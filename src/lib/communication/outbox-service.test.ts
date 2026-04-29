import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CommunicationOutboxEntry } from "@/types/communication"

import { dispatchOutboxRow } from "./outbox-service"

interface KiRunsRow {
  classification: 1 | 2 | 3
}

function makeOutbox(
  overrides: Partial<CommunicationOutboxEntry> = {}
): CommunicationOutboxEntry {
  return {
    id: "outbox-1",
    tenant_id: "tenant-1",
    project_id: "project-1",
    channel: "email",
    recipient: "lead@example.com",
    subject: "Status",
    body: "Body",
    metadata: {},
    status: "draft",
    error_detail: null,
    sent_at: null,
    created_by: "user-1",
    created_at: "2026-04-29T10:00:00Z",
    updated_at: "2026-04-29T10:00:00Z",
    ...overrides,
  }
}

interface SupabaseMockOpts {
  kiRunsRow?: KiRunsRow | null
  updateError?: { message: string } | null
}

function buildSupabaseMock(opts: SupabaseMockOpts = {}) {
  const updateRowResult = {
    data: { id: "outbox-1" },
    error: opts.updateError ?? null,
  }

  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(updateRowResult),
  }

  const kiRunsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.kiRunsRow ?? null,
      error: null,
    }),
  }

  const from = vi.fn((table: string) => {
    if (table === "ki_runs") return kiRunsChain
    if (table === "communication_outbox") return updateChain
    throw new Error(`unexpected table ${table}`)
  })

  return {
    client: { from } as unknown as Parameters<typeof dispatchOutboxRow>[0]["supabase"],
    updateChain,
    kiRunsChain,
  }
}

describe("dispatchOutboxRow", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("dispatches internal channel without contacting any provider", async () => {
    const { client, updateChain, kiRunsChain } = buildSupabaseMock()
    const outbox = makeOutbox({ channel: "internal" })

    const { result } = await dispatchOutboxRow({ supabase: client, outbox })

    expect(result.status).toBe("sent")
    expect(result.error_detail).toBeNull()
    expect(result.class3_blocked).toBe(false)
    expect(kiRunsChain.maybeSingle).not.toHaveBeenCalled()
    const updateArgs = (updateChain.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0]
    expect(updateArgs).toMatchObject({ status: "sent", error_detail: null })
  })

  it("suppresses external channel when linked ki_run is Class-3", async () => {
    const { client, updateChain } = buildSupabaseMock({
      kiRunsRow: { classification: 3 },
    })
    const outbox = makeOutbox({
      channel: "email",
      metadata: { ki_run_id: "run-1", ki_drafted: true },
    })

    const { result } = await dispatchOutboxRow({ supabase: client, outbox })

    expect(result.status).toBe("suppressed")
    expect(result.class3_blocked).toBe(true)
    expect(result.error_detail).toMatch(/class-3-suppressed/)
    const updateArgs = (updateChain.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0]
    expect(updateArgs).toMatchObject({ status: "suppressed", sent_at: null })
  })

  it("permits internal channel even when linked ki_run is Class-3", async () => {
    // Internal data may stay inside the tenant — Class-3 only blocks external.
    const { client } = buildSupabaseMock({
      kiRunsRow: { classification: 3 },
    })
    const outbox = makeOutbox({
      channel: "internal",
      metadata: { ki_run_id: "run-1" },
    })

    const { result } = await dispatchOutboxRow({ supabase: client, outbox })

    expect(result.status).toBe("sent")
    expect(result.class3_blocked).toBe(false)
  })

  it("permits external channel when linked ki_run is Class-2", async () => {
    const { client } = buildSupabaseMock({
      kiRunsRow: { classification: 2 },
    })
    const outbox = makeOutbox({
      channel: "email",
      metadata: { ki_run_id: "run-2" },
    })

    const { result } = await dispatchOutboxRow({ supabase: client, outbox })

    expect(result.status).toBe("sent")
    expect(result.class3_blocked).toBe(false)
    // Stub fallback because RESEND_API_KEY is absent.
    expect(result.stub).toBe(true)
  })

  it("returns failed when adapter is a not-implemented stub (slack)", async () => {
    const { client } = buildSupabaseMock()
    const outbox = makeOutbox({ channel: "slack" })

    const { result } = await dispatchOutboxRow({ supabase: client, outbox })

    expect(result.status).toBe("failed")
    expect(result.error_detail).toMatch(/no-adapter-yet/)
    expect(result.class3_blocked).toBe(false)
  })

  it("rejects rows already in a terminal status", async () => {
    const { client, kiRunsChain } = buildSupabaseMock()
    const outbox = makeOutbox({ status: "sent", sent_at: "2026-04-29T11:00:00Z" })

    const { result, row } = await dispatchOutboxRow({ supabase: client, outbox })

    expect(result.status).toBe("sent")
    expect(result.error_detail).toMatch(/terminal status/)
    expect(row).toBeNull()
    expect(kiRunsChain.maybeSingle).not.toHaveBeenCalled()
  })

  it("ignores ki_run cross-reference when no ki_run_id is set", async () => {
    const { client, kiRunsChain } = buildSupabaseMock()
    const outbox = makeOutbox({ channel: "email", metadata: {} })

    const { result } = await dispatchOutboxRow({ supabase: client, outbox })

    expect(result.status).toBe("sent")
    expect(kiRunsChain.maybeSingle).not.toHaveBeenCalled()
  })
})
