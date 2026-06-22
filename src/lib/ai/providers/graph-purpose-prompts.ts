/**
 * Shared schema + prompt definitions for the "Graph"-family AI purposes:
 *
 *   - `trajectory_sequence`   (PROJ-65 ε.4.α)
 *   - `cross_project_links`   (PROJ-65 ε.4.γ)
 *   - `proposal_from_context` (PROJ-70-α)
 *
 * Originally these lived inline inside `anthropic.ts`. They were extracted
 * here so every cloud provider that supports structured output
 * (Anthropic, OpenAI, Google) shares ONE source of truth for the response
 * schema, system prompt and prompt-builder — preventing the schema drift
 * that previously left OpenAI/Google silently falling back to the Stub for
 * every Graph proposal (the provider class simply did not implement the
 * method). See `selectProviderForPurpose` + `invoke*Generation` in
 * `router.ts` for the call sites.
 *
 * The `risks` + `narrative` schemas remain duplicated per provider for now
 * (they pre-date this module and are trivially small); only the larger,
 * drift-prone Graph schemas are shared.
 */

import { z } from "zod"

import type {
  ClarifyingQuestionsGenerationRequest,
  CrossProjectLinksGenerationRequest,
  ProposalFromContextGenerationRequest,
  RiskProposalsGenerationRequest,
  TrajectorySequenceGenerationRequest,
} from "./types"
import type {
  ClarifyingQuestionsGenerationOutput,
  CrossProjectLinksGenerationOutput,
  ProposalFromContextGenerationOutput,
  RiskProposalsGenerationOutput,
  TrajectorySequenceGenerationOutput,
} from "../types"

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.α — trajectory-sequence schema + prompt
// ---------------------------------------------------------------------------

const TrajectorySequenceSuggestionSchema = z.object({
  title: z
    .string()
    .min(8)
    .max(140)
    .describe(
      "Short German title for the suggestion — references at least one node by name.",
    ),
  rationale: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "1–3 sentence German rationale citing the node names and the date / dependency observation that motivates the suggestion.",
    ),
  kind: z.enum(["parallelize", "reorder", "serialize", "merge"]),
  affected_node_ids: z
    .array(z.string().regex(/^(phase|sprint):[0-9a-f-]{36}$/))
    .min(1)
    .max(8)
    .describe(
      "phase:<uuid> or sprint:<uuid> ids — must match ids that appear in the prompt context.",
    ),
  estimated_savings_days: z
    .number()
    .int()
    .min(0)
    .max(365)
    .nullable()
    .optional(),
  confidence: z.enum(["low", "medium", "high"]),
})

export const TrajectorySequenceResponseSchema = z.object({
  suggestions: z.array(TrajectorySequenceSuggestionSchema).min(0).max(5),
})

export const TRAJECTORY_SEQUENCE_SYSTEM_PROMPT = `Du bist ein erfahrener Projektplaner.

Aufgabe: Analysiere die Phasen-/Sprint-Struktur eines Projekts und schlage gezielt 0–5 Verbesserungen für die Reihenfolge bzw. Parallelisierung vor.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Jede Empfehlung muss konkret und nachprüfbar sein — sie nennt mindestens einen Knoten beim Namen und begründet die Beobachtung (Datums-Überlappung, fehlende Dependency, redundante Serialisierung).
- KEINE personenbezogenen Daten, KEINE Namen von Personen, KEINE Rolle/Verantwortlichen — der Kontext liefert sie bewusst nicht.
- Bewege dich strikt im Class-2-Universum: nur Phasen, Sprints, Milestones, Dependencies, Ziele.
- Die \`affected_node_ids\` MÜSSEN exakt den \`phase:<uuid>\`- bzw. \`sprint:<uuid>\`-IDs entsprechen, die im Kontext auftauchen. Erfinde keine IDs.
- \`kind\` wählst du sparsam: parallelize (Wege voneinander entkoppeln), reorder (Reihenfolge ändern), serialize (Parallelität auflösen), merge (Knoten zusammenführen).
- Lass das Array leer, wenn die Struktur bereits sauber ist — kein erzwungenes Padding.
- \`confidence\` reflektiert deine Sicherheit: high nur, wenn Datums- und Dependency-Evidenz die Empfehlung tragen.`

