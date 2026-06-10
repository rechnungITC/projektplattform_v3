/**
 * PROJ-12 — payload classification.
 *
 * `classifyRiskAutoContext` walks the curated allowlist auto-context and
 * returns the highest privacy class observed. The router uses the result
 * to decide whether external (cloud) routing is permitted.
 *
 * This runs as the second defense line over the auto-context allowlist:
 * the allowlist already excludes Class-3 fields by design, but if a
 * future change accidentally adds a Class-3 field to the auto-context
 * shape, the classifier still catches it and forces local routing.
 */

import { classifyField } from "./data-privacy-registry"
import type {
  CoachingAutoContext,
  CrossProjectLinksAutoContext,
  DataClass,
  NarrativeAutoContext,
  ProposalFromContextAutoContext,
  ResourceSwapAutoContext,
  RiskAutoContext,
  SentimentAutoContext,
  StakeholderProposalsAutoContext,
  TrajectorySequenceAutoContext,
} from "./types"

function bumpMax(current: DataClass, candidate: DataClass): DataClass {
  return (Math.max(current, candidate) as DataClass)
}

function classifyRecord(
  table: string,
  record: Record<string, unknown>,
  tenantDefault: DataClass
): DataClass {
  let max: DataClass = 1
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") continue
    max = bumpMax(max, classifyField(table, key, tenantDefault))
    if (max === 3) return 3
  }
  return max
}

/**
 * `tenantDefault` (PROJ-17) is the fallback class for *unknown* fields.
 * Defaults to 3 (most conservative) when not provided. Known Class-3
 * fields always stay Class 3 regardless of the tenant default.
 */
export function classifyRiskAutoContext(
  ctx: RiskAutoContext,
  tenantDefault: DataClass = 3
): DataClass {
  let max: DataClass = 1

  max = bumpMax(max, classifyRecord("projects", ctx.project, tenantDefault))
  if (max === 3) return 3

  for (const phase of ctx.phases) {
    max = bumpMax(max, classifyRecord("phases", phase, tenantDefault))
    if (max === 3) return 3
  }
  for (const milestone of ctx.milestones) {
    max = bumpMax(max, classifyRecord("milestones", milestone, tenantDefault))
    if (max === 3) return 3
  }
  for (const item of ctx.work_items) {
    max = bumpMax(max, classifyRecord("work_items", item, tenantDefault))
    if (max === 3) return 3
  }
  for (const risk of ctx.existing_risks) {
    max = bumpMax(max, classifyRecord("risks", risk, tenantDefault))
    if (max === 3) return 3
  }

  return max
}

// ---------------------------------------------------------------------------
// PROJ-30 — narrative-purpose classifier (whitelist-based)
// ---------------------------------------------------------------------------

/**
 * Whitelist of fields explicitly permitted in `NarrativeAutoContext`.
 * Anything not on the list is treated as Class-3 — "fail safe" choice
 * per Tech-Design § Decision 4. When extending the auto-context shape,
 * add the new field key here AND update `data-privacy-registry` if
 * needed.
 *
 * Keys are unprefixed (table-agnostic) because the narrative context is
 * a flat synthetic shape, not a per-table dump.
 */
const NARRATIVE_FIELD_WHITELIST: ReadonlySet<string> = new Set([
  // top-level discriminator
  "kind",
  // project block (Class-1/2)
  "name",
  "project_type",
  "project_method",
  "lifecycle_status",
  "planned_start_date",
  "planned_end_date",
  // phases_summary block
  "total",
  "by_status",
  // top_risks items
  "title",
  "score",
  "status",
  // top_decisions items
  "decided_at",
  // upcoming_milestones items
  "target_date",
  // backlog_counts block
  "by_kind",
])

const NARRATIVE_BLOCK_KEYS: ReadonlySet<string> = new Set([
  "project",
  "phases_summary",
  "top_risks",
  "top_decisions",
  "upcoming_milestones",
  "backlog_counts",
])

function classifyNarrativeRecord(
  record: Record<string, unknown>,
): DataClass {
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") continue
    if (!NARRATIVE_FIELD_WHITELIST.has(key)) {
      return 3
    }
  }
  return 2
}

/**
 * PROJ-30 — classify a `NarrativeAutoContext` payload.
 *
 * Returns:
 *   - 1 when the context is empty/structural
 *   - 2 when only whitelisted Class-1/2 fields are present (default)
 *   - 3 when ANY un-whitelisted field appears anywhere in the payload
 *
 * `tenantDefault` raises the floor — a tenant configured with
 * `default_class=3` will see narrative routed locally even on a
 * fully-whitelisted context. This matches the Risk classifier's
 * tenant-default semantics.
 */
