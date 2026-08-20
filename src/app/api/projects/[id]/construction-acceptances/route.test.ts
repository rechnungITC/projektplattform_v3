import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-γ — Tests für die Abnahme-Routen.
//
// Der Prüfstand spiegelt construction-defects/route.test.ts: Auth, Projekt-
// zugriff und das Modul-Tor sind gestubbt, damit die Zusicherungen auf DIESE
// Routen zielen — Filterung, Validierung, Fehlerabbildung und die Prüfung, dass
// die Projekt-Kennung in der Adresse nicht dekorativ ist.
//
// Die ROLLENREGEL selbst (nur Projektleitung/Bauleitung oder Mandanten-
// Administration, L22) lebt in den SECURITY-DEFINER-Funktionen und ist live
// belegt in tests/sql/PROJ-45-gamma-construction-acceptances-pentest.sql —
// Vektoren B (Betrachter) und C/C2 (Projekt-Editor). Ein Mock kann das nicht
// beweisen und behauptet es hier auch nicht.

const { getAuthMock, accessMock, moduleMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
  moduleMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})

vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: moduleMock,
}))

import { GET, POST } from "./route"
import { PATCH } from "./[aid]/route"
import { POST as STATUS } from "./[aid]/status/route"
import { PUT as DOCUMENT } from "./[aid]/document/route"
import { PUT as PARTICIPANTS } from "./[aid]/participants/route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const TRADE = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const SECTION = "ffffffff-6666-4666-8666-ffffffffffff"
const AID = "11111111-7777-4777-8777-111111111111"

interface Calls {
  eq: Array<[string, unknown]>
  is: Array<[string, unknown]>
  not: Array<[string, unknown, unknown]>
  gte: Array<[string, unknown]>
  lte: Array<[string, unknown]>
  select: string[]
}
let calls: Calls
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>

/** Ein Abfrage-Kettenglied, das jeden Filter aufzeichnet. */
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn((cols: string) => {
    calls.select.push(cols)
    return c
  })
  c.eq = vi.fn((col: string, val: unknown) => {
    calls.eq.push([col, val])
    return c
  })
  c.is = vi.fn((col: string, val: unknown) => {
    calls.is.push([col, val])
    return c
  })
  c.not = vi.fn((col: string, op: unknown, val: unknown) => {
    calls.not.push([col, op, val])
    return c
  })
  c.gte = vi.fn((col: string, val: unknown) => {
    calls.gte.push([col, val])
    return c
  })
  c.lte = vi.fn((col: string, val: unknown) => {
    calls.lte.push([col, val])
    return c
  })
  c.order = vi.fn(() => c)
  c.limit = vi.fn(async () => result)
  c.maybeSingle = vi.fn(async () => result)
  return c
}

function supa(opts: {
  row?: unknown
  rpc?: { data?: unknown; error?: unknown }
} = {}) {
  return {
    from: vi.fn(() => chain({ data: opts.row ?? [], error: null })),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return opts.rpc ?? { data: { id: AID }, error: null }
    }),
  }
}

function ctx(id: string = PROJECT, aid: string = AID) {
  return { params: Promise.resolve({ id, aid }) }
}

