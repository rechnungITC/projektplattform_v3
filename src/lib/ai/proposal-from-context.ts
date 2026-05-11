/**
 * PROJ-44-δ — `proposal_from_context` AI purpose.
 *
 * V1 ships as a stub similar to PROJ-21's KI-narrative stub: the
 * router signature is in place and Class-3 routing is enforced,
 * but the actual model call is replaced with a deterministic
 * templated proposal. A future slice swaps the stub for a real
 * provider call (Anthropic / Ollama, per tenant settings).
 *
 * Class-3 hard block: when the context source's `privacy_class`
 * is 3 AND no local provider is configured for the tenant, the
 * function silently skips proposal generation. This mirrors the
 * established pattern in `src/lib/ki/run.ts`.
 */

import type { ContextSource } from "@/types/context-source"
import type { DataClass } from "@/types/tenant-settings"

export type ProposalKind = "work_item" | "risk" | "decision" | "open_item"

export interface ContextProposal {
  kind: ProposalKind
  title: string
  description: string
  /** Derived classification — propagates the source's privacy_class. */
  classification: DataClass
  /** Provenance — which context source produced the proposal. */
  source_id: string
  /** Provider that generated the proposal. `stub` in V1. */
  provider: string
}

export interface InvokeProposalFromContextResult {
  source_id: string
  proposals: ContextProposal[]
  classification: DataClass
  provider: string
  /** Set when Class-3 routing prevented external calls and no
   *  local provider was configured. */
  blocked: boolean
  blocked_reason: string | null
}

interface InvokeArgs {
  source: Pick<
    ContextSource,
    "id" | "tenant_id" | "kind" | "title" | "content_excerpt" | "privacy_class"
  >
  /** Resolved tenant providers — when null, no local fallback. */
  hasLocalProvider: boolean
}

/**
 * Returns deterministic templated proposals based on the source
 * kind. Real model integration is the next slice. The output
 * shape is the wire contract the upcoming UI will consume.
 */
export async function invokeProposalFromContext(
  args: InvokeArgs,
): Promise<InvokeProposalFromContextResult> {
  const { source, hasLocalProvider } = args

  // Class-3 hard block. Without a local provider we don't proceed
  // — never leak personal data to an external API.
  if (source.privacy_class === 3 && !hasLocalProvider) {
    return {
      source_id: source.id,
      proposals: [],
      classification: 3,
      provider: "blocked",
      blocked: true,
      blocked_reason:
        "Class-3 input and no local provider configured for this tenant.",
    }
  }

  const provider = source.privacy_class === 3 ? "stub-local" : "stub"
  const title = source.title.trim()
  const proposals: ContextProposal[] = []

  // Templated derivation. The patterns mirror what the real
  // model is expected to produce for each context source kind.
  switch (source.kind) {
    case "email": {
      proposals.push({
        kind: "work_item",
        title: `Follow-up: ${title}`,
        description:
          "Aus einer eingehenden E-Mail abgeleitet — Inhalt prüfen und ggf. konkretisieren.",
        classification: source.privacy_class,
        source_id: source.id,
        provider,
      })
      proposals.push({
        kind: "open_item",
        title: `Klärung mit Absender: ${title}`,
        description:
          "Offener Punkt zur Rückmeldung an den Absender der E-Mail.",
        classification: source.privacy_class,
        source_id: source.id,
        provider,
      })
      break
    }
    case "meeting_notes":
    case "transcript": {
      proposals.push({
        kind: "decision",
        title: `Entscheidung aus Meeting: ${title}`,
        description:
          "Im Meeting genannter Entscheidungsbedarf — Beschreibung prüfen und ggf. ergänzen.",
        classification: source.privacy_class,
        source_id: source.id,
        provider,
      })
      proposals.push({
        kind: "work_item",
        title: `Action Item: ${title}`,
        description:
          "Aus dem Meeting abgeleitetes Arbeitspaket — verantwortliche Person und Termin pflegen.",
        classification: source.privacy_class,
        source_id: source.id,
        provider,
      })
      break
    }
    case "document": {
      proposals.push({
        kind: "risk",
        title: `Risiko aus Dokument: ${title}`,
        description:
          "Dokument enthält risikorelevante Aussagen — Risiko erfassen oder bestätigen, dass keines vorliegt.",
        classification: source.privacy_class,
        source_id: source.id,
        provider,
      })
      break
    }
    case "other":
    default: {
      proposals.push({
        kind: "work_item",
        title: `Eingang prüfen: ${title}`,
        description: "Generischer Vorschlag — Inhalt prüfen und ggf. überführen.",
        classification: source.privacy_class,
        source_id: source.id,
        provider,
      })
      break
    }
  }

  return {
    source_id: source.id,
    proposals,
    classification: source.privacy_class,
    provider,
    blocked: false,
    blocked_reason: null,
  }
}
