# PROJ-156: Assistant Dialog Continuity and Everyday Command Understanding

## Status: In Review
## Deployment Scope: —

**Created:** 2026-08-20
**Last Updated:** 2026-08-26

## Summary

Close the gap between the conversational behavior promised by PROJ-37/38/39 and the deployed
Assistant runtime. Users must be able to start clear actions in ordinary German, answer missing-field
questions over several turns, and continue the original action after selecting a project.

The first supported end-to-end paths are:

- *„Leg mir ein Projekt an.“* → collect the missing project fields → create a reviewable Wizard draft;
- *„Mach im Projekt Apollo eine Story für den Rechnungsimport.“* → resolve the project → create a
  reviewable PROJ-144 work-item draft → retain the existing explicit confirmation step.

This is a gap-closure slice, not a general-purpose AI agent. Intent recognition and dialog transitions
remain deterministic, provider-independent, and auditable. No external model sees the input, no new
AI purpose is introduced, and no business object is written before the existing review/confirmation
gate.

## Origin and Current-State Evidence

The review on 2026-08-20 found four connected causes:

1. `src/lib/assistant/runtime.ts` classifies turns through narrow regular expressions. For example,
   `lege` is recognized but the common imperative `leg` is not.
2. Project creation immediately inserts a generic Wizard draft, even when name, type, method, and
   description are missing. It does not perform the dialog promised by PROJ-37 and PROJ-39.
3. `src/app/api/assistant/turns/route.ts` writes `last_intent` and `context` to
   `assistant_sessions`, but does not load that state before handling the next turn. A reply to a
   clarification therefore starts a new classification attempt.
4. Project-choice buttons in `src/components/assistant/assistant-launcher.tsx` navigate to a project;
   they do not submit the chosen project back to the pending command. Disambiguation abandons the
   original action.

The focused Assistant regression suite is green (3 files, 37 tests), but covers ideal one-turn commands
rather than the missing multi-turn behavior. The other active worktrees on 2026-08-20 concern
PROJ-45-δ, PROJ-80, PROJ-Y-145b, and PROJ-Y-114a and do not modify Assistant code.

## Dependencies

- **Requires: PROJ-37** (Assistant overlay and promised conversational project creation) — Deployed
- **Requires: PROJ-38** (intent runtime, session context, policy and confirmation gates) — Deployed
- **Requires: PROJ-39** (project lookup, navigation and Wizard-draft action pack) — Deployed
- **Requires: PROJ-40** (transcript retention and redaction rules) — Deployed
- **Requires: PROJ-144** (reviewable work-item draft and explicit confirmation) — Deployed, scope `full`
- **Reuses: PROJ-5** (guided project creation Wizard) and PROJ-6 (project types/methods)
- **Does not absorb: PROJ-Y-144a** (LLM extraction from genuinely unstructured work-item speech)

## Locked Scope Decisions

1. **Deterministic first.** Common German imperatives, filler words, word-order variants, and explicit
   action phrases are normalized without an LLM, cloud call, fuzzy-matching package, or new dependency.
2. **Explicit dialog state.** An allow-listed, versioned state stores the pending intent, normalized
   slots, missing slots, project candidates, and project context. Raw prompt history is not the state
   machine.
3. **Project draft only after a completed dialog.** Name, type, method, and short description are each
   answered or explicitly skipped where the Wizard permits an empty value. A name is mandatory. Only
   then is the existing Wizard draft created.
4. **Selection continues the action.** Choosing a project resumes the pending command first. Navigation
   is offered only after the command has produced its result.
5. **Existing mutation gates stay intact.** Project creation ends in the Wizard review. Work-item
   creation ends in the PROJ-144 draft card and still requires its explicit click confirmation.
6. **No overlap with PROJ-Y-144a.** PROJ-156 supports natural but clearly action-oriented paraphrases
   and follow-up answers. Unstructured speech without a reliable action, kind, or target remains a
   separate pilot-driven LLM follow-up.
7. **Controlled lifetime.** Pending dialog state expires after 30 minutes of inactivity and is cleared
   on cancel, completion, tenant change, logout, or an incompatible project-context change.

## User Stories

1. **Everyday project command** — As a project lead, I want to say *„Leg mir ein Projekt an“* and be
   asked for the missing details, so that I do not have to learn internal command syntax.
2. **Multi-turn completion** — As a user, I want my answer to *„Wie soll das Projekt heißen?“* to fill
   the open project-name field, so that the conversation continues instead of starting over.
3. **Action-preserving project choice** — As a user, I want selecting one of several matching projects
   to continue my original command, so that disambiguation is not a dead end.
4. **Natural Story creation** — As a Scrum user, I want to write *„Mach im Projekt Apollo eine Story
   für den Rechnungsimport“* and receive a reviewable Story draft, so that I can capture work without
   guessing the parser's preferred word order.
5. **Safe review** — As a user, I want to see and correct the collected project or work-item data before
   final creation, so that misunderstood speech cannot silently mutate business data.
6. **Private session state** — As a tenant admin, I want pending dialogs isolated by tenant and user and
   compatible with transcript-retention settings, so that better usability does not weaken privacy.
7. **Recoverable misunderstanding** — As a user, I want an intent-specific question and an example when
   my request is ambiguous, so that I can repair it without restarting the task.

## Acceptance Criteria

### A. Everyday-language recognition

- [ ] **AC-156.1** — `Leg mir ein Projekt an`, `Lege bitte ein neues Projekt an`, `Erstell mir ein
      Projekt`, and `Mach ein neues Projekt für mich` all resolve to `project_create_draft` without a
      model call.
- [ ] **AC-156.2** — Filler words and German verb-clause order do not change the recognized intent.
- [ ] **AC-156.3** — Status questions such as *„Wie steht das Projekt?“* never become write intents.
- [ ] **AC-156.4** — A phrase with several materially different actions is not guessed; the Assistant
      asks the user to choose or split the request.
- [ ] **AC-156.5** — Unknown input receives an intent-specific repair hint when a likely domain is
      visible; the generic catch-all remains only when no safe domain can be inferred.

### B. Dialog state and continuation

- [ ] **AC-156.6** — Session context is loaded before classification of every follow-up turn and is
      validated through a versioned schema.
- [ ] **AC-156.7** — The state contains only allow-listed fields: pending intent, normalized slots,
      missing slots, candidate identifiers, current project identifier, schema version, and expiry.
