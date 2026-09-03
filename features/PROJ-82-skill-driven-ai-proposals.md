# PROJ-82: Skill-driven AI Proposals

## Status: Planned (geschnitten in α + β)
**Created:** 2026-06-06
**Last Updated:** 2026-09-01

> **α ist baubar, β ist gesperrt.** Der Kern dieser Story — das Mandat eines Skills
> (`allowed_actions`) tatsächlich **durchzusetzen** — braucht **kein** Retrieval und ist die Lücke,
> die PROJ-153 am 2026-08-28 ausdrücklich hierher verwiesen hat. Alles, was an RAG-Scope hängt
> (Punkt 2 des Invocation-Flows, `rag_scope_size`), wartet auf PROJ-80-β. Siehe Erdung 2026-09-01.

## Summary
Connects Skills (PROJ-76) to the existing AI Proposal Layer (PROJ-12). When a PM triggers an action that has AI assistance (create work item, suggest risks, plan phases, draft acceptance criteria, etc.), the system picks the matching assigned Skill(s) from PROJ-78, loads the skill's markdown + scoped RAG context (PROJ-80/81), and invokes the agent to produce proposal entries in `ki_suggestions`. The PM reviews and accepts as today. When multiple skills match, the system explicitly asks the PM to pick one or run both.

## Dependencies
- Requires: PROJ-76 (Skill-Framework — content)
- Requires: PROJ-77 (Skill-Customizing — `allowed_actions` enforcement)
- Requires: PROJ-78 (Skill-Projektzuordnung — which skills apply)
- Requires (**nur β**): **PROJ-80-β** (Retrieval) — das ausgelieferte PROJ-80-α hat keinen Vektorindex
- Requires (**nur β**): PROJ-81 (Scope enforcement) — selbst blockiert durch PROJ-80-β
- Requires: PROJ-12 (AI Proposal Layer — target system for proposals)
- Requires: PROJ-9 (Work item metamodel — for `allowed_kinds`)
- Influences: PROJ-83 (Task-driven Content Generation — shares same invocation core)
- Influences: PROJ-84 (KI-Kennzeichnung — proposals are flagged AI-generated)

## V2 Reference Material
- ADR `v3-ai-proposal-architecture.md` (referenced from PROJ-7).
- ADR `architecture-principles` — "AI as proposal layer, never silent mutation".

## User Stories
- **[V3 SK-25]** As a PM, when I trigger an AI-assisted action on a project artifact, I want the system to use the project's assigned Skills, so that the proposals reflect the chosen methodology and project type.
- **[V3 SK-26]** As a PM, when multiple Skills match my action (e.g. Scrum Master + Datenschützer on a DSGVO-affecting story), I want to choose which Skill drives the proposal — or run both and see two proposals, so that I stay in control of conflicting perspectives.
- **[V3 SK-27]** As the system, I want to enforce a Skill's `allowed_actions` list, so that a Skill cannot propose artifact kinds outside its mandate.
- **[V3 SK-28]** As a PM, I want to see a per-proposal indicator showing which Skill generated it, so that I can trace the reasoning back to a specific persona.
- **[V3 SK-29]** As an admin, I want a configurable conflict-resolution mode at tenant level (PM picks / sequential / priority order), so that we can decide the default tenant-wide.

## Acceptance Criteria

### Skill-to-action mapping
- [ ] ~~Action enum (V1): `propose_work_item`, `propose_risk`, `propose_budget_item`, `propose_phase`, `propose_milestone`, `propose_acceptance_criteria`, `propose_dependency`.~~
      **Überholt — PROJ-77-α hat das Enum am 2026-07-24 ausgeliefert und anders geschnitten.**
      Autorität ist `src/lib/skills/allowed-actions.ts` mit **acht** Werten: `propose_work_item`,
      `propose_risk`, `propose_budget_item`, `propose_phase`, `propose_milestone`,
      `generate_document`, `summarize_document`, `read_only`. Die hier ursprünglich genannten
      `propose_acceptance_criteria` und `propose_dependency` **existieren nicht**; drei
      ausgelieferte Werte kannte diese Spec nicht. Sie darf das Enum nicht neu definieren —
      ein Skill trägt seine Werte schon heute im Frontmatter, und eine zweite Liste würde
      auseinanderlaufen. Erweiterung um die zwei fehlenden Werte ist ein eigener Entscheid.
- [ ] Each Skill's `frontmatter.allowed_actions[]` (PROJ-77) lists which of these it can run.
- [ ] When the PM triggers action X on project P:
  1. System fetches active `project_skills` for P (PROJ-78).
  2. Filters to skills where `allowed_actions` contains X.
  3. If zero → respond "No Skill is configured for this action in this project" with deep link for admin.
  4. If exactly one → proceed directly.
  5. If more than one → conflict resolution (see below).

