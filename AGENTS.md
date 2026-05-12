<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **projektplattform_v3** (16829 symbols, 25464 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/projektplattform_v3/context` | Codebase overview, check index freshness |
| `gitnexus://repo/projektplattform_v3/clusters` | All functional areas |
| `gitnexus://repo/projektplattform_v3/processes` | All execution flows |
| `gitnexus://repo/projektplattform_v3/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->


<claude-mem-context>
# Memory Context

# [projektplattform_v3] recent context, 2026-05-12 11:58am GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (23,069t read) | 351,266t work | 93% savings

### May 12, 2026
2140 10:27a ✅ PROJ-58 slice table updated: all slices α through η marked Deployed
2141 " 🔄 PROJ-58 spec deduplicated: stale "noch nicht implementiert" stub removed
2142 10:28a ✅ PROJ-58 spec Implementation Notes expanded with closing batch and η motion polish entry
S194 Justify why the pre-existing doc diffs (AGENTS.md, features/INDEX.md, PROJ-27 spec) were excluded from the resizable-drawer push, and signal a separate cleanup pass for them. (May 12, 10:28 AM)
2143 " ✅ PROJ-58 spec header updated to reflect η deployment and 2026-05-12 date
2144 " 🔵 ProjectGraphView has a single consumer at the graph page route
S195 Triage the orphan documentation diffs left over after the resizable-drawer fix and land any safe-to-publish status updates as a separate commit. (May 12, 10:29 AM)
2145 10:29a ✅ framer-motion imports added to project-graph-view.tsx
2146 " ✅ ProjectGraphView component JSDoc updated to reflect 58-η framer-motion polish
2147 " 🟣 useReducedMotion gate added to GraphSvg for 58-η accessibility
2148 " 🟣 SVG edges converted to motion.line with animated opacity and strokeWidth
2149 10:30a 🟣 Node groups wrapped in motion.g with enter, hover, and tap animations
2151 " 🔵 Pre-existing doc diffs flip PROJ-27 status to "In Progress" and refresh sync date
2150 " ✅ 58-η motion polish implementation marked complete; validation phase begun
2152 " 🔵 Lint passes for 58-η: zero errors, only a pre-existing React Hook Form warning
2153 " 🔵 Orphan doc diffs upgrade PROJ-27 status to Deployed and a new untracked PROJ-58 + graph-view change appears
2154 10:31a 🔵 TypeScript typecheck passes cleanly for 58-η changes
2156 " 🔵 Pre-staged docs commit is 2 files, +3/-3 lines; gitnexus reports LOW risk across all working changes
2155 " 🔵 No vitest test files in src/components/projects directory
2157 " 🔵 Project-graph aggregator vitest suite: 3/3 passing in 1.08s
2158 " ✅ PROJ-27 marked Deployed in feature index and spec via commit 90bd31a
2159 " ✅ PROJ-27 "Deployed" docs commit pushed to origin/main
S196 PROJ-58-η: framer-motion polish on hand-rolled SVG project-graph-view + PROJ-58 spec hygiene cleanup, after user said "ja mach das und setzte 58-n um" (May 12, 10:31 AM)
2160 " 🔵 Production build succeeds with 58-η framer-motion changes
2161 10:32a 🔵 Build succeeds with graph route confirmed in output
2162 " 🔵 project-graph-view.tsx final length confirmed at 530 lines after 58-η
2163 " 🟣 PROJ-58-η framer-motion polish complete and validated
S197 Commit and push PROJ-58 η framer-motion polish + spec cleanup (May 12, 10:33 AM)
2164 11:23a ⚖️ Commit framer-motion polish for PROJ-58
2165 11:24a 🔵 PROJ-58 working tree contains three modified files
2166 " 🔵 PROJ-27 spec and feature INDEX have no pending changes
2167 " 🔵 PROJ-27 confirmed deployed with status persisted in spec and INDEX
2168 " 🔵 PROJ-27 deployed-status commit already on HEAD
2169 " 🔵 Recent branch history shows multiple shipped tickets
2173 " 🔵 features/INDEX.md captures full PROJ-1…PROJ-64 status ledger with Next Available ID = PROJ-65
2170 " 🔵 PROJ-58 diff sized at ~166 changed lines on synced main
2171 " ⚖️ Reverted AGENTS.md auto-mem churn before PROJ-58 commit
2172 11:25a 🔵 Working tree cleanly scoped to PROJ-58 files
2174 " 🟣 PROJ-58 η framer-motion polish committed as 1cb86e0
2175 " 🔵 PROJ-58 spec header drifts ahead of INDEX.md to record η framer-motion polish as live and `@xyflow/react` as deferred
S198 List the open / unfinished PROJ tickets per features/INDEX.md and flag any status drift between the index and the per-spec headers. (May 12, 11:25 AM)
S199 Audit features/INDEX.md to enumerate every remaining open PROJ ticket and flag any index-vs-spec status drift. (May 12, 11:26 AM)
S200 Run the /CIA portfolio review on the open PROJ tickets to decide what to do next; deliver structured CIA findings with decision options. (May 12, 11:27 AM)
2176 11:32a 🔵 CIA + GitNexus governance documented in .claude/rules and skills, gating refactors and PROJ specs
2177 " 🔵 .claude/ directory enumerates 9 agents, 6 rules, and 10 skills; working tree narrowed to just AGENTS.md
2178 11:33a 🔵 Continuous Improvement Agent operating contract documented in agent file + skill + rules
2179 " 🔵 PROJ-58 η framer-motion polish landed as commit 1cb86e0; origin/main now records four PROJ-relevant commits in this session window
2180 " 🔵 PROJ-34 spec file is absent on disk despite Planned listing; Voice Agent stack PROJ-37/38/39/40/41 specs are present and detailed
2181 11:34a 🔵 Five Planned PROJ specs (34, 45–50) referenced by INDEX.md are missing on disk; Assistant Track + governance specs are complete
2182 " 🔵 features/ directory inventory confirms exactly 7 phantom INDEX rows: PROJ-34, PROJ-45–50 spec files do not exist
2183 " 🔵 GitNexus index now stale at indexed commit 04fc5d2 vs current 1cb86e0; analyze re-run skips 1 large file
2184 11:35a 🔵 GitNexus re-index complete: 16957 symbols, 22 clusters, 56 features, 32 processes from 1067 files in 8.84s
2185 " 🔵 GitNexus FTS index ensure fails with read-only DB errors for File/Function/Class/Method/Interface tables
2186 11:36a 🔵 Three gitnexus queries return empty due to FTS-write-failure regression; status reports up-to-date at 1cb86e0
2187 11:37a ✅ CIA subagent invoked for portfolio review of open PROJ specs after PROJ-58 η deploy
2188 " ✅ CLAUDE.md now also dirty alongside AGENTS.md after CIA spawn — likely auto-touched by reanalyze hook
2189 11:40a ⚖️ CIA Continuous Improvement Report delivered with prioritized roadmap and four new requirements proposals
S201 Run /CIA as a structured portfolio review of the open PROJ specs and present decision-ready next-step options without applying changes. (May 12, 11:40 AM)
S202 Next-step recommendation after PROJ-58 η ship: three candidate work items ranked by effort vs. value, awaiting user choice between PROJ-42 branch-protection finalize and PROJ-34 Stakeholder Communication Tracking (May 12, 11:42 AM)
S203 Checkpoint capture after the /CIA portfolio review delivery — awaiting user pick among the three decision options surfaced. (May 12, 11:57 AM)
**Investigated**: The full CIA contract stack (.claude/rules + .claude/skills + .claude/agents/continuous-improvement-agent.md), every existing PROJ spec on disk, features/INDEX.md, docs/PRD.md, and the recent commit log. Seven INDEX rows confirmed to link to non-existent spec files: PROJ-34, PROJ-45, PROJ-46, PROJ-47, PROJ-48, PROJ-49, PROJ-50. Status drift catalogued: PROJ-42 INDEX=Deployed vs spec=Planned, PROJ-58 spec η-live vs INDEX η-deferred, PROJ-53 β QA-Approved awaiting /deploy, PROJ-54 α/β/γ live with δ intentionally deferred. GitNexus re-indexed from stale 04fc5d2 → HEAD 1cb86e0 (1067 files, final 16829 nodes/25464 edges/384 clusters/300 flows). Confirmed GitNexus query is non-functional on this checkout (read-only DB blocks FTS index creation, no embedding API key → empty results across diverse queries).

**Learned**: CIA is the architectural gatekeeper named across most major PROJ verdicts; the skill is a coordination layer that never auto-applies recommendations. CIA's verdict aligned with the PRD's documented Assistant Track release sequence: runtime first → governed actions second → compliance third → comfort last. GitNexus has two persistent infrastructure quirks: analyze touches AGENTS.md and CLAUDE.md as side effects even when LLM regeneration is skipped, and query cannot create FTS indexes lazily in read-only mode. The PROJ-54 spec documents a reusable infrastructure gotcha: Vercel/Next.js edge applies RFC-7232 §3.4 to the standard If-Unmodified-Since header (412 preflight), requiring rename to a custom X-If-Unmodified-Since header for optimistic locking.

**Completed**: Three commits landed on origin/main in this session window: 5fd84d2 fix(work-items): make detail drawer resizable (live on production deploy dpl_FLnu7ViDXuJArHqY17cdwcKzhwwV at projektplattform-v3.vercel.app), 90bd31a docs(proj-27): mark cross-project links deployed, and 1cb86e0 feat(PROJ-58): η framer-motion polish + spec cleanup (HEAD). CIA portfolio review delivered via subagent Hypatia (019e1b8c-0790-7e00-ad05-08da0774ac8b): prioritized sequence (Closeout PROJ-53/54/42/58 → Missing-spec triage PROJ-34/45–50 → PROJ-63 /architecture → PROJ-61 release-domain lock → Assistant Track runtime-first), four new ticket proposals (PROJ-65 Hygiene Closeout, PROJ-66 Missing Spec Repair, PROJ-67 Release Domain Lock, PROJ-68 Assistant Controlled Core), 5 risks, 5 open user-decision questions, "Mein Vorschlag" closing line. Output surfaced to user with section structure preserved, three concrete decision options presented (✅ Closeout now / ✅ Start PROJ-63 / ✏️ Triage Missing-Specs first).

**Next Steps**: Awaiting user pick among the three offered decision options. No new tool executions observed in this checkpoint — the session is paused on the user's choice. Working tree still carries " M AGENTS.md" and " M CLAUDE.md" gitnexus-managed churn from the analyze run; these remain intentionally uncommitted and would land as a separate chore(gitnexus) commit if accepted.


Access 351k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
