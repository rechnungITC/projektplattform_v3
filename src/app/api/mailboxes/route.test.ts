import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PROJ-158-α — Routentests der Postfach-Anbindung.
 *
 * Geprüft wird vor allem, was die Route dem Aufrufer **nicht** gibt und
 * **nicht** annimmt. Der eigentliche Zugriffsschutz ist die RLS-Regel der
 * Tabelle (live belegt: ein Mandanten-Administrator sieht ein fremdes Postfach
 * nicht) — hier steht die zweite Reihe.
 */

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
  getAuthenticatedUserId: vi.fn(),
  resolveActiveTenantId: vi.fn(),
  requireTenantMember: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/api/_lib/route-helpers")
  >("@/app/api/_lib/route-helpers")
  return {
    ...actual,
    getAuthenticatedUserId: mocks.getAuthenticatedUserId,
    requireTenantMember: mocks.requireTenantMember,
  }
})

vi.mock("@/app/api/_lib/active-tenant", () => ({
  resolveActiveTenantId: mocks.resolveActiveTenantId,
}))

import { MAILBOX_PUBLIC_COLUMNS } from "@/lib/mailboxes/credentials"

import { GET, POST } from "./route"

const USER_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "11111111-1111-4111-8111-111111111111"

let selectedColumns = ""
let insertPayload: Record<string, unknown> | null = null
let insertError: { code?: string } | null = null

const VALID_BODY = {
  label: "Mein Postfach",
  provider: "imap",
  imap_host: "mail.example.test",
  imap_port: 993,
  imap_security: "tls",
  imap_username: "sven@example.test",
  password: "geheim",
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/mailboxes", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  selectedColumns = ""
  insertPayload = null
  insertError = null
  process.env.SECRETS_ENCRYPTION_KEY = "test-key"

  mocks.getAuthenticatedUserId.mockResolvedValue({
    userId: USER_ID,
    supabase: mocks.supabase,
  })
  mocks.resolveActiveTenantId.mockResolvedValue(TENANT_ID)
  mocks.requireTenantMember.mockResolvedValue(null)
  mocks.supabase.rpc.mockResolvedValue({ data: "CHIFFRE", error: null })

  mocks.supabase.from.mockImplementation(() => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
      select: (cols: string) => {
        selectedColumns = cols
        return chain
      },
      eq: self,
      order: () => ({ data: [], error: null }),
      insert: (payload: Record<string, unknown>) => {
        insertPayload = payload
        return chain
      },
      single: () => ({
        data: insertError ? null : { id: "neu", label: VALID_BODY.label },
        error: insertError,
      }),
    })
    return chain
  })
})

describe("PROJ-158 — GET /api/mailboxes", () => {
  it("verlangt eine Sitzung", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue({ userId: null, supabase: null })
    expect((await GET()).status).toBe(401)
  })

  it("verlangt einen aktiven Mandanten", async () => {
    mocks.resolveActiveTenantId.mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
  })

  it("gibt das verschlüsselte Geheimnis NICHT zurück (AC-158.2)", async () => {
    await GET()
    // Die tragende Zusicherung: der Chiffretext taucht in keiner Antwort auf.
    expect(selectedColumns).not.toContain("credential_encrypted")
    expect(selectedColumns).not.toContain("*")
    // Und die Auswahl stammt aus der geteilten Liste, nicht aus einer Kopie —
    // sonst könnten Route und Liste auseinanderlaufen.
    for (const col of MAILBOX_PUBLIC_COLUMNS) {
      expect(selectedColumns).toContain(col)
    }
  })
})

describe("PROJ-158 — POST /api/mailboxes", () => {
  it("verlangt eine Sitzung", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue({ userId: null, supabase: null })
    expect((await POST(req(VALID_BODY))).status).toBe(401)
  })

  it("legt ein IMAP-Postfach im Zustand unchecked an", async () => {
    const res = await POST(req(VALID_BODY))
    expect(res.status).toBe(201)
    expect(insertPayload).toMatchObject({
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      provider: "imap",
      status: "unchecked",
    })
  })

  it("schreibt das Passwort NIE im Klartext in die Ablage", async () => {
    await POST(req(VALID_BODY))
    const serialised = JSON.stringify(insertPayload)
    expect(serialised).not.toContain(VALID_BODY.password)
    expect(insertPayload).toHaveProperty("credential_encrypted", "CHIFFRE")
    expect(insertPayload).not.toHaveProperty("password")
  })

  it("weist Microsoft 365 und Gmail mit eigenem Grund ab, nicht als Eingabefehler", async () => {
    for (const provider of ["microsoft365", "gmail"]) {
      const res = await POST(req({ ...VALID_BODY, provider }))
      expect(res.status).toBe(422)
      const body = (await res.json()) as { error: { code: string } }
      // Eigener Code, damit die Oberfläche „kommt später" sagen kann statt
      // „ungültige Eingabe" — der Nutzer hat nichts falsch gemacht.
      expect(body.error.code).toBe("provider_not_available_yet")
    }
  })

  it.each([
    ["127.0.0.1"],
    ["10.0.0.5"],
    ["169.254.169.254"],
    ["localhost"],
  ])("weist den internen Host %s ab (AC-158.19)", async (host) => {
    const res = await POST(req({ ...VALID_BODY, imap_host: host }))
    expect(res.status).toBe(422)
    expect(insertPayload, "es darf nichts angelegt worden sein").toBeNull()
  })

  it.each(["imap_host", "imap_port", "imap_security", "imap_username", "password"])(
    "verlangt %s für ein IMAP-Postfach",
    async (field) => {
      const body: Record<string, unknown> = { ...VALID_BODY }
      delete body[field]
      const res = await POST(req(body))
      expect(res.status).toBe(400)
      expect(insertPayload).toBeNull()
    }
  )

  it("meldet ein doppeltes Postfach als 409, nicht als Serverfehler", async () => {
    insertError = { code: "23505" }
    const res = await POST(req(VALID_BODY))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("duplicate_mailbox")
  })

  it("legt nichts an, wenn der Server nicht verschlüsseln kann", async () => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    const res = await POST(req(VALID_BODY))
    expect(res.status).toBe(503)
    // Sonst entstünde ein Postfach ohne Geheimnis, das niemand prüfen kann.
    expect(insertPayload).toBeNull()
  })

  it("weist einen kaputten Rumpf ab", async () => {
    const res = await POST(
      new Request("http://localhost/api/mailboxes", { method: "POST", body: "{" })
    )
    expect(res.status).toBe(400)
  })
})