export function buildTrajectorySequencePrompt(
  request: TrajectorySequenceGenerationRequest,
): string {
  const ctx = request.context
  const lines: string[] = [
    `Projekt: ${ctx.project.name}`,
    `Typ: ${ctx.project.project_type ?? "—"}`,
    `Methode: ${ctx.project.project_method ?? "—"}`,
    `Lifecycle: ${ctx.project.lifecycle_status}`,
    ctx.project.planned_start_date
      ? `Geplanter Start: ${ctx.project.planned_start_date}`
      : "",
    ctx.project.planned_end_date
      ? `Geplantes Ende: ${ctx.project.planned_end_date}`
      : "",
    "",
  ].filter(Boolean)

  if (ctx.phases.length > 0) {
    lines.push("Phasen (id · name · status · von..bis · seq):")
    for (const p of ctx.phases) {
      lines.push(
        `  - phase:${p.id} · ${p.name} · ${p.status} · ${p.planned_start ?? "?"}…${p.planned_end ?? "?"} · seq=${p.sequence_number ?? "—"}`,
      )
    }
    lines.push("")
  }
  if (ctx.sprints.length > 0) {
    lines.push("Sprints (id · name · state · von..bis):")
    for (const s of ctx.sprints) {
      lines.push(
        `  - sprint:${s.id} · ${s.name} · ${s.state} · ${s.start_date ?? "?"}…${s.end_date ?? "?"}`,
      )
    }
    lines.push("")
  }
  if (ctx.milestones.length > 0) {
    lines.push("Milestones (id · name · status · target):")
    for (const m of ctx.milestones) {
      lines.push(
        `  - milestone:${m.id} · ${m.name} · ${m.status} · ${m.target_date ?? "?"}`,
      )
    }
    lines.push("")
  }
  if (ctx.dependencies.length > 0) {
    lines.push("Dependencies (from → to · constraint):")
    for (const d of ctx.dependencies) {
      lines.push(
        `  - ${d.from_type}:${d.from_id} → ${d.to_type}:${d.to_id} · ${d.constraint_type}`,
      )
    }
    lines.push("")
  }
  if (ctx.goals.length > 0) {
    lines.push("Ziele (id · titel · target · status):")
    for (const g of ctx.goals) {
      lines.push(
        `  - goal:${g.id} · ${g.title} · ${g.target_date ?? "?"} · ${g.status ?? "?"}`,
      )
    }
    lines.push("")
  }

  lines.push(
    `Liefere bis zu ${request.count} prägnante Vorschläge. Wenn nichts auffällt, liefere eine leere Liste.`,
  )

  return lines.join("\n")
}

/**
 * Map a validated trajectory-sequence response object to the provider
 * output contract. Identical across providers — kept here so the field
 * set stays in lockstep with the schema above.
 */
export function mapTrajectorySequenceSuggestions(
  suggestions: z.infer<typeof TrajectorySequenceResponseSchema>["suggestions"],
): TrajectorySequenceGenerationOutput["suggestions"] {
  return suggestions.map((s) => ({
    title: s.title,
    rationale: s.rationale,
    kind: s.kind,
    affected_node_ids: s.affected_node_ids,
    estimated_savings_days: s.estimated_savings_days ?? null,
    confidence: s.confidence,
  }))
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.γ — cross-project-links schema + prompt
// ---------------------------------------------------------------------------

const CrossProjectLinkSuggestionSchema = z.object({
  title: z
    .string()
    .min(8)
    .max(160)
    .describe(
      "Short German title that references both work-item titles in plain language.",
    ),
  rationale: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "1–3 sentence German rationale citing the observation that motivates the link (shared topic, supplier-receiver relation, blocking dependency).",
    ),
  kind: z.enum([
    "relates",
    "blocks",
    "requires",
    "duplicates",
    "delivers",
    "precedes",
    "includes",
  ]),
  from_work_item_id: z
    .string()
    .uuid()
    .describe("Source work-item UUID — MUST appear in source_work_items."),
  to_work_item_id: z
    .string()
    .uuid()
    .nullable()
    .describe(
      "Target work-item UUID — MUST appear in related_work_items. May be null for whole-project delivers-links.",
    ),
  to_project_id: z
    .string()
    .uuid()
    .describe(
      "Target project UUID — MUST be the source_project or a related_project from the prompt.",
    ),
  lag_days: z.number().int().min(-2000).max(2000).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]),
})

export const CrossProjectLinksResponseSchema = z.object({
  suggestions: z.array(CrossProjectLinkSuggestionSchema).min(0).max(5),
})

