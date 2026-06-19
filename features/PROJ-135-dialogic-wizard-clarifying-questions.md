# PROJ-135: Dialogic Wizard Clarifying Questions (AI-Rückfragen vor der Generierung)

## Status: In Progress
**Created:** 2026-06-16
**Last Updated:** 2026-06-19
**Origin:** PROJ-90 "Next/Later" — promoted to its own spec (user-requested 2026-06-16)
**Priority:** P1 — sharpens the PROJ-86–91 AI-bootstrap output
**CIA review:** GO-mit-Auflagen (2026-06-16, obs 8167) — persistence approach **Option B-modified** locked (see CIA Architecture Review section)

## Summary
Today the wizard's follow-up questions (PROJ-5) are **rule-based** from the PROJ-6 catalog — they do not look at the uploaded kickoff document. This feature adds an **AI clarifying-question round** inside the wizard, **before finalize**: after the user uploads a kickoff artefact, the AI reads the document + the Vorhaben (`projects.description`) and asks **one round of a few targeted questions** about the gaps and ambiguities it found. The user answers what they want (each question skippable), and the answers are stored as a **structured context addendum** that the downstream generation (PROJ-70 backlog, PROJ-88 stakeholders, PROJ-89 risks, orchestrated via PROJ-90) reads — producing higher-quality, more goal-aligned proposals.

It reuses the existing AI-router machinery (purpose-based `invoke…`, Class-3 routing, cost-cap, no silent mutation). It introduces **no autonomous agent loop** and **no business-data mutation** — the only output is reviewable Q&A text attached to the context source.

## Problem / Context
The AI-bootstrap track (PROJ-86–91) can now generate a whole project from a kickoff document, but the quality ceiling is the **input**: a thin or ambiguous kickoff yields thin or off-target proposals. The wizard's existing follow-ups are generic catalog questions (PROJ-6), blind to the actual document. There is no step where the AI says "your kickoff doesn't mention a go-live date / budget owner / target system — can you clarify?" before it generates. This feature closes that gap with a single, controlled clarifying round that enriches the context the generation already consumes.