- [ ] **AC-156.8** — A follow-up answer fills only the field currently requested; it is not reclassified
      as an unrelated top-level command unless the user explicitly starts a new command.
- [ ] **AC-156.9** — `Abbrechen`, completion, 30 minutes of inactivity, logout, tenant change, or an
      incompatible project change clears the pending state.
- [ ] **AC-156.10** — State reads and writes are scoped to the authenticated user and active tenant;
      another user or tenant cannot see or resume the dialog.
- [ ] **AC-156.11** — Concurrent updates from two tabs cannot silently overwrite each other; a stale
      continuation receives a controlled conflict response and reloads the current state.

### C. Conversational project creation

- [ ] **AC-156.12** — *„Leg mir ein Projekt an“* creates no Wizard draft yet and asks for the project
      name first.
- [ ] **AC-156.13** — The dialog collects project name, type, method, and short description over one or
      more turns; existing values present in the first command are retained.
- [ ] **AC-156.14** — Project type and method questions use the existing PROJ-5/6 catalog values and
      labels, not a second hard-coded catalog.
- [ ] **AC-156.15** — The user may explicitly skip only Wizard-optional fields; a missing project name
      cannot be replaced by `Neuer Projektentwurf`.
- [ ] **AC-156.16** — Before draft creation, the Assistant shows a structured summary and allows the
      collected values to be corrected or cancelled.
- [ ] **AC-156.17** — Approval creates exactly one `project_wizard_drafts` row and returns the existing
      Wizard review link. It does not insert a final `projects` row.
- [ ] **AC-156.18** — Repeating approval, double-clicking, or replaying a completed turn cannot create a
      second Wizard draft from the same dialog.

### D. Project resolution and Story/work-item continuation

- [ ] **AC-156.19** — Project names are accepted in common positions, including *„im Projekt Apollo eine
      Story“* and *„eine Story für den Rechnungsimport im Projekt Apollo“*.
- [ ] **AC-156.20** — If a work-item command lacks a project outside a Project Room, the Assistant asks
      for it and preserves the requested kind, title, and description.
- [ ] **AC-156.21** — If a work-item command lacks a title, the next answer fills the title and resumes
      the same PROJ-144 flow.
- [ ] **AC-156.22** — When project search returns multiple candidates, choosing one posts a structured
      selection to the existing session and resumes the pending action; it does not merely navigate.
- [ ] **AC-156.23** — *„Mach im Projekt Apollo eine Story für den Rechnungsimport“* creates a PROJ-144
      draft when Apollo is uniquely visible and uses the existing method-to-kind mapping.
- [ ] **AC-156.24** — Before confirmation no `work_items` row exists. Final creation still requires the
      existing PROJ-144 confirmation control and remains idempotent.
- [ ] **AC-156.25** — A non-visible project is handled as not found without leaking its name or existence.

### E. Privacy, audit, and failure behavior

- [ ] **AC-156.26** — PROJ-156 makes no external AI/STT call beyond the already selected input modality,
      creates no `ki_runs` row, and adds no AI purpose.
- [ ] **AC-156.27** — `no_persist` stores no raw utterance in dialog context. Necessary normalized
      action slots are treated as temporary action state, minimized, and deleted on cancel/completion/
      expiry; `/architecture` must reconcile this explicitly with PROJ-40.
- [ ] **AC-156.28** — Every clarification, selection, cancellation, draft creation, blocked action, and
      state conflict remains traceable through existing Assistant turn/action audit without logging
      unnecessary raw Class-3 content.
- [ ] **AC-156.29** — Database, permission, or module-gate errors preserve no half-created business
      object and produce a clear, actionable German response.
- [ ] **AC-156.30** — Text and voice transcripts use the same parser and dialog state; all behavior is
      available without microphone permission.

### F. Regression and evidence

- [ ] **AC-156.31** — Existing PROJ-37/38/39 runtime, route, and Assistant E2E tests remain green.
- [ ] **AC-156.32** — Existing PROJ-144 unit, API, RLS/pentest, and E2E confirmation behavior remains
      unchanged.
- [ ] **AC-156.33** — A table-driven suite covers positive paraphrases and negative near-matches for
      every write intent.
- [ ] **AC-156.34** — An authenticated E2E test proves the complete project chain: colloquial command →
      questions → corrections → summary → one Wizard draft → Wizard link.
- [ ] **AC-156.35** — An authenticated E2E test proves the Story chain with an ambiguous project:
      command → candidate selection → PROJ-144 draft → explicit confirmation → exactly one Story.
- [ ] **AC-156.36** — Reload continuation, cancel, expiry, tenant switch, unauthorized project, and
      concurrent-tab conflict each have a regression test.

## Edge Cases

- The user answers a type question with a method, or vice versa → explain the mismatch and keep the
  requested slot open.
- The user changes intent during a pending dialog → explicitly confirm replacing the old action; never
  merge unrelated slots.
- The same project name exists more than once → preserve all collected work-item fields while asking
  for a selection.
- The selected project is deleted or access is revoked before continuation → neutral failure, clear
  pending target, no existence leak.
- The project method changes between draft preparation and confirmation → PROJ-144 revalidates the
  final kind; no stale method assumption is trusted.
- Speech recognition produces a wrong title → the existing editable draft/review remains the correction
  gate.
- A session is resumed after expiry → explain that the pending action expired and offer to restart; do
  not reconstruct it from transcript history.
- Two browser tabs answer the same question → one continuation wins, the other receives a state-conflict
  response instead of creating a duplicate.
- `no_persist` is active → no raw wording is added to context or audit; normalized temporary action state
  is removed at the terminal transition.

## Out of Scope

- General free-form agent autonomy or unrestricted tool selection
- LLM extraction from unstructured Work-Item speech (remains PROJ-Y-144a)
- Multiple Work Items from one utterance (PROJ-Y-144b)
- Parent, sprint, phase, or assignee resolution by speech (PROJ-Y-144c)
- Spoken confirmation that directly mutates data
- Direct final project creation outside the PROJ-5 Wizard
- Global fuzzy matching or typo-correction dependency
- New speech, wake-word, STT, or TTS infrastructure

## Solution Path for `/architecture`

1. Define a small typed dialog-state model and allowed transition table beside the existing Assistant
   runtime. Reuse `assistant_sessions.context`; do not add free prompt memory.
2. Load and validate that state in the turn route before runtime execution. Persist the next state with
   expiry and optimistic versioning after the turn.
