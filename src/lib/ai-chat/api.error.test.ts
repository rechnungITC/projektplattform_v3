import { afterEach, describe, expect, it, vi } from "vitest"

import { ChatApiError, listFolders } from "./api"

/**
 * PROJ-Y-151b, F-2 — jede Chat-Fehlermeldung las sich woertlich
 * "[object Object]".
 *
 * Das Haus-Fehlerformat ist `{ error: { code, message } }` (apiError in
 * src/app/api/_lib/route-helpers.ts). Der Client typisierte `error` als
 * Zeichenkette und reichte das OBJEKT an den Fehlerkonstruktor weiter.
 * Betroffen war jeder Fehler: Modul aus, 403, 404, fehlerhafte Eingabe.
 *
 * Die Route-Tests konnten das nicht sehen — sie pruefen Statuscodes, nicht
 * was der Nutzer liest. Gefunden hat es der authentifizierte Durchlauf.
 */

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => body,
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe("ChatApiError aus dem Haus-Fehlerformat", () => {
  it("liest die Meldung aus { error: { code, message } }", async () => {
    respond(403, { error: { code: "forbidden", message: "Kein Zugriff." } })
    await expect(listFolders("p1")).rejects.toMatchObject({
      message: "Kein Zugriff.",
      status: 403,
      code: "forbidden",
    })
  })

  it("gibt niemals '[object Object]' aus", async () => {
    respond(404, { error: { code: "not_found", message: "Nicht gefunden." } })
    // `.catch()` weitet den Typ auf "Erfolg ODER Fehler" — deshalb erst
    // sicherstellen, dass wirklich geworfen wurde, statt den Typ wegzucasten.
    await expect(listFolders("p1")).rejects.toBeInstanceOf(ChatApiError)
    const err = await listFolders("p1").then(
      () => null,
      (e: unknown) => e as ChatApiError,
    )
    expect(err).not.toBeNull()
    expect(err!.message).not.toContain("[object Object]")
    expect(err!.message).toBe("Nicht gefunden.")
  })

  it("vertraegt weiterhin eine flache Zeichenkette", async () => {
    // Aeltere Routen antworten teils mit `{ error: "..." }`. Der Fix darf die
    // nicht schlechter behandeln als vorher.
    respond(400, { error: "kaputt" })
    await expect(listFolders("p1")).rejects.toMatchObject({
      message: "kaputt",
      status: 400,
    })
  })

  it("faellt auf den Statuscode zurueck, wenn gar kein Rumpf kommt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("kein JSON")
        },
      }),
    )
    await expect(listFolders("p1")).rejects.toMatchObject({ message: "HTTP 500" })
  })
})
