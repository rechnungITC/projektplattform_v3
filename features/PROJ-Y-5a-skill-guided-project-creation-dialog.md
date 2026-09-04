# PROJ-Y-5a: Skill-Guided Project Creation Dialog

## Status: Deployed

## Deployment Scope: alpha

**Created:** 2026-08-31
**Last Updated:** 2026-09-01

## Summary

Extend the deployed PROJ-5 project-creation wizard with an adaptive AI-guided
detail dialog. The dialog starts only after the user has selected the stable
project frame: basics, project type, method, and project skills. If a kickoff
document was uploaded, its reviewed content is part of the dialog context too.

The dialog does not ask a fixed number of questions. It continues until every
selected skill has enough context to operate, or the user has explicitly marked
the remaining gaps as unknown, not applicable, or intentionally unanswered.
The user can stop at any time; an incomplete dialog never prevents project
creation. All supplied context, open gaps, assumptions, and coverage decisions
are documented durably, regardless of whether an AI provider was available.

The dialog routes its structured result into the existing PROJ-5 Review step.
It never creates a project or other business records without the user's final
review and explicit confirmation.

## Problem Statement

The current wizard asks deterministic catalog questions and PROJ-135 can ask
one optional round of questions about gaps in an uploaded kickoff document.
Neither path determines whether the skills selected for the future project have
the context they need. A fixed questionnaire also cannot react when one answer
reveals a new ambiguity for a particular skill.

As a result, a project can be created with a selected skill set but without the
decisions, constraints, vocabulary, and source context those skills need. When
AI is unavailable, the current flow also lacks an explicit durable record that
the context was captured but not AI-analyzed.

## Locked Product Decisions

1. **Adaptive completion, not a question count.** The dialog asks as many
   questions as needed to establish context coverage for the selected skills.
2. **Placement after deterministic selections.** The dialog belongs in the
   detail-question phase after type, method, and skills are selected. It also
   consumes a kickoff document when one was uploaded earlier in the wizard.
3. **Documentation is unconditional.** User input and remaining gaps are
   documented with or without an eligible AI provider. Without AI, the record
   is visibly marked as captured but not AI-analyzed.
4. **Human-controlled completion.** Coverage is guidance, not an autonomous
   gate. The user may finish with documented gaps and must review the structured
   result before project creation.
5. **One coherent dialog.** When a kickoff exists, the deployed PROJ-135
   clarification capability is incorporated into the same conversation. The
   user is not sent through two independent AI question rounds.

## Dependencies

- Requires: PROJ-5 (wizard, draft persistence, Review and finalize flow)
- Requires: PROJ-6 (type/method rules and deterministic detail questions)
- Requires: PROJ-12/32/93/137 (AI router, tenant providers, Class-3 routing,
  cost caps, and visible reason codes)
- Requires: PROJ-70 (optional kickoff source in the wizard)
- Requires: PROJ-76/77/78 (versioned tenant skills and wizard skill selection)
- Reuses: PROJ-135 (kickoff-grounded clarification round)
- Related but separate: PROJ-82 (skill-driven business proposals), PROJ-153
  (work-item proposals from project intent), and PROJ-151 (post-create chat)

## User Stories

- As a project lead, I want the detail dialog to use the project type, method,
  selected skills, and my prior answers so that it does not ask generic or
  already-answered questions.
- As a project lead, I want follow-up questions to adapt to my answers until the
  selected skills have sufficient context so that the future project assistance
  starts from an understood project frame.
- As a project lead with a kickoff document, I want the dialog to incorporate
  the document and ask only about gaps, ambiguities, or contradictions so that I
  do not repeat information already provided.
- As a project lead, I want to stop or skip questions without losing my work so
  that unknown information does not block project creation.
- As a reviewer, I want to see which statements came from me, a prior wizard
  selection, a kickoff document, or an AI interpretation so that I can correct
  unsupported assumptions before creating the project.
- As a project team member, I want the dialog result and its remaining gaps to
  remain available after project creation so that the context is not lost when
  the wizard draft is deleted.
- As a compliance officer, I want every prompt input, including skill
  instructions and conversation history, to obey the Class-3 provider gate so
  that personal data cannot bypass the routing policy.
- As a project lead without an eligible AI provider, I want my context captured
  and documented anyway, with an honest status, so that I can finish manually
  and the missing analysis is not mistaken for completed AI review.

## Acceptance Criteria

### Entry point and context

- [x] **AC-Y5a.1:** The adaptive dialog appears in the project-creation flow
  only after project type, method, and the wizard skill selection have been
  resolved; it is part of the detail-question phase, not a separate entry mode.
- [x] **AC-Y5a.2:** Before its first question, the dialog receives the confirmed
  wizard frame: project basics, type, method, deterministic PROJ-6 answers, and
  the exact selected skill versions.
- [x] **AC-Y5a.3:** If a kickoff source was uploaded, its permitted content and
  existing PROJ-135 clarification context are included. Without a kickoff, the
  dialog remains available and relies on the wizard frame and user answers.
- [x] **AC-Y5a.4:** Information already established by a prior selection,
  answer, or kickoff source is not asked again unless it is ambiguous,
  contradictory, stale, or insufficient for a selected skill. The dialog states
  why clarification is needed.
- [x] **AC-Y5a.5:** A kickoff-backed flow presents one coherent conversation;
  users are not required to complete a separate PROJ-135 question round and a
  second PROJ-Y-5a round over the same gaps.

### Adaptive skill coverage

- [x] **AC-Y5a.6:** Every question identifies the selected skill or shared
  context area whose gap it addresses. One question may satisfy multiple skills.
- [x] **AC-Y5a.7:** The dialog can ask follow-up questions based on prior user
  answers. It has no product-level fixed question count.
- [x] **AC-Y5a.8:** Each selected skill receives a visible coverage state:
  `sufficient`, `unknown`, `not_applicable`, `skipped`, or `needs_clarification`.
- [x] **AC-Y5a.9:** The normal completion condition is that no selected skill
  remains in `needs_clarification`. The user may nevertheless end the dialog at
  any time; unresolved areas are converted to documented `unknown` or `skipped`
  gaps rather than silently treated as sufficient.
- [x] **AC-Y5a.10:** The user can skip an individual question, answer "unknown",
  or end the whole dialog. None of these actions prevents reaching Review or
  creating the project.
- [x] **AC-Y5a.11:** If no skills are selected, the dialog can still document
  shared project context, clearly reports that no skill-specific coverage was
  evaluated, and does not invent a default skill assignment.
- [x] **AC-Y5a.12:** Provider timeout, cost-cap exhaustion, or an interrupted
  response cannot create an unbounded loop. The current conversation is saved
  and the user can continue manually, retry, or proceed with documented gaps.

### Documentation and provenance

- [x] **AC-Y5a.13:** The wizard draft stores the conversation, current coverage
  states, and structured summary so a reload or later resume restores the same
  state without forcing regeneration.
- [x] **AC-Y5a.14:** Every documented statement distinguishes at least these
  origins: confirmed wizard selection, user-authored answer, kickoff evidence,
  and AI interpretation. AI interpretations are never labelled as user facts.