3. Split intent recognition into canonical normalization plus intent-specific parsers. Add conservative
   German verb forms, filler words, and supported word-order variants without broad fuzzy matching.
4. Convert project creation into slot collection and a review transition. Invoke the existing Wizard-
   draft writer only once after approval.
5. Change project-choice UI actions from navigation-only buttons to structured continuation events; the
   runtime resolves the pending command and then returns the appropriate result/link.
6. Feed completed work-item slots into the unchanged PROJ-144 draft creator. Keep its rights check,
   method mapping, claim-before-create protection, and explicit UI confirmation.
7. Add table-driven parser/transition tests, route tests for state ownership/conflicts, and the two
   authenticated E2E chains from AC-156.34/.35.

This sequence is directional, not the final technical design. `/architecture` must run GitNexus impact
analysis on the runtime, turn route, session context, and launcher before selecting the concrete data and
API shapes.

## Continuous Improvement Review (2026-08-20)

**Decision:** Implement PROJ-156 as a must-have gap closure.

**Findings:** Narrow regex recognition, write-only session context, premature generic Wizard drafts,
and navigation-only disambiguation jointly cause the reported behavior. The issue is structural but can
be solved inside the established stack.

**Risks:** Over-broad patterns can misclassify reads as writes; temporary slots can violate retention if
raw text is copied; stale state can target the wrong tenant/project; parallel tabs need conflict handling.

**Recommendation:** Use deterministic normalization plus an explicit dialog state machine first. Do not
introduce an LLM/NLU dependency, a general agent, or changes to PROJ-144 confirmation semantics. Keep
PROJ-Y-144a separate until pilot evidence justifies provider- and Class-3-sensitive free-speech parsing.

## Technical Requirements

- Next.js 16, TypeScript, Supabase, Zod 4, existing Assistant tables and shadcn/ui only
- No new npm dependency, external service, AI purpose, provider configuration, or migration unless
  `/architecture` proves that versioned state cannot safely fit `assistant_sessions.context`
- Session-bound Supabase access; no service-role execution path
- Existing tenant/module/project permission gates remain authoritative
- Existing transcript retention, audit, PROJ-5 Wizard, and PROJ-144 draft semantics are reused

---

## Tech Design (Solution Architect)

### 1. Architecture Outcome

PROJ-156 extends the existing Assistant rather than creating a second chatbot or an autonomous agent.
The turn route remains the single entry point, the existing runtime remains the policy and orchestration
boundary, and PROJ-5/PROJ-144 remain the only destinations for project and Work-Item creation.

The solution has four bounded additions:

1. a deterministic everyday-language recognizer in front of the existing intent handlers;
2. a typed dialog state that turns isolated requests into a controlled conversation;
3. structured continuation actions for clarification, correction, cancellation, and project choice;
4. an atomic completion step that creates one Wizard draft and closes the pending project dialog
   together.

Backend and frontend work are both required. No AI provider, model call, new service, or general tool
planner is introduced.

### 2. Component Structure

```text
Assistant Overlay
+-- Conversation Timeline
|   +-- User message
|   +-- Assistant clarification
|   +-- Project choices
|   +-- Project summary card
|   +-- Existing Work-Item draft card
+-- Input Area
|   +-- Text input
|   +-- Existing speech transcript input
|   +-- Cancel / replace-action affordance
+-- Continuation Controller
    +-- Sends text turns
    +-- Sends structured project selections
    +-- Carries session and conflict token

Assistant Turn Boundary
+-- Authentication, tenant, and module gates
+-- Session Loader
|   +-- Ownership check
|   +-- Expiry check
|   +-- Dialog-state validation
+-- Dialog Runtime
|   +-- Normalization
|   +-- Intent-specific recognition
|   +-- Slot collection
|   +-- Allowed state transitions
|   +-- Existing project resolution
|   +-- Existing project/work-item permission checks
+-- Result and Audit Writer
    +-- Clarification / choices / summary
    +-- Updated dialog state
    +-- Existing turn and action audit

Existing Action Destinations
+-- PROJ-5 Wizard Draft
|   +-- Atomic create-once completion
|   +-- Existing Wizard review and finalization
+-- PROJ-144 Work-Item Draft
    +-- Existing editable draft card
    +-- Existing explicit confirmation
    +-- Existing claim-before-create protection
```

The summary card is the only new visible Assistant element. Existing shadcn/ui cards, buttons, badges,
and selection controls are reused.

### 3. Dialog Model

The active dialog is stored in the existing owner-scoped `assistant_sessions.context` object. It is not
a transcript and not free-form model memory. The application accepts only a versioned, allow-listed
shape containing:

- dialog schema version;
- pending action (`project_create_draft` or `work_item_create_draft`);
- current phase (collecting, choosing project, reviewing, completing, or conflicted);
- normalized slots already supplied by the user;
- the single slot currently requested;
- visible project candidate identifiers when disambiguation is required;
- the project context against which the dialog started;
- expiry and conflict token;
- the terminal result reference needed to make retries idempotent.

Raw utterances, full message history, provider prompts, and unrestricted metadata are excluded. Existing
session RLS continues to make the state private to the authenticated user and tenant.

### 4. State Transitions

```text
No pending action
  -> recognize a safe write intent
  -> collect missing fields

Collecting fields
  -> accept the requested field
  -> ask the next question
  -> resolve/select a project when needed
  -> show review summary when complete

Review summary
  -> correct one field -> collecting fields
  -> cancel -> aborted
  -> approve project draft -> atomic completion
  -> approve Work-Item draft preparation -> existing PROJ-144 flow

Any active state
  -> explicit replacement request -> confirm replacement first
  -> expiry / tenant change / incompatible project change -> expired
  -> stale conflict token -> conflicted and reload current state
```

Only explicit transitions are allowed. A short answer such as *„Scrum“* fills the currently requested
method slot; it is not sent through top-level intent recognition. A clearly new command does not silently
inherit old slots and must replace or cancel the pending action first.

### 5. Everyday-Language Recognition

Recognition remains deterministic and layered:

1. normalize case, diacritics, punctuation, filler words, and supported German imperative forms;
2. detect read-only intents before write intents to preserve the safety precedence;
3. use an intent-specific project parser and the existing Work-Item kind vocabulary;
4. return an intent-specific repair question when a domain is visible but the action is incomplete;
5. return `unknown` when no safe action can be inferred.

This deliberately supports ordinary but action-oriented language. It does not promise typo-tolerant
general language understanding. PROJ-Y-144a remains the only candidate for later model-assisted
extraction from genuinely unstructured speech.