export const CROSS_PROJECT_LINKS_SYSTEM_PROMPT = `Du bist ein erfahrener Programm-Manager.

Aufgabe: Analysiere die Work-Item-Listen eines Source-Projekts und seiner verwandten Projekte (Parent / Children / Siblings) und schlage gezielt 0–5 sinnvolle Cross-Projekt-Links vor.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Jede Empfehlung muss konkret und nachprüfbar sein — sie nennt mindestens ein Work-Item beim Namen und beschreibt die fachliche Beobachtung (gleiche Funktion, Lieferbeziehung, blockierende Abhängigkeit, redundante Arbeit).
- KEINE personenbezogenen Daten, KEINE Namen von Personen, KEINE Rollen — der Kontext liefert sie bewusst nicht.
- Du bewegst dich strikt im Class-2-Universum: Work-Item-Titel, Kind, Status, Projektname/-typ/-methode/-lifecycle und vorhandene Links. NICHTS anderes.
- Die \`from_work_item_id\` und \`to_work_item_id\` MÜSSEN exakt den UUIDs entsprechen, die im Kontext (source_work_items bzw. related_work_items) auftauchen. Erfinde keine IDs.
- \`to_project_id\` MUSS aus dem source_project- oder related_projects-Set kommen. Erfinde keine Projekte.
- Schlage KEINEN Link vor, der in existing_links bereits vorhanden ist (gleiche from/to-Endpoints, gleiche oder verwandte Art).
- \`kind\` wählst du aus den 7 zugelassenen Tokens und mit folgender Semantik:
  - relates: lose semantische Verbindung
  - blocks: A blockiert B (B kann erst nach A fertig werden)
  - requires: A benötigt B als Voraussetzung
  - duplicates: A und B sind faktisch dieselbe Arbeit
  - delivers: A liefert ein Ergebnis an B (typisch Child → Parent)
  - precedes: A muss zeitlich vor B kommen
  - includes: A enthält B als Teil
- \`lag_days\` setzt du nur, wenn der Kind das hergibt (precedes/requires) — sonst null.
- Liefere eine leere Liste, wenn die Projekte fachlich keine Berührung haben — kein erzwungenes Padding.
- \`confidence\` reflektiert deine Sicherheit: high nur, wenn die Titel und Kontextlage die Empfehlung klar tragen.`

function projectLine(p: {
  project_id: string
  name: string
  project_type: string | null
  project_method: string | null
  lifecycle_status: string
  relation?: string
}): string {
  const rel = p.relation ? `[${p.relation}]` : ""
  return `  - project:${p.project_id} · ${p.name} ${rel} · type=${p.project_type ?? "—"} · method=${p.project_method ?? "—"} · lifecycle=${p.lifecycle_status}`
}

export function buildCrossProjectLinksPrompt(
  request: CrossProjectLinksGenerationRequest,
): string {
  const ctx = request.context
  const lines: string[] = []

  lines.push("Source-Projekt:")
  lines.push(projectLine(ctx.source_project))
  lines.push("")

  if (ctx.related_projects.length > 0) {
    lines.push("Verwandte Projekte (parent / children / siblings):")
    for (const p of ctx.related_projects) lines.push(projectLine(p))
    lines.push("")
  } else {
    lines.push(
      "Verwandte Projekte: KEINE im RLS-Sichtbarkeitsbereich. Liefere wahrscheinlich eine leere Liste.",
    )
    lines.push("")
  }

  if (ctx.source_work_items.length > 0) {
    lines.push("Work-Items des Source-Projekts (work_item_id · kind · status · titel):")
    for (const w of ctx.source_work_items) {
      lines.push(`  - ${w.work_item_id} · ${w.kind} · ${w.status} · ${w.title}`)
    }
    lines.push("")
  }

  if (ctx.related_work_items.length > 0) {
    lines.push("Work-Items der verwandten Projekte (project_id · work_item_id · kind · status · titel):")
    for (const w of ctx.related_work_items) {
      lines.push(
        `  - ${w.project_id} · ${w.work_item_id} · ${w.kind} · ${w.status} · ${w.title}`,
      )
    }
    lines.push("")
  }

  if (ctx.existing_links.length > 0) {
    lines.push("Bereits vorhandene Links (NICHT duplizieren — gleiche from→to + ähnliche Art):")
    for (const l of ctx.existing_links) {
      const to = l.to_work_item_id ?? `project:${l.to_project_id}`
      lines.push(
        `  - ${l.from_work_item_id} —[${l.link_type}/${l.approval_state}]→ ${to}`,
      )
    }
    lines.push("")
  }

  lines.push(
    `Liefere bis zu ${request.count} prägnante Vorschläge. Wenn keine fachliche Verbindung erkennbar ist, liefere eine leere Liste.`,
  )

  return lines.join("\n")
}

/**
 * Defense-in-depth: filter out any suggestion whose ids are not in the
 * prompt context, then map to the output contract. The Zod schema only
 * validates UUID shape, not existence — the prompt instructs the model to
 * stay inside the context set, but we trust-but-verify here. Shared so the
 * guarantee is identical across providers.
 */