- [x] **AC-Y5a.15:** Any AI-derived interpretation that would populate or change
  project master data requires explicit confirmation or editing by the user.
- [x] **AC-Y5a.16:** The Review step shows an editable structured summary, the
  coverage state per selected skill, all unresolved gaps, and contradictions or
  assumptions requiring attention before the existing Create action.
- [x] **AC-Y5a.17:** Finalizing the wizard durably attaches the reviewed dialog
  documentation to the created project before the wizard draft is deleted. The
  project retains the summary, provenance, selected-skill coverage, unresolved
  gaps, and the status of AI analysis.
- [ ] **AC-Y5a.18:** Project members with the applicable project access can read
  the retained documentation after creation. Editing or superseding it is
  auditable; history is not silently overwritten.
- [x] **AC-Y5a.19:** The documentation is created even when the dialog ran
  entirely without AI. In that case it is visibly marked `captured_not_ai_analyzed`
  and must not be presented as skill-validated or AI-complete.

### Provider failure and privacy

- [x] **AC-Y5a.20:** When no eligible provider is configured, external AI is
  disabled, the cost cap is exhausted, or the provider fails, all user-entered
  context remains saved. The UI shows the actionable reason and offers the
  manual detail path without blocking finalize.
- [x] **AC-Y5a.21:** Privacy classification covers the complete outbound prompt:
  wizard values, kickoff content, conversation history, and all selected skill
  instructions. Omitting any of these inputs from classification is a failing
  security case.
- [x] **AC-Y5a.22:** Class-3 content follows the existing hard routing policy:
  no OpenAI-direct, Anthropic, or Google call; only the permitted local path or
  an attested EU-resident trusted processor may be used.
- [x] **AC-Y5a.23:** If Class-3 content has no permitted provider, the dialog
  falls back to documented manual capture and reports `class3_blocked`; it never
  downgrades the classification or sends a reduced prompt to an external model.
- [x] **AC-Y5a.24:** Every AI call is tenant-scoped, cost-capped, and recorded
  with provider, model, privacy class, status, and typed reason code. An empty or
  interrupted result is always distinguishable from "no gaps found".

### Review and handoff

- [x] **AC-Y5a.25:** Confirmed structured values route into the same PROJ-5
  Review and finalize flow as manually entered values; no parallel project
  creation endpoint or silent mutation path is exposed to the user.
- [x] **AC-Y5a.26:** Exactly one project can be created from a finalized draft,
  and failed finalization retains both the draft and dialog documentation for a
  safe retry.
- [x] **AC-Y5a.27:** The final Review differentiates required master-data gaps
  that already block PROJ-5 finalization from optional skill-context gaps that
  are merely documented.

## Edge Cases

- **Skill selection changes after the dialog started:** retain the history,
  mark the coverage evaluation stale, evaluate newly selected skills, and keep
  removed-skill answers as provenance without claiming current coverage.
- **Kickoff document is replaced or removed:** preserve the old provenance,
  mark document-derived conclusions stale, and require review before they can
  populate master data.
- **Kickoff contradicts a user answer:** prefer neither silently; show the
  conflict, ask the user to resolve it, and document the resolution.
- **A skill instruction conflicts with platform privacy or review rules:** the
  platform rule wins. Record the skill as unable to complete the conflicting
  request; do not weaken Class-3 routing or the human approval gate.
- **A skill asks for personal data that is unnecessary for project creation:**
  the dialog explains why the field is sensitive and permits skip/unknown; it
  does not turn the skill instruction into a mandatory wizard field.
- **Provider fails midway through a response:** do not persist a partial AI
  sentence as a confirmed fact. Preserve the last complete user turn and mark
  the interrupted analysis accordingly.
- **Cost cap is reached during a long dialog:** stop new AI turns, retain all
  completed turns, and continue through manual capture with open coverage gaps.
- **User resumes an old draft after skill versions changed:** show the versions
  used for the previous analysis and mark affected coverage stale until reviewed
  against the newly selected versions.
- **Two tabs edit the same dialog:** inherit PROJ-5 draft-conflict detection;
  never merge two transcripts silently or lose the newer documented state.
- **No kickoff and very little project description:** begin from the confirmed
  type/method/skill frame, explain the missing baseline, and let the user stop
  with an honest incomplete record.
- **User changes language during the dialog:** retain original user wording in
  the documentation; summaries may be regenerated in the active UI language but
  must not replace the source statements.

## Out of Scope

- Automatically creating the project or other business records from AI output.
- Generating or accepting backlog items, risks, stakeholders, or documents;
  those remain PROJ-70/82/88/89/153 concerns.
- Editing skill definitions from inside the dialog.
- Replacing the post-create project chat from PROJ-151.
- Voice input or wake-word interaction.
- Claiming that a skill "understands" the project merely because an AI call
  completed; only the documented coverage states and user review count.

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Drafted:** 2026-08-31
**Architecture status:** approved by the user on 2026-08-31
**CIA review:** GO with mandatory conditions; recommendation accepted by the
user on 2026-08-31.

### What changes for the user

The current wizard spreads deterministic detail questions, skill selection,
kickoff upload, and PROJ-135 kickoff clarification across separate steps. The
new flow gathers the stable choices first and then opens one coherent
"Project context" step.

The user sees what the wizard already knows, answers adaptive questions, and
reviews context coverage per selected skill. A skill may be marked sufficiently
covered only through an explicit user confirmation. The user can stop early,
mark a gap as unknown or not applicable, or continue manually when no eligible
AI provider is available.

After project creation, the reviewed summary and its open gaps remain available
in the project. The raw transcript is retained too, but has a narrower audience
than the confirmed summary.

### Wizard and project-room structure

```text
Project creation
+-- Master data
+-- Project type
+-- Method
+-- Skills
+-- M&A foundation (only for M&A)
+-- Kickoff / AI backlog (optional)
+-- Project context
|   +-- Known-context summary
|   |   +-- Confirmed wizard selections
|   |   +-- Deterministic PROJ-6 requirements
|   |   +-- Kickoff evidence, when present
|   +-- Adaptive dialog
|   |   +-- Current question and rationale
|   |   +-- Answer / Unknown / Skip
|   |   +-- Manual fallback
|   +-- Skill-coverage panel
|   |   +-- One row per exact skill version
|   |   +-- Coverage state and evidence
|   +-- Finish-dialog action
+-- Review
    +-- Editable confirmed summary
    +-- Assumptions and contradictions
    +-- Open context gaps
    +-- Required master-data gaps
    +-- Create project

Project room
+-- Project context
    +-- Confirmed summary
    +-- Skill coverage and open gaps
    +-- Provenance per statement
    +-- Raw transcript (restricted audience)
    +-- Revision history (beta)
```

The existing PROJ-6 detail fields are not removed. They become part of the
Project-context step and remain directly editable. This is also the complete
manual path: provider failure must never remove or hide a required field.

### Dialog lifecycle