### 6. Project-Creation Conversation

The project dialog asks for name first, then type, method, and short description. Values already present
in the initial request are retained. Name is mandatory; the other Wizard-compatible fields may be
explicitly skipped and appear as not yet defined in the summary.

No Wizard draft exists while questions are still open. Once the user approves the summary, one
transactional completion performs two inseparable outcomes:

- create exactly one owner-scoped PROJ-5 Wizard draft from the reviewed values;
- mark the pending Assistant action completed with the resulting draft reference.

This completion must be safe to retry. A repeated approval returns the same result instead of inserting
another draft. The final project still exists only after the user follows the Wizard review and completes
the established PROJ-5 flow.

### 7. Work-Item / Story Conversation

PROJ-156 only improves how the existing PROJ-144 draft receives its inputs:

- common project-name positions are recognized;
- missing project or title becomes an explicit pending slot;
- project disambiguation preserves kind, title, and description;
- a project-choice action resumes draft preparation instead of navigating away.

After the slots are complete, the runtime delegates to the existing PROJ-144 draft creation. Method-to-
kind mapping, project write permission, editable review card, private draft RLS, claim-before-create,
and explicit click confirmation remain unchanged.

### 8. Turn Contract and UI Continuations

The Assistant turn boundary accepts either ordinary text/voice input or a structured continuation tied
to the current session. Structured continuations cover project choice, summary approval, field
correction, cancellation, and action replacement.

Each response carries the current dialog phase and conflict token in addition to the existing text,
route target, project choices, Wizard draft, and Work-Item draft result. The overlay renders controls
from this structured result; it never tries to reconstruct the dialog from message text.

Project-choice buttons therefore submit the selected identifier to the current Assistant session. They
do not navigate until the resumed command returns a navigation/result target.

### 9. Concurrency and Idempotency

Ordinary session-state changes use the existing session timestamp as an optimistic conflict token: a
turn succeeds only if the session is still at the version it loaded. If another tab moved it first, the
stale turn receives a conflict result and the overlay reloads the current state.

That mechanism alone is insufficient for project approval because updating a session and inserting a
Wizard draft are two separate writes. A small transactional database operation is therefore required to
claim the reviewed state, create the draft, and store its result reference atomically. This is the only
new database behavior; no new table or domain object is introduced.

### 10. Privacy and Retention Decision

PROJ-40 transcript retention and PROJ-156 action state are treated as different data classes:

- turns continue to obey `no_persist`, metadata-only, or redacted-transcript policy;
- dialog context never stores the raw utterance;
- normalized slots are temporary action data needed to perform the user's requested business action;
- only the minimum slots are retained, under owner-only session RLS;
- pending slots are removed on cancel, completion, expiry, tenant change, or logout;
- completed business data survives only in the established Wizard or Work-Item draft, under its own RLS
  and retention rules.

This permits a multi-turn action in `no_persist` mode without retaining a transcript. Audit events record
state transitions and result identifiers, not unnecessary raw slot values.

### 11. Security and Policy Boundaries

- The existing authenticated, active-tenant, membership, and Assistant-module gates remain before all
  runtime work.
- Project resolution continues through tenant-scoped, session-bound queries and treats hidden projects
  as not found.
- Project and Work-Item actions re-check authorization at completion, not only when the dialog starts.
- The transactional project-draft completion reads the authenticated identity itself; it accepts no
  caller-supplied actor identity and grants no anonymous execution.
- Read-only recognition has precedence over write recognition, and ambiguous multi-action input never
  mutates data.
- Text and speech transcripts enter the same runtime after transcription; speech creates no privileged
  path.

### 12. Failure and Recovery Behavior

| Situation | User-visible behavior | Data outcome |
|---|---|---|
| Unrecognized wording | Domain-specific repair example where safe | No pending mutation |
| Missing slot | Ask exactly one next question | Reviewed slots retained temporarily |
| Several matching projects | Show choices and preserve the command | No navigation or draft yet |
| Stale browser tab | Explain that the dialog changed and reload it | No overwritten state |
| Expired dialog | Explain expiry and offer restart | Pending slots removed |
| Permission/module change | Explain the block in German | No draft/business object |
| Project disappears | Neutral not-found response | Target cleared; no leak |
| Completion retry | Return the prior result | Exactly one Wizard/Work-Item draft |
| Partial database failure | Entire completion rolls back | No half-created draft |

### 13. Test Architecture

The acceptance evidence is split by responsibility:

- **Recognizer tests:** table-driven German paraphrases plus negative near-matches and read-before-write
  precedence.
- **State-machine tests:** every permitted transition, invalid slot, replacement, cancellation, expiry,
  and terminal cleanup as pure domain behavior.
- **Runtime tests:** project lookup, missing-slot preservation, method mapping reuse, module/permission
  gates, and no-provider independence.
- **Route tests:** session ownership, malformed state reset, optimistic conflict, structured selection,
  transcript policy, and stable error codes.
- **Database smoke/pentest:** create-once transactional completion, retry idempotency, cross-user and
  cross-tenant denial, anonymous execution denial, and rollback/no-residue verification.
- **Component tests:** summary correction, cancellation, project-choice continuation, conflict and
  expiry messaging, keyboard operation, and no navigation before continuation.
- **Authenticated E2E:** the complete colloquial project flow and the ambiguous-project Story flow from
  AC-156.34/.35, using the dedicated Assistant tenant established by PROJ-Y-144d.

### 14. Dependencies and Deployment

**New packages:** None.

**Reused platform capabilities:** Supabase/RLS, Zod, existing Assistant session/turn/action tables,
PROJ-5 Wizard drafts, PROJ-144 Work-Item drafts, project access helpers, project type/method catalogs,
and installed shadcn/ui components.

**Database:** One additive migration for the atomic project-draft completion and its execution grants;
no new table, provider setting, scheduled job, or AI-purpose CHECK value.

**Delivery order:** backend first, because the frontend cannot safely present resumable approvals until
the dialog contract, conflict handling, and atomic completion exist. Frontend follows against that
stable contract, then `/qa` validates both authenticated chains and all security regressions.

### 15. GitNexus Impact Result

Impact analysis was run on the indexed PROJ-156 worktree on 2026-08-21:

- `handleAssistantTurn`: 1 direct product caller, 1 affected process, **LOW** risk;
- `classifyAssistantIntent`: 2 upstream symbols across runtime and turn route, **LOW** risk;
- `parseWorkItemCommand`: 3 upstream levels ending at the turn route, **LOW** risk;
- Assistant turn `POST`: no upstream code caller, **LOW** risk (public route boundary);
- `upsertSession`: 1 direct caller inside the turn route, **LOW** risk;
- `AssistantLauncher`: AppShell and AppLayout upstream, **LOW** risk.

Although every individual symbol is low-risk, the turn route is the shared execution boundary for the
whole feature. Existing PROJ-37/38/39 and PROJ-144 tests therefore remain mandatory regression gates.

## Backend Implementation (2026-08-21)

The backend slice is implemented and keeps the architecture locks intact:

- `src/lib/assistant/dialog-state.ts` defines the Zod-validated v1 state, 30-minute expiry,
  structured continuations, catalog-backed slot parsing, and the minimal completion reference.
- `src/lib/assistant/runtime.ts` loads pending intent state before top-level classification, collects
  one requested field at a time, presents a review summary, supports correction/cancel/expiry, and
  resumes preserved Work-Item commands after project selection.
- `src/lib/assistant/work-item-command.ts` accepts the reported ordinary word order
  *„Mach im Projekt Apollo eine Story für den Rechnungsimport“* while retaining the existing
  read/write and project-creation boundaries.
- `src/app/api/assistant/turns/route.ts` loads sessions through user+tenant scope, validates stored
  state, accepts typed continuations, and uses `last_turn_at` as an optimistic write token. A stale
  session update returns stable `assistant_dialog_conflict` / HTTP 409.
- `20260821120100_proj156_assistant_project_dialog_completion.sql` adds the sole database behavior:
  a `SECURITY INVOKER` RPC that locks the owner session, verifies state/revision/expiry, creates the
  Wizard draft, removes temporary slots, and records an idempotent completion key in one transaction.
  `PUBLIC` and `anon` execution are revoked; the actor comes exclusively from `auth.uid()`.

No final `projects` or `work_items` row is created by the new flow. The PROJ-5 Wizard review and
PROJ-144 explicit confirmation remain the mutation gates. No package, AI purpose, provider, or external
call was added.

Backend-focused unit coverage is green (4 files, 44 tests). The migration has not been applied to the
live database in this stage, so its mandatory live RPC smoke and cross-tenant/anonymous pentest remain
QA/deployment evidence rather than being claimed here. This was the backend-stage handoff; the frontend
continuation controls are documented below, while authenticated E2E chains remain for `/qa`.

## Frontend Implementation (2026-08-24)

The Assistant overlay now consumes the typed dialog contract instead of reconstructing actions from
response text:

- `assistant-dialog-controls.tsx` renders the responsive project-review card from existing shadcn/ui
  Card, Badge, Button, Input, Select, and Textarea primitives. It shows that no project exists yet,
  reuses the canonical project-type/method labels, and exposes explicit correction, cancellation, and
  Wizard-draft approval controls.
- Project candidates in a pending Work-Item dialog now post a `project_choice` continuation with the
  current revision. They no longer navigate away and discard the preserved Story fields.
- Ordinary follow-up text carries `dialog_revision`; all structured controls carry
  `expected_revision`. Earlier message controls are retired after a successful transition so a stale
  turn cannot remain apparently actionable.
- The approval control uses one stable completion key per reviewed revision. UI busy state prevents
  accidental repeat clicks, while the backend completion key remains the authoritative idempotency
  boundary.
- The launcher stores only the opaque session identifier in user- and tenant-keyed `sessionStorage`.
  `GET /api/assistant/turns?session_id=...` reloads the allow-listed, owner-scoped dialog state and
  visible project choices after a browser reload or a 409 conflict. Raw utterances are not added to
  client persistence.
- Text and existing speech transcripts still enter the same `submitTurn` path. Work-Item confirmation
  remains the unchanged PROJ-144 card and API.

Frontend and resume coverage adds 15 tests for summary rendering, corrections, cancellation,
structured project choice, reload continuation, and owner-scoped resume behavior. The combined
PROJ-156/PROJ-144-focused run is green (7 files, 59 tests); ESLint, migration naming, and feature-index
scope checks are green. The webpack production build compiles successfully and then stops at the
pre-existing, unrelated invalid Route export `mapCommEntryRpcError` in the communication-entry route.
The default Turbopack build cannot run from this worktree because its shared `node_modules` symlink
points outside the worktree root.

The migration remains unapplied. Live RPC smoke, cross-tenant/anonymous pentest, authenticated E2E
chains, and browser sign-off remain `/qa` evidence and are not claimed by this frontend stage.

### Speech pause regression fix (2026-08-26)

A browser-observed regression in the existing input modality was fixed before QA: Chrome/Edge may end
a Web Speech recognition run at the first speaking pause even with an otherwise valid microphone
session, and the launcher previously replaced the complete input with `results[0]` on every run.

- Recognition now requests continuous, interim results and automatically restarts after a normal
  browser-side `onend` until the user explicitly presses Stop.
- Before each automatic or manual restart, the already recognized input becomes the immutable base for
  the next result list. Later speech segments are appended with normalized spacing instead of replacing
  prior transcript content.
- `no-speech` is treated as a normal pause; permission, capture, provider/network, and unexpected abort
  errors still stop recording with the existing actionable feedback.
- Explicit Stop cancels a pending restart and tolerates the browser's `InvalidStateError` window after
  an automatic `onend`. Unmount also stops the recognition without losing the text already shown.

Two browser-API component regressions pin both reported cases: first-pause continuation and append on a
new recording cycle. The focused Assistant suite is green with 61 tests and ESLint remains green.

## Backend Remediation (2026-08-27)

The implementation returned to `/backend` after the blocking QA decision and now addresses all three
High findings plus the listed behavioral gaps:

- **Privacy/retention:** `assistant_turns.response_text` is no longer persisted because rendered
  Assistant responses may repeat temporary project names or descriptions. Input retention remains
  governed by the existing PROJ-40 helper. Expiry, logout, and tenant switching call the new
  owner-scoped `clear_assistant_dialog_state` RPC, which deletes the temporary slots and writes a
  metadata-only action event.
- **Work-Item TOCTOU:** resumed Work-Item dialogs now use
  `complete_assistant_work_item_dialog`. The RPC locks the owner session, verifies the exact dialog
  revision and expiry, re-checks project write access, creates one private PROJ-144 draft, removes the
  pending slots, and writes the turn/action audit in one transaction. A concurrent stale request sees
  the consumed state and cannot leave a second draft.