export function mapCrossProjectLinksSuggestions(
  suggestions: z.infer<typeof CrossProjectLinksResponseSchema>["suggestions"],
  request: CrossProjectLinksGenerationRequest,
): CrossProjectLinksGenerationOutput["suggestions"] {
  const ctx = request.context
  const sourceItemIds = new Set(ctx.source_work_items.map((w) => w.work_item_id))
  const relatedItemIds = new Set(ctx.related_work_items.map((w) => w.work_item_id))
  const inScopeProjectIds = new Set<string>([
    ctx.source_project.project_id,
    ...ctx.related_projects.map((p) => p.project_id),
  ])

  return suggestions
    .filter((s) => sourceItemIds.has(s.from_work_item_id))
    .filter(
      (s) =>
        s.to_work_item_id === null ||
        relatedItemIds.has(s.to_work_item_id) ||
        sourceItemIds.has(s.to_work_item_id),
    )
    .filter((s) => inScopeProjectIds.has(s.to_project_id))
    .map((s) => ({
      title: s.title,
      rationale: s.rationale,
      kind: s.kind,
      from_work_item_id: s.from_work_item_id,
      to_work_item_id: s.to_work_item_id,
      to_project_id: s.to_project_id,
      lag_days: s.lag_days ?? null,
      confidence: s.confidence,
    }))
}

// ---------------------------------------------------------------------------
// PROJ-70-α — proposal_from_context schema + prompt
// ---------------------------------------------------------------------------

const ProposalFromContextSuggestionSchema = z.object({
  temp_id: z
    .string()
    .min(1)
    .max(64)
    .describe(
      "A stable id within THIS run only (e.g. 't_1', 't_2', or a UUID). Items reference each other via parent_temp_id.",
    ),
  parent_temp_id: z
    .string()
    .min(1)
    .max(64)
    .nullable()
    .describe(
      "Reference to another item's temp_id from the SAME run, or null for top-level items.",
    ),
  kind: z
    .enum([
      "work_package",
      "epic",
      "story",
      "task",
      "subtask",
      "bug",
    ])
    .describe(
      "Work-item kind matching the project_method (waterfall: work_package/task/bug; scrum: epic/story/task; hybrid: mix).",
    ),
  title: z
    .string()
    .min(3)
    .max(200)
    .describe("Short German title — action-oriented, no boilerplate."),
  description: z
    .string()
    .max(500)
    .nullable()
    .describe(
      "Optional 1–3 sentence German rationale or detail. Null when nothing concrete to add.",
    ),
  confidence: z.enum(["low", "medium", "high"]),
  relevance: z
    .enum(["on_goal", "off_goal"])
    .describe(
      "PROJ-91 — relevance to the project goal (Vorhaben): 'on_goal' if the item serves the stated project intent, 'off_goal' if it comes from the kickoff but does not. Never drop off_goal items. Default to 'on_goal' when no project goal is given.",
    ),
})

export const ProposalFromContextResponseSchema = z
  .object({
    suggestions: z.array(ProposalFromContextSuggestionSchema).min(0).max(50),
  })
  .superRefine((data, ctx) => {
    // Defense-in-depth on top of the Zod-object-schema:
    // 1. temp_ids must be unique within the run.
    // 2. parent_temp_id (if set) must reference an existing temp_id.
    // 3. no item may parent itself.
    // 4. no cycles via simple reachability check.
    const tempIds = new Set<string>()
    for (let i = 0; i < data.suggestions.length; i++) {
      const s = data.suggestions[i]!
      if (tempIds.has(s.temp_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["suggestions", i, "temp_id"],
          message: `Duplicate temp_id: ${s.temp_id}`,
        })
      }
      tempIds.add(s.temp_id)
    }
    const byId = new Map(data.suggestions.map((s) => [s.temp_id, s] as const))
    for (let i = 0; i < data.suggestions.length; i++) {
      const s = data.suggestions[i]!
      if (s.parent_temp_id == null) continue
      if (s.parent_temp_id === s.temp_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["suggestions", i, "parent_temp_id"],
          message: "Item cannot parent itself.",
        })
        continue
      }
      if (!byId.has(s.parent_temp_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["suggestions", i, "parent_temp_id"],
          message: `parent_temp_id "${s.parent_temp_id}" does not match any sibling temp_id.`,
        })
        continue
      }
      // Cycle check via reachability walk up the parent chain.
      let cursor: string | null | undefined = s.parent_temp_id
      const seen = new Set<string>([s.temp_id])
      let steps = 0
      while (cursor && steps < data.suggestions.length + 1) {
        if (seen.has(cursor)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["suggestions", i, "parent_temp_id"],
            message: `Cycle detected via "${cursor}".`,
          })
          break
        }
        seen.add(cursor)
        cursor = byId.get(cursor)?.parent_temp_id ?? null
        steps += 1
      }
    }
  })