1. **Build the trusted frame.** The server resolves the current draft, project
   type, method, deterministic answers, selected active skill versions, and the
   optional kickoff source. IDs supplied by the browser are never treated as
   authority.
2. **Classify the complete outbound context.** Privacy classification covers
   every byte that can reach a provider: wizard text, deterministic answers,
   kickoff material, prior turns, current summary, and skill instructions. The
   kickoff's stored class remains a minimum floor.
3. **Ask one adaptive question.** The AI may propose a next question, affected
   skills, evidence references, and a coverage recommendation. It cannot write
   canonical coverage states or project fields.
4. **Record the human response.** The user answers, marks unknown/not
   applicable, skips, or ends the dialog. Only user-authored or explicitly
   confirmed content becomes evidence.
5. **Re-evaluate coverage.** The server carries the authoritative state and
   checks that every selected skill version remains represented. Repeated gaps
   without new evidence trigger the manual fallback instead of another loop.
6. **Review and finalize.** The user confirms or edits the structured summary.
   Project creation and the initial project-context documentation succeed as one
   unit or not at all.

There is no product-level fixed question count. Operational safeguards remain:
bounded input and transcript sizes, provider timeout, tenant cost cap,
rate-limiting, idempotent turns, optimistic concurrency, and non-progress
detection. Hitting a safeguard documents the remaining gaps; it never claims
that the context is complete.

### AI-purpose boundary

The feature receives its own non-proposal purpose:
`skill_context_clarification`.

This is intentionally separate from `clarifying_questions_from_context`:

- PROJ-135 is one kickoff-grounded generation with zero to six questions.
- PROJ-Y-5a is multi-turn, skill-version-aware, and also works without a
  kickoff.
- Keeping the purposes separate preserves historical cost, provider, and audit
  meaning.

The new purpose is implemented for every registered provider and included in
the data-driven capability matrix. It is registered in the run log, the
per-purpose cost-cap register, and the bounded pre-project run rule. It is
explicitly absent from the suggestion and suggestion-undo registers because it
creates no `ki_suggestions` and has no accept/undo lifecycle.

AI runs remain linked to the wizard draft before creation and are re-linked to
the project during finalize. The pre-project read path is owner-bound through
the draft; another member of the same tenant cannot inspect an unfinished
dialog's run metadata.

### Data ownership and persistence

The architecture uses two persistence phases.

#### Before project creation: working draft

The existing owner-protected wizard draft remains the editable working state.
Its dialog block contains:

- conversation turns and turn status;
- confirmed and proposed statements with provenance;
- selected skill-version snapshot;
- current coverage and gaps;
- analysis status and reason code;
- concurrency version and idempotency markers.

The draft is not the permanent record and is not shared with project members.

#### After project creation: project-context documentation

A new bounded domain stores the reviewed result:

| Record | Responsibility |
|---|---|
| Project context document | Tenant/project ownership, document kind, confidentiality, current revision and origin draft |
| Context revision | Immutable reviewed summary, structured statements, provenance, gaps, contradictions, privacy class and analysis status |
| Skill coverage | One relational row per exact immutable skill version, human-confirmed state and evidence references |
| Dialog turns | Immutable raw user/assistant turns with their narrower read policy |

Structured statements may live inside the immutable revision as strictly
validated structured content. Skill versions remain relational references so a
later activation cannot rewrite what the original dialog evaluated.

Revisions supersede rather than overwrite one another. Alpha creates and reads
the initial revision. Beta adds the post-create revision workflow and visual
comparison.

### Why existing stores are not reused

| Existing store | Decision | Reason |
|---|---|---|
| `context_sources` | Do not use for the dialog record | It represents ingested evidence and is offered as a generation source. A synthetic conversation there would blur PROJ-91 grounding. |
| PROJ-135 excerpt append | Legacy only | Existing drafts remain compatible, but new dialog drafts do not rewrite a kickoff excerpt as though user answers were document text. |
| Project chat | Do not use | It is post-create, private by conversation owner, and has no structured coverage or review contract. |
| Project description / extras | Do not use | These are business master data, not a revisioned provenance record. |
| DMS document | Do not use | No binary document is being stored; forcing a tree node would add a false document lifecycle. |
| `ki_suggestions` | Do not use | The dialog proposes questions, not reviewable business mutations. |

### Atomic finalize and retry safety

The existing route currently creates a project and performs several later steps
best-effort. That is insufficient for the accepted requirement that
documentation always survives draft deletion.

The new core finalize boundary therefore owns one transaction:

- validate draft ownership and the expected draft version;
- create exactly one project for the draft;
- establish the mandatory project access needed by the creator;
- create the context-document header and immutable initial revision;
- persist skill-version coverage and the retained transcript;
- re-link the dialog's AI-run records;
- remove the draft only after all mandatory records exist.

The operation is idempotent by the draft identity. A retry after an uncertain
network response returns the already-created project instead of creating a
second one. Optional follow-on enrichments may remain best-effort, but project
and initial context documentation may not be separated.

The database-side operation reads the actor from the authenticated session; it
does not accept an actor parameter.

### PROJ-135 compatibility

For new drafts, the visible PROJ-135 clarification step is absorbed into the
single Project-context step:

- with a kickoff, the dialog receives the document and already confirmed
  kickoff answers;
- without a kickoff, it starts from the wizard frame and skill versions;
- the user never sees two question rounds over the same gaps.

Old drafts carrying the deployed `clarifying` shape remain readable. On first
open, an adapter represents their questions and answers as historical confirmed
turns without calling the model again. The deployed PROJ-135 route and finalize
path remain available for legacy drafts until those drafts have expired.

Confirmed dialog statements are not automatically fed into PROJ-70, PROJ-82,
PROJ-153, or project chat. A later consumer must request them as an explicitly
labelled second context channel and define its own grounding contract.

### Coverage semantics

The canonical coverage states remain those approved in Requirements, with one
important authority rule:

| State | Who can establish it |
|---|---|
| Needs clarification | Initial server state or a new unresolved human-reviewed gap |
| Sufficient | User confirmation against cited human/kickoff evidence |
| Unknown | User action |
| Not applicable | User action |
| Skipped | User action |

The model can recommend a state and explain why; it cannot establish one. Model
output alone is never evidence. The UI therefore says "recommended as covered"
until the user confirms it, avoiding the false claim that an AI call proves a
skill understands the project.

### Access, confidentiality, and privacy

The retained information has two orthogonal protections:

- **Privacy class** controls which AI provider may process it.
- **Confidentiality level** controls which project members may read it.

Each project-context document starts at least at the project's confidentiality
level and may be raised, never lowered beneath the project. Access combines
project membership with the existing restrictive classified-content gate.

Read audiences:

- confirmed summary, coverage, and gaps: project members who pass the
  confidentiality gate;
- raw transcript: its author plus project leads/editors who pass the same gate;
- unfinished draft and pre-project run metadata: draft owner only.