- **Project/audit atomicity:** `complete_assistant_project_dialog` now creates the Wizard draft,
  Assistant turn, action event, completion reference, and closed dialog state in one transaction.
  Idempotent approval retries return the already committed turn and draft; the route does not duplicate
  either audit row.
- **Behavioral closure:** mixed read/write requests are rejected, the ordinary infinitive `anlegen` is
  recognized, an explicit new command replaces (and audits replacement of) a pending dialog,
  global/project context transitions clear pending state, browser speech submits `modality: voice`, and
  raw database messages no longer reach user-facing responses.

Backend evidence after remediation: 7 focused files / 73 tests pass; ESLint passes; migration naming
and feature-index scope both report 0 errors. The complete Vitest suite also passes with 445 files /
3,852 tests. `tsc --noEmit` reports only the pre-existing unrelated
test-type baseline and no PROJ-156 error. A production build cannot run from this isolated worktree
because its shared `node_modules` symlink points outside Turbopack's filesystem root. The fresh shadow
schema run is also not available in this WSL instance (`DATABASE_URL` unset and Docker WSL integration
disabled). These two checks, the new RPC live smoke/pentest, authenticated E2E chains, and real browser
speech sign-off remain mandatory in the full `/qa` rerun. The migration remains unapplied.

The required post-change GitNexus check remains **HIGH**, not MEDIUM: the remediation delta alone maps
14 files / 30 symbols to 9 execution flows; the complete branch compared with `main` maps 22 files /
176 symbols to the same 9 flows. The directly affected boundaries are the Assistant launcher plus the
Assistant GET/POST route flows and logout shell. This is the current blast-radius evidence for the
next QA pass.

## QA Test Results

### Full QA rerun (2026-08-27)

The backend remediation itself remains covered by the passing Vitest and lint gates. The full
Playwright run is **not a QA pass**: 418 tests passed, 37 failed, and 96 were skipped. The failures
are primarily pre-existing authentication/visual-baseline expectations for `/login`, while the
application now redirects to `/anmelden`; the run also skipped WebKit because host libraries are
missing. PROJ-156 authenticated chains could not execute because the required Supabase environment
variables and authenticated storage state were unavailable. Consequently the live RPC smoke,
cross-tenant pentest, schema-drift replay, responsive cross-browser sign-off, and browser speech
sign-off remain unproven.

**Decision:** **NOT READY — deployment remains blocked.** The earlier three backend High findings
are addressed in the implementation, but QA cannot approve without the missing live/authenticated
evidence and the unrelated baseline failures being triaged.

**Tested:** 2026-08-26  
**Reviewer:** QA Engineer with an independent red-team review  
**Decision:** **NOT READY — deployment blocked**

The rebased implementation passes its focused automated baseline: 7 files / 66 tests, ESLint with
zero errors, migration naming with zero errors, and feature-index scope with zero errors. These green
checks do not override the security and correctness findings below.

### Blocking findings

1. **High — privacy and retention contract is incomplete (AC-156.9, AC-156.27, AC-156.28).**
   `projectSummary()` can copy the project name and full description into persisted
   `runtime.user_response`; the turn route stores `response_text` even for `no_persist` or redacted
   results. Expired dialog state is hidden by the resume route but not removed from
   `assistant_sessions.context.dialog_state`. Logout and tenant switching only change the
   `sessionStorage` key and do not clear the server-side state.
2. **High — concurrent Work-Item continuation has a TOCTOU window (AC-156.11, AC-156.35).**
   `continueWorkItemDialog()` creates an `assistant_work_item_drafts` row before the optimistic
   `last_turn_at` update in `upsertSession()`. Two tabs can therefore create two drafts; one request
   subsequently receives HTTP 409, but its duplicate draft remains confirmable.
3. **High — project approval and audit evidence are not atomic (AC-156.28, AC-156.29).**
   The completion RPC commits the Wizard draft and session completion, while the route writes the
   assistant turn and action event afterward in separate operations. A failed turn insert can leave a
   committed draft without the required audit trail, and action-event insertion errors are ignored.

### Additional gaps

- Mixed request *„Wie steht Apollo und leg ein Projekt an“* is treated as a write instead of being
  rejected by the multi-action boundary (AC-156.4).
- The ordinary infinitive wording *„Kannst du mir bitte ein Projekt anlegen?“* is not recognized
  (AC-156.2).
- A new command during a pending dialog is consumed as the current slot value; there is no controlled
  replace/cancel transition (AC-156.8).
- Project-to-global and global-to-project context changes do not reliably clear pending state.
- Speech-originated turns are still sent with `modality: "text"`; real Chrome/Edge microphone sign-off
  is absent.
- Some raw database error text can reach the user-facing response.

Static/unit evidence supports AC-156.1, AC-156.3, AC-156.12, AC-156.14, AC-156.16, AC-156.19, and
AC-156.26, with partial evidence for several dialog/rendering criteria. The High findings mean the
remaining acceptance criteria cannot be approved. The migration was deliberately not applied; live
RPC smoke, cross-tenant/anonymous pentest, authenticated E2E chains, and browser speech sign-off were
not run against production.

Required next stage: return to `/backend`, resolve all three High findings and the listed behavioral
gaps, then restart `/qa` in full. Status remains `In Review`; deployment scope remains `—`.

## Deployment

Not executed. `/deploy` is blocked by the 2026-08-26 QA decision. No migration was applied, no branch
was pushed or merged, and no production deployment was triggered.

## QA Test Results (2026-08-31)

**Verdikt: NICHT produktionsreif — 0 Critical / 1 High / 1 Medium.** Status bleibt `In Review`.
Der verbleibende High-Fund ist kein Code-Defekt, sondern eine Nachweislücke: drei
Akzeptanzkriterien haben keinen Test. **F-2 ist mit dem Nachtrag vom selben Tag geschlossen** —
die Migration ist angewendet und der Live-Smoke gefahren.

### Vorgeschichte dieses Durchgangs

Die Slice lag seit 2026-08-24 als `audit/chatbot-command-understanding` ohne PR auf der Platte
und trug die Kennung **PROJ-150**, die zwei Tage später unabhängig an den Branch-Kollisions-Wächter
vergeben und als `v2.77.0-PROJ-150` ausgeliefert wurde. Umbenannt auf **PROJ-156**; Einzelheiten
im Rettungs-Commit. Zwei Befunde daraus gehören ins Register, nicht in diese Spec:

