import { describe, expect, it } from "vitest"

import {
  contentForPersistence,
  DEFAULT_CHAT_RETENTION,
  resolveChatRetention,
} from "./chat-retention"

describe("resolveChatRetention", () => {
  it("speichert standardmäßig — ohne Verlauf ist ein Chat kein Chat", () => {
    expect(resolveChatRetention(null)).toBe("store")
    expect(DEFAULT_CHAT_RETENTION).toBe("store")
  })

  it("erbt NICHT die Assistenten-Einstellung", () => {
    // Genau dieser Wert steht bei allen sechs Mandanten in Prod. Würde er
    // geerbt, wäre der Verlauf im Produktivmandanten leer.
    const settings = { assistant_settings: { transcript_retention_mode: "persist_metadata_only" } }
    expect(resolveChatRetention(settings)).toBe("store")
  })

  it("nimmt die eigene Einstellung an, wenn sie gesetzt ist", () => {
    expect(resolveChatRetention({ ai_chat_settings: { history_retention: "none" } })).toBe("none")
    expect(resolveChatRetention({ ai_chat_settings: { history_retention: "redacted" } })).toBe("redacted")
  })

  it("fällt bei unbekanntem Wert auf den Default zurück statt zu raten", () => {
    expect(resolveChatRetention({ ai_chat_settings: { history_retention: "quatsch" } })).toBe("store")
  })
})

describe("contentForPersistence", () => {
  it("speichert unverändert bei 'store'", () => {
    expect(contentForPersistence("Hallo max@example.com", "store")).toBe("Hallo max@example.com")
  })

  it("nutzt die PROJ-40-Bereinigung bei 'redacted' statt einer eigenen Regelliste", () => {
    const out = contentForPersistence("Melde dich bei max@example.com", "redacted")
    expect(out).toContain("[redacted-email]")
    expect(out).not.toContain("max@example.com")
  })

  it("speichert bei 'none' nichts", () => {
    expect(contentForPersistence("geheim", "none")).toBeNull()
  })
})