**This last line replaces three already deployed policies, and that is stated
here rather than only in the migration comment.** PROJ-135 introduced
project-less `ki_runs` rows for its pre-project clarification purpose and gated
them tenant-wide: `project_id IS NULL AND is_tenant_member(tenant_id)` on
select, insert and update — measured live before applying. This slice narrows
all three to the **draft owner** (`project_wizard_drafts.created_by =
auth.uid()` plus tenant equality). Once finalize re-links the run to its
project, the existing project-scoped policies take over unchanged.

It is a **tightening**, not a widening: unfinished dialog metadata can contain
what a user typed before anyone else has any reason to see it. Two things were
measured before applying, because a tightening can also break a promise: no
`ki_runs` row currently has a null `project_id` (**0 rows**, so no data changes
audience), and no pentest file asserts the wider form — there is no PROJ-135
pentest file at all. PROJ-135's live red-team smoke did record
*project-less run visible to a member*; that measurement was correct on its day
and its INDEX row is annotated as superseded rather than rewritten.

~~Tenant administration does not bypass the classified-content rule.~~ Child
records inherit access from the parent document; they do not carry an
independent, potentially weaker truth.

**The first sentence is contradicted by the deployed gate and is marked rather
than rewritten (house form, PROJ-Y-143n).** `can_access_classified` opens with
`if public.is_tenant_admin(v_tenant) then return true`, so an *uncleared* tenant
admin does read a `strict` document. Measured on 2026-09-04, not read off the
source: for the same `strict` project the gate returns `true` for an uncleared
tenant admin and `false` for an uncleared tenant member. The discrepancy is not
this slice's doing — the gate is PROJ-100a's and is shared by 140-plus call
sites — but the sentence stood here as a property of *this* access model, and a
reader would have relied on it. The second sentence is unaffected and is now
measured (vector Q). Deciding whether the gate or the promise moves is a
product call and belongs to a follow-up, not to a test pass.

This is also why the pentest's uncleared reader is deliberately a tenant
`member`: an admin probe would return `true` from the gate and prove nothing
about the restrictive policy.

Skill instructions are untrusted prompt input. They can shape which context is
requested but cannot alter tenant isolation, provider routing, response schema,
tool availability, review requirements, provenance, or coverage authority. The
dialog has no tools and no business-data mutation capability.

### Backend surfaces

The backend needs these high-level capabilities:

- load the authoritative dialog frame for an owned wizard draft;
- submit one dialog turn with concurrency and idempotency protection;
- save manual answers and user-established coverage states without a provider;
- preview the reviewed documentation before finalize;
- atomically finalize draft, project, initial documentation, and run re-linking;
- read the confirmed project context and, for authorised roles, its transcript;
- read revision history once beta is delivered.

All project-facing routes go through the existing project-access helper and the
session-bound database client. Aggregate views over coverage or gaps remain
invoker-scoped so row-level and classified-content policies apply to counts as
well as row lists.

### Failure and recovery states

| Situation | User-visible outcome |
|---|---|
| No provider | Context remains editable; status says no provider and manual capture continues |
| Class 3 without permitted processor | No external call; status says privacy block and manual capture continues |
| Cost cap reached | Completed turns remain; open gaps are documented and retry is disabled until allowed |
| Provider timeout/error | Last complete human turn survives; partial AI text is not evidence |
| Repeated question/no progress | AI loop stops and highlights the unresolved gap for manual handling |
| Skill version changes | Prior analysis names its old version and becomes stale until reviewed |
| Kickoff changes | Document-derived statements become stale; source history remains visible |
| Draft conflict | Existing PROJ-5 conflict handling prevents silent transcript merging |
| Finalize response lost | Idempotent retry returns the same project and documentation |

### Test and production evidence required

The implementation and QA stages must cover:

- data-driven provider capability coverage for the new purpose;
- reason-code behavior for no provider, privacy block, provider error, cost cap,
  and external-AI-disabled;
- prompt-classification sabotage tests that independently remove wizard text,
  kickoff text, history, summary, and skill instructions;
- proof that an AI recommendation cannot set `sufficient` or populate master
  data without confirmation;
- repeated-question and concurrent-tab behavior;
- atomic finalize, idempotent retry, and forced failure between the mandatory
  records;
- tenant, project, draft-owner, role, skill-version, and `anon` negative cases;
- restrictive confidentiality tests for summary, transcript, and every child
  record;
- aggregate-leak probes for counts of documents, gaps, and coverage rows;
- live smoke for every new privileged database operation, using `auth.uid()` and
  leaving zero residue;
- one real-provider multi-turn conversation and one authenticated browser flow.

Existing PROJ-5, PROJ-70, PROJ-78, PROJ-135, PROJ-151, and PROJ-153 regression
paths remain in the QA set. A manual-only dialog is tested as a first-class
successful path, not merely as an error state.

### Dependencies and technology

No new npm package, framework, external service, queue, or database extension is
needed. The design reuses:

- the existing Vercel AI SDK router and six provider implementations;
- provider timeout, cost-cap, and typed-reason infrastructure;
- PROJ-5 draft and Review flow;
- PROJ-6 deterministic rule catalog;
- PROJ-70 kickoff source handling;
- PROJ-76 immutable skill versions and PROJ-78 selection;
- PROJ-10 revision/audit principles;
- shadcn/ui form, card, alert, badge, progress, and dialog primitives.

### Delivery slices

#### Alpha — usable creation flow

- new non-proposal AI purpose across every provider;
- unified Project-context step with and without kickoff;
- adaptive multi-turn dialog and complete manual fallback;
- exact skill-version snapshot and human-controlled coverage;
- Review integration;
- atomic and idempotent finalize;
- immutable initial project-context documentation;
- project-room read view with restricted transcript;
- full security, live-smoke, real-provider, and browser evidence.

Alpha is a usable vertical product slice. Its deployment scope is `alpha`, not
`mvp` or `full`, because AC-Y5a.18's post-create revision workflow remains open.

#### Beta — context-document lifecycle

- create a superseding revision after project creation;
- compare revisions and show what changed;
- retention/export treatment for old revisions and discarded statements;
- optional, purpose-specific downstream use of confirmed statements, only after
  a separate grounding review.

Beta closes the lifecycle and enables a later scope upgrade only after a new QA
and deployment pass.

### Architecture decisions summary

| Decision | Choice | Primary reason |
|---|---|---|
| Dialog purpose | New `skill_context_clarification` purpose | Different semantic and audit contract from PROJ-135 |
| Working state | Existing owner-only wizard draft | Editable and resumable before a project exists |
| Permanent state | New revisioned project-context domain | Durable provenance without corrupting evidence or chat semantics |
| Coverage authority | Human-confirmed server state | Prevents AI self-certification |
| Finalize | Atomic and idempotent core operation | Prevents project/document split and duplicate projects |
| PROJ-135 | Legacy-compatible adapter into one visible dialog | No duplicate questioning or broken old drafts |
| Transcript access | Author plus classified-authorised leads/editors | Raw text is more sensitive than confirmed summary |
| Downstream AI use | Deferred and purpose-specific | Protects PROJ-91 grounding |
| Delivery | Usable alpha, lifecycle beta | Keeps the first deployment vertical and testable |
| New dependencies | None | Existing stack already supplies every required primitive |

### Frontend handoff