- **Ein Merge hätte zwei verschiedene Features unter einer ID eingetragen** und `PROJ-Y-150a` von
  `Deployed` auf `In Progress` zurückgedreht — **ohne dass ein CI-Gate das bemerkt**:
  `scripts/check-index-scope` prüft Zellenzahl, Statuswerte und Kombinationen, aber **keine
  ID-Eindeutigkeit** (im Quelltext nachgesehen). Am Probe-Merge gemessen, nicht vermutet.
- Der Kollisions-Wächter hätte diesen Branch **nie** sehen können: sein Name enthält keine
  Slice-Kennung — das als **PROJ-Y-150e** registrierte blinde Fenster, hier erstmals real eingetreten.

### Gates

| Gate | Ergebnis |
|---|---|
| vitest (volle Suite, integriert gegen `main`) | **4035 / 4035** in 465 Dateien |
| tsc | **11** Fehler — Baseline 13, und **keiner** in einer der 20 Slice-Dateien (Zuordnung geprüft) |
| ESLint | **0 Fehler**, 4 Warnungen |
| `npm run build` | clean |
| `check:index-scope` | 199 Zeilen, 0 Fehler |
| `check:migration-naming` | 247 Migrationen, 0 Fehler |

### Integrationsnachweis statt Selbstauskunft

Die Selbstauskunft des Branches wurde gegen die Realität gemessen, nicht übernommen:

- **main hat in 29 Commits keine einzige der berührten `src/`-Dateien angefasst** — die Übernahme
  ist konfliktfrei, einziger Konflikt war eine Zeile in `docs/PRD.md`.
- Die zwei geteilten Dateien (`tenant-switcher.tsx`, `user-menu.tsx`) sind auf main seit dem
  Abzweig **0-mal** geändert worden; ihre Änderung setzt Lock 7 um (Dialogzustand wird bei
  Mandantenwechsel und Abmeldung serverseitig geräumt).

### Regression — der tragende Teil

| Suite | Ergebnis |
|---|---|
| `PROJ-37-assistant-core` + `PROJ-144-assistant-work-item-drafts` (Auth-Gates) | **6 / 6** chromium |
| `PROJ-Y-144d-assistant-work-item-chain` (**authentifiziert, mutierend**) | **3 / 3** chromium |

Der zweite Lauf ist der aussagekräftige: die Slice schreibt 666 Zeilen in `runtime.ts` und 359 in
`turns/route.ts` neu, und die bestehende Kette *„diktieren → prüfen → korrigieren → bestätigen
erzeugt genau ein Work-Item"* läuft unverändert durch. **AC-156.31 und AC-156.32 damit belegt.**

### Migration — geprüft, aber nicht angewendet

`20260831120000_proj156_assistant_project_dialog_completion.sql`, 417 Zeilen, **rein additiv**:

- **Drei neue Funktionen, kein bestehendes Objekt berührt** — live gegengeprüft, dass keine der
  drei in Prod existiert; `create or replace` ist hier also reine Neuanlage. Keine Tabelle, keine
  Policy, kein Trigger, kein Eingriff in die vier Audit-Register.
- Alle drei `SECURITY INVOKER` (die bestehende Eigentümer-RLS bleibt maßgeblich), alle drei mit
  `search_path = public, pg_temp`, alle drei `revoke all from public` **und** `from anon` plus
  `grant execute to authenticated`, alle drei mit `comment on function`.
- **Kein Actor-Parameter** — `auth.uid()` wird intern gelesen; die Eigentümer-Bindung steht doppelt
  (`where s.user_id = v_actor` beim Lesen **und** `and user_id = v_actor` beim Schreiben).
- **Alle 12 Spaltenreferenzen gegen das Live-Schema geprüft, 0 fehlend.** `plpgsql` validiert
  Tabellenzugriffe erst zur Laufzeit — eine falsche Spalte hätte sich sauber anwenden lassen und
  erst beim ersten echten Aufruf gebrochen.
- **Ein eigener Fehlschluss unterwegs, festgehalten:** eine dateiweite Spaltenprüfung meldete
  `project_wizard_drafts.description` als fehlend — die Spalte gibt es wirklich nicht, aber die
  Referenz liegt in der **zweiten** Funktion, wo `v_draft` ein `assistant_work_item_drafts%rowtype`
  ist. Ein Alarm aus der Verwechslung zweier lokaler Variablen; funktionsweise nachgemessen ist er
  gegenstandslos. Die Prüfung muss je Funktionsrumpf gescopt werden, nicht je Datei.

### Sicherheitsprüfung

- **AC-156.26 mechanisch belegt:** keine der 20 Dateien enthält `ki_runs`, `AIPurpose`,
  `generateObject`/`generateText` oder einen Router-Aufruf. Kein Modell sieht die Eingabe, kein
  neuer KI-Zweck, keine Lockstep-Migration nötig.
- **AC-156.7 ist ein echter Allow-List, kein dekorativer:** `parseAssistantDialogState` gibt
  `parsed.data` zurück, unbekannte Schlüssel werden also entfernt statt durchgereicht; der gesamte
  Schreibpfad hängt an diesem Rückgabewert. Die Feldliste deckt sich exakt mit dem Kriterium, und
  ein Feld für den Rohwortlaut existiert **nicht** — AC-156.27 damit strukturell erfüllt.
- **AC-156.14 belegt:** Typ- und Methodenwerte kommen aus `PROJECT_TYPES`/`PROJECT_METHODS`/
  `WORK_ITEM_KINDS`, also den PROJ-5/6/9-Katalogen, nicht aus einer zweiten Liste.
- Neuer `DELETE /api/assistant/turns`: UUID-validiert, 401 ohne Sitzung, ruft die INVOKER-RPC mit
  dem **sitzungsgebundenen** Client (nicht Service-Role) — ein Nutzer kann nur den eigenen Zustand
  räumen.

### Befunde

