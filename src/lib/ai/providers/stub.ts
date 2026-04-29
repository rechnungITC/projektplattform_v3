/**
 * PROJ-12 — Stub provider.
 *
 * Deterministic fake risk-suggestion generator. Used:
 *   - automatically as fallback when ANTHROPIC_API_KEY is missing or when
 *     the router routes locally (Class-3 payload, EXTERNAL_AI_DISABLED, …)
 *     and Ollama isn't wired yet;
 *   - in vitest (no API key, no quota, no flakiness);
 *   - for local dev demos and stand-alone bootstrap.
 *
 * The shape is identical to what the Anthropic provider returns so the
 * downstream pipeline doesn't care which provider produced the data.
 */

import type {
  AIRiskProvider,
  RiskGenerationRequest,
} from "./types"
import type { RiskGenerationOutput, RiskSuggestion } from "../types"

const TEMPLATES: Array<Omit<RiskSuggestion, "title"> & { titleSeed: string }> = [
  {
    titleSeed: "Verzögerung der Datenmigration",
    description:
      "Die Datenmigration aus Altsystemen kann durch fehlende Datenqualität oder unklare Mappings ausbremsen.",
    probability: 3,
    impact: 4,
    status: "open",
    mitigation:
      "Frühe Datenqualitäts-Stichproben, dedizierte Migrations-Sprints, Fallback-Plan für Teil-Cutover.",
  },
  {
    titleSeed: "Fehlende Verfügbarkeit von Key-Usern",
    description:
      "Key-User aus den Fachbereichen sind im Tagesgeschäft gebunden und können Tests + Schulung nicht in der geplanten Tiefe leisten.",
    probability: 4,
    impact: 3,
    status: "open",
    mitigation:
      "Verbindliche Freistellung mit Steering Committee abstimmen; Backup-Tester pro Bereich identifizieren.",
  },
  {
    titleSeed: "Schnittstellen zu Drittsystemen",
    description:
      "Schnittstellen-Spezifikationen Dritter sind unvollständig oder ändern sich kurzfristig.",
    probability: 3,
    impact: 3,
    status: "open",
    mitigation:
      "Schnittstellen-Workshops vor Spec-Ende; Vertragliche Stabilitätszusagen einfordern; Mock-Server für frühen Test.",
  },
  {
    titleSeed: "Compliance-Konformität (DSGVO/Betriebsrat)",
    description:
      "Externe Compliance-Auflagen (Betriebsrat, Datenschutzbeauftragter) führen zu Nachzügler-Anforderungen.",
    probability: 2,
    impact: 4,
    status: "open",
    mitigation:
      "Compliance-Stakeholder in Sprint-0 einbinden; DSGVO-Checkliste vor jeder Phase abarbeiten.",
  },
  {
    titleSeed: "Budgetüberschreitung durch Change-Requests",
    description:
      "Während der Umsetzung entstehen unvorhergesehene Anforderungen, die das Budget belasten.",
    probability: 3,
    impact: 3,
    status: "open",
    mitigation:
      "Strenges CR-Management mit Steering-Approval ab definierter Schwelle; Reserve-Budget einplanen.",
  },
  {
    titleSeed: "Akzeptanz im Fachbereich",
    description:
      "Endanwender:innen befürchten Mehraufwand oder Bedienkomplexität — Akzeptanz sinkt nach Go-Live.",
    probability: 3,
    impact: 3,
    status: "open",
    mitigation:
      "Frühe Hands-On-Sessions; Champions pro Abteilung; Support-Hotline in den ersten 4 Wochen post-Go-Live.",
  },
]

function tagFromContext(request: RiskGenerationRequest, idx: number): string {
  const projectName = request.context.project.name
  const tag = projectName ? ` · ${projectName}` : ""
  return `${TEMPLATES[idx % TEMPLATES.length]!.titleSeed}${tag}`
}

export class StubRiskProvider implements AIRiskProvider {
  readonly name = "stub" as const
  readonly modelId = "stub-deterministic-v1"

  async generateRiskSuggestions(
    request: RiskGenerationRequest
  ): Promise<RiskGenerationOutput> {
    const start = Date.now()
    // Deterministic: pick the first N templates for the requested count.
    const count = Math.max(1, Math.min(request.count, TEMPLATES.length))
    const suggestions = Array.from({ length: count }, (_, i) => {
      const t = TEMPLATES[i % TEMPLATES.length]!
      return {
        title: tagFromContext(request, i),
        description: t.description,
        probability: t.probability,
        impact: t.impact,
        status: t.status,
        mitigation: t.mitigation,
      }
    })

    return {
      suggestions,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
      },
    }
  }
}