Next stage: `/frontend` for the Alpha UI boundary: the unified Project-context
wizard step, known-context summary, adaptive/manual answer controls,
human-confirmed skill-coverage panel, Review integration, and the read-only
project-room context view. The frontend stage reuses installed shadcn/ui
primitives and introduces no dependency. Database records, atomic finalize,
AI-purpose wiring, APIs, RLS, and transcript authorization remain the following
`/backend` stage; the UI may use typed fixture state until those contracts exist.

## Frontend Implementation Notes (2026-08-31)

The Alpha frontend boundary is implemented and ready for user review.

### Delivered

- The wizard now has one unconditional **Project context** step after Skills,
  the optional M&A foundation, and the optional kickoff. The separate visible
  PROJ-135 clarification step is removed from new flows; persisted legacy
  questions and answers are adapted into the same retained statement and turn
  history without another model call.
- The draft has a typed `project_context` block for summary, provenance-bearing
  statements, turns, exact client-visible skill-version snapshots, canonical
  coverage states, gaps, assumptions, contradictions, analysis status, reason
  code, and completion state. Old drafts are backfilled during hydration and
  optimistic-conflict reload.
- The complete manual path is usable without a provider: confirmed wizard
  selections, deterministic detail answers, and optional kickoff evidence are
  collected automatically; users can add free text, mark each selected skill
  as sufficient/unknown/not applicable/skipped, or finish with documented gaps.
  Only a user interaction can establish `sufficient`.
- The Review step includes an editable context summary, honest analysis-status
  banner, per-skill coverage, gaps/assumptions/contradictions, and provenance.
  Editing the summary is explicitly separated from project master data.
- A core Project-room route `/projects/[id]/projektkontext` and navigation item
  render the confirmed summary, coverage, gaps, provenance, confidentiality,
  and the narrower transcript state. Loading, empty, authorization-safe
  transcript, and retryable error states are present. Existing projects receive
  a normal empty state when the future API returns 404.
- The UI reuses installed shadcn/ui primitives and semantic Tailwind tokens;
  no dependency, inline style, CSS module, or raw palette color was added.

### Frontend evidence

- Focused tests: **147/147** across wizard order/defaults, manual capture,
  legacy clarification absorption, version staleness, reviewable project-room
  output, transcript narrowing, wizard navigation, and method-aware routing.
- Full Vitest suite: **4015/4015** in 464 files. The first sandboxed run had
  eight `spawnSync git EPERM` failures in the hook-installer suite; the approved
  unrestricted repetition is fully green.
- ESLint: **0 errors**. Token-drift guard: **0 errors / 0 warnings**.
- TypeScript: the repository's existing **13-error baseline**, **0 new** and no
  error in a changed file.
- Production compilation: **successful in 87 seconds** with Next's official
  webpack builder (Turbopack rejects an external worktree dependency symlink).
  The subsequent global route-type pass stops on the pre-existing unrelated
  export `mapCommEntryRpcError` in the communication-entry route.
- `check:index-scope`: **199/199**, 0 errors. `git diff --check`: clean.

### Frontend continuation

The preview and test login were made available on 2026-09-01. After the user
confirmed that access worked and asked to continue building, the slice moved to
the backend stage. The implementation follows the existing wizard visual
language; no separate mockup, dependency, or brand deviation was introduced.

## Backend Implementation Notes (2026-09-01)

### Delivered locally

- Added the separate non-proposal purpose `skill_context_clarification` to the
  TypeScript purpose union, provider capability matrix, typed reason-code
  exhaustiveness guard, `ki_runs` register, cost-cap register, and bounded
  pre-project-run rule. It deliberately remains absent from suggestion and undo
  registers. All cloud providers, Azure, Ollama, and Stub use the existing
  structured clarification transport; provider selection and run accounting
  retain the new purpose's distinct audit identity.
- Added an owner-scoped adaptive next-question route. It resolves the draft,
  current selected active skill versions and instructions, optional kickoff,
  prior turns and reviewed summary server-side; classifies the complete bounded
  outbound payload; uses optimistic concurrency and request-id idempotency; and
  persists both successful assistant turns and typed manual-fallback reasons.
  AI output cannot establish canonical coverage or mutate project master data.
- Added the revisioned project-context domain: document header, immutable
  revision, exact relational skill-version coverage, and raw turns. Every table
  is tenant-scoped, RLS-enabled and direct-write closed. Summary access combines
  project membership with restrictive confidentiality; transcript access is
  limited to its author or project lead/editor and remains subject to the same
  classification gate. Strict reads use the existing deduplicated confidential
  access log.
- Replaced the split create/bootstrap/delete core with
  `finalize_project_wizard_with_context`. It reads the actor from `auth.uid()`,
  locks and validates the owned draft, creates the project, lead membership,
  M&A profile where applicable, selected skills, initial context revision,
  coverage and transcript, re-links wizard AI runs, and deletes the draft in
  one transaction. `origin_draft_id` is unique, so a lost-response retry returns
  the same project. Optional template and kickoff handoffs remain best-effort
  after the mandatory transaction.
- Added the authenticated project-context read API and connected the existing
  project-room hook/page to authoritative relational coverage and the narrower
  transcript response.
- Added route tests plus a self-rolling-back SQL pentest covering atomic failure,
  idempotent retry, direct-write denial, tenant isolation, transcript roles,
  restrictive confidentiality/aggregate leakage, and revoked `anon` execute.

### Backend evidence

- Full Vitest suite: **4025/4025** tests in **466/466** files.
- Finalize regression suite: **20/20**; new project-context APIs: **7/7**.
- Provider capability and reason-code matrices remain exhaustive for the new
  purpose.
- ESLint: **0 errors** (four unrelated pre-existing warnings). Token-drift,
  migration-naming, index-scope, and `git diff --check`: green.
- Next.js webpack production compilation succeeds. The subsequent global route
  type pass stops at the pre-existing unrelated `mapCommEntryRpcError` export;
  no changed file appears in the TypeScript baseline.
- ~~Local fresh-schema replay was attempted but the WSL Docker daemon is not
  available. The migration and rollback pentest therefore remain intentionally
  unapplied until `/qa` can use the approved target database workflow.~~
  **Superseded on 2026-09-04 — both are done; see *Applied migration* below.**
  The fresh replay was obtained from CI rather than locally: the schema-drift
  guard rebuilds the schema from the migration files and passed on the draft PR.

### Required before Backend approval / QA handoff

- ~~Apply the migration with the filename stem preserved, then run schema-drift,
  the live finalize RPC smoke, and `tests/sql/PROJ-Y-5a-project-context-pentest.sql`.~~
  **Done 2026-09-04** — see *Applied migration* below.
- **Still open:** run one real-provider multi-turn conversation and one
  authenticated browser flow against the migrated API, including no-provider and
  Class-3 fallback.
- **Still open:** re-run existing PROJ-5/70/78/135 creation regressions against
  the live RPC. Note that PROJ-135's own red-team measurement is deliberately
  superseded by this slice, not to be reproduced — see the *Read audiences*
  paragraph above.