### Conflict resolution
- [ ] Tenant setting `skill_conflict_mode TEXT CHECK (skill_conflict_mode IN ('pm_picks','sequential','priority_order'))` with default `pm_picks`.
- [ ] **`pm_picks`**: UI dialog lists matching skills; PM picks one or "Run all (parallel)".
- [ ] **`sequential`**: All matching skills run in order of `project_skills.assigned_at`; outputs aggregated into a single proposal review queue.
- [ ] **`priority_order`**: Method-skill > project_type-skill > cross_cutting (deterministic).
- [ ] All matching skills' results are written as separate `ki_suggestions` rows, each tagged with `originating_skill_id` and `originating_skill_version_id`.

### Invocation flow
- [ ] New endpoint `POST /api/projects/:id/ai/run-action` with body `{ action, target_table, target_row_id?, input_payload?, force_skill_id? }`.
- [ ] Server:
  1. Validates action against assigned skills.
  2. **(β)** Resolves RAG scope via PROJ-81 — in α übersprungen, weil es kein Retrieval gibt.
  3. Builds prompt: skill.markdown + frontmatter directives + RAG context + input_payload.
  4. Calls LLM, parses output into a `payload` matching the existing `ki_suggestions` purpose-specific schema.
  5. Writes one `ki_suggestions` row per skill outcome with `originating_skill_id` and `originating_skill_version_id` columns added to that table.
  6. Returns the created proposal ids.
- [ ] Allowed-action check: if a skill returns a proposal for a kind not in its `allowed_actions`, the row is rejected and `skill.action_denied` audited.

### Schema additions to existing `ki_suggestions`
- [ ] Add columns: `originating_skill_id UUID REFERENCES skills(id)`,
      `originating_skill_version_id UUID REFERENCES skill_versions(id)`, `conflict_group_id UUID NULL`.
      **`rag_scope_size INT` erst mit β** — in α gibt es keinen Scope, dessen Größe man zählen
      könnte, und eine Spalte, die konstant `NULL` trägt, ist von „nicht gemessen" nicht zu
      unterscheiden. Gemessen am 2026-09-01: alle vier Spalten existieren heute nicht (je 0
      Treffer in Migrationen und `src/`).
- [ ] `conflict_group_id` groups proposals produced by the same triggered action when multiple skills ran.

### UI
- [ ] In the AI-proposal review inbox (existing PROJ-12 surface), each proposal card shows: skill name, skill version badge, conflict group indicator if part of a multi-skill run.
- [ ] PM can compare proposals within a conflict group side-by-side and accept one (others auto-archive with status `rejected_in_conflict_resolution`).

### Audit
- [ ] Events: `ai.action_invoked`, `ai.proposal_created`, `ai.proposal_accepted`, `ai.proposal_rejected`, `skill.action_denied`, `skill.conflict_resolved`.

## Edge Cases
- **No skills match action** → user gets actionable error with admin deep link.
- **Skill markdown is malformed at invocation time** → invocation fails fast with a structured error; proposal not created; audit row `ai.invocation_failed`.
- **LLM output cannot be parsed into target schema** → proposal row created with `status='parse_error'` and raw output in `error_payload` for review.
- **Skill returns multiple sub-proposals** (e.g. one input → three suggested risks) → each becomes a separate `ki_suggestions` row sharing one `conflict_group_id`.
- **`allowed_actions` empty** → skill is treated as `read_only`; cannot be invoked for any action; visible only as RAG context donor where applicable.
- **Skill deactivated mid-flight** → in-progress invocation completes (was already loaded); next invocation skips it.
- **PM cancels conflict-resolution dialog without picking** → no `ki_suggestions` rows are persisted.
- **Rate limit / cost guard at tenant level** → exceeding budget returns 429 with retry hint; tracked in PROJ-84 cost ledger if implemented.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase (Edge Functions for LLM calls or server actions), shadcn/ui (`Dialog`, `Tabs`, `Badge`, `RadioGroup`).
- **Multi-tenant:** every row in `ki_suggestions` already carries `tenant_id`; new FK columns inherit; scope resolution joins through `project_skills`.
- **Validation:** Zod for action payloads; LLM output validated against a Zod schema per `target_table`.
- **Auth:** project_lead or editor role on the project to trigger; viewer role can read proposals only.
- **Performance:** Skill invocation runs async with a background job; PM sees "Vorschlag wird erstellt …" state with optimistic placeholder. Target end-to-end latency ≤ 30 s.
- **Cost guard:** per-tenant cost ledger increment per invocation (token usage estimate). Hard limit per license tier (open question — V1 default budget configurable).
- **Audit hook:** PROJ-10.

