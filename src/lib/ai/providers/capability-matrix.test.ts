/**
 * PROJ-85 — provider capability-matrix regression guard.
 *
 * The router dispatches each AI purpose to the tenant's selected provider
 * and silently falls back to the StubProvider when the provider doesn't
 * implement the method. That silent fallback hid a real gap for months
 * (OpenAI/Google lacked the PROJ-65/70 graph purposes; Ollama lacked the
 * two Class-2 graph purposes). This test pins the intended matrix so a
 * future provider regression fails loudly here instead of degrading to
 * stub output in production.
 *
 * `resource_swap` is INTENTIONALLY Ollama-only (Class-3 → tenant-local,
 * PROJ-65 ε.4.β); cloud providers must NOT implement it.
 */

import { describe, expect, it } from "vitest"

import { AnthropicProvider } from "./anthropic"
import { AzureOpenAIProvider } from "./azure"
import { GoogleProvider } from "./google"
import { OllamaProvider } from "./ollama"
import { OpenAIProvider } from "./openai"
import { StubProvider } from "./stub"
import type { AIProvider } from "./types"
import type { AIPurpose } from "../types"

const anthropic = new AnthropicProvider("claude-test", "sk-test")
const openai = new OpenAIProvider({ apiKey: "sk-test", modelId: "gpt-test" })
const google = new GoogleProvider({ apiKey: "g-test", modelId: "gemini-test" })
// PROJ-92 — Azure is a cloud peer (Class-1/2 only), same purpose surface as
// the other cloud providers.
const azure = new AzureOpenAIProvider({
  endpoint: "https://res.openai.azure.com",
  deployment: "gpt-test",
  apiKey: "az-test",
  apiVersion: "2024-10-21",
})
const ollama = new OllamaProvider({
  endpointUrl: "https://ollama.test",
  modelId: "llama-test",
})
const stub = new StubProvider()

type Method =
  | "generateRiskSuggestions"
  | "generateNarrative"
  | "generateTrajectorySequence"
  | "generateCrossProjectLinks"
  | "generateProposalFromContext"
  | "generateResourceSwap"
  | "generateRiskProposals"
  | "generateClarifyingQuestions"

function has(provider: AIProvider, method: Method): boolean {
  return typeof (provider as unknown as Record<string, unknown>)[method] ===
    "function"
}

