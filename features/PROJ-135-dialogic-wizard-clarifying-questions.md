# PROJ-135: Dialogic Wizard Clarifying Questions (AI-Rückfragen vor der Generierung)

## Status: In Progress
**Created:** 2026-06-16
**Last Updated:** 2026-06-19
**Origin:** PROJ-90 "Next/Later" — promoted to its own spec (user-requested 2026-06-16)
**Priority:** P1 — sharpens the PROJ-86–91 AI-bootstrap output

## Summary
Today the wizard's follow-up questions (PROJ-5) are **rule-based** from the PROJ-6 catalog — they do not look at the uploaded kickoff document. This feature adds an **AI clarifying-question round** inside the wizard, **before finalize**: after the user uploads a kickoff artefact, the AI reads the document + the Vorhaben (`projects.description`) and asks **one round of a few targeted questions** about the gaps and ambiguities it found. The user answers what they want (each question skippable), and the answers are stored as a **structured context addendum** that the downstream generation (PROJ-70 backlog, PROJ-88 stakeholders, PROJ-89 risks, orchestrated via PROJ-90) reads — producing higher-quality, more goal-aligned proposals.

It reuses the existing AI-router machinery (purpose-based `invoke…`, Class-3 routing, cost-cap, no silent mutation). It introduces **no autonomous agent loop** and **no business-data mutation** — the only output is reviewable Q&A text attached to the context source.

## Problem / Context
The AI-bootstrap track (PROJ-86–91) can now generate a whole project from a kickoff document, but the quality ceiling is the **input**: a thin or ambiguous kickoff yields thin or off-target proposals. The wizard's existing follow-ups are generic catalog questions (PROJ-6), blind to the actual document. There is no step where the AI says "your kickoff doesn't mention a go-live date / budget owner / target system — can you clarify?" before it generates. This feature closes that gap with a single, controlled clarifying round that enriches the context the generation already consumes.

## Locked scope decisions (user, 2026-06-16)
1. **Trigger point:** inside the wizard, **before finalize** — a new optional step after the kickoff upload (mirrors the existing optional `ki_backlog` step).
2. **Answer sink:** answers become a **structured context addendum** attached to the kickoff `context_source`; the Vorhaben (`projects.description`) is **NOT** modified — preserving the PROJ-91 track invariant (Vorhaben = relevance yardstick only, never a generation source).
3. **Dialog shape:** **one round** of a few (3–6) targeted, **individually skippable** questions — one AI call, deterministic, testable. No multi-turn agent loop.
4. **Class-3 behaviour:** the question-generation is its own AI purpose routed through the **standard resolver** (Class-1/2 → cloud, Class-3/PII → Ollama-only). If the source is Class-3 and no local provider is configured, the clarifying step is **gracefully skipped** (never blocks the wizard); generation proceeds as before. Consistent with PROJ-88/89.

## User Stories
- As a PM uploading a kickoff in the wizard, I want the AI to ask me a few pointed questions about gaps it found in my document, so that the project it generates afterwards is sharper and more complete.
- As a PM, I want every clarifying question to be optional (skippable), so that the wizard never stalls on a question I can't or don't want to answer.
- As a PM, I want my answers to visibly feed the generation (backlog/stakeholders/risks), so that answering feels worthwhile rather than busywork.
- As a Compliance officer, I want the clarifying round to obey the same Class-3 routing as the rest of the AI bootstrap, so that a kickoff containing personal data keeps its Q&A local.
- As a PM with no kickoff document, I want the clarifying step to simply not appear, so that the wizard stays short for the manual path.