## Locked scope decisions (user, 2026-06-16)
1. **Trigger point:** inside the wizard, **before finalize** — a new optional step after the kickoff upload (mirrors the existing optional `ki_backlog` step).
2. **Answer sink:** answers become a **structured context addendum** attached to the kickoff `context_source`; the Vorhaben (`projects.description`) is **NOT** modified — preserving the PROJ-91 track invariant (Vorhaben = relevance yardstick only, never a generation source). **Persistence mechanism locked by CIA (obs 8167) → Option B-modified:** the Q&A is appended to `context_source.content_excerpt` (the field the collectors actually read), **not** parked in `source_metadata`-only — because `source_metadata` is never read by the collectors *nor* by the Class-3 classifier scan path, which would let PII-laden answers bypass the privacy gate. See CIA Architecture Review below.
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
- [ ] **AC-135.4** _(revised per CIA obs 8167 — Option B-modified)_: On finalize, the answered questions are persisted by **appending** a structured Q&A block to `context_source.content_excerpt` with a stable delimiter (so the PROJ-70/88/89 collectors — which read `content_excerpt` — actually see it), **without** modifying `projects.description`. The same Q&A block is **mirrored into `source_metadata` for audit only**. Persisting Q&A in `source_metadata`-only is explicitly rejected: it is read by neither the collectors nor the Class-3 classifier scan path. Unanswered/skipped questions are omitted from both.
- [ ] **AC-135.4b** _(privacy re-stamp — CIA-mandated)_: At persist time, `detectClass3Markers` (post-PROJ-86) is re-run over the Q&A text; on any PII hit the source's `privacy_class` is raised via `GREATEST(privacy_class, 3)`. A Class-2 kickoff whose answers introduce personal data therefore becomes Class-3 **before** any downstream cloud generation reads it — closing the bypass the rejected Option A would have opened.
- [ ] **AC-135.5**: The downstream generation purposes (PROJ-70/88/89) **read the Q&A addendum** as part of their auto-context, so accepted proposals reflect the clarifications. The PROJ-91 track invariant is preserved: the Vorhaben stays the relevance yardstick; the addendum is treated as additional **kickoff-derived** source material, not as a generation goal.
- [ ] **AC-135.6**: **No silent mutation / full auditability** — the clarifying run is recorded as a `ki_run` (purpose, classification, provider, tokens, status) like every other AI call; the Q&A addendum is reviewable text, not a business record. No `work_items`/`stakeholders`/`risks` are created by this step (invariant #2).
- [ ] **AC-135.7**: **Graceful skip / non-blocking** — if question generation errors, returns zero questions, is `external_blocked` (Class-3 without Ollama), or hits the cost cap, the step shows a clear, non-blocking message and the user can proceed to finalize; generation downstream is unaffected. No all-or-nothing.
- [ ] **AC-135.8**: **Cost-cap respected** — the clarifying purpose is gated by the existing per-purpose cost-cap mechanism (its own purpose row, NULL-purpose fallback), like the other AI purposes.
- [ ] **AC-135.9** _(migration lockstep — CIA-mandated)_: The new purpose (`clarifying_questions_from_context`) is added to the `ki_runs.purpose` CHECK constraint **and** the `tenant_ai_cost_caps` purpose CHECK constraint **in the same migration**, re-enumerating the full set (including `sentiment` + `coaching`, which have repeatedly regressed out of these CHECKs — PROJ-34/PROJ-88). A missing enum value causes a live 5xx on the first call, so a regression-guard test asserts the purpose is accepted by both constraints.
- [ ] **AC-135.10** _(finalize independence — CIA-mandated)_: `finalizeDraft` **never `await`s** the clarifying-question generation. The clarifying call is fired with a ~15–20s timeout (analog PROJ-70-γ) and fails open on provider error / no-Ollama / cost-cap; finalize completes regardless. The wizard step is the only place the user waits on the call, and that wait is bounded and skippable.
- [ ] **AC-135.11** _(audit re-linking — CIA Q1, from Tech Design §3.1)_: Because the clarifying run is recorded **before** the project exists (`ki_runs.project_id` is null at generation time, bounded-nullable per Option 1), the run carries a `wizard_draft_id`; at finalize the run is **best-effort re-linked** to the new `project_id`. A project-less `ki_runs` row is readable only via the tenant-scoped audit policy and never leaks across tenants (`tenant_id` anchor + red-team smoke).

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
- No new npm dependency expected (reuses the AI SDK + router stack). A CIA review was **completed** (2026-06-16, obs 8167) — verdict **GO-mit-Auflagen** — because this introduces a new AI purpose + a new wizard interaction pattern. Its mandatory conditions are folded into AC-135.4 / AC-135.4b / AC-135.9 / AC-135.10 above.

## CIA Architecture Review (2026-06-16, obs 8167)
**Verdict:** GO-mit-Auflagen.

**Core decision — persistence:** persist clarifying Q&A by **appending to `context_source.content_excerpt` (Option B-modified)**, mirror to `source_metadata` audit-only. Rejected: **Option A** (Q&A in `source_metadata`-only, appended at runtime) — *High risk*, because `classifyProposalFromContextAutoContext` inspects only `content_excerpt` (+ `description`), so a Class-2 source carrying PII-laden Q&A answers would be shipped to a cloud provider undetected.

**Confirmed code facts (basis for the Auflagen):**
- All three collectors (PROJ-70/88/89) `SELECT` identical fields from `context_sources`: `id, kind, title, privacy_class, content_excerpt, language, project_id`.
- `source_metadata` is **intentionally excluded** from the collectors (see comment in `src/lib/ai/auto-context.ts` ~lines 1050–1052) — confirming Option A would be invisible to generation.
- The new purpose must re-enumerate the `ki_runs` **and** `tenant_ai_cost_caps` CHECK constraints in lockstep (incl. `sentiment` + `coaching`).
- `finalizeDraft` must never `await` the Q&A call; ~15–20s timeout (analog PROJ-70-γ), fail-open.
- PROJ-91 invariant holds: `projects.description` (Vorhaben) stays untouched; Q&A is kickoff-derived only.

**Five mandatory acceptance criteria handed to `/architecture`** (AC-A1..A5, now mapped into this spec): append-to-excerpt + audit mirror (→ AC-135.4); detect/raise `privacy_class` on persist (→ AC-135.4b); preserve Vorhaben (→ AC-135.5); fail-open finalize independence (→ AC-135.10); new purpose with cost-cap row + migration lockstep (→ AC-135.9).

**Effort:** Slice α (backend ~2 PT) + β (frontend ~1.5 PT) ≈ **3.5 PT total**.

**Follow-ups proposed (not in this slice):** multiple clarifying rounds; PROJ-90 conductor integration of the clarifying step; PROJ-75 full-text reclassification bridge (re-classify on the full document, not just the 8000-char excerpt).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
**Designed:** 2026-06-18 · **Backend + Frontend** (no new npm dependency) · **CIA-reviewed** (the central audit fork — see §3.1)

### Overview — what gets built
A new AI "purpose" (`clarifying_questions_from_context`) that, inside the project-creation wizard, reads the uploaded kickoff document and proposes a short round of clarifying questions; the PM answers what they want; the answers are attached to the kickoff source so the later backlog/stakeholder/risk generation (PROJ-70/88/89) reads sharper input. It reuses the existing AI-router, classifier, cost-cap, and audit machinery — it adds **no** new proposal/review surface, **no** new business records, and **no** autonomous loop.

This purpose is deliberately **unlike** the PROJ-70/88/89 "proposal" purposes. Those write reviewable `ki_suggestions` rows with an accept/undo workflow. This one writes its output as **text appended to the kickoff source** — behaving like the existing `narrative`/`sentiment`/`coaching` purposes (which also record an audit run but write to a non-suggestion sink). Consequence: **no `ki_suggestions` rows, no accept/undo RPC pair, no `ki_provenance`, no immutability-bypass** are needed. This is a much smaller backend than its siblings.

### 1) Component structure (what the user sees)
```
Project-Creation Wizard
+-- basics            (existing — kickoff upload toggle lives here, PROJ-70-ε)
+-- type / method / followups   (existing — rule-based PROJ-6 questions, unchanged)
+-- ki_backlog        (existing optional step — kickoff upload, PROJ-70-ε)
+-- clarifying        (NEW optional step — appears only when a kickoff was uploaded)
|   +-- "Generate questions" trigger (auto-fires on entering the step)
|   +-- 0–6 question cards, each with:
|   |     +-- the AI's question text (+ optional gap-tag / rationale)
|   |     +-- a free-text answer field
|   |     +-- a per-question "überspringen" affordance
|   +-- step-level "Schritt überspringen" affordance
|   +-- bounded wait (~15–20s) + fail-open states:
|         "keine Rückfragen nötig" / "lokaler Provider erforderlich – übersprungen" / error
+-- review            (existing — finalize)
```
The step's **visibility** reuses the exact `ki_backlog` condition (a kickoff `context_source` was uploaded). Question text + the PM's answers live in the **wizard draft** (resumable, like every other wizard field). Nothing is generated unless the PM reaches/triggers the step.

### 2) Data model (plain language — no business tables added)
- **`context_sources` (existing, reused as the answer sink):** on finalize, a structured Q&A block is **appended to `content_excerpt`** with a stable delimiter, and the **full Q&A is mirrored into `source_metadata` for audit only**. `content_excerpt` has a hard **8000-character cap** — the append must always fit (see truncation rule, §3.2). The source's `privacy_class` is **re-stamped** at the same time (§3.3). `projects.description` (the Vorhaben) is never touched.
- **`ki_runs` (existing audit table — one bounded change):** every clarifying generation is recorded as a `ki_run` (purpose, classification, provider, tokens, status) like every other AI call. Because generation happens in the wizard **before the project exists**, the run has no project to point at. We make `ki_runs.project_id` **nullable in a bounded way** — see §3.1. A new optional `wizard_draft_id` correlation column lets a project-less run be tied back to its draft (and best-effort back-filled to the real project at finalize).
- **Purpose CHECK constraints:** `clarifying_questions_from_context` is added to **`ki_runs.purpose`** and **`tenant_ai_cost_caps.purpose`** — re-enumerating the *full current* list (incl. `sentiment` + `coaching`, which regressed out before — PROJ-88 incident). It is **deliberately NOT added to `ki_suggestions.purpose`** (no suggestions written); the migration's smoke-test asserts its *absence* there to prevent copy-paste drift from the PROJ-70 template.

### 3) Tech decisions (the WHY)

#### 3.1 The audit fork → **Option 1: bounded-nullable `ki_runs.project_id`** (CIA-recommended, GO-mit-Auflagen)
The clarifying call fires in the wizard step *before* finalize, so no `projects` row exists yet — but AC-135.6 requires every AI call to be audited as a `ki_run`, and `ki_runs.project_id` is currently `NOT NULL`. CIA evaluated three options and recommended **Option 1**, because it is the only one that keeps **both** the audit-completeness invariant **and** the locked "wizard, before finalize" placement:
- *Rejected — defer the run to finalize:* an abandoned wizard would leave a real provider call (tokens spent, Class-3 decision made) **unaudited** → breaks the "100% traceable" governance metric **and** opens a cost-cap-bypass / cost-DoS vector (caps are tenant+purpose-scoped and only count recorded runs).
- *Rejected — generate after finalize:* contradicts the locked scope and the product premise (answers must sharpen the *subsequent* generation).

**Mandatory Auflagen folded into this design (all six):**
1. **Bounded CHECK, not a blanket drop:** `project_id` may be null **only** for `purpose = 'clarifying_questions_from_context'`; `NOT NULL` stays effectively enforced for all 8 other purposes.
2. **Additive RLS, never replace:** the existing project-scoped read/insert policies on `ki_runs` are left untouched; **one additional** SELECT and INSERT policy each, gated on `project_id IS NULL AND is_tenant_member(tenant_id)` (the `tenant_id` anchor prevents cross-tenant leakage). A red-team smoke proves a project-less run from Tenant A is invisible to Tenant B.
3. **Correlation anchor:** new optional `ki_runs.wizard_draft_id` (FK → `project_wizard_drafts`, `ON DELETE SET NULL`), set on the clarifying insert; best-effort back-filled to the real `project_id` at finalize (added as **AC-135.11** below, per CIA Q1).
4. **Partial index** `(tenant_id, created_at) WHERE project_id IS NULL` for the tenant-level audit view.
5. **Truncation rule** for the excerpt append (§3.2).
6. **Class-3 re-stamp** after the append (§3.3).

#### 3.2 Persistence = Option B-modified, with a deterministic truncation rule
Answers are appended to `content_excerpt` (not parked in `source_metadata`-only) because the PROJ-70/88/89 collectors and the Class-3 classifier read **only** `content_excerpt` — `source_metadata` is invisible to both (intentional, to keep PII out of prompts). To respect the 8000-char cap: render the Q&A block first; if `excerpt + block` would exceed 8000, **head-truncate the original excerpt** (with a visible `[…excerpt gekürzt…]` marker) and **always keep the full Q&A block** — the PM's clarifications are the high-value signal and the original kickoff is redundant with the stored file.

#### 3.3 Privacy: re-stamp on persist (DSGVO defense-in-depth)
The Q&A block is free user text and may introduce personal data. On persist, `detectClass3Markers` (post-PROJ-86) runs over the **combined** excerpt and raises `privacy_class` to its floor via "greatest" (never downgrades). A Class-2 kickoff whose answers add PII becomes Class-3 **before** any downstream cloud generation reads it — closing the exact bypass the rejected `source_metadata`-only approach would have opened.

#### 3.4 Classification & routing = standard path (not pinned)
Mirrors PROJ-70/89 (`classify…AutoContext` with `context_source.privacy_class` as floor + marker-upgrade), **not** PROJ-88's hard Class-3 pin: a clean Class-1/2 kickoff may use the tenant's cloud provider; Class-3 clamps to Ollama-only via the resolver (no hard-pin — PROJ-93 forward-compat). If the source is Class-3 and the tenant has no local provider, the step shows "lokaler Provider erforderlich – übersprungen" and the wizard proceeds (fail-open).

#### 3.5 Generation in the step, persistence at finalize (finalize never awaits AI)
Generation is a new tenant-scoped endpoint the wizard calls **on entering the clarifying step**, taking the kickoff `context_source_id` (its `project_id` is still null) + the draft's Vorhaben text — bounded ~15–20s timeout, fail-open. **Finalize never calls the AI**; it only does cheap DB writes: attach `context_source.project_id` (existing PROJ-70-ε step), append the answered Q&A + re-stamp, and back-fill the run's `wizard_draft_id → project_id`.

### 4) Dependencies
None. Reuses the AI SDK + router + classifier + cost-cap stack already in `package.json`.

### 5) Acceptance-criteria mapping
- **AC-135.1** → new purpose + `invoke…` helper returning 0–6 questions to the caller (no `ki_suggestions` written).
- **AC-135.2 / 3.4** → standard classifier + resolver clamp.
- **AC-135.3 / §1** → new optional `clarifying` wizard step, per-question + step skip.
- **AC-135.4 / §3.2** → append to `content_excerpt` + audit mirror + truncation rule.
- **AC-135.4b / §3.3** → re-stamp `privacy_class` on persist.
- **AC-135.6 / §3.1** → bounded-nullable `ki_runs` audit (Option 1) — every run recorded, even pre-project.
- **AC-135.7 / §3.5** → fail-open, non-blocking step.
- **AC-135.8** → cost-cap row for the new purpose (tenant+purpose-scoped; works for project-less runs).
- **AC-135.9 / §2** → CHECK lockstep on `ki_runs` + `tenant_ai_cost_caps` (keep `sentiment`+`coaching`); assert absence on `ki_suggestions`.
- **AC-135.10 / §3.5** → finalize never awaits the AI call.
- **AC-135.11 (new, CIA Q1):** at finalize, the clarifying run's `wizard_draft_id` is best-effort resolved to the new `project_id` so project-less audit rows are re-linked.

### 6) CIA review outcome (audit fork, 2026-06-18)
**Verdict: GO — Option 1 with Auflagen 1–6** (all folded into §3.1–§3.3 above). Blast radius bounded to the `ki_runs` audit table + two *additive* RLS policies + one optional column + one partial index; no new dependency; multi-tenant invariant preserved via the `tenant_id` anchor. Follow-ups: **Q2** — retention/cleanup cron for project-less `clarifying` runs whose draft was abandoned (low prio, post-pilot → **PROJ-Y candidate**); **Q3** — full-text (not 8000-excerpt) Class-3 re-classification overlaps **PROJ-75** (kept as that slice; MVP re-stamps the combined excerpt only, consistent with PROJ-70-γ).

### 7) Suggested build slices
- **α (backend ~2 PT):** purpose + types + `classify…`/`collect…` + `invoke…` helper + generation endpoint + migration (bounded-nullable + CHECK lockstep + additive RLS + `wizard_draft_id` + partial index) + finalize persist (append/truncate/re-stamp/back-fill). Live-RPC/endpoint smoke required (per project convention).
- **β (frontend ~1.5 PT):** the optional `clarifying` wizard step, question cards, per-question + step skip, bounded-wait + fail-open states, draft persistence.

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

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
