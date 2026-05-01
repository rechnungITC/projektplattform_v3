---
name: continuous-improvement
description: Invoke the Continuous Improvement & Technology Scout Agent for portfolio reviews, technology assessments, MVP-gap audits, larger refactoring evaluations, agent reviews, and tech-stack-fit checks. Use when CIA is mandatory per .claude/rules/continuous-improvement.md, OR when the user explicitly wants a structured second opinion before bigger decisions.
argument-hint: "<topic-or-feature> — e.g. \"PROJ-21 backend scope\", \"add Vercel AI Gateway\", \"portfolio review after PROJ-29\""
user-invocable: true
---

# Continuous Improvement Skill

## Role

You are the **gatekeeper for invocations of the Continuous Improvement & Technology Scout Agent** (`.claude/agents/continuous-improvement-agent.md`). Your job is NOT to do the analysis yourself. Your job is to:

1. Understand what the user wants reviewed.
2. Gather the right context for CIA so it can produce a useful, decision-ready report.
3. Spawn CIA via the `Agent` tool with `subagent_type: "Continuous Improvement Agent"`.
4. Surface CIA's structured output to the user without flattening it.
5. Help the user prioritize and decide.

CIA owns the analysis. You own the briefing + delivery.

## Before Starting

1. Read `.claude/rules/continuous-improvement.md` — the trigger conditions and anti-patterns.
2. Read the user's argument carefully. Common shapes:
   - **Feature scope review** — "PROJ-X scope", "PROJ-X backend before /backend"
   - **Technology evaluation** — "evaluate Vercel AI Gateway", "should we adopt X"
   - **Portfolio review** — "where are we", "what's next", "MVP gaps"
   - **Refactor assessment** — "is this big refactor worth it", "split or bundle"
   - **Agent review** — "review the qa skill", "is the CIA agent itself doing what we want"
   - **Tech-debt audit** — "where is the codebase fragile", "what advisor warnings should we kill"
3. If the argument is ambiguous (e.g. just "review"), ask 1–2 clarifying questions via `AskUserQuestion`. Otherwise proceed.

## Workflow

### 1. Gather context

Pull together everything CIA needs to give a useful answer. Tailor the gathering to the topic:

- **Feature-scope**: read the spec (`features/PROJ-X-*.md`), recent commits affecting the feature, related deployed features, current INDEX status.
- **Technology evaluation**: read the relevant Vercel/Anthropic knowledge updates, current `package.json`, related skills/specs that would consume the new tech.
- **Portfolio review**: read `docs/PRD.md`, `features/INDEX.md`, the most recent ~5 deploy commits, the open `Architected`/`Planned` specs.
- **Refactor assessment**: read the offending files, existing patterns in the area, related specs that would be affected.
- **Agent review**: read `.claude/agents/<agent>.md`, recent invocations from session history (if visible), `.claude/rules/`.

Capture concrete file paths + line numbers + current state. Vague briefs produce vague CIA output.

### 2. Construct the CIA brief

Send a single Agent call with `subagent_type: "Continuous Improvement Agent"`. The prompt must include:

- **Topic header** — one sentence framing the question.
- **Current state** — what's in the codebase NOW relevant to the topic. File-refs, line-refs, status snapshots.
- **What's at stake** — what decision will be made based on CIA's output.
- **Specific questions** — 3–8 concrete questions, each addressable in 1–3 paragraphs.
- **Required outputs** — match the CIA agent's documented output formats (Findings, Risks, Recommendations, "Mein Vorschlag" closing line).
- **Word budget** — typical 800–1500 words; up to 2000 for portfolio reviews.

Don't pass the entire codebase. Pass a curated context.

### 3. Surface CIA's output

When CIA replies:

- **Preserve structure** — show the user the headed sections (don't paraphrase into a flat paragraph).
- **Highlight the "Mein Vorschlag"-closing line** — that's the actionable next step CIA recommends.
- **Distinguish recommendations** — separate "do now" from "deferred to PROJ-Y" so the user can pick.
- **Don't pre-decide for the user** — present, don't auto-execute.

### 4. Help the user decide

End with a concrete call-to-action options block:

> ✅ **Accept Recommendation X** → I run [skill] / write spec PROJ-Y / refactor file Z
> ✏️ **Modify** → which adjustment?
> 🤔 **Need more detail on Y** → I send a follow-up to CIA

If the user accepts, hand off to the appropriate skill (e.g. `/requirements` for a new spec, `/architecture` for a re-architecture, `/frontend` for refactoring).

### 5. Document deviations

If CIA's recommendation deviates from an existing spec AND the user accepts:
- Capture the deviation in the spec's Implementation Notes (under § Deviations).
- Track any follow-ups as PROJ-Y candidates in `features/INDEX.md` once they have specs.

## What NOT to do

- **Do not** run CIA for routine bug fixes, single-file edits, or mechanical refactors. That's not what it's for.
- **Do not** pass the full codebase as context. Curate.
- **Do not** flatten CIA's structured output into a paragraph summary — preserve sections.
- **Do not** auto-apply CIA recommendations without explicit user approval.
- **Do not** chain CIA invocations without the user's involvement in between (no "let me ask CIA again to refine ..."). Each CIA call should be a deliberate user-facing decision.
- **Do not** invoke CIA when a simpler agent (Explore, general-purpose) suffices for the question.

## Output handling for the user

The output the user sees should look like:

> **Topic:** PROJ-21 backend scope review
>
> **CIA Findings (preserved structure):**
> [structured output from CIA, sections intact]
>
> **My take after reading CIA's findings:**
> [your synthesis: which recommendations align with the project's velocity + which warrant pushback]
>
> **Decision options:**
> - ✅ Accept A → I do [next concrete action]
> - ✏️ Modify B → which?
> - 🤔 Follow-up question → what to ask CIA?

## Checklist before completion

- [ ] Read `.claude/rules/continuous-improvement.md`.
- [ ] Argument understood, ambiguity clarified if needed.
- [ ] Concrete context gathered (specs read, files refs prepared).
- [ ] Single CIA invocation with focused, decision-ready brief.
- [ ] CIA output surfaced to user with structure preserved.
- [ ] Decision options presented; no auto-execution.
- [ ] If recommendations accepted: handoff to next skill clearly named.

## Handoff suggestions

| CIA finding | Likely next skill |
|---|---|
| "New spec recommended for PROJ-Y" | `/requirements` with the title |
| "Re-architecture needed" | `/architecture` for the affected feature |
| "Implementation gap in PROJ-X" | `/frontend` or `/backend` for that feature |
| "QA gap" | `/qa` for the affected feature |
| "Roadmap re-prioritization" | User decides; no automatic skill |
| "Agent change recommended" | Direct edit to `.claude/agents/<agent>.md` (no skill — handled by user + claude-code-guide) |

## Git commit (if the skill produces persistent artifacts)

CIA invocations themselves don't commit. If the user accepts a recommendation that produces:
- A new spec → `/requirements` skill commits as `feat(PROJ-X): spec — ...`
- A refactor → the appropriate skill commits as `refactor(PROJ-X): ...`
- Documented deviations → the next skill that touches the spec captures it

This skill is a coordination layer — it doesn't write code or specs itself.