- Beta remains separate: post-create superseding revisions, revision comparison,
  retention/export treatment, and controlled downstream reuse.

## Applied migration — 2026-09-04

`20260901123000_projy5a_alpha_project_context` is **in production**, registered
under the repo filename stem (PROJ-134; the version prefix carries the MCP
timestamp `20260904072715`, the documented benign drift — the rule requires the
*name* to match, and it does).

**Pre-flight against production, before applying.** Nothing here was assumed:

| checked | result |
|---|---|
| the four tables / the function | did **not** exist — nothing to clobber |
| anchor `'work_items_from_project_intent'::text` in `ki_runs_purpose_check` | present, **exactly once** |
| same anchor in `tenant_ai_cost_caps_purpose_check` | present |
| anchor `'dd_report'::text` in `confidential_read_log_entity_type_check` | present, new value absent |
| `ki_runs` rows with a null `project_id` | **0** — the widened CHECK validates against no data |
| all 8 referenced functions | signatures **exact**, including `create_ma_project_profile` with 11 arguments |
| all 20 referenced columns | present |

The last two rows matter more than they look: `plpgsql` does **not** validate its
body when the function is created, only on first call. That is precisely how
PROJ-Y-158a shipped a wrong signature that only QA found. Checking beforehand
turns a runtime surprise into a pre-flight fact.

**Transcription ruled out, not assumed.** The migration had to be passed through
as 23 KB of SQL, so the applied function body was compared against the repo
file: identical length (**9630**) and identical raw md5 (`d2e45b30…`). Byte
equality, not a plausibility argument.

**Post-state, measured independently of the apply:**

| checked | result |
|---|---|
| tables / with RLS | **4 / 4** |
| policies · restrictive · **write policies** | 8 · 4 · **0** (writes go through the RPC only) |
| purpose registers `ki_runs` / `tenant_ai_cost_caps` | **18 / 18** values — lockstep, siblings preserved (17 before) |
| `confidential_read_log_entity_type_check` | 17 values, new one among them |
| `ki_runs_project_id_bounded_null` | additive, both pre-project purposes |
| `ki_runs` policies · of those owner-bound | 6 · **3** |
| function | `SECURITY DEFINER`, `search_path=public, pg_temp` |
| function ACL | `authenticated`, `service_role`, `postgres` — **no PUBLIC entry**, `anon` without EXECUTE |
| write privileges for `authenticated` on the four tables | **0** |
| data | 0 project-less runs, 0 documents — unchanged |

**Live pentest `tests/sql/PROJ-Y-5a-project-context-pentest.sql`: A–L 12/12 PASS**
against production, rollback forced by the closing exception. Load-bearing
vectors: **D** a retry returns the same project instead of a second one · **E** a
direct write to the revisions is refused with `42501` · **G/H** as a pair — the
same raw transcript is invisible to a project viewer and visible to its author,
which is what makes G more than "a count was zero" · **J** the restrictive
confidentiality policy hides an uncleared read · **L** a forced failure rolls the
project back **and** preserves the draft.

**Zero residue across 12 counters**: no pentest tenants, profiles, `auth.users`,
projects or drafts; 0 rows in all four new tables; and **0 audit rows in the last
15 minutes** — the strictest of the twelve, because those would be append-only
and permanent.

**Advisors: 0 ERROR**, 158 WARN. The four new tables produce **no** notice at all
— in particular no missing-RLS finding. The function appears in exactly one
category, `authenticated_security_definer_function_executable` (WARN), which is
the intended house category for a `SECURITY DEFINER` write path callable by
`authenticated`; the codebase carries well over 140 of the same kind.

**What this does not establish.** No provider has been called and no browser has
walked the flow. The dialog route, the wizard step and the finalize path are
proven at the database and unit level; the chain from a typed answer through a
model to a stored revision is not. That is the remaining handoff above, and it
is why this slice stays `In Review`.

## Pentest extended to A-U — 2026-09-04

`tests/sql/PROJ-Y-5a-project-context-pentest.sql` grew from 12 to **22 vectors**.
A-L are unchanged. M-U were derived by walking the acceptance criteria and the
*Access, confidentiality and privacy* section against what A-L actually asserts;
each new vector names the gap it closes in the file itself.

**Result: 22/22 PASS against production**, the fixture rolled back by the closing
exception.

| new | closes which gap |
|---|---|
| **M** | The migration replaced three deployed PROJ-135 policies that exposed project-less `ki_runs` tenant-wide. Nothing asserted the narrowing. Owner sees the run, a fellow tenant member does not — and the member's tenant membership is asserted first, so a zero count cannot be mistaken for tenant isolation. |
| **N** | The select half is not the dangerous half: a fellow member must not be able to attach run metadata to a draft they do not own (42501). Positive half keeps the negative from being vacuous. |
| **O** | This migration rewrote three CHECK constraints by string surgery and added a fourth. A count of accepted values does not prove they still constrain: a project-less run of another purpose is refused (23514), the new purpose is accepted by *both* purpose registers, the new read-log entity type is accepted and a bogus one refused. |
| **P** | The canonical coverage snapshot is what the slice asks to be trusted, and nothing asserted it. No skills selected → no invented default row (AC-Y5a.11); a selected skill omitted from the browser payload → backfilled as `needs_clarification` against the exact current version, never as sufficient; `sufficient` without cited evidence refused (23514), with evidence accepted. |
| **Q** | J covered the parent document only. The child records must inherit, not carry a weaker truth: revisions, coverage and turns are each hidden from the uncleared member. One verdict over three tables, guarded so no later check can overwrite an earlier failure. |
| **R** | G and H would both stay green if the transcript policy had collapsed to author-only. The lead and editor branches are exercised with one non-author, non-admin user. |
| **S** | Nothing asserted the owner binding of the finalize RPC. A fellow tenant member gets `P0002`, the draft survives and no project is created — and because the draft demonstrably still exists, `P0002` can only come from the ownership clause. |
| **T** | Nothing asserted that finalize re-links the pre-project run, which is what hands authority from the owner-only draft policy back to the project-scoped one. It also pins the ordering: `wizard_draft_id` is `ON DELETE SET NULL`, so a finalize that deleted the draft first would orphan the run forever. |
| **T2** | E proved the write closure for one of four tables. Documents, coverage and turns are asserted on their exact SQLSTATE (E's shape, not L's catch-all). |
| **U** | The privilege half of "no write path": `authenticated` still HAS execute (a revoke that overshoots breaks the feature silently) and holds zero write privileges on all four tables. |

### Red-green: the new vectors were shown to bite

Everything green on the first run is when to be suspicious, so seven product-level
sabotages were applied inside one rolled-back transaction — not sabotaged
expectations, but the deployed state itself:

| sabotage | new vector | old vector |
|---|---|---|
| transcript policy collapsed to author-only | **R FAIL** (lead n=0) | G PASS |
| revisions given their own permissive `using(true)` and their restrictive policy dropped | **Q FAIL** (revisions=1) | J PASS |
| `insert` granted on turns + permissive insert policy | **T2 FAIL** (turns accepted) | E PASS |
| `insert` granted on documents, no policy | **U FAIL** (write grants=2) | T2's documents check still 42501 |
| the viewer made owner of the pending draft | **M FAIL**, **N FAIL** | — |
| `..._sufficient_has_evidence` constraint dropped | **P FAIL** | — |