## Out of Scope
- Auto-acceptance of proposals (explicit ADR `architecture-principles` says never).
- Conversational refinement of a single proposal in chat (V2; PROJ-83 handles document chat).
- Learning loop (reuse accepted proposals as future few-shot examples) — V2.
- A/B comparison of two skill versions on the same action — V2.

## Geerdet am 2026-09-01 (PROJ-165) — und in α + β geschnitten

### Der Kern ist dringender als bei der Erstfassung, nicht weniger dringend

PROJ-153s CIA-Pass hat am 2026-08-28 gemessen, dass der Skill-Text im System-Prompt **hinter** den
Hausanweisungen landet und „Ergänzung, kein Ersatz" damit eine **Positionskonvention, kein
Mechanismus** ist. Er hält heute nur, weil Schema und serverseitige Persistenz klammern — und
ausdrücklich, solange es **kein Tool-Calling** gibt (dort unabhängig nachgemessen: 0 Stellen). Sein
Verdikt: „PROJ-153 wird dessen erster Konsument, baut aber **keine eigene Mandatsprüfung** — eine
zweite Durchsetzungsstelle müsste PROJ-82 später zusammenführen." Genau diese Stelle ist der
α-Umfang.

### Messungen, die den Schnitt erzwingen

| Annahme der Erstfassung | Gemessener Stand 2026-09-01 |
|---|---|
| `allowed_actions` ist hier zu definieren (7 Werte) | **PROJ-77-α hat es am 2026-07-24 ausgeliefert**, mit **8** anderen Werten (`src/lib/skills/allowed-actions.ts`) |
| `propose_acceptance_criteria`, `propose_dependency` | **existieren nicht** |
| Actions sind das Vokabular der KI-Aufrufe | Das Produkt führt **17 `AIPurpose`-Werte** (`src/lib/ai/types.ts`); Actions und Purposes sind zwei Register, die aufeinander abgebildet werden müssen |
| Retrieval steht bereit (PROJ-80) | PROJ-80-**α** ist „Quintessenz ohne Vektor"; `document_chunks` hat **0** Treffer |
| Skill-Kontext im Prompt ist neu zu bauen | **existiert zweimal**: `project-chat-skills.ts` (PROJ-151) und der Skill-Lader von PROJ-153 |
| Schemazusätze auf `ki_suggestions` | `originating_skill_id`, `conflict_group_id`, `rag_scope_size`, `skill_conflict_mode`: **je 0 Treffer** — unberührt |

### α — Mandatsdurchsetzung ohne Retrieval (baubar)

- Autorität für die Wertemenge bleibt `src/lib/skills/allowed-actions.ts`; diese Spec definiert kein
  zweites Enum.
- Abbildung **Action → AIPurpose** wird explizit und an **einer** Stelle geführt. Sie ist nicht
  eins-zu-eins: `propose_work_item` bedient heute mindestens `proposal_from_context` und
  `work_items_from_project_intent`.
- Durchsetzung ist eine **einzige** serverseitige Prüfstelle, die jeder skillgesteuerte Zweck
  aufruft — PROJ-151 und PROJ-153 werden ihre ersten Konsumenten. Zwei Prüfstellen wären genau die
  zweite Wahrheit, die PROJ-153 vermeiden wollte.
- `originating_skill_id` / `originating_skill_version_id` / `conflict_group_id` auf `ki_suggestions`,
  Konfliktauflösung, Kennzeichnung in der Prüfansicht.
- **Nicht** in α: `rag_scope_size`, Scope-Auflösung, RAG-Kontext im Prompt.

### β — RAG-gestützte Skill-Ausführung (gesperrt)

Punkt 2 des Invocation-Flows, `rag_scope_size`, „Skill greift auf X Dokumente zu". Wartet auf
PROJ-80-β und PROJ-81.

### Was diese Erdung ausdrücklich nicht entschieden hat

Ob `propose_acceptance_criteria` und `propose_dependency` dem ausgelieferten Enum hinzugefügt werden;
ob die Konfliktauflösung wirklich drei Modi braucht (der Bestand hat **null** Konsumenten, also keine
Erfahrung); und ob die Abbildung Action→Purpose in α vollständig sein muss oder nur für die Zwecke,
die heute skillgesteuert sind (PROJ-151, PROJ-153). Drei offene Fragen für `/architecture`.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