function req(body: unknown, method = "POST") {
  return new Request("http://t/", { method, body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  calls = { eq: [], is: [], not: [], gte: [], lte: [], select: [] }
  rpcCalls = []
  getAuthMock.mockResolvedValue({ userId: ME, supabase: supa() })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("GET /api/projects/[id]/construction-acceptances", () => {
  it("refuses without a session", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa() })
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(res.status).toBe(401)
  })

  it("refuses a malformed project id before touching the database", async () => {
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
    expect(getAuthMock).not.toHaveBeenCalled()
  })

  it("passes the module denial through unchanged", async () => {
    moduleMock.mockResolvedValue(new Response("nope", { status: 404 }))
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(res.status).toBe(404)
  })

  it("applies every filter server-side", async () => {
    await GET(
      new Request(
        `http://t/?trade_id=${TRADE}&status=angesetzt&from=2026-01-01&to=2026-12-31`
      ),
      { params: Promise.resolve({ id: PROJECT }) }
    )
    expect(calls.eq).toEqual(
      expect.arrayContaining([
        ["project_id", PROJECT],
        ["trade_id", TRADE],
        ["status", "angesetzt"],
      ])
    )
    expect(calls.gte).toEqual([["scheduled_for", "2026-01-01"]])
    expect(calls.lte).toEqual([["scheduled_for", "2026-12-31"]])
  })

  it("filters the project-wide acceptance on BOTH anchor columns", async () => {
    // Der ankerlose Fall (D-γ1) ist der einzige, der zwei Spalten zugleich
    // braucht — genau der, den man beim Filtern uebersieht.
    await GET(new Request("http://t/?subject=gesamt"), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(calls.is).toEqual([
      ["trade_id", null],
      ["section_id", null],
    ])
  })

  it("ignores a bogus filter value instead of failing", async () => {
    await GET(new Request("http://t/?status=erfunden&trade_id=nope"), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(calls.eq).toEqual([["project_id", PROJECT]])
  })

  it("never selects with a wildcard (schema-drift guard)", async () => {
    await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(calls.select[0]).not.toContain("*")
    expect(calls.select[0]).toContain("warranty_end_date")
  })
})

describe("POST /api/projects/[id]/construction-acceptances", () => {
  it("refuses both anchors at once", async () => {
    const res = await POST(req({ scheduled_for: "2026-09-01", trade_id: TRADE, section_id: SECTION }), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(res.status).toBe(422)
    expect(rpcCalls).toHaveLength(0)
  })

  it("accepts NO anchor — that is the project-wide acceptance", async () => {
    const res = await POST(req({ scheduled_for: "2026-09-01", title: "Gesamtabnahme" }), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(res.status).toBe(201)
    expect(rpcCalls[0].fn).toBe("schedule_construction_acceptance")
    expect(rpcCalls[0].args.p_trade_id).toBeNull()
    expect(rpcCalls[0].args.p_section_id).toBeNull()
  })

  it("maps the already-scheduled refusal to 409, not 500", async () => {
    // P0001 ist gegenueber β NEU. Haette γ die β-Abbildung uebernommen, waere
    // die benennende Absage als roher 500 herausgegangen.
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        rpc: {
          data: null,
          error: { code: "P0001", message: "an acceptance is already scheduled for this subject" },
        },
      }),
    })
    const res = await POST(req({ scheduled_for: "2026-09-01", trade_id: TRADE }), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("conflict")
  })

  it("maps the role refusal to 403", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: null, error: { code: "42501", message: "nope" } } }),
    })
    const res = await POST(req({ scheduled_for: "2026-09-01" }), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(res.status).toBe(403)
  })

  it("gates writes with the write intent", async () => {
    await POST(req({ scheduled_for: "2026-09-01" }), {
      params: Promise.resolve({ id: PROJECT }),
    })
    expect(moduleMock).toHaveBeenCalledWith(expect.anything(), TENANT, "construction", {
      intent: "write",
    })
  })
})