describe("PROJ-85 — provider capability matrix", () => {
  it("Stub implements every purpose (router fallback target)", () => {
    for (const m of [
      "generateRiskSuggestions",
      "generateNarrative",
      "generateTrajectorySequence",
      "generateCrossProjectLinks",
      "generateProposalFromContext",
      "generateResourceSwap",
      "generateRiskProposals",
      "generateClarifyingQuestions",
    ] as Method[]) {
      expect(has(stub, m), `stub.${m}`).toBe(true)
    }
  })

  it("cloud providers implement all non-Class-3 purposes", () => {
    for (const p of [anthropic, openai, google, azure]) {
      for (const m of [
        "generateRiskSuggestions",
        "generateNarrative",
        "generateTrajectorySequence",
        "generateCrossProjectLinks",
        "generateProposalFromContext",
        // PROJ-89 — content-classified, cloud-capable from day 1.
        "generateRiskProposals",
        // PROJ-135 — content-classified, cloud-capable from day 1.
        "generateClarifyingQuestions",
      ] as Method[]) {
        expect(has(p, m), `${p.name}.${m}`).toBe(true)
      }
    }
  })

  it("Ollama implements risk proposals (PROJ-89 Class-3 branch + local-preference tenants)", () => {
    expect(has(ollama, "generateRiskProposals")).toBe(true)
  })

  it("Ollama implements clarifying questions (PROJ-135 Class-3 branch + local-preference tenants)", () => {
    expect(has(ollama, "generateClarifyingQuestions")).toBe(true)
  })

  it("resource_swap is Ollama-only (Class-3, by design)", () => {
    expect(has(ollama, "generateResourceSwap")).toBe(true)
    expect(has(anthropic, "generateResourceSwap")).toBe(false)
    expect(has(openai, "generateResourceSwap")).toBe(false)
    expect(has(google, "generateResourceSwap")).toBe(false)
    // PROJ-92 — Azure is cloud → must NOT implement the Class-3-only purpose.
    expect(has(azure, "generateResourceSwap")).toBe(false)
  })

  it("Ollama implements the Class-2 graph purposes (PROJ-85 fix)", () => {
    // These were the residual silent-stub gap closed by PROJ-85.
    expect(has(ollama, "generateTrajectorySequence")).toBe(true)
    expect(has(ollama, "generateCrossProjectLinks")).toBe(true)
    // …plus the purposes Ollama already had.
    expect(has(ollama, "generateProposalFromContext")).toBe(true)
    expect(has(ollama, "generateRiskSuggestions")).toBe(true)
    expect(has(ollama, "generateNarrative")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// PROJ-80-α — die Matrix datengetrieben machen
// ---------------------------------------------------------------------------
// Befund beim Hinzufügen von `document_summary`: die Fälle oben sind von Hand
// geschrieben, einer je Zweck. Der Test prüft damit, woran sich jemand erinnert
// hat — nicht die `AIPurpose`-Union. Ein neuer Zweck kann also lautlos ohne
// Abdeckung bleiben, und genau daraus entstand PROJ-85 (stiller Stub-Rückfall).
//
// Die folgende Tabelle schließt das: sie ist über `AIPurpose` **erschöpfend**
// typisiert. Ein neuer Wert in der Union bricht die Kompilierung hier, bis
// jemand entscheidet, welcher Anbieter ihn können muss.

type ProviderMethod = keyof AIProvider

/** Für jeden Zweck: die Methode und wer sie implementieren MUSS. */
const PURPOSE_MATRIX: Record<
  AIPurpose,
  { method: ProviderMethod; cloud: boolean; ollama: boolean }
> = {
  risks: { method: "generateRiskSuggestions", cloud: true, ollama: true },
  // Diese drei laufen nicht über die Provider-Schnittstelle (kein eigener
  // Methodenname) — sie sind hier als "nicht anwendbar" verbucht, damit die
  // Erschöpfung trotzdem erzwungen wird.
  decisions: { method: "name", cloud: false, ollama: false },
  work_items: { method: "name", cloud: false, ollama: false },
  open_items: { method: "name", cloud: false, ollama: false },
  narrative: { method: "generateNarrative", cloud: true, ollama: true },
  // PROJ-34 — Stimmungs- und Coaching-Auswertung über Stakeholder-Interaktionen.
  // `classifySentimentAutoContext`/`classifyCoachingAutoContext` geben FEST 3
  // zurück: die Daten sind personenbezogen per Konstruktion. Cloud-Anbieter
  // dürfen sie deshalb NICHT können (Invariante #3). Live nachgemessen
  // 2026-08-14: nur Ollama + Stub — und das ist richtig so.
  sentiment: { method: "generateSentiment", cloud: false, ollama: true },
  coaching: { method: "generateCoaching", cloud: false, ollama: true },
  trajectory_sequence: {
    method: "generateTrajectorySequence",
    cloud: true,
    ollama: true,
  },
  // Class-3 per Konstruktion → ausdrücklich NUR lokal (PROJ-65 ε.4.β).
  resource_swap: { method: "generateResourceSwap", cloud: false, ollama: true },
  cross_project_links: {
    method: "generateCrossProjectLinks",
    cloud: true,
    ollama: true,
  },
  proposal_from_context: {
    method: "generateProposalFromContext",
    cloud: true,
    ollama: true,
  },
  // PROJ-88 — extrahiert Personen aus einem Kickoff, also Class-3-gepinnt.
  proposal_stakeholders_from_context: {
    method: "generateStakeholderProposals",
    cloud: false,
    ollama: true,
  },
  proposal_risks_from_context: {
    method: "generateRiskProposals",
    cloud: true,
    ollama: true,
  },
  clarifying_questions_from_context: {
    method: "generateClarifyingQuestions",
    cloud: true,
    ollama: true,
  },
  document_summary: {
    method: "generateDocumentSummary",
    cloud: true,
    ollama: true,
  },
  // PROJ-151-α — projektbezogener Chat. Muss von JEDEM Anbieter kommen: ein
  // Chat, der bei einem Mandanten still auf den leeren Stub fällt, ist von
  // "das Modell hat nichts gesagt" nicht zu unterscheiden (PROJ-85).
  project_chat: { method: "generateProjectChat", cloud: true, ollama: true },
}

describe("PROJ-80 — Capability-Matrix über die ganze AIPurpose-Union", () => {
  // Über die Schnittstelle indizieren, nicht über die konkreten Klassen:
  // `keyof AIProvider` ist auf `OllamaProvider`/`StubProvider` sonst kein
  // gültiger Index (die Klassen deklarieren die optionalen Methoden nicht alle).
  const ollamaAsProvider: AIProvider = ollama
  const stubAsProvider: AIProvider = stub

  const cloudProviders: [string, AIProvider][] = [
    ["anthropic", anthropic],
    ["openai", openai],
    ["google", google],
    ["azure", azure],
  ]

  for (const [purpose, spec] of Object.entries(PURPOSE_MATRIX) as [
    AIPurpose,
    (typeof PURPOSE_MATRIX)[AIPurpose],
  ][]) {
    if (spec.method === "name") continue // nicht über die Provider-Schnittstelle

    if (spec.cloud) {
      it(`${purpose}: jeder Cloud-Anbieter implementiert ${spec.method}`, () => {
        for (const [name, p] of cloudProviders) {
          expect(
            typeof p[spec.method],
            `${name} fehlt ${spec.method} — der Router fiele still auf den Stub zurück`,
          ).toBe("function")
        }
      })
    } else {
      it(`${purpose}: KEIN Cloud-Anbieter implementiert ${spec.method}`, () => {
        for (const [name, p] of cloudProviders) {
          expect(
            typeof p[spec.method],
            `${name} implementiert ${spec.method}, obwohl der Zweck lokal bleiben muss`,
          ).not.toBe("function")
        }
      })
    }

    if (spec.ollama) {
      it(`${purpose}: Ollama implementiert ${spec.method}`, () => {
        expect(typeof ollamaAsProvider[spec.method]).toBe("function")
      })
    }

    it(`${purpose}: der Stub implementiert ${spec.method} (Rückfallweg)`, () => {
      // Ohne Stub-Umsetzung wirft der Router-Rückfall statt leer zu liefern.
      expect(typeof stubAsProvider[spec.method]).toBe("function")
    })
  }
})
