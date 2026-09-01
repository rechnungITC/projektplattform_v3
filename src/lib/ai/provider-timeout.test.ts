/**
 * PROJ-152 — Tests für das Provider-Zeitbudget.
 *
 * Der Defekt, den diese Datei bewacht, ist **Stille**: ein Endpunkt, der die
 * Verbindung annimmt und nie antwortet. Ein Test, der einen *Fehler*
 * simuliert, würde ihn verfehlen — deshalb hängt der Kernfall hier an einer
 * Zusage, die von sich aus nie erfüllt wird, und die Zeit wird über
 * `vi.useFakeTimers()` vorgestellt statt real gewartet.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CLOUD_PROVIDER_TIMEOUT_MS,
  LOCAL_PROVIDER_TIMEOUT_MS,
  ProviderTimeoutError,
  createTimeoutFetch,
  describeProviderFallback,
} from "./provider-timeout"

describe("createTimeoutFetch", () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  it("bricht einen Endpunkt ab, der nie antwortet — der eigentliche Defekt", async () => {
    // Genau die Lage der zwei Prod-Zeilen vom 2026-08-27: kein Fehler,
    // keine Antwort, nur Stille.
    globalThis.fetch = vi.fn(
      (_input: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          )
        }),
    ) as unknown as typeof globalThis.fetch

    const timed = createTimeoutFetch("ollama", 5_000)
    const pending = timed("https://ollama.example/v1/chat/completions")
    const assertion = expect(pending).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    )

    await vi.advanceTimersByTimeAsync(5_001)
    await assertion
  })

  it("nennt Anbieter und Budget, damit die Meldung handlungsfähig ist", async () => {
    globalThis.fetch = vi.fn(
      (_input: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          )
        }),
    ) as unknown as typeof globalThis.fetch

    const timed = createTimeoutFetch("ollama", 5_000)
    const pending = timed("https://ollama.example/")
    const assertion = expect(pending).rejects.toThrow(
      /"ollama" hat innerhalb von 5 Sekunden/,
    )

    await vi.advanceTimersByTimeAsync(5_001)
    await assertion
  })

  it("lässt eine rechtzeitige Antwort unangetastet durch", async () => {
    const response = new Response("ok")
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch

    const timed = createTimeoutFetch("openai", 5_000)
    await expect(timed("https://api.openai.com/")).resolves.toBe(response)
  })

  it("meldet einen echten Netzwerkfehler unverändert weiter (kein falscher Timeout)", async () => {
    const boom = new Error("ECONNREFUSED")
    globalThis.fetch = vi.fn(async () => {
      throw boom
    }) as unknown as typeof fetch

    const timed = createTimeoutFetch("ollama", 5_000)
    await expect(timed("https://ollama.example/")).rejects.toBe(boom)
  })

  it("nimmt dem Aufrufer sein eigenes Abbruch-Signal nicht weg", async () => {
    // Gegenprobe: würde das Budget-Signal das eingehende ersetzen, liefe
    // ein vom Client abgebrochener Request bis zum Budget-Ende weiter.
    globalThis.fetch = vi.fn(
      (_input: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason),
          )
        }),
    ) as unknown as typeof globalThis.fetch

    const caller = new AbortController()
    const timed = createTimeoutFetch("ollama", 240_000)
    const pending = timed("https://ollama.example/", {
      signal: caller.signal,
    })
    // Der Abbruch des Aufrufers darf NICHT als Timeout verkleidet werden.
    const assertion = expect(pending).rejects.not.toBeInstanceOf(
      ProviderTimeoutError,
    )

    caller.abort()
    await vi.advanceTimersByTimeAsync(1)
    await assertion
  })
})

describe("Budgets", () => {
  it("gibt lokalen Modellen mehr Zeit als der Cloud", () => {
    // Live gemessene erfolgreiche Ollama-Läufe: 176 s und 253 s. Ein
    // cloud-taugliches Budget würde jeden davon abschneiden.
    expect(LOCAL_PROVIDER_TIMEOUT_MS).toBeGreaterThan(CLOUD_PROVIDER_TIMEOUT_MS)
    expect(LOCAL_PROVIDER_TIMEOUT_MS).toBeGreaterThanOrEqual(253_000 - 13_000)
  })

  it("bleibt unter der Vercel-Pro-Funktionsgrenze von 300 s", () => {
    // Sonst stirbt die Funktion, bevor der Provider aufgibt — und der Lauf
    // bliebe auf 'running' stehen, ohne dass jemand einen Grund sieht.
    expect(LOCAL_PROVIDER_TIMEOUT_MS).toBeLessThan(300_000)
  })
})

describe("describeProviderFallback", () => {
  it("nennt beim Timeout den Grund statt ihn in die generische Hülle zu packen", () => {
    const msg = describeProviderFallback(
      "ollama",
      new ProviderTimeoutError("ollama", 240_000),
    )
    expect(msg).not.toMatch(/fell back to Stub/)
    expect(msg).toMatch(/nicht geantwortet/)
  })

  it("behält für gewöhnliche Fehler die bestehende Formulierung bei", () => {
    const msg = describeProviderFallback("ollama", new Error("schema mismatch"))
    expect(msg).toBe(
      "Provider ollama failed (schema mismatch); fell back to Stub.",
    )
  })
})
