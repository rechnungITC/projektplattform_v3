import { describe, expect, it } from "vitest"

import { ALPHA_PROVIDERS, validateMailboxHost } from "./validation"

describe("PROJ-158 — Host darf nicht ins interne Netz zeigen (AC-158.19)", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.10",
    "172.16.0.5",
    "169.254.169.254", // Metadaten-Endpunkt der Cloud — der klassische Fall
    "100.64.0.1",
    "0.0.0.0",
    "localhost",
    "mail.localhost",
    "::1",
    "fe80::1",
    "fd00::1",
  ])("weist %s ab", (host) => {
    expect(validateMailboxHost(host, 993)).toEqual({
      ok: false,
      code: "host_reserved",
    })
  })

  it.each([
    "mail.example.test",
    "imap.gmail.com",
    "outlook.office365.com",
    "8.8.8.8",
    "2606:4700::1111",
  ])("laesst %s zu", (host) => {
    // Gegenkontrolle: ohne sie wuerde ein Pruefer, der ALLES abweist, oben
    // vollstaendig gruen sein.
    expect(validateMailboxHost(host, 993).ok).toBe(true)
  })
})

describe("PROJ-158 — offensichtliche Fehleingaben", () => {
  it.each([
    ["", "host_empty"],
    ["   ", "host_empty"],
    ["https://mail.example.test", "host_malformed"],
    ["mail.example.test/inbox", "host_malformed"],
    ["user@mail.example.test", "host_malformed"],
    ["mail example test", "host_malformed"],
  ])("%s -> %s", (host, code) => {
    expect(validateMailboxHost(host, 993).code).toBe(code)
  })

  it("weist einen zu langen Namen ab", () => {
    expect(validateMailboxHost(`${"a".repeat(254)}.test`, 993).code).toBe(
      "host_too_long"
    )
  })

  it.each([0, -1, 65536, 1.5, Number.NaN])("weist Port %s ab", (port) => {
    expect(validateMailboxHost("mail.example.test", port as number).code).toBe(
      "port_invalid"
    )
  })

  it("laesst die ueblichen Ports zu", () => {
    for (const port of [143, 993, 1143]) {
      expect(validateMailboxHost("mail.example.test", port).ok).toBe(true)
    }
  })

  it("prueft den Host vor dem Port — ein reservierter Host mit gutem Port faellt durch", () => {
    // Die Reihenfolge zaehlt: ein Aufrufer, der nur auf `port_invalid` prueft,
    // wuerde einen internen Host sonst durchlassen.
    expect(validateMailboxHost("127.0.0.1", 993).code).toBe("host_reserved")
  })
})

describe("PROJ-158-α — nur IMAP ist in dieser Slice nutzbar", () => {
  it("fuehrt genau imap", () => {
    // β entfernt diese Einschraenkung; die Ablage kennt alle drei Werte
    // bereits, damit β keine Schema-Aenderung braucht.
    expect([...ALPHA_PROVIDERS]).toEqual(["imap"])
  })
})