The right-hand column is the argument that the new vectors add coverage: each
sabotage is invisible to the vector it extends. The documents/turns pair under
one sabotage is the sharpest case — with the privilege granted but no policy the
insert still fails `42501`, so T2 stays green while U turns red, which is exactly
why both exist.

O, S, T and P's sub-checks 1-2 were not sabotaged by DDL; they are self-controlling
(each asserts a positive state that simply does not arise if the mechanism is
absent) and P and O carry explicit positive controls.

### Findings

- **F-1 (spec vs. deployed gate, not a code defect of this slice).** "Tenant
  administration does not bypass the classified-content rule" is false for the
  deployed `can_access_classified`. Measured; the sentence is marked in *Access,
  confidentiality and privacy* above rather than rewritten.
- **F-2 (precision of the pre-existing vector H).** The red-green run showed H
  passes through the **lead/admin** branch, not through authorship: with an
  author-only policy the owner sees 1 of 2 turns, because the assistant turn
  carries `author_user_id = NULL`. H's label overstates what it isolates. Not a
  product defect — the draft owner is always made project lead by
  `bootstrap_project_lead` — but an author who is neither lead nor editor would
  see their own turns and not the assistant's replies. The pure-author branch
  remains untested by both H and R; the fixture cannot produce a non-admin,
  non-lead author cheaply.

### Not established by this pass

