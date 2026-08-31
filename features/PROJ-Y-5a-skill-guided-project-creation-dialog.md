# PROJ-Y-5a: Skill-Guided Project Creation Dialog

## Status: Architected

## Deployment Scope: —

**Created:** 2026-08-31
**Last Updated:** 2026-08-31

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

- [ ] **AC-Y5a.1:** The adaptive dialog appears in the project-creation flow
  only after project type, method, and the wizard skill selection have been
  resolved; it is part of the detail-question phase, not a separate entry mode.
- [ ] **AC-Y5a.2:** Before its first question, the dialog receives the confirmed
  wizard frame: project basics, type, method, deterministic PROJ-6 answers, and
  the exact selected skill versions.
- [ ] **AC-Y5a.3:** If a kickoff source was uploaded, its permitted content and
  existing PROJ-135 clarification context are included. Without a kickoff, the
  dialog remains available and relies on the wizard frame and user answers.
- [ ] **AC-Y5a.4:** Information already established by a prior selection,
  answer, or kickoff source is not asked again unless it is ambiguous,
  contradictory, stale, or insufficient for a selected skill. The dialog states
  why clarification is needed.
- [ ] **AC-Y5a.5:** A kickoff-backed flow presents one coherent conversation;
  users are not required to complete a separate PROJ-135 question round and a
  second PROJ-Y-5a round over the same gaps.

### Adaptive skill coverage

- [ ] **AC-Y5a.6:** Every question identifies the selected skill or shared
  context area whose gap it addresses. One question may satisfy multiple skills.
- [ ] **AC-Y5a.7:** The dialog can ask follow-up questions based on prior user
  answers. It has no product-level fixed question count.
- [ ] **AC-Y5a.8:** Each selected skill receives a visible coverage state:
  `sufficient`, `unknown`, `not_applicable`, `skipped`, or `needs_clarification`.
- [ ] **AC-Y5a.9:** The normal completion condition is that no selected skill
  remains in `needs_clarification`. The user may nevertheless end the dialog at
  any time; unresolved areas are converted to documented `unknown` or `skipped`
  gaps rather than silently treated as sufficient.
- [ ] **AC-Y5a.10:** The user can skip an individual question, answer "unknown",
  or end the whole dialog. None of these actions prevents reaching Review or
  creating the project.
- [ ] **AC-Y5a.11:** If no skills are selected, the dialog can still document
  shared project context, clearly reports that no skill-specific coverage was
  evaluated, and does not invent a default skill assignment.
- [ ] **AC-Y5a.12:** Provider timeout, cost-cap exhaustion, or an interrupted
  response cannot create an unbounded loop. The current conversation is saved
  and the user can continue manually, retry, or proceed with documented gaps.

### Documentation and provenance

- [ ] **AC-Y5a.13:** The wizard draft stores the conversation, current coverage
  states, and structured summary so a reload or later resume restores the same
  state without forcing regeneration.
- [ ] **AC-Y5a.14:** Every documented statement distinguishes at least these
  origins: confirmed wizard selection, user-authored answer, kickoff evidence,
  and AI interpretation. AI interpretations are never labelled as user facts.
- [ ] **AC-Y5a.15:** Any AI-derived interpretation that would populate or change
  project master data requires explicit confirmation or editing by the user.
- [ ] **AC-Y5a.16:** The Review step shows an editable structured summary, the
  coverage state per selected skill, all unresolved gaps, and contradictions or
  assumptions requiring attention before the existing Create action.
- [ ] **AC-Y5a.17:** Finalizing the wizard durably attaches the reviewed dialog
  documentation to the created project before the wizard draft is deleted. The
  project retains the summary, provenance, selected-skill coverage, unresolved
  gaps, and the status of AI analysis.
- [ ] **AC-Y5a.18:** Project members with the applicable project access can read
  the retained documentation after creation. Editing or superseding it is
  auditable; history is not silently overwritten.
- [ ] **AC-Y5a.19:** The documentation is created even when the dialog ran
  entirely without AI. In that case it is visibly marked `captured_not_ai_analyzed`
  and must not be presented as skill-validated or AI-complete.

### Provider failure and privacy

- [ ] **AC-Y5a.20:** When no eligible provider is configured, external AI is
  disabled, the cost cap is exhausted, or the provider fails, all user-entered
  context remains saved. The UI shows the actionable reason and offers the
  manual detail path without blocking finalize.
- [ ] **AC-Y5a.21:** Privacy classification covers the complete outbound prompt:
  wizard values, kickoff content, conversation history, and all selected skill
  instructions. Omitting any of these inputs from classification is a failing
  security case.
- [ ] **AC-Y5a.22:** Class-3 content follows the existing hard routing policy:
  no OpenAI-direct, Anthropic, or Google call; only the permitted local path or
  an attested EU-resident trusted processor may be used.
- [ ] **AC-Y5a.23:** If Class-3 content has no permitted provider, the dialog
  falls back to documented manual capture and reports `class3_blocked`; it never
  downgrades the classification or sends a reduced prompt to an external model.
- [ ] **AC-Y5a.24:** Every AI call is tenant-scoped, cost-capped, and recorded
  with provider, model, privacy class, status, and typed reason code. An empty or
  interrupted result is always distinguishable from "no gaps found".

### Review and handoff

- [ ] **AC-Y5a.25:** Confirmed structured values route into the same PROJ-5
  Review and finalize flow as manually entered values; no parallel project
  creation endpoint or silent mutation path is exposed to the user.
- [ ] **AC-Y5a.26:** Exactly one project can be created from a finalized draft,
  and failed finalization retains both the draft and dialog documentation for a
  safe retry.
- [ ] **AC-Y5a.27:** The final Review differentiates required master-data gaps
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

Tenant administration does not bypass the classified-content rule. Child
records inherit access from the parent document; they do not carry an
independent, potentially weaker truth.

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

## QA Test Results

_To be added by /qa._

## Deployment

_To be added by /deploy._
