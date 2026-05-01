# Continuous Improvement Rules

These rules govern when the **Continuous Improvement & Technology Scout Agent** (`.claude/agents/continuous-improvement-agent.md`) must be involved in the development workflow. They complement `CLAUDE.md`'s "Verbindliche Nutzung" section and apply to **every** skill (`/requirements`, `/architecture`, `/frontend`, `/backend`, `/qa`, `/deploy`) when the trigger conditions below are met.

## When CIA is MANDATORY

The Continuous Improvement Agent must be invoked **before** committing to any of the following:

1. **New technologies** — adding a new npm package, framework, library, or external service that is not already in `package.json` or the established stack (Next.js + Supabase + Vercel + Anthropic Claude + shadcn/ui + Tailwind).
2. **Larger refactorings** — changes that touch ≥ 5 files in a single concern OR change an architecture-level pattern (e.g. swapping a state-management approach, replacing the routing-middleware, restructuring the multi-tenant invariant).
3. **Architecture decisions** — when a `/architecture` skill encounters a fork that the spec didn't lock, OR when a deployed feature needs to be re-architected.
4. **MVP gaps + product-strategy questions** — when investigating "what's missing for the pilot use case" or "should we add feature X".
5. **Agent changes** — when modifying any file under `.claude/agents/` or adding a new agent.
6. **Technical-debt assessments** — when the user asks "what should we clean up" or "where is the codebase fragile".
7. **Feature ideas from technical observations** — when a code-reading reveals a missing capability (rather than a user-driven feature request).
8. **Lint / advisor / security overrides** — when a linter or Supabase advisor wants to override a rule across more than 5 files, OR when an override has security implications.

## When CIA is OPTIONAL (recommended but not blocking)

- Spec QA — sanity-checking a `/requirements`-output before `/architecture`.
- Test-suite gaps — identifying under-tested areas before `/qa`.
- Cross-feature consistency — checking whether a new spec contradicts an existing spec (PROJ-X vs PROJ-Y).
- Performance investigations — when a Vitest or Playwright run is slower than expected.

## When CIA is NOT needed

- Bug-fixes that don't change architecture.
- Spec-following implementations — building exactly what the Tech Design specifies.
- Mechanical lint cleanups (e.g. unescaped-entity HTML escapes).
- Dependency-version bumps that don't change major versions.
- Documentation-only changes.

## How CIA must be invoked

Use the `Agent` tool with `subagent_type: "Continuous Improvement Agent"`. The prompt must include:

1. **Context briefing** — what's currently in the codebase relevant to the question (file paths + line numbers, existing specs, related deploys).
2. **Concrete question** — single specific decision or scope, not "what should we improve".
3. **Required output format** — structured findings (Findings, Risks, Recommendations) matching the CIA agent's output contract in its agent file.
4. **Word limit** — typically 800–1500 words for focused decisions; up to 2000 for portfolio reviews.

CIA replies inherit the German output language conventions documented in its agent file. Skills that consume CIA output should preserve the structure when relaying findings to the user.

## Workflow Integration

| Skill | When the skill must consult CIA |
|---|---|
| `/requirements` | Before adding a feature that introduces a new technology or rebuilds a deployed feature. |
| `/architecture` | When the spec leaves an architecture decision open AND the chosen path affects ≥ 3 future skills. |
| `/frontend` | When the implementation needs a new UI library OR a deployed component needs a behavior-changing refactor. |
| `/backend` | When the implementation needs a new persistence pattern, a new external integration, or rewrites a deployed RLS / migration / RPC pattern. |
| `/qa` | When QA discovers a class of issues that points to a structural problem (not a one-off bug) — flag for CIA before re-architecting. |
| `/deploy` | When deploy-time discovers a deferred-from-spec deviation that has architectural implications. |

## Output Handling

When CIA returns findings:

1. **Surface to user** — present the structured output (don't paraphrase into a flat summary) so the user can re-prioritize.
2. **Document deviations** — if the user accepts a CIA recommendation that deviates from the original spec, capture the deviation in the spec's Implementation Notes.
3. **Track follow-ups** — recommendations that are accepted but deferred become PROJ-Y candidates; surface them in the recommendation list at the end of the current slice.
4. **Respect the user's call** — CIA recommends; the user decides. Never auto-apply CIA findings without confirmation.

## Anti-patterns to avoid

- **CIA-bypass**: skipping CIA review by framing a refactor as a "small fix" when ≥ 5 files are touched.
- **CIA-by-proxy**: asking general-purpose agents to do CIA's job (portfolio reviews, technology evaluations).
- **Over-invocation**: spawning CIA for routine bug-fixes or single-file edits — that wastes the user's review attention.
- **Vague briefing**: passing CIA "what should we improve" without a concrete scope — produces flat brainstorm output.
- **Silent integration**: applying CIA's recommendations without telling the user — kills auditability.

## Slash command

Users can invoke CIA directly via `/continuous-improvement <topic>`. The skill at `.claude/skills/continuous-improvement/SKILL.md` defines the input shape and output expectations.