**F-1 (High) — drei Akzeptanzkriterien ohne jeden Test.** Die Slice bringt **keine einzige
Playwright-Datei** mit. AC-156.34 (Projektkette Ende-zu-Ende), AC-156.35 (Story-Kette mit
Mehrdeutigkeit) und AC-156.36 (Reload, Abbruch, Ablauf, Mandantenwechsel, fremdes Projekt,
Zwei-Tab-Konflikt) verlangen wörtlich authentifizierte E2E-Nachweise. Belegt ist die **Mechanik**
über 103 Unit-/Routentests, **nicht die Verkettung im Browser**. Die Spec sagt das an anderer
Stelle selbst („E2E steht aus"); als Kriterium ist es damit offen, nicht abgewichen.

**F-2 (Medium) — ERLEDIGT, siehe Nachtrag unten.** Ursprünglich: Live-RPC-Smoke nicht führbar. CLAUDE.md macht ihn zur Bedingung für `Approved`:
„Every new `SECURITY DEFINER` RPC gets one real call against the live DB." Die drei Funktionen sind
INVOKER, nicht DEFINER — der Buchstabe der Regel greift also nicht, ihr Zweck sehr wohl: dies ist
genau die Klasse Fehler (Spaltenname, Laufzeitbindung), die zweimal in diesem Repo erst live
aufgefallen ist. Ohne angewendete Migration ist der Smoke unmöglich, und mit ihm hängen
**AC-156.17, .18 und der Abschlussteil von .24** in der Luft.

**F-3 (Medium) — englischer Fehlertext auf deutscher Fläche.** `user-menu.tsx` meldet
`toast.error("Logout failed", …)` mit deutscher Beschreibung darunter. Verstößt gegen die
Sprachkonvention und gegen die in PROJ-Y-143m gezogene Linie; Code dieser Slice, also hier zu
beheben, nicht als Fremdbefund abzugeben.

**F-4 (Info) — Browser-Speech nicht geprüft.** AC-156.30 verlangt, dass alles ohne
Mikrofonfreigabe erreichbar ist. Der Textpfad ist über die Unit-Tests belegt, der Sprachpfad nicht
ausgeübt.

### Nicht geprüft, ausdrücklich benannt

Kein Cross-Browser-Lauf (Firefox nicht konfiguriert, WebKit env-gesperrt — PROJ-67/F2), keine
Responsive-Messung, keine Visual-Regression (die Slice ändert `tenant-switcher.tsx`, das im Fuß
jeder authentifizierten Seite steht — ein Baseline-Lauf gehört vor den Deploy).

### Nachtrag 2026-08-31 — Migration angewendet, Live-Smoke gefahren (schließt F-2)

Migration `20260831120000_proj156_assistant_project_dialog_completion` ist in Prod
(registriert unter dem Dateistamm, PROJ-134-konform).

**Struktur nach dem Anwenden eigenständig nachgemessen**, nicht aus der Migration übernommen:
alle drei Funktionen `SECURITY INVOKER`, alle mit `search_path=public, pg_temp`, `anon` **ohne**
EXECUTE, `authenticated` **mit**, **PUBLIC ohne Eintrag** (geprüft über den ACL-Eintrag, der mit
`=` *beginnt* — die PROJ-Y-114a-Lehre), alle drei mit `comment on function`.

**Live-Smoke gegen Prod: 12 / 12, 0 Rückstände über 6 Zähler.** Der Block erzwingt seinen eigenen
Rollback über eine Abschluss-Exception; die Ergebnisse reisen in der Fehlermeldung.

| Vektor | Ergebnis | Kriterium |
|---|---|---|
| V0 Kontrolle | Aufrufer `authenticated` — **nicht** Superuser, **umgeht RLS nicht**, **kein** postgres-Mitglied | — |
| V1 Projekt-Happy-Path | genau **1** Wizard-Entwurf, Name und `data.description` korrekt | AC-156.17 |
| V2 Audit-Spur | 1 Turn-Zeile **und** 1 Action-Event | AC-156.28 |
| V3 Wiederholung mit gleichem `completion_key` | weiterhin **1** Entwurf, gleiche Kennung zurück | AC-156.18 |
| V4 zweiter Abschluss, anderer Schlüssel | `40001` | AC-156.18 |
| V5 veraltete Revision | `40001` | AC-156.11 |
| V6 abgelaufener Dialog | `P0001` | AC-156.9 |
| V7 leerer Projektname | `22023` | AC-156.15 |
| V8 **fremde Sitzung** | `P0002` „not found" — kein Namens- oder Existenzleck | AC-156.10 · .25 |
| V9 Work-Item-Happy-Path | genau **1** PROJ-144-Entwurf, `target_kind=story` | AC-156.23 |
| V10 untergeschobener Titel | `40001` — Nutzlast muss zum Dialogzustand passen | AC-156.8 |
| V11 Bereinigung | 1 geräumt, Restzustand **0**, 1 Action-Event | AC-156.9 |
| V12 erfundener Bereinigungsgrund | `22023` | — |

**V0 ist der Vektor, der den Lauf überhaupt aussagekräftig macht** — und meine erste Fassung war
untauglich: sie las `usesuper` aus `pg_user`, das nur Login-Rollen führt, und lieferte für
`authenticated` einen **leeren** Wert, also keinen Beweis. Sauber gegen `pg_roles` nachgemessen:
`rolsuper=false`, `rolbypassrls=false`, kein postgres-Mitglied. Ohne diese Nachmessung hätte der
ganze Smoke unter einer Rolle laufen können, die RLS ohnehin umgeht — jeder negative Vektor wäre
dann wertlos gewesen.

**V8 und V10 sind die tragenden negativen Vektoren:** eine fremde Sitzung ist auch für einen
Mandanten-Administrator nicht abschließbar (die Eigentümer-Bindung steht doppelt, beim Lesen und
beim Schreiben), und eine manipulierte Nutzlast kann den geprüften Dialogzustand nicht überschreiben.

**Advisors: 157 WARN / 0 ERROR**, und **keine einzige Meldung nennt eine der drei neuen Funktionen** —
erwartbar, weil INVOKER plus gesetzter `search_path` genau die zwei üblichen Warnklassen vermeidet.

**Funktions-Inventar aufgefrischt: 298 → 301** (`supabase/prod-inventory/functions.txt`, Kopfdatum
nachgezogen); der Wächter führt die drei nicht mehr als „im Repo angelegt, aber nicht in Prod"
(17 → 14 Restmeldungen, sämtlich Bestandsfälle).

**Damit sind AC-156.17, .18 und der Datenbankteil von .24 belegt.** Offen bleibt allein **F-1**:
die drei Kriterien AC-156.34/.35/.36 verlangen authentifizierte Browser-Ketten, und dafür gibt es
weiterhin keine Playwright-Datei. Der Smoke beweist die Datenbankschicht, **nicht** die Verkettung
über HTTP und Oberfläche.