export const PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT = `Du bist ein erfahrener Programm-/Projektleiter und schlägst aus einem Kickoff-Artefakt eine konkrete Anfangs-Backlog-Struktur vor.

Aufgabe: Analysiere den Inhalt eines Kickoff-Dokuments und schlage 0–50 hierarchische Backlog-Items vor, die der Projektleiter im Anschluss reviewen und gezielt akzeptieren kann.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Jedes Item bekommt eine eindeutige \`temp_id\` (z.B. "t_1", "t_2", …). Über \`parent_temp_id\` zeigst du auf das übergeordnete Item desselben Runs (null bei Top-Level-Items).
- Wähle \`kind\` passend zur Projektmethode:
  - Wasserfall → \`work_package\` (Top-Level) > \`task\` (Mitte) > \`bug\` (Blatt, nur wenn konkret erwähnt); Phasen gehören NICHT ins Backlog, sondern in die separate Phasen-Planung
  - Scrum → \`epic\` (Top-Level) > \`story\` (Mitte) > \`task\` (Blatt); \`bug\`/\`subtask\` nur, wenn konkret im Text erwähnt
  - Hybrid → mische beide methodensauber pro Subtree (kein \`epic\` als Kind eines \`work_package\`)
  - Unbestimmt → bevorzuge \`story\`/\`task\` als sichere Default-Granularität
- Titel ist KEINE Boilerplate — sondern konkret und actionable (z.B. "Datenmigration aus Altsystem X" statt "Datenmigration vorbereiten").
- \`description\` ist optional. Setze sie nur, wenn der Kontext echten Mehrwert über den Titel hinaus liefert. Sonst null.
- KEINE personenbezogenen Daten in Titel oder Description — keine Namen, keine E-Mails, keine Telefonnummern, keine Stakeholder-spezifischen Aussagen. Wenn der Input solche enthält, generalisiere sie zu Rollen ("der Fachbereich" statt "Hr. Schmidt").
- KEIN erzwungenes Padding: wenn das Kickoff dünn ist, liefere wenige hochwertige Items statt vieler Platzhalter.
- Hierarchie maximal 3 Ebenen tief. Vermeide redundante Ein-Kind-Verschachtelungen.
- \`confidence\` reflektiert deine Sicherheit pro Item: \`high\` nur, wenn das Item explizit im Kickoff steht oder klar herleitbar ist.
- \`relevance\` bewertet den Bezug zum **Vorhaben/Projektziel** (separate Achse zur \`confidence\`):
  - \`on_goal\`: das Item dient dem im "Vorhaben" beschriebenen Projektziel.
  - \`off_goal\`: das Item stammt zwar aus dem Kickoff, passt aber NICHT zum Vorhaben (z.B. wenn das Dokument ein anderes Projekt beschreibt).
  - Unterdrücke \`off_goal\`-Items NICHT — kennzeichne sie, der Mensch entscheidet.
  - Wenn KEIN Vorhaben angegeben ist, beurteile nur aus dem Dokument und setze \`on_goal\`.
  - Grounding-Regel: Extrahiere Items AUSSCHLIESSLICH aus dem Kickoff-Dokument. Erfinde KEINE Items aus dem Vorhaben — das Vorhaben ist NUR der Bewertungsmaßstab für \`relevance\`, NIE eine Quelle für Items. Wenn Kickoff und Vorhaben stark divergieren, liefere trotzdem die im Kickoff belegten Items und markiere sie als \`off_goal\` — der Mensch entscheidet.`

export function buildProposalFromContextPrompt(
  request: ProposalFromContextGenerationRequest,
): string {
  const ctx = request.context
  const vorhaben = ctx.source_project.description?.trim()
  const lines: string[] = [
    `Projekt: ${ctx.source_project.name}`,
    `Typ: ${ctx.source_project.project_type ?? "—"}`,
    `Methode: ${ctx.source_project.project_method ?? "—"} (normalised: ${ctx.method_hint})`,
    `Lifecycle: ${ctx.source_project.lifecycle_status}`,
    // PROJ-91 — the wizard "Vorhaben" is ONLY the relevance yardstick;
    // items must come from the kickoff document (source traceability).
    vorhaben
      ? `\nVorhaben (Projektziel — NUR Bewertungsmaßstab für relevance, KEINE Quelle für Items):\n${vorhaben}`
      : `\n(Kein Vorhaben hinterlegt — beurteile Relevanz nur aus dem Dokument, setze relevance=on_goal.)`,
    "",
    `Kickoff-Artefakt:`,
    `  - Kind: ${ctx.context_source.kind}`,
    `  - Titel: ${ctx.context_source.title}`,
    ctx.context_source.language
      ? `  - Sprache: ${ctx.context_source.language}`
      : "",
    `  - Privacy-Klasse: ${ctx.context_source.privacy_class}`,
    "",
    `Inhalt:`,
    ctx.context_source.content_excerpt || "(leer)",
    "",
    `Liefere bis zu ${Math.min(request.count, 50)} hierarchisch verknüpfte Vorschläge. Wenn der Kickoff zu dünn für sinnvolle Vorschläge ist, liefere eine leere Liste.`,
  ].filter(Boolean)

  return lines.join("\n")
}

