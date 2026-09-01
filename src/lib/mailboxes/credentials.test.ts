import { beforeEach, describe, expect, it, vi } from "vitest"

import { decryptMailboxCredential, encryptMailboxCredential } from "./credentials"

/**
 * PROJ-Y-158a — Regressionsschutz für QA-Befund F-2.
 *
 * Der Defekt war ein **Parametername**: der Code rief
 * `decrypt_tenant_secret_with_key` mit `p_payload`, die Funktion in Prod nimmt
 * `p_secret_id uuid`. Nichts fing es, weil der einzige Test der Nachbarroute
 * die RPC mit einem erfundenen Rückgabewert mockte — ein Mock beantwortet
 * jeden Namen.
 *
 * DIESE DATEI IST NUR DIE HÄLFTE DES SCHUTZES, und das ist wichtig zu wissen:
 * sie nagelt fest, **was die Anwendung sendet**. Ob es die Datenbank auch
 * annimmt, kann ein Mock grundsätzlich nicht sagen. Die andere Hälfte ist der
 * Live-Vektor F1 in `tests/sql/PROJ-158-user-mailboxes-pentest.sql`, der die
 * Funktion mit **genau diesen** Namen gegen Prod aufruft. Erst beide zusammen
 * schließen die Lücke — wer hier etwas ändert, muss dort nachziehen.
 */

const rpc = vi.fn()
const supabase = { rpc } as never

beforeEach(() => {
  rpc.mockReset()
  process.env.SECRETS_ENCRYPTION_KEY = "test-key"
})

describe("PROJ-Y-158a — die gesendete Signatur ist festgenagelt", () => {
  it("ruft decrypt_user_mailbox_credential mit p_mailbox_id und p_key", async () => {
    rpc.mockResolvedValue({ data: { password: "geheim" }, error: null })
    await decryptMailboxCredential(supabase, "11111111-1111-4111-8111-111111111111")

    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe("decrypt_user_mailbox_credential")
    // Exakt diese Schlüssel — nicht „enthält": ein zusätzlicher oder
    // umbenannter Parameter ist genau der Defekt, um den es geht.
    expect(Object.keys(args).sort()).toEqual(["p_key", "p_mailbox_id"])
    expect(args.p_mailbox_id).toBe("11111111-1111-4111-8111-111111111111")
  })

  it("uebergibt die KENNUNG, nicht den Chiffretext", async () => {
    rpc.mockResolvedValue({ data: { password: "x" }, error: null })
    await decryptMailboxCredential(supabase, "22222222-2222-4222-8222-222222222222")
    const [, args] = rpc.mock.calls[0]
    // Der Chiffretext verlaesst die Datenbank seit PROJ-Y-158a gar nicht mehr.
    expect(String(args.p_mailbox_id)).not.toContain("\\x")
    expect(args).not.toHaveProperty("p_payload")
  })

  it("verschluesselt weiterhin ueber die Konnektor-Funktion", async () => {
    rpc.mockResolvedValue({ data: "CHIFFRE", error: null })
    await encryptMailboxCredential(supabase, { password: "geheim" })
    const [name, args] = rpc.mock.calls[0]
    // Diese Haelfte war nie kaputt: encrypt_tenant_secret ist rein und nimmt
    // wirklich eine Nutzlast. Der Test haelt fest, dass sie es bleibt.
    expect(name).toBe("encrypt_tenant_secret_with_key")
    expect(Object.keys(args).sort()).toEqual(["p_key", "p_payload"])
  })
})

describe("PROJ-Y-158a — die Gruende werden unterschieden", () => {
  it("meldet not_found, wenn die Zeile nicht sichtbar ist (P0002)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "not_found" } })
    const r = await decryptMailboxCredential(supabase, "id")
    expect(r).toEqual({ ok: false, reason: "not_found" })
  })

  it("meldet decrypt_failed bei jedem anderen Fehler", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "39000", message: "Wrong key" } })
    const r = await decryptMailboxCredential(supabase, "id")
    expect(r).toEqual({ ok: false, reason: "decrypt_failed" })
  })

  it("unterscheidet „kein Geheimnis hinterlegt\" vom Fehlschlag", async () => {
    // Der Unterschied ist nicht kosmetisch: erneutes Speichern hilft im einen
    // Fall und im anderen nicht. Die Vorfassung riet immer zum Speichern.
    rpc.mockResolvedValue({ data: null, error: null })
    const r = await decryptMailboxCredential(supabase, "id")
    expect(r).toEqual({ ok: false, reason: "no_credential" })
  })

  it("meldet encryption_unavailable ohne Schluessel und ruft gar nichts", async () => {
    delete process.env.SECRETS_ENCRYPTION_KEY
    const r = await decryptMailboxCredential(supabase, "id")
    expect(r).toEqual({ ok: false, reason: "encryption_unavailable" })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("liefert das Geheimnis, wenn alles stimmt", async () => {
    rpc.mockResolvedValue({ data: { password: "geheim" }, error: null })
    const r = await decryptMailboxCredential(supabase, "id")
    expect(r).toEqual({ ok: true, credential: { password: "geheim" } })
  })

  it("weist eine Antwort ohne Passwort-Feld zurueck", async () => {
    rpc.mockResolvedValue({ data: { nutzer: "x" }, error: null })
    const r = await decryptMailboxCredential(supabase, "id")
    expect(r).toEqual({ ok: false, reason: "decrypt_failed" })
  })
})