describe("mutations check that the acceptance belongs to the project in the URL", () => {
  // Ohne diese Pruefung waere die Projekt-Kennung in der Adresse dekorativ:
  // die Funktion autorisiert gegen das ECHTE Projekt der Abnahme, eine Mutation
  // koennte also ueber die Adresse eines anderen Projekts laufen. β hat genau
  // diese Lockerheit in der Durchsicht gefunden; γ zieht sie von Anfang an mit.
  const notOwned = () =>
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: {
        from: vi.fn(() => chain({ data: null, error: null })),
        rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args })
          return { data: null, error: null }
        }),
      },
    })

  it("PATCH answers 404 and calls no RPC", async () => {
    notOwned()
    const res = await PATCH(req({ title: "x" }, "PATCH"), ctx())
    expect(res.status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })

  it("status answers 404 and calls no RPC", async () => {
    notOwned()
    const res = await STATUS(req({ action: "absagen", reason: "x" }), ctx())
    expect(res.status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })

  it("participants answers 404 and calls no RPC", async () => {
    notOwned()
    const res = await PARTICIPANTS(req({ participants: [] }, "PUT"), ctx())
    expect(res.status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })

  it("document answers 404 and calls no RPC", async () => {
    notOwned()
    const res = await DOCUMENT(req({ clear: true }, "PUT"), ctx())
    expect(res.status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })
})

describe("PATCH — explicit clear switches", () => {
  it("refuses a value and its own clear switch together", async () => {
    const res = await PATCH(req({ title: "x", clear_title: true }, "PATCH"), ctx())
    expect(res.status).toBe(422)
  })

  it("refuses an empty patch", async () => {
    const res = await PATCH(req({}, "PATCH"), ctx())
    expect(res.status).toBe(422)
  })

  it("passes the clear switch through as its own flag", async () => {
    await PATCH(req({ clear_notes: true }, "PATCH"), ctx())
    expect(rpcCalls[0].args.p_clear_notes).toBe(true)
    expect(rpcCalls[0].args.p_notes).toBeNull()
  })
})

describe("POST status — cancel and record", () => {
  it("requires a reason to cancel", async () => {
    const res = await STATUS(req({ action: "absagen" }), ctx())
    expect(res.status).toBe(422)
  })

  it("routes cancel to its own RPC", async () => {
    await STATUS(req({ action: "absagen", reason: "Wetter" }), ctx())
    expect(rpcCalls[0].fn).toBe("cancel_construction_acceptance")
  })

  it("refuses an unknown result", async () => {
    const res = await STATUS(req({ action: "protokollieren", result: "vielleicht" }), ctx())
    expect(res.status).toBe(422)
  })

  it("passes reservations and the warranty through", async () => {
    await STATUS(
      req({
        action: "protokollieren",
        result: "abgenommen_unter_vorbehalt",
        warranty_months: 48,
        reservation_defect_ids: [SECTION],
        new_reservations: [{ title: "Fuge", trade_id: TRADE }],
      }),
      ctx()
    )
    expect(rpcCalls[0].fn).toBe("record_construction_acceptance")
    expect(rpcCalls[0].args.p_warranty_months).toBe(48)
    expect(rpcCalls[0].args.p_reservation_defect_ids).toEqual([SECTION])
    expect(rpcCalls[0].args.p_new_reservations).toEqual([
      { title: "Fuge", trade_id: TRADE },
    ])
  })

  it("maps the open-defect refusal to 409", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        row: { id: AID },
        rpc: { data: null, error: { code: "P0001", message: "open defect(s) exist" } },
      }),
    })
    const res = await STATUS(req({ action: "protokollieren", result: "abgenommen" }), ctx())
    expect(res.status).toBe(409)
  })

  it("maps the freeze guard to 403", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        row: { id: AID },
        rpc: { data: null, error: { code: "42501", message: "unveraenderlich" } },
      }),
    })
    const res = await STATUS(req({ action: "protokollieren", result: "abgenommen" }), ctx())
    expect(res.status).toBe(403)
  })
})

describe("PUT participants — exactly one source per row", () => {
  it("refuses a row with two sources", async () => {
    const res = await PARTICIPANTS(
      req({ participants: [{ stakeholder_id: TRADE, vendor_id: SECTION }] }, "PUT"),
      ctx()
    )
    expect(res.status).toBe(422)
    expect(rpcCalls).toHaveLength(0)
  })

  it("refuses a row with no source", async () => {
    const res = await PARTICIPANTS(
      req({ participants: [{ role_in_acceptance: "bauleitung" }] }, "PUT"),
      ctx()
    )
    expect(res.status).toBe(422)
  })

  it("accepts a free-text participant", async () => {
    const res = await PARTICIPANTS(
      req({ participants: [{ display_name: "Nachbar", role_in_acceptance: "sonstige" }] }, "PUT"),
      ctx()
    )
    expect(res.status).toBe(200)
    expect(rpcCalls[0].fn).toBe("set_construction_acceptance_participants")
  })
})

describe("PUT document — the reused SSRF check", () => {
  it("refuses an internal address", async () => {
    // Die Pruefung wird aus PROJ-115 WIEDERVERWENDET, nicht nachgebaut. Der
    // Fall belegt, dass sie wirklich laeuft — und dass nichts abgerufen wird.
    const res = await DOCUMENT(
      req({ url: "https://169.254.169.254/latest/meta-data" }, "PUT"),
      ctx()
    )
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("invalid_url")
    expect(rpcCalls).toHaveLength(0)
  })

  it("refuses a plain-http address", async () => {
    const res = await DOCUMENT(req({ url: "http://example.org/p.pdf" }, "PUT"), ctx())
    expect(res.status).toBe(422)
  })

  it("refuses an address and a node together", async () => {
    const res = await DOCUMENT(
      req({ url: "https://example.org/p.pdf", document_node_id: SECTION }, "PUT"),
      ctx()
    )
    expect(res.status).toBe(422)
  })

  it("refuses clearing and setting at once", async () => {
    const res = await DOCUMENT(
      req({ clear: true, url: "https://example.org/p.pdf" }, "PUT"),
      ctx()
    )
    expect(res.status).toBe(422)
  })

  it("accepts a public https address", async () => {
    const res = await DOCUMENT(
      req({ url: "https://example.org/protokoll.pdf", label: "Protokoll" }, "PUT"),
      ctx()
    )
    expect(res.status).toBe(200)
    expect(rpcCalls[0].args.p_url).toBe("https://example.org/protokoll.pdf")
  })
})