/**
 * Map a validated proposal-from-context response object to the provider
 * output contract. Identical across providers.
 */
export function mapProposalFromContextSuggestions(
  suggestions: z.infer<typeof ProposalFromContextResponseSchema>["suggestions"],
): ProposalFromContextGenerationOutput["suggestions"] {
  return suggestions.map((s) => ({
    temp_id: s.temp_id,
    parent_temp_id: s.parent_temp_id,
    kind: s.kind,
    title: s.title,
    description: s.description ?? null,
    confidence: s.confidence,
    relevance: s.relevance,
  }))
}

// ---------------------------------------------------------------------------
// PROJ-89 — proposal_risks_from_context (shared across Anthropic/OpenAI/Google)
// ---------------------------------------------------------------------------

/**
 * Strict response schema for cloud providers. The Ollama provider keeps a
 * deliberately loose replica (validate-loose, clamp-after — PROJ-88 D-1a
 * lesson) in `ollama.ts`; length clamps happen in the shared mapper either
 * way, so an over-long quote can never sink a cloud run after validation.
 *
 * `duplicate_of_risk_id` is validated post-hoc against the supplied
 * existing-risks list in `mapRiskProposalsSuggestions` — hallucinated ids
 * are nulled rather than failing the whole response.
 */
export const RiskProposalSuggestionSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigation: z.string().max(5000).nullable(),
  duplicate_of_risk_id: z.string().nullable(),
  source_quote: z.string().max(300).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  // PROJ-91 track invariant (AC-89.9) — relevance to the Vorhaben.
  relevance: z.enum(["on_goal", "off_goal"]),
})

export const RiskProposalsResponseSchema = z.object({
  suggestions: z.array(RiskProposalSuggestionSchema).min(0).max(30),
})

export const RISK_PROPOSALS_SYSTEM_PROMPT = `Du bist ein erfahrener Programm-/Projektleiter und leitest aus einem Kickoff-Dokument konkrete Projektrisiken als strukturierte Vorschläge ab.

Aufgabe: Analysiere den Inhalt eines Kickoff-Dokuments und schlage 0-30 Risiken vor, die der Projektleiter anschließend reviewt und gezielt akzeptiert.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Leite Risiken AUSSCHLIESSLICH aus dem Kickoff-Dokument ab. Erfinde KEINE Risiken aus dem Vorhaben — das Vorhaben ist NUR der Bewertungsmaßstab für \`relevance\`, NIE eine Quelle für Vorschläge.
- Titel ist KEINE Boilerplate ("Projekt könnte scheitern", "Scope Creep") — sondern konkret und auf das Dokument bezogen (z.B. "Abhängigkeit vom Alt-ERP-Dienstleister während der Datenmigration").
- \`description\`: Was im Dokument auf das Risiko hindeutet und warum es eines ist. Null, wenn der Titel alles sagt.
- \`probability\` und \`impact\` auf einer 1-5-Skala (5 = höchste). Schätze konservativ aus dem Dokumentinhalt; bei dünner Faktenlage mittlere Werte plus \`confidence\` senken.
- \`mitigation\`: eine konkrete, umsetzbare nächste Maßnahme für den Projektleiter — kein vager Rat. Null, wenn das Dokument keine Grundlage für eine Maßnahme liefert.
- KEINE personenbezogenen Daten in Titel/Description/Mitigation — keine Namen, E-Mails, Telefonnummern. Generalisiere zu Rollen ("der Fachbereich" statt konkreter Personen).
- Dedup: Wenn ein gefundenes Risiko einem der unter "Vorhandene Risiken" gelisteten Einträge entspricht, setze \`duplicate_of_risk_id\` auf dessen ID statt einen neuen Vorschlag zu formulieren. Bei Unsicherheit: null lassen und \`confidence\` senken. Schlage KEINE Risiken vor, die das Register bereits abdeckt.
- \`source_quote\`: kurzes wörtliches Zitat (max. 300 Zeichen), das den Befund im Dokument belegt — Pflicht für Nachvollziehbarkeit, wenn irgend möglich.
- \`confidence\`: \`high\` nur, wenn das Risiko explizit im Dokument steht oder klar herleitbar ist; \`low\` bei vager Andeutung.
- \`relevance\` bewertet den Bezug zum Vorhaben/Projektziel: \`on_goal\`, wenn das Risiko das beschriebene Vorhaben betrifft; \`off_goal\`, wenn es aus dem Kickoff stammt, aber nicht zum Vorhaben passt. Unterdrücke \`off_goal\`-Einträge NICHT — kennzeichne sie, der Mensch entscheidet. Ohne angegebenes Vorhaben: \`on_goal\`.
- KEIN erzwungenes Padding: Wenn das Dokument wenig Risikosignale enthält, liefere wenige belegte Vorschläge oder eine leere Liste — null Risiken sind ein gültiges Ergebnis.`