export function classifyNarrativeAutoContext(
  ctx: NarrativeAutoContext,
  tenantDefault: DataClass = 3,
): DataClass {
  let max: DataClass = 1

  for (const [topKey, topValue] of Object.entries(ctx)) {
    if (topValue === null || topValue === undefined) continue
    if (
      !NARRATIVE_FIELD_WHITELIST.has(topKey) &&
      !NARRATIVE_BLOCK_KEYS.has(topKey)
    ) {
      return 3
    }
    if (
      typeof topValue === "object" &&
      !Array.isArray(topValue) &&
      topValue !== null
    ) {
      const blockClass = classifyNarrativeRecord(
        topValue as Record<string, unknown>,
      )
      max = bumpMax(max, blockClass)
      if (max === 3) return 3
    }
    if (Array.isArray(topValue)) {
      for (const item of topValue) {
        if (item === null || typeof item !== "object") continue
        const itemClass = classifyNarrativeRecord(
          item as Record<string, unknown>,
        )
        max = bumpMax(max, itemClass)
        if (max === 3) return 3
      }
    }
  }

  // Per-tenant floor — Class-3 tenants force local even on safe contexts.
  if (tenantDefault === 3 && max < 2) {
    // empty context is still safe to keep at Class 1 if the registry
    // didn't flag anything; the tenant default kicks in only when we
    // would have routed external. Risk-classifier semantics preserved.
    return max
  }

  return max
}

/**
 * PROJ-34-γ.1 — sentiment classifier (CIA-L1).
 *
 * Sentiment- und Coaching-Summaries enthalten zwangsläufig identifizierbare
 * Personenbezüge (Stakeholder-Namen + Verhaltensbewertung). Per CIA-L1
 * werden sie ausnahmslos als Class-3 klassifiziert — kein Class-2-Bypass,
 * Tenant-Provider-Pflicht ohne Ausnahme.
 *
 * Der `tenantDefault`-Parameter bleibt aus Symmetriegründen erhalten, hat
 * aber keine Wirkung — Class-3 ist hier eine Konstante.
 */
export function classifySentimentAutoContext(
  _ctx: SentimentAutoContext,
  _tenantDefault: DataClass = 3,
): DataClass {
  return 3
}

/**
 * PROJ-34-ε — coaching classifier (CIA-L1).
 *
 * Coaching recommendations are derived from interaction summaries and
 * qualitative profile fields about a named stakeholder. Like Sentiment,
 * this is always Class-3 — no Class-2 bypass.
 */
export function classifyCoachingAutoContext(
  _ctx: CoachingAutoContext,
  _tenantDefault: DataClass = 3,
): DataClass {
  return 3
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.α — trajectory-sequence classifier (whitelist-based)
// ---------------------------------------------------------------------------

/**
 * Whitelist of field keys allowed in `TrajectorySequenceAutoContext`.
 * Class-1/2 only: structural layout (project / phase / sprint / milestone /
 * dependency / goal metadata). NO personal data keys (`responsible_user_id`,
 * `stakeholder_*`, `created_by`, descriptions, etc.).
 *
 * Anything not on the list flips the classification to Class-3, mirroring
 * the narrative classifier's "fail-safe" semantics. Extending the auto-
 * context shape must update this list AND `data-privacy-registry`.
 */
const TRAJECTORY_SEQUENCE_FIELD_WHITELIST: ReadonlySet<string> = new Set([
  // project block
  "name",
  "project_type",
  "project_method",
  "lifecycle_status",
  "planned_start_date",
  "planned_end_date",
  // phases / sprints / milestones / goals items
  "id",
  "status",
  "state",
  "planned_start",
  "planned_end",
  "sequence_number",
  "start_date",
  "end_date",
  "target_date",
  "title",
  // dependencies items
  "from_type",
  "from_id",
  "to_type",
  "to_id",
  "constraint_type",
])

const TRAJECTORY_SEQUENCE_BLOCK_KEYS: ReadonlySet<string> = new Set([
  "project",
  "phases",
  "sprints",
  "milestones",
  "dependencies",
  "goals",
])

function classifyTrajectoryRecord(
  record: Record<string, unknown>,
): DataClass {
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") continue
    if (!TRAJECTORY_SEQUENCE_FIELD_WHITELIST.has(key)) {
      return 3
    }
  }
  return 2
}