## Acceptance Criteria
- [ ] **AC-135.1**: A new `AIPurpose` value (e.g. `clarifying_questions_from_context`) is added and wired through the router with a dedicated `invoke…` helper (mirrors `invokeProposalFromContextGeneration`): it takes the kickoff context (excerpt + Vorhaben + project frame) and returns **0–6 clarifying questions**, each with a short prompt text and an optional rationale/gap-tag.
- [ ] **AC-135.2**: Classification follows the **standard path** — Class-1/2 kickoff → cloud provider; Class-3 (PII, post-PROJ-86 detection or stamped `privacy_class`) → Ollama-only via the resolver clamp (no hard-pin — PROJ-93 forward-compat).
- [ ] **AC-135.3**: A new **optional wizard step** appears only when a kickoff source was uploaded (mirrors the `ki_backlog` step visibility); it renders the generated questions with a free-text answer field per question and a clear **"überspringen"** affordance per question and for the whole step.
- [ ] **AC-135.4**: On finalize, the answered questions are persisted as a **structured Q&A addendum** on the kickoff `context_source` (e.g. in `source_metadata`), **without** modifying `projects.description`. Unanswered/skipped questions are omitted from the addendum.
- [ ] **AC-135.5**: The downstream generation purposes (PROJ-70/88/89) **read the Q&A addendum** as part of their auto-context, so accepted proposals reflect the clarifications. The PROJ-91 track invariant is preserved: the Vorhaben stays the relevance yardstick; the addendum is treated as additional **kickoff-derived** source material, not as a generation goal.
- [ ] **AC-135.6**: **No silent mutation / full auditability** — the clarifying run is recorded as a `ki_run` (purpose, classification, provider, tokens, status) like every other AI call; the Q&A addendum is reviewable text, not a business record. No `work_items`/`stakeholders`/`risks` are created by this step (invariant #2).
- [ ] **AC-135.7**: **Graceful skip / non-blocking** — if question generation errors, returns zero questions, is `external_blocked` (Class-3 without Ollama), or hits the cost cap, the step shows a clear, non-blocking message and the user can proceed to finalize; generation downstream is unaffected. No all-or-nothing.
- [ ] **AC-135.8**: **Cost-cap respected** — the clarifying purpose is gated by the existing per-purpose cost-cap mechanism (its own purpose row, NULL-purpose fallback), like the other AI purposes.

## Edge Cases
- No kickoff uploaded → the clarifying step is not shown at all (manual wizard path unchanged).
- Kickoff is thin/empty → AI returns 0 questions → step auto-skips with a brief "keine Rückfragen nötig" note, or is not shown.
- User skips every question → no addendum is written; generation runs on the original context (identical to today).
- Class-3 kickoff, no Ollama → step shows "lokaler Provider erforderlich – übersprungen" and lets the user finalize; downstream generation still respects Class-3.
- User edits an AI question's intent by answering tangentially → the answer is stored verbatim; the AI is told (in the downstream prompt) these are user clarifications, grounding still requires kickoff-derived items.
- Wizard draft is saved mid-clarifying-step and resumed → answered questions survive in the draft (no re-generation forced unless the user re-triggers).
- Generate-All triggered twice / wizard re-finalize → the clarifying run is not duplicated; the addendum is idempotently overwritten by the latest answered set.

## Non-Goals / Out of Scope
- **Multi-turn / autonomous agent dialog** — explicitly excluded; one controlled round only.
- **Modifying the Vorhaben** (`projects.description`) from answers — excluded to preserve the PROJ-91 invariant.
- **Post-finalize re-run in the PROJ-90 conductor** — out of this slice (the locked trigger is the wizard); can be promoted later if pilot demand appears.
- **New extraction targets** (budget, schedule auto-fill) — stays with their owning specs.
- **Replacing the PROJ-6 rule-based follow-ups** — the AI clarifying round is additive, not a replacement of the catalog questions.

## Dependencies
- Requires: PROJ-86 (classifier correctness so Class-2 kickoffs reach cloud), PROJ-70 (`context_source` + proposal-from-context auto-context that will read the addendum), PROJ-5 (wizard step framework + draft persistence), PROJ-12 (AI router, `ki_runs`, cost-cap), PROJ-91 (track invariant the addendum must respect).
- Relates to: PROJ-90 (the orchestrated generation that benefits from the sharpened context), PROJ-88/89 (also consume the enriched context).
- Unblocks: higher proposal quality across the whole AI-bootstrap track.

## Technical Requirements (optional)
- The clarifying step must not add a hard dependency that blocks finalize — it is always skippable and fail-open.
- No new npm dependency expected (reuses the AI SDK + router stack); a CIA review is warranted at `/architecture` because this introduces a **new AI purpose + a new wizard interaction pattern**.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Designed:** 2026-06-18 · **Status of this design:** ready for review
**CIA pre-architecture review:** GO-mit-Auflagen (2026-06-16, obs 8167). The verdict below is fully incorporated — see "Persistence decision" and the new hardening criteria AC-A1…A5.

### The one decision that shapes everything: where the answers live

This feature only produces one piece of output — the question/answer text the PM types in the wizard. Everything else is plumbing we already own. So the whole design hinges on a single choice: **where do those answers get stored so the downstream generation actually sees them, and so our privacy guard still inspects them?**

We looked at two options:

- **Option A — store the Q&A only in the source's metadata field (`context_sources.source_metadata`).** Rejected. Two existing safety/quality mechanisms read the source's *excerpt* field, not the metadata field:
  1. The backlog/stakeholder/risk generators (PROJ-70/88/89) build their AI context from a fixed list of columns that includes `content_excerpt` but **deliberately excludes `source_metadata`** (it's free-shape JSON that often hides emails/attendee names). So Q&A in metadata would be *invisible to the generation* — the feature wouldn't actually improve the output.
  2. The Class-3 privacy classifier scans `content_excerpt` for personal-data markers. Q&A in metadata would *skip the scan* — a kickoff stamped "Class-2 / cloud-OK" could ship PII-laden answers (e.g. "the budget owner is Frau Müller, mueller@kunde.de") to a cloud provider. A direct violation of Invariant #3.

- **Option B-modified — append the Q&A to the source's excerpt field (`content_excerpt`) with a stable delimiter, and additionally mirror it into `source_metadata` for audit/replay.** **Chosen** (CIA recommendation). Because the generators already read `content_excerpt`, the enriched context flows downstream with **zero change to the three collectors**. Because the classifier already scans `content_excerpt`, the answers are **automatically PII-scanned** at persist time. The metadata mirror is audit-only (who asked what, when, which questions were skipped) and is never the generation source.

This is why the design is small: we are not building a new context-delivery path, we are feeding the *existing* one a richer excerpt.

### Component Structure (what the user sees)

```
Project Creation Wizard (existing)
+-- Type → Basics → Method → Follow-ups (existing, PROJ-5/6)
+-- "KI-Backlog" step (existing, optional, PROJ-70-ε)
|     +-- Kickoff upload  → creates a context_source, stores its id
+-- "KI-Rückfragen" step  ← NEW, optional
|     +-- shown ONLY when a kickoff context_source exists (mirrors KI-Backlog visibility)
|     +-- on enter: ONE AI call → 0–6 clarifying questions
|     +-- per question:  prompt text · optional gap-tag · free-text answer field · "überspringen"
|     +-- whole-step "überspringen" affordance
|     +-- non-blocking status line for the skip/empty/blocked/cost-cap cases
+-- Review → Finalize (existing)
      +-- on finalize: answered Q&A appended to the kickoff source's excerpt + privacy re-stamp + audit mirror
```

The step is a sibling of the existing optional `KI-Backlog` step. It reuses the wizard's step-visibility helper (`visibleWizardSteps`), the draft persistence, and the same "this step is optional and skippable" interaction language. No new navigation, no new page.

### Data Model (plain language)

Nothing new is created as a table or business record. We touch one existing row and add one new "kind of AI call":

- **The kickoff `context_sources` row** (created during the KI-Backlog upload) gets two writes at finalize:
  - its **excerpt** field gains an appended, clearly-delimited block: `--- Rückfragen & Antworten (KI) ---` followed by each *answered* question and its answer. Skipped/unanswered questions are omitted. This block is what the downstream generators now read as additional kickoff-derived material.
  - its **metadata** field gains an audit mirror of the same Q&A plus run bookkeeping (timestamp, which questions were generated, which were skipped). Audit-only.
  - its **privacy class** is re-evaluated against the new excerpt content and **raised (never lowered)** if the appended answers introduce personal-data markers — so a previously Class-2 source correctly becomes Class-3 before any downstream cloud call.
- **A `ki_runs` audit row** records the clarifying call itself (purpose, classification, provider, token usage, status) — exactly like every other AI call in the system. The Q&A is reviewable text, not a business record; **no** work-items / stakeholders / risks are created by this step (Invariant #2).
- **The Vorhaben (`projects.description`) is never written by this feature** — preserving the PROJ-91 track invariant (the Vorhaben is the relevance yardstick, never a generation source). Clarifying answers are kickoff-derived source material only.

A **new AI purpose** is introduced: `clarifying_questions_from_context`. It joins the existing purpose family (`proposal_from_context`, `…_stakeholders_…`, `…_risks_…`). Adding a purpose requires re-enumerating two database CHECK constraints **in lockstep** (`ki_runs.purpose` and `tenant_ai_cost_caps.purpose`) — and, per the standing ⚠️ note in the PROJ-89 migration, that re-enumeration **must keep `sentiment` + `coaching`** in the list (they were silently dropped once and 5xx'd in production). One migration, mirroring the PROJ-89 purpose migration's structure (constraint re-enum + cost-cap row support + a self-check smoke block).

### Tech Decisions (WHY, for a PM)

1. **Append-to-excerpt over metadata-only** — the only choice that makes the answers *both* improve generation *and* stay inside the privacy guard. Picking the convenient metadata-only path would have quietly defeated the feature's purpose and opened a Class-3 leak. (CIA, AC-A1/AC-A2.)
2. **Re-classify on persist** — because the PM's free-text answers can contain names/emails the original document didn't, we re-run the same personal-data detector used everywhere else and raise the source's privacy class if needed. This keeps the downstream Class-3→local-only routing correct without any special-casing. (AC-A2.)
3. **One controlled round, one AI call** — deterministic, testable, cheap; no autonomous multi-turn agent (explicit non-goal). This matches every other AI purpose in the platform and keeps the cost-cap meaningful.
4. **Standard routing, graceful skip** — the clarifying purpose goes through the normal resolver (Class-1/2 → tenant cloud provider; Class-3 → Ollama-only). If a Class-3 source has no local provider, or the call errors, returns nothing, or hits the cost cap, the step shows a calm "übersprungen" message and the user finalizes anyway. The wizard never stalls on this step. (AC-A4/AC-135.7.)
5. **Finalize never waits on the AI** — question *generation* happens when the user enters the step (interactive). The *persist* of answers at finalize is a fast local write (append + re-stamp), not an AI call, so finalize stays snappy and is never blocked by provider latency. (AC-A4.)
6. **No new npm dependency** — reuses the AI SDK, the router, the classifier, the wizard framework, and the `context_sources` table already in production.

### Slicing

- **α — Backend (~2 PT):** new purpose + router `invoke…` helper + classifier wiring; the append-to-excerpt + privacy re-stamp + audit-mirror persist path; the purpose/cost-cap migration (lockstep, keeps sentiment+coaching) with a live-RPC smoke (per the project's "live-RPC-smoke required" rule). No change to the PROJ-70/88/89 collectors — they inherit the richer excerpt for free.
- **β — Frontend (~1.5 PT):** the optional `KI-Rückfragen` wizard step (visibility via `visibleWizardSteps`, per-question + whole-step skip, non-blocking status states), draft persistence of answers, finalize hook to trigger the persist.

Total ≈ 3.5 PT. CIA review at `/architecture` is satisfied by this document; a further CIA pass is **not** required for `/backend` since the slice introduces no new dependency and follows the established purpose/router/classifier pattern.

### Hardening Acceptance Criteria (from CIA, obs 8167)

These sharpen the spec's AC-135.* with the persistence-and-privacy specifics the CIA review locked:

- [ ] **AC-A1 — Append + audit mirror:** answered Q&A is appended to `context_sources.content_excerpt` with a stable, parseable delimiter, AND mirrored into `source_metadata` for audit. The downstream PROJ-70/88/89 collectors read the enriched excerpt **without any code change** (verified by a generation run that demonstrably reflects an answer).
- [ ] **AC-A2 — Re-classify on persist:** the personal-data detector runs over the appended Q&A at persist time; `context_sources.privacy_class` is raised via a never-lower (`GREATEST`) rule when markers are found. A Class-2 kickoff whose answers introduce an email/name becomes Class-3 **before** any downstream cloud call.
- [ ] **AC-A3 — Vorhaben untouched:** `projects.description` is never modified by this feature; the PROJ-91 invariant holds (Vorhaben = relevance yardstick, Q&A = kickoff-derived source).
- [ ] **AC-A4 — Finalize independence / fail-open:** finalize never awaits the AI question-generation call; the persist step is a local write. On provider error / zero questions / `external_blocked` (Class-3 without Ollama) / cost-cap, the step is skipped with a non-blocking message and finalize proceeds; downstream generation is unaffected.
- [ ] **AC-A5 — New purpose, migration lockstep:** `clarifying_questions_from_context` is added to the `ki_runs.purpose` AND `tenant_ai_cost_caps.purpose` CHECK constraints in one migration that **retains `sentiment` + `coaching`**, supports a per-purpose cost-cap row (NULL-purpose fallback), and includes a self-check smoke block. Verified by a live-RPC smoke against the database.

### Open question for review

- **Step placement & re-trigger:** the design places `KI-Rückfragen` immediately after `KI-Backlog` (so the upload exists) and before Review. On wizard resume, answered questions survive in the draft and are **not** auto-regenerated unless the user re-triggers. Confirm this ordering and the "no silent re-generation on resume" behaviour, or state a preference.

## Implementation Notes

### Slice α — backend (2026-06-19, In Progress)
Built per the approved Tech Design. **No `ki_suggestions`, no accept/undo RPC, no provenance** — this purpose writes its output to `content_excerpt`, like `narrative`/`sentiment`/`coaching`.

**Files:**
- `src/lib/ai/types.ts` — new `AIPurpose` `clarifying_questions_from_context`; `ClarifyingQuestionsAutoContext` (pre-project shape: frame from the draft, not a `projects` row), `ClarifyingQuestion` (`question`/`rationale`/`gap_tag`), `ClarifyingQuestionsGenerationOutput`, `RouterClarifyingQuestionsResult`.
- `src/lib/ai/classify.ts` — `classifyClarifyingQuestionsAutoContext` (content-based, mirror of PROJ-89: `privacy_class` floor + marker upgrade on excerpt **and** Vorhaben; PROJ-86 regression-guarded by the existing `detectClass3Markers`).
- `src/lib/ai/auto-context.ts` — `collectClarifyingQuestionsAutoContext(supabase, contextSourceId, draftFrame)`: reads ONLY the kickoff `context_source` (pre-project, `project_id` still null); the Vorhaben/type/method come from the draft. `source_metadata` never read.
- `src/lib/ai/providers/graph-purpose-prompts.ts` — shared `ClarifyingQuestionsResponseSchema` + `CLARIFYING_QUESTIONS_SYSTEM_PROMPT` + `buildClarifyingQuestionsPrompt` + `mapClarifyingQuestions` (clamps lengths).
- All 5 providers implement `generateClarifyingQuestions` (Anthropic/OpenAI/Google strict via the shared schema; Ollama loose-replica `ClarifyingQuestionsResponseSchemaOllama` + shared prompt/mapper; Stub returns `[]`).
- `src/lib/ai/router.ts` — `insertKiRun` widened to `projectId: string | null` + `wizardDraftId?`; `invokeClarifyingQuestionsGeneration` (mirror of `invokeNarrativeGeneration`: single `ki_run`, no suggestions, Stub fail-open).
- `src/app/api/wizard-drafts/[id]/clarifying-questions/route.ts` — **draft-scoped** POST (no project yet); the `contextSourceId` is read from the draft (not the body); fail-open empty list when no kickoff/blocked.
- `src/app/api/wizard-drafts/[id]/finalize/route.ts` — appends answered Q&A to `content_excerpt` within the 8000 cap, re-stamps `privacy_class` (AC-135.4b), mirrors full Q&A to `source_metadata`, and best-effort re-links the project-less clarifying `ki_run` → new project (AC-135.11). Helpers extracted to `src/lib/context-ingestion/clarifying-qa.ts`.
- Migration `20260619100000_proj135_clarifying_questions_purpose.sql` — Option 1 audit fork: `ki_runs.project_id` bounded-nullable (partial CHECK → NULL only for this purpose) + `wizard_draft_id` FK + partial index + purpose CHECK lockstep on `ki_runs` **and** `tenant_ai_cost_caps` (keeps `sentiment`+`coaching`) + **3 additive tenant-scoped RLS policies** + 7 embedded smoke checks (incl. asserting `ki_suggestions_purpose_check` does NOT contain the purpose).
- `src/types/wizard.ts` — optional `clarifying` draft block (`ClarifyingData`) as the β contract.

**Quality gates:** lint 0 errors; tsc 13 baseline / **0 new**; vitest **1857/1857** (+27: classifier 6, qa-helper 9, finalize-persist 3, capability-matrix 2, plus existing); build clean (10.2s, new route registered).

**Live smoke (mandatory, prod `iqerihohwabyjzkpcujq`):** migration applied — all 7 embedded smoke checks passed. Behavioural smoke (rollback, 0 residue): a project-less `clarifying_questions_from_context` `ki_run` inserts cleanly; the bounded CHECK **rejects** a project-less `risks` row — proving the bound only relaxes for this one purpose.

**Deferred to β (frontend):** the optional `clarifying` wizard step (question cards, per-question + step skip, bounded-wait + fail-open states, draft persistence) and AC-135.3/5/7-UI. AC-135.10/11 live-E2E → /qa.

### Slice β — frontend (2026-06-19, In Progress)
The optional `clarifying` wizard step, wired to the slice-α endpoint + the `clarifying` draft block.

> Note: an initial β build was lost when the `/tmp` worktree was removed during a parallel-session collision (uncommitted). It was re-created verbatim from context on the `proj-135/requirements` branch (which carries backend α); no behavioural change.

**Files:**
- `src/types/wizard.ts` — added `clarifying` to `WIZARD_STEPS` (after `ki_backlog`, before `review`) + label "Rückfragen"; `visibleWizardSteps(kiBacklogEnabled, kickoffUploaded)` now gates the step on a kickoff actually being **uploaded** (`context_source_id` present — AC-135.3); extended `ClarifyingData` with `questions` + `status` (persisted for resume) alongside the finalize-read `answers`; new `ClarifyingQuestionItem`/`ClarifyingStatus` types.
- `src/lib/ai-proposals/clarifying-questions-api.ts` — `generateClarifyingQuestions(draftId, count)` with a **~20s `AbortController` bounded wait** (AC-135.10); maps abort → an actionable "Zeitüberschreitung" message; callers fail open.
- `src/components/projects/wizard/step-clarifying.tsx` — the step: auto-generates once on entering (one-shot effect, PROJ-70-ε `eslint-disable` pattern), renders question cards (gap-tag badge + question + rationale + answer `Textarea` + per-question **Überspringen/Einbeziehen** toggle), a step-level **"Alle überspringen"** + **"Neu generieren"**, and the four fail-open render states (loading / empty "keine Rückfragen nötig" / blocked "lokaler Provider erforderlich – übersprungen" / error + retry). Answers + generated questions sync into the draft `clarifying` block (resume-safe; finalize reads `answers`).
- `src/components/projects/wizard/wizard-client.tsx` — `clarifying` schema block (optional passthrough), `kickoffUploaded` watch → `visibleWizardSteps`, `validateStep` case (always-skippable), render branch passing the live `draftIdState`.

**AC coverage:** AC-135.3 (conditional step + per-question/step skip), AC-135.5 (answers persisted to the draft → finalize → downstream context), AC-135.7 (fail-open states, never blocks Weiter), AC-135.10 (client 20s bounded wait). AC-135.1/2/6/8/9/4/4b/11 are backend (slice α).

**Quality gates:** lint 0; tsc 13 baseline / **0 new**; vitest **1860/1860** (+3 PROJ-135 step-visibility tests in `wizard.test.ts`); build clean (11.3s, step + route registered).

**Deferred to /qa:** live-E2E Playwright (step appears only after upload; auto-generate; answer → finalize → Q&A appended to `content_excerpt`; AC-135.10/11 live).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
