<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **projektplattform_v3** (16800 symbols, 25429 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

# [projektplattform_v3] recent context, 2026-05-12 8:33am GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (23,891t read) | 469,418t work | 95% savings

### May 11, 2026
2010 6:39p 🔵 containerRef/svgRef-Verwendung in gantt-view.tsx für SVG-Split lokalisiert
2011 6:40p 🔵 Today-Marker an zwei Stellen; gantt-view.tsx noch ohne dedizierte Tests; gantt-timeline.test.ts 239 Zeilen mit 7 describe-Blöcken
2012 " 🟣 Vitest-Cases für holidayBandsForRegion + formatHolidayTooltip ergänzt
2013 6:41p 🟣 Vitest-Suite gantt-timeline.test.ts grün mit 42 Tests inkl. neuer Holiday-Helper-Cases
2014 " ✅ gantt-view.tsx Imports für PROJ-53-β Frontend-Integration erweitert
2015 " ⚖️ PROJ-53-β Sticky-Header-Strategie geändert: SVG-internal Transform statt SVG-Split
2016 " 🟣 PROJ-53-β Holiday-Lookup-Memos in GanttView implementiert
2017 6:42p 🟣 PROJ-53-β rAF-throttled vertical scroll tracking für Sticky-Header in GanttView
2018 " 🟣 PROJ-53-β Scroll-Container für dual-axis Scrolling und 70vh Max-Höhe konfiguriert
2019 6:43p 🟣 PROJ-53-β Holiday-Bänder Rendering in gantt-view.tsx SVG-Tree
2022 7:38p ⚖️ Roadmap priorities presented for next build cycle
2023 8:01p 🟣 PROJ-27 drawer wired with Verknüpfungen Tab + Sub-Project trigger + DeliveredByBanner
2024 " 🔵 tertiary-foreground token missing from tailwind config
2025 8:02p 🔴 Drawer tab badge uses text-background instead of missing tertiary-foreground token
2026 " 🟣 PROJ-27 frontend wiring agent dispatched for tab integration + inbox page
2027 " 🔵 Second Frontend agent completed only partial finish — inbox page absent, room-shell banner not rendered, INDEX/spec not updated
2028 8:34p ⚖️ Work item links: backend-first rollout plan agreed
2029 9:18p 🟣 work_item_links migration adds approval_project_id column + helper threading
2030 " 🔄 Approve/reject link routes pivot on approval_project_id
2031 " 🔄 Inbox + work-item link listings filter by approval_project_id
2032 " ✅ POST work_item_links test updated for approval_project_id
2033 9:19p 🔵 approval_project_id wiring is consistent end-to-end
2034 " ✅ Targeted PROJ-27 vitest suite stays green after approval_project_id refactor
2035 " ✅ PROJ-27 build/lint clean after approval_project_id refactor
2036 " 🔵 npx gitnexus install crashed inside this sandbox
S168 Where to find the current Supabase Postgres connection string for DATABASE_URL (the dashboard path has changed) (May 11, 9:22 PM)
S169 Where to find Supabase's Postgres connection string in the current dashboard (it moved from "Project Settings → Database → Connection string" to the top-level "Connect" button) (May 11, 9:25 PM)
S170 Confirm the Supabase Session-Pooler connection string for project iqerihohwabyjzkpcujq and explain how to plug the DB password in for `npm run check:schema-drift` (May 11, 9:25 PM)
S171 Validate the Supabase Session-Pooler URI shape for project iqerihohwabyjzkpcujq and explain how to plug in the DB password for `npm run check:schema-drift` (May 11, 9:26 PM)
S172 Run `npm run check:schema-drift` against the live Supabase Postgres using the user-supplied Session-Pooler URI (May 11, 9:26 PM)
2037 9:27p 🔵 tsx IPC pipe creation fails with EPERM under the sandboxed runtime
2038 " 🔵 Schema-drift check rerun with escalated permissions clears the tsx EPERM block
2039 9:28p 🔵 Schema-drift check fails authentication against Supabase pooler
2040 9:29p 🔵 PROJ-42 schema-drift guard is a documented, deployed CI feature
2041 " 🔵 Schema-drift script + envs confirmed: no DATABASE_URL anywhere in repo, by design
2042 " 🔵 DATABASE_URL is not present in the agent shell environment
S173 Run `npm run check:schema-drift` against the live Supabase Postgres (Session-Pooler URI for project iqerihohwabyjzkpcujq) and diagnose why it failed (May 11, 9:29 PM)
S174 Where to find / reset the Supabase Database password to make `npm run check:schema-drift` authenticate (May 11, 9:30 PM)
S175 How and where to retrieve or reset the Supabase Database password so `npm run check:schema-drift` can authenticate against project iqerihohwabyjzkpcujq (May 11, 9:30 PM)
S176 Apply the PROJ-27 migration to live Supabase, verify the schema-drift check, and commit the full cross-project work-item-links slice (May 11, 9:31 PM)
2043 9:33p 🔵 Schema-drift run with rotated DB password again blocked by tsx EPERM under sandbox
2044 9:34p ✅ Schema-drift check re-launched with rotated DB password under escalated sandbox
2045 " 🔵 Schema-drift auth still fails after Supabase Database password reset
2046 " 🔵 Schema-drift run succeeded against Supabase and flagged the expected PROJ-27 drift
2047 " 🔵 Migration deployment options inventoried after schema-drift flagged work_item_links
2048 9:35p 🔵 Sandbox lacks both `supabase` CLI and a workspace; PROJ-27 migration is the only path remaining for live apply
2049 " 🔵 No bare `supabase` dependency in package manifests
2050 " 🔵 Live Supabase migration ledger schema and recent applied versions confirmed
2051 9:36p 🔵 Sandbox shell loses DNS resolution for the Supabase pooler without escalated permissions
2052 " 🔵 supabase_migrations.schema_migrations nullability + defaults confirmed
2053 9:37p 🟣 PROJ-27 work_item_links migration applied to live Supabase
2054 " ✅ Schema-drift check is clean against live Supabase after PROJ-27 migration apply
2055 " ✅ PROJ-27 slice fully ready to commit — tree state captured
2056 9:38p 🔵 No DB credentials or DATABASE_URL strings leaked into the repository
2057 " 🔵 Implementation diverged from PROJ-27 spec in three places worth tracking
2058 " 🔵 PROJ-27 spec carries unfilled Implementation Notes / QA / Deployment placeholders
2059 " ✅ PROJ-27 feature spec promoted to Implemented with full implementation/QA/deploy notes
2060 9:39p ✅ PROJ-27 slice staged for commit (AGENTS.md / CLAUDE.md held back)
2061 " 🟣 PROJ-27 slice committed on main as a69db4e
S177 Final state checkpoint after PROJ-27 cross-project work-item links was committed on main (May 11, 9:40 PM)
**Investigated**: Confirmed post-commit working-tree state via `git status --short` and `git log -1 --oneline`. Reviewed earlier in the session: the PROJ-27 spec, the deployed migration SQL, the schema-drift script (`scripts/check-schema-drift/*`), Supabase pooler URI shapes, sandbox quirks (tsx EPERM under `/tmp/tsx-*`, DNS EAI_AGAIN without escalated permissions), and the live `supabase_migrations.schema_migrations` ledger to verify PROJ-27 had landed.

**Learned**: The drift script needs DATABASE_URL set in the calling shell (no dotenv); the runtime app uses the REST credentials in `.env.local` separately. Sandbox calls to Supabase need `sandbox_permissions=require_escalated` to bypass tsx-IPC-socket and DNS restrictions. PROJ-27 deliberately deviates from its architected spec in three places (added `approval_project_id`, relaxed UNIQUE to include `link_type`, consolidated five-trigger design into three with hybrid-approval moved to the API layer) — documented in the updated spec. `npx gitnexus` hangs in this sandbox; the cached `node …/dist/cli/index.js` is the working invocation.

**Completed**: - Live migration `supabase/migrations/20260511210000_proj27_work_item_links.sql` was applied to Supabase project `iqerihohwabyjzkpcujq` and registered in `supabase_migrations.schema_migrations` as version `20260511210000` / name `proj27_work_item_links`.
    - `npm run check:schema-drift` against the live DB reports `✓ 364 SELECT calls verified across 65 tables — 0 drift (80 dynamic calls skipped)` — was 1 drift before the migration apply.
    - `features/PROJ-27-cross-project-links-and-subproject-bridge.md` flipped to status `Implemented` (Last Updated 2026-05-11) with Implementation Notes, QA Test Results, and Deployment sections filled in.
    - Commit `a69db4e feat(proj-27): add cross-project work item links` landed on `main` — 27 files / 4346 insertions / 9 deletions, encompassing: PROJ-27 spec update, migration, 7 new backend routes (POST/DELETE/approve/reject `work-item-links`, per-item `links`, project-lead `links/inbox`, `work-items/search`), `_helpers.ts`, route test, `POST /api/projects` bootstrap-link extension, 7 UI components (parent-project-banner, create-subproject-from-wp-dialog, create-work-item-link-dialog, cross-project-link-badge, delivered-by-banner, work-item-link-row, work-item-links-tab), 3 hooks (use-link-inbox, use-work-item-links, use-work-item-search), link-types lib + drift test, and `src/types/work-item-link.ts`.
    - Quality gates verified pre-commit: focused vitest 41/41 green, `npm run build` clean, `npm run lint` exit 0 (only pre-existing react-hook-form `watch()` warning in `edit-work-item-dialog.tsx:410`), `git diff --check` and `git diff --cached --check` clean, GitNexus detect-changes MEDIUM with two expected WorkItemDetailDrawer flows.
    - Final post-commit working tree: only `AGENTS.md` and `CLAUDE.md` modified — the auto-regenerated GitNexus index headers from `gitnexus analyze` (symbol/edge counts moved 14876→16664 / 22373→25193, plus removal of the legacy "Current Hotfix References" block). Intentionally excluded from the PROJ-27 feature commit.
    - Credential sweep across the tree returns 0 matches for both Supabase Database passwords used during the session and any `DATABASE_URL='postgresql://...` literals.

**Next Steps**: Two small housekeeping options remain visible on the working tree: either stage `AGENTS.md` + `CLAUDE.md` as a separate "chore(gitnexus): refresh index headers" commit, or discard them and let the next `gitnexus analyze` regenerate them. Beyond that, the deployment path is: push `main` to trigger Vercel + CI (the PROJ-42 schema-drift workflow will rerun against the migrated DB), then run a manual end-to-end smoke on the deployed app — Sub-Projekt anlegen → cross-project link → Pending → Approve. Possible future follow-up slices the spec already deferred: PROJ-13 notification emission for pending links, Playwright E2E for the bridge flow, broader vitest coverage on approve/reject/inbox/per-item links routes, 14-day reminder + 30-day auto-expire cron for stale pending links, and writing the missing `scripts/check-schema-drift/README.md` documenting the Supabase URI shape + URL-encoding + sandbox escalation.


Access 469k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
