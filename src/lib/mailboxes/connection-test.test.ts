import { describe, expect, it, vi } from "vitest"

import {
  FORBIDDEN_DURING_CHECK,
  classifyMailboxError,
  runMailboxCheck,
  type MailboxCheckInput,
  type NarrowImapClient,
} from "./connection-test"

const INPUT: MailboxCheckInput = {
  host: "mail.example.test",
  port: 993,
  security: "tls",
  username: "sven@example.test",
  password: "geheim",
}

/**
 * Ein Doppelgaenger, der JEDEN Zugriff mitschreibt — auch auf Methoden, die es
 * gar nicht geben duerfte. Der Proxy ist der Kern des Nachweises: er kann
 * belegen, dass etwas NICHT aufgerufen wurde, was eine Attrappe mit festen
 * Methoden nicht kann.
 */
function spyClient(
  impl: Partial<NarrowImapClient> = {}
): { client: NarrowImapClient; touched: string[] } {
  const touched: string[] = []
  const base: NarrowImapClient = {
    connect: async () => {},
    list: async () => [{ path: "INBOX" }, { path: "Sent" }],
    logout: async () => {},
    ...impl,
  }
  const client = new Proxy(base, {
    get(target, prop: string) {
      touched.push(prop)
      return (target as unknown as Record<string, unknown>)[prop]
    },
  }) as NarrowImapClient
  return { client, touched }
}

describe("PROJ-158 — die Verbindungspruefung liest keine Nachricht", () => {
  it("ruft waehrend einer erfolgreichen Pruefung KEINE nachrichtennahe Methode auf", async () => {
    const { client, touched } = spyClient()
    const result = await runMailboxCheck(INPUT, () => client)

    expect(result.code).toBe("connected")
    // Die tragende Zusicherung zu AC-158.7.
    for (const forbidden of FORBIDDEN_DURING_CHECK) {
      expect(
        touched,
        `die Pruefung hat "${forbidden}" beruehrt — AC-158.7 verletzt`
      ).not.toContain(forbidden)
    }
  })

  it("beruehrt genau connect, list und logout — nicht mehr", async () => {
    const { client, touched } = spyClient()
    await runMailboxCheck(INPUT, () => client)
    expect([...new Set(touched)].sort()).toEqual(["connect", "list", "logout"])
  })

  it("oeffnet insbesondere keinen Ordner (mailboxOpen)", async () => {
    const { client, touched } = spyClient()
    await runMailboxCheck(INPUT, () => client)
    // Eigener Fall, weil das der subtilste der verbotenen Aufrufe ist: ein
    // geoeffneter Ordner kann je nach Server bereits Zustand veraendern.
    expect(touched).not.toContain("mailboxOpen")
  })

  it("gibt die Zahl der Ordner zurueck, nicht deren Inhalt", async () => {
    const { client } = spyClient({
      list: async () => [{ path: "INBOX" }, { path: "Sent" }, { path: "Trash" }],
    })
    const result = await runMailboxCheck(INPUT, () => client)
    expect(result.folderCount).toBe(3)
    expect(Object.keys(result)).toEqual(["code", "folderCount"])
  })

  it("meldet sich auch nach einem Fehler ab und wirft nicht", async () => {
    const { client, touched } = spyClient({
      connect: async () => {
        throw new Error("ECONNREFUSED")
      },
    })
    const result = await runMailboxCheck(INPUT, () => client)
    expect(result.code).toBe("unreachable")
    expect(touched).toContain("logout")
  })

  it("laeuft in die Zeitgrenze statt haengen zu bleiben (AC-158.10)", async () => {
    const { client } = spyClient({
      connect: () => new Promise<void>(() => {}), // antwortet nie
    })
    const result = await runMailboxCheck(INPUT, () => client, 20)
    expect(result.code).toBe("timeout")
  })

  it("ein fehlschlagendes Abmelden ueberschreibt das Ergebnis nicht", async () => {
    const { client } = spyClient({
      logout: async () => {
        throw new Error("socket already closed")
      },
    })
    const result = await runMailboxCheck(INPUT, () => client)
    expect(result.code).toBe("connected")
  })
})

describe("PROJ-158 — Fehlergruende sind Kennungen, keine Fremdtexte (AC-158.9)", () => {
  it.each([
    ["AuthenticationFailed: LOGIN failed", "auth_failed"],
    ["Invalid credentials (Failure)", "auth_failed"],
    ["getaddrinfo ENOTFOUND mail.example.test", "unreachable"],
    ["connect ECONNREFUSED 10.0.0.1:993", "unreachable"],
    ["self signed certificate in chain", "unreachable"],
    ["ETIMEDOUT", "timeout"],
    ["IMAP access is disabled for this mailbox", "mailbox_disabled"],
    ["Etwas voellig Unerwartetes", "error"],
  ])("%s -> %s", (raw, expected) => {
    expect(classifyMailboxError(new Error(raw))).toBe(expected)
  })

  it("gibt niemals den Rohtext zurueck", () => {
    const secret = "passwort-im-fehlertext-hunter2"
    const code = classifyMailboxError(new Error(`LOGIN failed for ${secret}`))
    expect(code).toBe("auth_failed")
    expect(JSON.stringify(code)).not.toContain(secret)
  })

  it("verwechselt „IMAP disabled\" nicht mit einem Anmeldefehler", () => {
    // Der Text enthaelt beides; die Reihenfolge der Pruefung entscheidet, und
    // eine Verwechslung schickt die Administration auf die Passwortsuche.
    expect(
      classifyMailboxError(new Error("NO [ALERT] IMAP disabled — auth aborted"))
    ).toBe("mailbox_disabled")
  })
})

describe("PROJ-158 — die verbotene Liste ist nicht leer", () => {
  it("nennt mindestens die nachrichtenlesenden Methoden", () => {
    // Ohne diesen Fall koennte jemand die Liste leeren und alle Zusicherungen
    // oben waeren trivial gruen.
    expect(FORBIDDEN_DURING_CHECK.length).toBeGreaterThanOrEqual(5)
    expect(FORBIDDEN_DURING_CHECK).toContain("fetch")
    expect(FORBIDDEN_DURING_CHECK).toContain("mailboxOpen")
  })
})

describe("PROJ-158 — der echte Client wird nur bei Bedarf geladen", () => {
  it("laedt die Bibliothek nicht, wenn eine Attrappe uebergeben wird", async () => {
    const spy = vi.fn()
    const { client } = spyClient()
    await runMailboxCheck(INPUT, () => {
      spy()
      return client
    })
    expect(spy).toHaveBeenCalledOnce()
  })
})