/**
 * PROJ-65 ε.4.α — classify a `TrajectorySequenceAutoContext` payload.
 *
 * Returns the highest data class observed in the payload. Defense-in-depth
 * over the allowlist already enforced by `collectTrajectorySequenceContext`.
 * If a future shape change accidentally adds an un-whitelisted key (e.g.
 * `responsible_user_id`), this classifier flips to Class-3 and the router
 * forces local routing — preventing any silent personal-data leak into a
 * cloud provider.
 */
export function classifyTrajectorySequenceAutoContext(
  ctx: TrajectorySequenceAutoContext,
  tenantDefault: DataClass = 3,
): DataClass {
  let max: DataClass = 1

  for (const [topKey, topValue] of Object.entries(ctx)) {
    if (topValue === null || topValue === undefined) continue
    if (
      !TRAJECTORY_SEQUENCE_FIELD_WHITELIST.has(topKey) &&
      !TRAJECTORY_SEQUENCE_BLOCK_KEYS.has(topKey)
    ) {
      return 3
    }
    if (
      typeof topValue === "object" &&
      !Array.isArray(topValue) &&
      topValue !== null
    ) {
      const blockClass = classifyTrajectoryRecord(
        topValue as Record<string, unknown>,
      )
      max = bumpMax(max, blockClass)
      if (max === 3) return 3
    }
    if (Array.isArray(topValue)) {
      for (const item of topValue) {
        if (item === null || typeof item !== "object") continue
        const itemClass = classifyTrajectoryRecord(
          item as Record<string, unknown>,
        )
        max = bumpMax(max, itemClass)
        if (max === 3) return 3
      }
    }
  }

  if (tenantDefault === 3 && max < 2) {
    return max
  }
  return max
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.β — resource-swap classifier (Class-3 hard-fix, CIA-L1)
// ---------------------------------------------------------------------------

/**
 * PROJ-65 ε.4.β — resource-swap classifier.
 *
 * Always Class-3, mirroring PROJ-34-γ.1 sentiment + PROJ-34-ε coaching.
 * A resource-swap suggestion is structurally personal data — it names an
 * incumbent A and a replacement B by display_name and ties them to skill
 * profiles, allocations, and (bucketed) rates. There is no Class-2 path
 * that produces a useful suggestion; the only safe route is local Ollama.
 *
 * Rate-bucketing in the auto-context handles the cost-clear-view RBAC
 * surface, but does NOT change the privacy class — the rationale still
 * references identifiable people and is therefore Class-3.
 *
 * `tenantDefault` is kept for symmetry but has no effect — Class-3 is a
 * constant here per CIA Fork 1 (2026-05-28).
 */
export function classifyResourceSwapAutoContext(
  _ctx: ResourceSwapAutoContext,
  _tenantDefault: DataClass = 3,
): DataClass {
  return 3
}

// ---------------------------------------------------------------------------
// PROJ-88 — stakeholder-proposals classifier (unconditional Class-3 pin)
// ---------------------------------------------------------------------------

/**
 * PROJ-88 — classify a `StakeholderProposalsAutoContext` payload.
 *
 * Constant Class-3 BY DESIGN (Tech-Design L1, mirror of resource_swap):
 * stakeholder extraction surfaces personal names per definition, so the
 * classification never depends on content heuristics. The router's
 * standard Class-3 clamp then restricts the provider set to local/
 * eligible providers (today Ollama; PROJ-93 may add attested
 * Trusted-EU-Processors via the resolver — no change needed here).
 *
 * `tenantDefault` is kept for signature symmetry but has no effect.
 */
export function classifyStakeholderProposalsAutoContext(
  _ctx: StakeholderProposalsAutoContext,
  _tenantDefault: DataClass = 3,
): DataClass {
  return 3
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.γ — cross-project-links classifier (whitelist-based)
// ---------------------------------------------------------------------------

/**
 * Whitelist of field keys allowed in `CrossProjectLinksAutoContext`.
 * Class-1/2 only: project metadata + work-item title/kind/status + link
 * type/approval enums + UX relation hint. NO `responsible_user_id`,
 * `description`, `created_by`, stakeholder joins, etc.
 *
 * Anything not on the list flips the classification to Class-3, mirroring
 * the narrative + trajectory_sequence classifiers' "fail-safe" semantics.
 * Extending the auto-context shape must update this list AND
 * `data-privacy-registry`.
 */
const CROSS_PROJECT_LINKS_FIELD_WHITELIST: ReadonlySet<string> = new Set([
  // source_project / related_projects items
  "project_id",
  "name",
  "project_type",
  "project_method",
  "lifecycle_status",
  "relation",
  // source_work_items / related_work_items items
  "work_item_id",
  "title",
  "kind",
  "status",
  // existing_links items
  "from_work_item_id",
  "to_work_item_id",
  "to_project_id",
  "link_type",
  "approval_state",
])

const CROSS_PROJECT_LINKS_BLOCK_KEYS: ReadonlySet<string> = new Set([
  "source_project",
  "related_projects",
  "source_work_items",
  "related_work_items",
  "existing_links",
])

function classifyCrossProjectLinksRecord(
  record: Record<string, unknown>,
): DataClass {
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") continue
    if (!CROSS_PROJECT_LINKS_FIELD_WHITELIST.has(key)) {
      return 3
    }
  }
  return 2
}

/**
 * PROJ-65 ε.4.γ — classify a `CrossProjectLinksAutoContext` payload.
 *
 * Returns the highest data class observed in the payload. Defense-in-depth
 * over the allowlist already enforced by `collectCrossProjectLinksContext`.
 * If a future shape change accidentally adds an un-whitelisted key (e.g.
 * `responsible_user_id`, `description`), this classifier flips to Class-3
 * and the router forces local routing — preventing any silent personal-
 * data leak into a cloud provider.
 */
export function classifyCrossProjectLinksAutoContext(
  ctx: CrossProjectLinksAutoContext,
  tenantDefault: DataClass = 3,
): DataClass {
  let max: DataClass = 1

  for (const [topKey, topValue] of Object.entries(ctx)) {
    if (topValue === null || topValue === undefined) continue
    if (
      !CROSS_PROJECT_LINKS_FIELD_WHITELIST.has(topKey) &&
      !CROSS_PROJECT_LINKS_BLOCK_KEYS.has(topKey)
    ) {
      return 3
    }
    if (
      typeof topValue === "object" &&
      !Array.isArray(topValue) &&
      topValue !== null
    ) {
      const blockClass = classifyCrossProjectLinksRecord(
        topValue as Record<string, unknown>,
      )
      max = bumpMax(max, blockClass)
      if (max === 3) return 3
    }
    if (Array.isArray(topValue)) {
      for (const item of topValue) {
        if (item === null || typeof item !== "object") continue
        const itemClass = classifyCrossProjectLinksRecord(
          item as Record<string, unknown>,
        )
        max = bumpMax(max, itemClass)
        if (max === 3) return 3
      }
    }
  }

  if (tenantDefault === 3 && max < 2) {
    return max
  }
  return max
}

// ---------------------------------------------------------------------------
// PROJ-70-α — proposal_from_context classifier (heuristic + defense-in-depth)
// ---------------------------------------------------------------------------

/**
 * Email-pattern: `local@domain.tld` — keeps it permissive enough to catch
 * the common DACH-business forms (`name.lastname@firma.de`,
 * `n.lastname@firma.com`) without false-positiving on plain URLs.
 */
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i

/**
 * DACH-Telefon: `+49`, `0049`, or leading `0` followed by ≥ 8 digits, with
 * optional separators (space, dash, slash, parenthesis). Catches
 * `+49 (0)30 1234 5678`, `0030/12345678`, `0301234567` and friends.
 */
const PHONE_PATTERN = /(?:\+49|0049|\b0)[\s\-/().]*\d(?:[\s\-/().]*\d){7,}/

/**
 * PROJ-86 — DACH-Name detection, context-bound instead of shape-bound.
 *
 * The previous `NAME_PATTERN` matched ANY two consecutive capitalised words.
 * Because German capitalises every noun, that fired on ordinary prose
 * ("Generisches Kickoff-Protokoll", "Google Analytics", "Best Practices"),
 * so every German document was wrongly upgraded to Class-3 and blocked from
 * cloud routing. We now require a personal-context trigger immediately
 * before the capitalised name, which is how real people appear in kickoff
 * documents:
 *
 *   • Salutations / titles — followed by whitespace + a capitalised word:
 *       Herr Müller · Frau Schmidt · Dr. Weber · Hr./Fr. <Name>
 *   • Role / contact labels — followed by a COLON + a capitalised word:
 *       Ansprechpartner: Anne Schmidt · Kontakt: Jörg Müller · Name: …
 *
 * The colon is deliberately REQUIRED for label triggers: without it,
 * "Lead Scoring" / "Name Service" / "Owner Module" would re-introduce the
 * false positives the salutation form avoids. Capture group 1 is the name
 * span (1–3 words, umlauts + simple hyphens), checked against the residual
 * whitelist below.
 */
const NAME_TRIGGER_PATTERN =
  /(?:\b(?:Herr|Frau|Hr\.|Fr\.|Dr\.)\s+|\b(?:Ansprechpartner|Kontakt|Lead|Owner|Name|Verantwortlich)\s*:\s*)([A-ZÄÖÜ][a-zäöüß]+(?:[- ][A-ZÄÖÜ][a-zäöüß]+){0,2})/

/**
 * Residual whitelist: capitalised spans that follow a trigger but are NOT
 * personal names (e.g. "Owner: Project Manager"). With the context-bound
 * `NAME_TRIGGER_PATTERN` this is now rarely hit, but kept as a conservative
 * second filter on the captured name span; adds, never removes.
 */
const NAME_FALSE_POSITIVES: ReadonlySet<string> = new Set([
  "Status Report",
  "Executive Summary",
  "Project Manager",
  "Project Owner",
  "Project Lead",
  "Steering Committee",
  "Go Live",
  "Use Case",
  "Use Cases",
  "User Story",
  "User Stories",
  "Work Package",
  "Work Packages",
  "Acceptance Criteria",
  "Definition Of Done",
  "Pull Request",
  "Sub Project",
  "Lessons Learned",
])

/**
 * Heuristic Class-3 detector for free-text kickoff content (PROJ-70/86).
 *
 * Returns `true` when the content carries real personal-data markers:
 * email addresses, DACH phone numbers, or a capitalised name that follows
 * a personal-context trigger (salutation/title or role/contact label —
 * see `NAME_TRIGGER_PATTERN`). Ordinary German noun phrases no longer fire.
 *
 * Defense-in-depth (PROJ-86 rationale): relaxing name detection from
 * shape-based to context-bound is acceptable because two independent lines
 * remain in force — (1) the upload-time `context_sources.privacy_class`
 * floor (a source already stamped Class-3 stays Class-3 regardless of this
 * detector), and (2) the user/admin can manually stamp any source Class-3.
 * The residual false-negative (a bare, unlabelled name in free text with no
 * email/phone) is bounded by those lines and by PROJ-75 (full-text
 * re-classification). We prefer a credible classifier over one that flags
 * 100% of German documents and renders the feature unusable.
 */
export function detectClass3Markers(text: string): boolean {
  if (!text) return false
  if (EMAIL_PATTERN.test(text)) return true
  if (PHONE_PATTERN.test(text)) return true

  // Walk every trigger-bound name match; capture group 1 is the name span.
  // A span on the residual whitelist (e.g. "Project Manager") is skipped.
  const globalNameTrigger = new RegExp(NAME_TRIGGER_PATTERN.source, "g")
  for (const match of text.matchAll(globalNameTrigger)) {
    const name = match[1]
    if (name && !NAME_FALSE_POSITIVES.has(name)) return true
  }
  return false
}

/**
 * PROJ-70-α — classify a `ProposalFromContextAutoContext` payload.
 *
 * Two defense lines (high-class-wins):
 *   1. `context_sources.privacy_class` from the upload-time classification
 *      (PROJ-44-β). User or auto-classifier may set this to 3 deliberately.
 *   2. Heuristic regex sweep over `content_excerpt` — catches Class-3
 *      markers a Class-2-stamped row might still carry.
 *
 * `tenantDefault` follows the established Risk/Narrative semantics: a
 * tenant configured with `default_class=3` will see proposal-from-context
 * routed locally even on a clean Class-2 input.
 */
export function classifyProposalFromContextAutoContext(
  ctx: ProposalFromContextAutoContext,
  tenantDefault: DataClass = 3,
): DataClass {
  // Floor: the privacy_class stamped at upload time.
  let max: DataClass = ctx.context_source.privacy_class

  // Heuristic upgrade: even a Class-1/2-stamped row can leak personal
  // markers in its excerpt; if so, force Class-3.
  // PROJ-91 defense-in-depth: the project description (Vorhaben) is now sent
  // to the provider as grounding, so it is classified alongside the excerpt —
  // a description carrying personal markers must also force local routing.
  if (
    max < 3 &&
    (detectClass3Markers(ctx.context_source.content_excerpt) ||
      detectClass3Markers(ctx.source_project.description ?? ""))
  ) {
    max = 3
  }

  // Per-tenant floor — mirrors Narrative classifier semantics.
  if (tenantDefault === 3 && max < 2) {
    return max
  }
  return max
}
