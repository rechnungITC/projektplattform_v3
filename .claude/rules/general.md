# General Project Rules

## New Project Detection (MANDATORY)
Before starting ANY work, check if the project has been initialized:
1. Read `docs/PRD.md` - if it still contains placeholder text like "_Describe what you are building_", the project is NOT initialized
2. Read `features/INDEX.md` - if the features table is empty, no features have been defined

**If the project is not initialized:**
- Do NOT write any code or create any components
- Do NOT skip ahead to implementation
- Instead, tell the user: "This project hasn't been set up yet. Let's start by defining what you want to build. Run `/requirements` with a description of your idea (e.g. `/requirements I want to build a task management app`)."
- If the user already described their idea in the current message, run `/requirements` automatically with their description

**If the project is initialized but the user requests a feature not yet in INDEX.md:**
- Guide them to run `/requirements` first to create the feature spec before any implementation

## Feature Tracking
- All features are tracked in `features/INDEX.md` - read it before starting any work
- Feature specs live in `features/PROJ-X-feature-name.md`
- Feature IDs are sequential: check INDEX.md for the next available number
- One feature per spec file (Single Responsibility)
- Never combine multiple independent functionalities in one spec

## Git Conventions
- Commit format: `type(PROJ-X): description`
- Types: feat, fix, refactor, test, docs, deploy, chore
- Check existing features before creating new ones: `ls features/ | grep PROJ-`
- Check existing components before building: `git ls-files src/components/`
- Check existing APIs before building: `git ls-files src/app/api/`

## Human-in-the-Loop
- Always ask for user approval before finalizing deliverables
- Present options using clear choices rather than open-ended questions
- Never proceed to the next workflow phase without user confirmation

## Status Updates (MANDATORY - Write-Then-Verify)
After completing work on any feature, you MUST update tracking files. Follow this exact sequence:

1. **Read** the feature spec (`features/PROJ-X-*.md`) and `features/INDEX.md` BEFORE editing
2. **Write** your changes using the Edit tool — do NOT just describe what you would write
3. **Re-read** the file AFTER editing to verify the changes are actually present
4. **If changes are missing**, repeat step 2 — never claim updates were made without verifying

**What to update in the feature spec:**
- Lifecycle status field in the header (Planned → Architected → In Progress → In Review → Approved → Deployed, or terminal Superseded)
- Deployment scope field as defined below
- Implementation notes: what was built, what changed, any deviations from the original spec
- Bug fixes or design changes discovered during implementation

**What to update in `features/INDEX.md`:**
- Feature status column must match the feature spec header
- Valid lifecycle statuses: Planned → Architected → In Progress → In Review → Approved → Deployed;
  `Superseded` is the separate terminal replacement status
  - **Planned**: after `/requirements`
  - **Architected**: after `/architecture`
  - **In Progress**: after `/frontend` or `/backend` starts
  - **In Review**: after `/qa` starts
  - **Approved**: after `/qa` passes (no critical/high bugs)
  - **Deployed**: after `/deploy`
  - **Superseded**: after the replacement and AC-by-AC disposition are documented

### Deployment Scope (MANDATORY)

Lifecycle status describes **where the feature is in the workflow**. Deployment scope describes **what
was actually delivered**. Keep them as separate fields in both the spec header and `features/INDEX.md`.
Use exactly one scope value: `full`, `mvp`, `alpha`, `tooling-only`, or `superseded`.

Canonical representation:

- Feature spec: separate `## Status: <value>` and `## Deployment Scope: <value>` headers.
- `features/INDEX.md`: separate `Status` and `Deployment Scope` columns. Do not hide scope inside the
  description or a prose-heavy status cell.

| Lifecycle status | Allowed deployment scope |
|---|---|
| Planned, Architected, In Progress, In Review, Approved | `—` (empty) |
| Deployed | `full`, `mvp`, `alpha`, or `tooling-only` |
| Superseded | `superseded` only |

Scope definitions and required evidence:

- **`full`** — every current in-scope acceptance criterion and the Definition of Done are satisfied;
  QA has no Critical/High findings; production behavior is verified. Later enhancements may remain open
  only if they do not defer or contradict an original in-scope acceptance criterion.
- **`mvp`** — an explicitly approved, usable MVP boundary is deployed; the spec contains an acceptance-
  criteria matrix for the delivered core; every omitted original requirement has a named follow-up.
- **`alpha`** — a named sub-slice with its own acceptance criteria completed QA and deployment; the spec
  lists every remaining slice, dependency, and omitted original criterion.
- **`tooling-only`** — no product runtime capability was delivered; evidence is an executed repository
  tool, test, workflow, or CI check plus the relevant repository/CI result.
- **`superseded`** — the feature was not deployed independently; name the replacement and map every
  original acceptance criterion to `absorbed`, `rejected`, or a tracked follow-up.

An auth redirect or route-existence smoke alone is not functional evidence. Use evidence proportional to
the feature: real library tests, API/RPC/RLS tests, UI/E2E checks, production smoke, or CI/tool execution.

### Deployment/Supersession Bookkeeping Procedure

Follow this order whenever setting `Deployed`, changing deployment scope, or setting `Superseded`:

1. Re-read the original acceptance criteria, Definition of Done, implementation notes, QA results, and
   actual code/migrations/tests. Do not classify from the existing status label.
2. Determine the lifecycle status and scope independently using the allowed-combination table.
3. Write the feature spec first: matching status and scope, exact delivered boundary, evidence per
   acceptance criterion, deviations, and remaining work.
4. Register every accepted omission from an original requirement in
   `features/OPEN-DEFERRED-STATUS.md`, including the source AC and a target `PROJ-Y` follow-up ID.
5. Update `features/INDEX.md` last. Keep lifecycle status and deployment scope in separate columns or
   explicitly labelled fields; never encode scope only inside a prose-heavy status cell.
6. Re-read all three files and verify status, scope, delivered boundary, and follow-up IDs agree.
7. For `alpha → mvp → full`, require a new QA/deployment pass and append the upgrade evidence without
   deleting the earlier slice history.

Legacy rollout: do not bulk-infer scope from existing `Deployed` labels. Classify legacy entries in a
separate evidence-based portfolio audit. If a legacy feature is touched before that audit completes,
classify that feature from its ACs and evidence as part of the change. If the INDEX has no `Deployment
Scope` column yet, add the column through that portfolio migration before recording a new deployment or
scope change; do not invent placeholder scopes for unreviewed rows.

Never use `Deployed + superseded`, `Planned + alpha`, or any other combination not listed above. Never
retroactively narrow or rewrite original acceptance criteria merely to justify `full`.

**NEVER do this:**
- Do NOT say "I've updated the feature spec" without actually calling the Edit tool
- Do NOT summarize changes in chat as a substitute for writing them to the file
- Do NOT skip updates because "it's obvious" or "minor"

## File Handling
- ALWAYS read a file before modifying it - never assume contents from memory
- After context compaction, re-read files before continuing work
- When unsure about current project state, read `features/INDEX.md` first
- Run `git diff` to verify what has already been changed in this session
- Never guess at import paths, component names, or API routes - verify by reading

## Handoffs Between Skills
- After completing a skill, suggest the next skill to the user
- Format: "Next step: Run `/skillname` to [action]"
- Handoffs are always user-initiated, never automatic
