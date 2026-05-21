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

# [projektplattform_v3] recent context, 2026-05-21 9:20pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,943t read) | 184,343t work | 91% savings

### May 20, 2026
S293 Deploy PROJ-65 ε.1 (Project Trajectory Graph & Decision Steering) foundation slice to production, including pre-deploy schema-drift fix, tag release, post-deploy smoke verification, and bookkeeping updates to INDEX.md and the feature spec. (May 20, 4:18 PM)
### May 21, 2026
S294 Deploy PROJ-65 ε.1 (Project Trajectory Graph & Decision Steering) foundation slice to production, including diagnosing and fixing Schema Drift Guard failures, tagging the release, verifying with post-deploy smoke, and landing INDEX.md + spec bookkeeping on main. (May 21, 2:19 PM)
S295 Implement PROJ-65 ε.2 frontend slice — Stakeholder-Marker + DetailPanel + transient SwapDialog per designer brief docs/design/proj-65-epsilon-2-stakeholder-markers.md (May 21, 2:21 PM)
S296 Continue PROJ-65 ε.2 by implementing the /backend slice — POST /api/projects/[id]/work-items/[wid]/stakeholder-swap-preview endpoint to complete the frontend SwapDialog's expected contract (May 21, 6:32 PM)
S297 PROJ-65 ε.2 QA-Pass + F-PROJ-65-17 Marker-Quittung Polish-Fix bündeln und als PR landen — Section R QA-Doku schreiben, INDEX-Status auf Approved setzen, Drilling-Chain für swapReceiptNodeId implementieren, PR mit auto-merge öffnen. (May 21, 6:43 PM)
S298 Deploy PROJ-65 ε.2 (Stakeholder-Marker + Detail-Panel + Swap-Dialog + Swap-Preview endpoint) to production per the features/PROJ-65 spec. (May 21, 7:29 PM)
S299 PROJ-65 ε.3 /architecture pass — Sub-Slice-Cut für Goals + Green-Path (ε.3a) und Plan-Mutate + Diff + Undo (ε.3b) mit 6 neuen Locks L15–L20 (May 21, 7:47 PM)
S300 Triage offene Topics außer PROJ-65 — endete mit Discovery + Fix des Assistant-Mikrofon-Blockers (PROJ-41) und Production-Rollout (May 21, 8:18 PM)
S301 OpenAI-Key konnte nicht in Tenant AI Provider gespeichert werden — Root-Cause-Analyse und Fix der EXECUTE-Grants auf den Secret-Crypto-RPCs nach der Security-Lockdown-Migration (May 21, 8:30 PM)
4586 8:56p 🔵 Test coverage map: encryption RPCs mocked across 5 test files spanning router and key-resolver
4587 8:57p 🔵 No Playwright/e2e tests touch the encryption RPCs — only Vitest unit tests cover this path
4588 " 🔵 Root cause of OpenAI-Key save failure identified: set_session_encryption_key GUC does not survive PostgREST's per-request transactions
4589 " 🔄 secrets.ts updated to use atomic encrypt/decrypt_with_key RPCs instead of two-step GUC-bind pattern
4590 8:58p 🔄 ai-providers PUT and validate routes migrated to the atomic *_with_key RPC wrappers
4591 " 🔄 key-resolver.ts switched to decrypt_tenant_ai_provider_with_key for the AI router decrypt path
4592 " 🔵 Tests still reference legacy RPC names — 5 test files need mock+assertion updates to match the new *_with_key wrappers
4593 " 🔄 perl sed-rename completed in bulk: decrypt_tenant_ai_provider → _with_key and encrypt_tenant_secret → _with_key across all test files
4594 8:59p 🔵 Obsolete set_session_encryption_key error test confirmed; structure of buildSupabaseMock + setKeyResult option ready for surgical removal
4595 " 🔄 Key-resolver test cleaned: obsolete set_session_encryption_key block repurposed to "atomic decrypt RPC error"; bulk-rename verification reveals leftover mock branches
4596 " ✅ /tmp/apply-secret-rpc-grants.js deleted after successful production apply
4597 " 🔵 Apply-script fails on pre-check because the _with_key functions don't exist yet (chicken-and-egg)
4598 9:00p 🔴 Apply script hardened with to_regprocedure() guard + coalesce default — handles non-existent functions before migration apply
4599 " 🟣 Production DB: three new *_with_key SECURITY DEFINER wrappers created and granted to authenticated
4600 " ✅ npm ci started in fix-encrypt-key-binding worktree to enable lint/test/build validation
4601 " ✅ npm ci completed in fix-encrypt-key-binding worktree (980 packages, 22s, same 4 moderate vulns)
4602 " ✅ Vitest started for 5 affected test files; git diff --check clean (no whitespace issues)
4603 9:01p 🔵 Targeted vitest suite (5 files) all green: 56/56 tests pass in 1.17s
4604 " 🔵 Working tree state shows the full key-binding patch set: 9 modified files + 1 new migration, plus AGENTS.md/CLAUDE.md drift
4605 " 🔵 gitnexus detect-changes shows HIGH risk for the encryption refactor — 6 affected execution flows, 15 symbols touched
4606 " 🔵 Lint + Build both green: 0 errors, same pre-existing react-hook-form warning; Next.js production build 24.1s + 66 static pages in 276ms
4607 9:02p 🔵 Post-restore working tree: 9 modified files + 1 new migration; diff is net negative (-39 lines: 61 insertions vs 100 deletions)
4608 " ✅ Full vitest suite started for final pre-commit validation
4609 " 🔵 Full vitest suite green: 1485/1485 tests pass across 178 files in 18.07s
4610 " 🔵 Production-code diff verified clean; 7 leftover dead set_session_encryption_key mock branches confirmed harmless
4611 9:03p 🔵 Migration content re-verified pre-commit: 96-line SQL with three SECURITY DEFINER wrappers + grants
4612 " ✅ Apply script extended with end-to-end smoke test under authenticated role context
4613 " 🔵 Production end-to-end smoke confirmed: encrypt_tenant_secret_with_key callable by authenticated role returns non-null bytea
4614 " ✅ Commit 11ed481 created on fix/encrypt-secret-key-binding: 10 files, +157/-100
4615 " ✅ fix/encrypt-secret-key-binding pushed to origin; PR creation URL provided
4616 " ✅ PR #53 opened: "fix(PROJ-32): bind secret key inside crypto RPCs"
4617 9:04p 🔵 PR #53 initial CI: Vercel preview deploy pending CmQK6snaDSQni3zT1H49YUCbhDMk; Schema-Drift not yet surfaced
4618 " 🔵 Schema-Drift Guard now visible on PR #53 (run 26247092543) — all three checks running
4619 " 🔵 Schema-Drift Guard on PR #53 passed in 53s; Vercel preview still building
4620 9:05p 🔵 PR #53 all checks green: Schema-Drift 52-53s, Vercel preview 184s, Vercel Preview Comments instant
4621 " 🔵 gh pr checks watcher exited cleanly with all 3 PR #53 checks green
4622 " 🔵 PR #53 MERGEABLE / CLEAN state confirmed; headRefOid 11ed481ce4b15e949415cde4b3588e225fff2710 with all 3 checks SUCCESS
4623 " 🔵 gh pr merge 53 blocked by /tmp/proj9-sprint-state-fix worktree holding main — same pattern as PR #51/#52
4624 " 🟣 PR #53 squash-merged via gh api PUT — main advances with key-binding refactor
4625 " 🔵 main fast-forwarded ca220ea..d20b40a (PR #53); new post-merge Schema-Drift run + Vercel production deploy in flight
4626 9:06p 🔵 Post-merge Schema-Drift Guard run on main d20b40a passed in 52s (job 77248441013); Vercel production deploy still building
4627 " 🔵 Production Vercel deploy for d20b40a in progress: projektplattform-v3-ozwz9gskh-it-couch.vercel.app age 1m, status Building
4628 9:07p 🔵 Vercel commit status flipped to success at 19:07:10Z; production deploy completed for d20b40a
4629 " 🟣 Production deploy projektplattform-v3-ozwz9gskh-it-couch.vercel.app Ready — PROJ-32 key-binding live
4630 " 🟣 End-of-cycle: production deployment dpl_ELUHHHd6FVELWCnSKgznQxgYE3un Ready with aliases active; primary tree now behind 3 commits
S302 Zweite Stufe des OpenAI-Key-Save-Fehlers: encryption_unavailable trotz erfolgter Grant-Restore — atomare *_with_key RPC-Wrapper eingeführt, Production-DB direkt gefixt, PR #53 gemerged, Production deployed (May 21, 9:09 PM)
4631 9:18p ⚖️ ε.1 Frontend braucht eigenen Designer-Pass für Modus-Toggle und 2D-Pfad-Renderer
4632 " 🔵 ε.3a Bundle-Größe knapp über Designer-Brief-Budget
4633 9:19p 🟣 PROJ-65 ε.3a Frontend+Backend implementiert — Goals CRUD + Green-Path BFS
4634 " 🔵 PROJ-65 ε.3a Working-Tree-Inventar — modifizierte und neue Dateien
4635 " 🟣 PROJ-65 ε.3a Commit gestaged — 2005 Zeilen über 12 Dateien

Access 184k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