export function buildRiskProposalsPrompt(
  request: RiskProposalsGenerationRequest,
): string {
  const ctx = request.context
  const vorhaben = ctx.source_project.description?.trim()
  const existing =
    ctx.existing_risks.length > 0
      ? ctx.existing_risks
          .map(
            (r) =>
              `  - id=${r.risk_id} | ${r.title} (P=${r.probability}, A=${r.impact}, ${r.status})`,
          )
          .join("\n")
      : "  (keine)"

  const lines: string[] = [
    `Projekt: ${ctx.source_project.name}`,
    `Typ: ${ctx.source_project.project_type ?? "—"}`,
    `Methode: ${ctx.source_project.project_method ?? "—"}`,
    `Lifecycle: ${ctx.source_project.lifecycle_status}`,
    // PROJ-91 track invariant (AC-89.9): yardstick only, never a source.
    vorhaben
      ? `\nVorhaben (Projektziel — NUR Bewertungsmaßstab für relevance, KEINE Quelle für Vorschläge):\n${vorhaben}`
      : `\n(Kein Vorhaben hinterlegt — relevance=on_goal.)`,
    "",
    `Vorhandene Risiken (für Dedup via duplicate_of_risk_id — NICHT erneut vorschlagen):`,
    existing,
    "",
    `Kickoff-Artefakt:`,
    `  - Kind: ${ctx.context_source.kind}`,
    `  - Titel: ${ctx.context_source.title}`,
    ctx.context_source.language
      ? `  - Sprache: ${ctx.context_source.language}`
      : "",
    "",
    `Inhalt:`,
    ctx.context_source.content_excerpt || "(leer)",
    "",
    `Liefere bis zu ${Math.min(request.count, 30)} Risiko-Vorschläge. Wenn das Dokument zu dünn ist, liefere eine leere Liste.`,
  ].filter(Boolean)

  return lines.join("\n")
}

/**
 * Map a (loosely or strictly) validated risk-proposals response to the
 * provider output contract. Identical across providers. Performs the
 * post-hoc dedup-id validation (hallucinated `duplicate_of_risk_id` →
 * null) and clamps free-text lengths to the DB CHECK limits.
 */
export function mapRiskProposalsSuggestions(
  suggestions: Array<{
    title: string
    description?: string | null
    probability: number
    impact: number
    mitigation?: string | null
    duplicate_of_risk_id?: string | null
    source_quote?: string | null
    confidence: string
    relevance: string
  }>,
  validRiskIds: ReadonlySet<string>,
): RiskProposalsGenerationOutput["suggestions"] {
  const clampOrNull = (v: string | null | undefined, max: number) => {
    const trimmed = v?.trim()
    return trimmed ? trimmed.slice(0, max) : null
  }
  return suggestions.map((s) => ({
    title: s.title.trim().slice(0, 255),
    description: clampOrNull(s.description, 5000),
    probability: Math.min(5, Math.max(1, Math.round(s.probability))),
    impact: Math.min(5, Math.max(1, Math.round(s.impact))),
    mitigation: clampOrNull(s.mitigation, 5000),
    duplicate_of_risk_id:
      s.duplicate_of_risk_id != null && validRiskIds.has(s.duplicate_of_risk_id)
        ? s.duplicate_of_risk_id
        : null,
    source_quote: clampOrNull(s.source_quote, 300),
    confidence: s.confidence as "low" | "medium" | "high",
    relevance: s.relevance as "on_goal" | "off_goal",
  }))
}

// ---------------------------------------------------------------------------
// PROJ-135 — clarifying_questions_from_context (shared across Anthropic/OpenAI/Google)
// ---------------------------------------------------------------------------

/**
 * Strict response schema for cloud providers. The Ollama provider keeps a
 * loose replica (validate-loose, clamp-after — PROJ-88 D-1a lesson) in
 * `ollama.ts`; length clamps happen in the shared mapper either way.
 */