- The skill-version-changed guard (`40001`, "selected skill version changed;
  review required") is still unasserted.
- No provider was called and no browser walked the flow — unchanged from the
  *Applied migration* section above.

**Zero residue across 19 counters**, each compared against a snapshot taken
before the run rather than against an assumption: `auth.users` 8, profiles 6,
tenants 9, memberships 11, projects 57, project memberships 51, drafts 11,
skills 2, skill versions 2, project skills 3, `ki_runs` 88 (0 project-less),
read log 6, all four context tables 0, cost caps 0 — every value identical.
`audit_log_entries` stayed at **1217** with **0 rows in the last 60 minutes**,
the strictest of the counters because those rows are append-only and permanent.
The six DDL sabotages were rolled back too: 8 context policies, the evidence
constraint present, 0 write grants for `authenticated`.

## QA Test Results — 2026-09-04

**Verdikt: 0 Critical / 0 High / 0 Medium offen → Approved.** Der Durchgang
begann mit **1 High** und **1 Medium**; beide sind in der QA behoben, nicht
zurückgestellt.

**26 von 27 Kriterien erfüllt.** Offen bleibt allein **AC-Y5a.18** zur Hälfte:
Lesen ist belegt (Routentests, Pentest **G/H/J/Q/R**), das **Bearbeiten und
Supersedieren** ist zurückgestellt — `supersedes_revision_id` existiert ohne
Schreiber, und auf den vier Tabellen liegt kein Audit-Trigger. Per Tech Design
Sache von **β**, und der Grund, warum diese Slice `alpha` ist und nicht `full`.

### Was in der QA gefunden und behoben wurde

**F-A (High) — der Grund erreichte den Nutzer nie.** `reason_code` wurde von der
Route geliefert, im Zod-Schema validiert, in den Entwurf geschrieben und in die
Revision persistiert — und **an keiner Stelle gerendert**. Folge: ein Klick auf
„Nächste KI-Frage" ohne Anbieter ergab HTTP 200 mit `question: null`, keinen
Toast, keine Meldung. Ein stiller Knopf, und das ausgerechnet in der Slice, deren
Alleinstellung Ehrlichkeit über fehlende KI ist. Wörtlich die Defektklasse, gegen
die PROJ-137 gebaut wurde. **AC-Y5a.20 war damit unerfüllt.**

Behoben durch **Wiederverwendung** von PROJ-137s `reasonCodeToBanner` +
`<ReasonBanner>` statt einer zweiten Fassung — dessen ganzer Zweck war, dass es
genau *einen* solchen Renderpfad gibt. Die Wertelisten decken sich exakt; dass
die Slice mit `PROJECT_CONTEXT_REASON_CODES` eine Parallelkopie des Haustyps
angelegt hat, ist ein eigener Followup (**PROJ-Y-5a-w3**).

**F-B (Medium) — AC-Y5a.21 war unbewacht.** Die Klassifikation ist strukturell
richtig: Rahmen, Kickoff, Verlauf **und Skill-Anweisungen** landen in *einem*
String, der als `content_excerpt` klassifiziert wird — geprüft wird also genau
das, was rausgeht. Nur hielt das **nichts** fest: der Routentest mockte den
Generator vollständig weg. Verschiebt jemand die Skill-Anweisungen in ein eigenes
Prompt-Feld, wird der Klassifizierer für sie blind und Class-3-Inhalte gingen am
Gate **vorbei** statt hindurch — wörtlich PROJ-Y-151e/151f, eine Ebene weiter.
Das Tech Design listet diesen Nachweis als **Pflicht**; er fehlte. Jetzt
vorhanden, mit Rot-Grün.

**F-H (Low) — „Manuelle Erfassung aktiv" rendert unbedingt**, auch nach einem
gelungenen KI-Turn, und war dann schlicht falsch. Jetzt an
`analysis_status !== "ai_analyzed"` gebunden.

**Fehlende Auth-Gate-Abdeckung.** Die Slice brachte **zwei neue API-Routen** ohne
jeden Auth-Gate-Test mit — dieselbe Lücke, die PROJ-45-β und PROJ-155-β.2 je in
ihrer eigenen QA fanden. `tests/PROJ-Y-5a-project-context-auth-gates.spec.ts`
schliesst sie, **4/4** chromium. Die Zusicherung lautet **exakt `307`**, nicht
`[307, 401, 403]`: die lockere Form besteht auch, wenn es die Route gar nicht
gibt. Der vierte Fall spricht die Grenze der Datei aus — ein **erfundener** Pfad
antwortet ebenfalls 307, ein grüner Lauf belegt also das **Tor**, nie die
**Existenz**.

### Nachweise

- **Live-Pentest A–U: 22/22 PASS, 0 FAIL**, im **Auslieferungszustand** gefahren
  (nach dem Merge von `main`, nicht im Baustand). Rückstände gegen einen
  **vorher** genommenen Stand über 16 Tabellen identisch, `audit_log_entries`
  unverändert **1227** — der schärfste Beleg, weil dort seit PROJ-130-α nichts
  löschbar ist. Zusätzlich fixture-spezifisch nachgezählt (elf Tabellen je 0),
  weil eine gleiche Gesamtzahl theoretisch „eins dazu, eins weg" verbergen
  könnte.
- **Prod-Zustand eigenständig nachgemessen** statt aus Notizen übernommen:
  Migration registriert (Name = Repo-Dateistamm, PROJ-134-konform), 4 Tabellen
  mit RLS, **0 Schreib-Policies**, `finalize_project_wizard_with_context` als
  `SECURITY DEFINER` mit `anon` **und** PUBLIC ohne EXECUTE. Die 11 Policies der
  Datei verteilen sich auf 8 neue plus **3 auf `ki_runs`** — die Verengung, mit
  der die Slice PROJ-135s mandantenweite Sichtbarkeit projektloser Läufe
  zurücknimmt.
- **Vier-Register-Gleichschritt geprüft:** der Zweck steht in
  `ki_runs_purpose_check` **und** `tenant_ai_cost_caps_purpose_check`; die zwei
  übrigen Register sind **richtig** leer, weil der Zweck PROJ-135s Transport
  nutzt, der laut Vertrag nie `ki_suggestions` schreibt. Wäre das anders, hätten
  wir den PROJ-153-Defekt — Modell wird gerufen und **bezahlt**, das Speichern
  scheitert mit `23514`.
- **Rot-Grün dreimal, je mit eigener Trefferzahl:** Grund-Banner entfernt → 1 rot
  · Manuell-Hinweis wieder unbedingt → 1 rot · Skill-Anweisungen aus dem
  klassifizierten Strang → 1 rot (die drei Nachbarfälle bleiben grün). Jedes Mal
  per Dateikopie byte-identisch zurückgesetzt.
- **Gates:** vitest **4274/4274** (482 Dateien) · ESLint 0 Fehler · tsc
  **11 = Baseline** · Build clean · alle fünf Datei-Wächter OK.

### Offene Befunde, benannt statt geglättet

| # | Schwere | Befund | Ziel |
|---|---|---|---|
| **F-1/F-C** | Medium | Die Zusage „tenant administration does not bypass the classified-content rule" ist für das **deployte** Tor falsch, und zwar über **beide** Hälften: `can_access_classified` gibt für Mandanten-Admins unbedingt `true` (an der Quelle gelesen), und `has_project_role` ebenso **ohne** Projektmitgliedschaft. Ein unfreigegebener Admin liest über den direkten PostgREST-Zugriff jedes Rohtranskript des Mandanten. Vorbestehend (PROJ-100a/PROJ-4, 140+ Aufrufstellen), **nicht** von dieser Slice verursacht — aber die Spec behauptete die Enge als Eigenschaft *dieses* Modells. In der Spec **durchgestrichen statt umgeschrieben** (Hausform PROJ-Y-143n) | **PROJ-Y-5a-w1** |
| **F-2** | Low | Pentest-Vektor **H** besteht über den `lead`/`admin`-Zweig, nicht über Autorschaft; der reine Autoren-Zweig bleibt ungeprüft. Kein Produktfehler, weil der Entwurfs-Eigner immer `lead` wird | **PROJ-Y-5a-w2** |
| **F-D** | Low | `project_context_revisions.privacy_class` wird per Regex `~* '(email\|phone\|person)'` gesetzt statt mit `detectClass3Markers` — falsch-positiv bei jedem deutschen „Person/Personal", falsch-negativ bei einer Adresse ohne das Wort. **Wird von keiner Zeile gelesen** und gatet nichts | **PROJ-Y-5a-w4** |
| **F-E** | Low | `40001` ist doppelt belegt (Draft-Konflikt und Skill-Versionswechsel); die Route meldet für beides „Draft changed before finalization" — bei einem Versionswechsel eine **falsche** Auskunft | **PROJ-Y-5a-w5** |
| **F-F/F-G** | Low | `gap_tag` und `affected_skill_version_ids` werden berechnet und vom Client verworfen; `assumptions`, `contradictions` und die Herkunft `ai_interpretation` haben **keinen Erzeuger** und sind in α strukturell leer | **β** |
| **F-I** | Info | Toter Legacy-Relink in `finalize/route.ts` (nach der RPC trifft `.is("project_id", null)` nichts). Harmlos | — |

### Nicht geprüft, ausdrücklich benannt

- **Kein echter Anbieter-Lauf** — kein Schlüssel, kein lokales Ollama. Der
  Kernpfad „Frage rein → Modellfrage raus" ist nie gegen ein Modell gelaufen.
- **Kein angemeldeter Browser-Durchlauf** der Kette Wizard → Dialog → Review →
  Finalize. Belegt sind Datenschicht (22 Vektoren), Routen und Komponenten,
  nicht ihre Verkettung im Browser.
- **`step-review.tsx` hat keine Testdatei**; AC-Y5a.16 ist code-belegt.

Beides sind **Nachweisgrenzen**, keine zurückgestellten Anforderungen — sie
stehen bereits in der Spec und bleiben offen.

## Deployment

_To be added by /deploy._

**Ausgeliefert 2026-09-04: Tag `v3.7.0-PROJ-Y-5a` auf dem Merge-Commit `555dcb8`
(PR #545, squash), alle zehn CI-Checks grün.**

Die Migration lag seit dem 2026-09-04 in Prod (registriert `20260904072715`,
Name = Repo-Dateistamm, PROJ-134-konform); der Merge liefert damit die
**Anwendungsschicht** und löst einen halben Zustand auf, in dem die Datenschicht
live war und über HTTP nichts davon erreichbar.

**Scope `alpha`, aus den Kriterien statt aus Vorsicht:**

- **`full` scheidet aus**, weil **AC-Y5a.18** eine **ursprüngliche** Anforderung
  ist, deren zweite Hälfte (Bearbeiten und Supersedieren auditierbar)
  zurückgestellt und mit Ziel-Kennung **PROJ-Y-5a-β** registriert ist. „Waived
  criterion" scheitert schon an seiner ersten Bedingung („nothing was
  deferred").
- **`mvp` scheidet aus**, weil hinter der Grenze mit **β** ein *namentlich
  geführter* Sub-Slice steht — wörtlich die `alpha`-Definition (Präzedenz
  PROJ-80-α, PROJ-79-α).
- **`tooling-only` scheidet aus**, weil Produkt-Laufzeitfähigkeit geliefert wird.

**Die gelieferte Grenze:** ein adaptiver, skill-gesteuerter Detailfragen-Dialog in
der Projektanlage, der den Kontext **dokumentiert** — auch ohne KI, und dann
ehrlich als „erfasst, nicht KI-analysiert" gekennzeichnet. Nicht dabei: das
Bearbeiten der Dokumentation nach der Anlage (β), Erzeuger für Annahmen und
Widersprüche (β), und ein KI-Weg, der Aussagen selbst schreibt — die KI erzeugt
in α ausschliesslich Fragen, nie Fakten.

**Zwei Nachweisgrenzen bleiben und sind keine zurückgestellten Anforderungen:**
kein echter Anbieter-Lauf (kein Schlüssel, kein lokales Ollama — der Kernpfad
„Frage rein → Modellfrage raus" ist nie gegen ein Modell gelaufen) und kein
angemeldeter Browser-Durchlauf der Kette Wizard → Dialog → Review → Finalize.
Belegt sind Datenschicht (22 Vektoren gegen Prod), Routen, Komponenten und die
Auth-Gates — nicht ihre Verkettung im Browser.