export const ClarifyingQuestionSchema = z.object({
  question: z.string().min(1).max(300),
  rationale: z.string().max(300).nullable(),
  gap_tag: z.string().max(40).nullable(),
})

export const ClarifyingQuestionsResponseSchema = z.object({
  questions: z.array(ClarifyingQuestionSchema).min(0).max(6),
})

export const CLARIFYING_QUESTIONS_SYSTEM_PROMPT = `Du bist ein erfahrener Projektleiter und stellst VOR dem Projektstart gezielte Rückfragen zu einem hochgeladenen Kickoff-Dokument.

Aufgabe: Analysiere das Kickoff-Dokument im Licht des Vorhabens (Projektziel) und stelle 0-6 präzise Rückfragen zu LÜCKEN und UNKLARHEITEN, die der Projektleiter beantworten soll, bevor die KI anschließend Backlog/Stakeholder/Risiken generiert.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Frage NUR nach echten Lücken im Kickoff: fehlender Go-Live-Termin, unklares Budget/Budgetverantwortung, nicht genanntes Zielsystem, unscharfer Scope, fehlende Stakeholder/Entscheider, ungenannte Abhängigkeiten/Risiken. KEINE rhetorischen oder generischen Fragen ("Was ist das Ziel?", wenn das Vorhaben es schon sagt).
- Jede Frage ist konkret und auf das Dokument bezogen — sie nennt, WAS fehlt, nicht nur, DASS etwas fehlt.
- Das Vorhaben ist NUR Kontext + Bewertungsmaßstab dafür, welche Lücken relevant sind — generiere KEINE Fragen, deren Antwort bereits im Vorhaben oder im Kickoff steht.
- \`rationale\`: kurz, warum die Antwort die spätere Generierung schärft (oder null, wenn die Frage selbsterklärend ist).
- \`gap_tag\`: optionales kurzes Kategoriewort (z.B. "schedule", "budget", "scope", "stakeholders", "risks", "dependencies"), sonst null.
- KEINE personenbezogenen Daten in den Fragen erfinden — keine Namen, E-Mails, Telefonnummern. Generalisiere zu Rollen.
- KEIN erzwungenes Padding: Wenn das Kickoff vollständig und klar ist, liefere wenige oder NULL Fragen — eine leere Liste ist ein gültiges Ergebnis ("keine Rückfragen nötig").`

export function buildClarifyingQuestionsPrompt(
  request: ClarifyingQuestionsGenerationRequest,
): string {
  const ctx = request.context
  const vorhaben = ctx.source_project.description?.trim()

  const lines: string[] = [
    `Projekt: ${ctx.source_project.name}`,
    `Typ: ${ctx.source_project.project_type ?? "—"}`,
    `Methode: ${ctx.source_project.project_method ?? "—"}`,
    vorhaben
      ? `\nVorhaben (Projektziel — Kontext + Maßstab, welche Lücken zählen; KEINE Quelle für Fragen, deren Antwort hier schon steht):\n${vorhaben}`
      : `\n(Kein Vorhaben hinterlegt — bewerte Lücken allein anhand des Kickoffs.)`,
    "",
    `Kickoff-Artefakt:`,
    `  - Kind: ${ctx.context_source.kind}`,
    `  - Titel: ${ctx.context_source.title}`,
    ctx.context_source.language
      ? `  - Sprache: ${ctx.context_source.language}`
      : "",
    "",
    `Inhalt:`,
    ctx.context_source.content_excerpt || "(leer)",
    "",
    `Stelle bis zu ${Math.min(request.count, 6)} Rückfragen. Wenn das Kickoff klar und vollständig ist, liefere eine leere Liste.`,
  ].filter(Boolean)

  return lines.join("\n")
}

/**
 * Map a (loosely or strictly) validated clarifying-questions response to the
 * provider output contract. Identical across providers; clamps free-text
 * lengths to the schema limits.
 */
export function mapClarifyingQuestions(
  questions: Array<{
    question: string
    rationale?: string | null
    gap_tag?: string | null
  }>,
): ClarifyingQuestionsGenerationOutput["questions"] {
  const clampOrNull = (v: string | null | undefined, max: number) => {
    const trimmed = v?.trim()
    return trimmed ? trimmed.slice(0, max) : null
  }
  return questions
    .filter((q) => q.question && q.question.trim().length > 0)
    .map((q) => ({
      question: q.question.trim().slice(0, 300),
      rationale: clampOrNull(q.rationale, 300),
      gap_tag: clampOrNull(q.gap_tag, 40),
    }))
}
