# Open, Deferred, and Partial Feature Status

**Last Updated:** 2026-06-07

This file is the cross-feature status register referenced by `features/INDEX.md`. It keeps follow-ups, MVP partials, and bookkeeping conflicts visible without overloading individual feature rows.

## Planned Followups

| PROJ | Status | Current reconciliation |
|---|---|---|
| PROJ-71 | Planned (Followup) | OCR for scan PDFs from PROJ-70-γ Y-1. Still pilot-feedback-driven; PROJ-80 RAG should only surface extraction failures in V1. |
| PROJ-72 | Planned (Followup) | Streaming/chunked parse or worker queue for upload scaling. Still real-load-driven; not a blocker for current 25 MB parser flow. |
| PROJ-73 | Planned (Followup, reduced) | More parser formats. MD/TXT and EML/MSG are now covered by PROJ-70 γ/δ for kickoff ingestion; remaining practical gap is PPTX/XLSX and later DMS/RAG formats. |
| PROJ-74 | Approved | Supply-chain audit CI slice selected as the independent item: workflow + `npm run audit:prod` + Sentry parser-output scrubber implemented and locally verified; remaining handoff is `SNYK_TOKEN` + branch-protection required-check setup after merge. |
| PROJ-75 | Planned (Followup) | Class-3 re-classification after parse/full text. Still open; PROJ-84 audit tagging does not replace this privacy guard. |

## New Feature Series

The new Skill/DMS/RAG feature specs originally collided with reserved PROJ-71..75 IDs. They are now reconciled as PROJ-76..84.

| PROJ | Feature | Dependency assessment |
|---|---|---|
| PROJ-76 | Skill-Framework Foundation | Independently buildable. Requires only deployed PROJ-2, PROJ-4, and PROJ-10. Best first product slice from the new series. |
| PROJ-77 | Skill-Customizing | Not independent. Requires PROJ-76 and PROJ-79 because knowledge links target DMS nodes. |
| PROJ-78 | Skill-Projektzuordnung | Not independent. Requires PROJ-76; can follow as a smaller wizard/sidebar slice. |
| PROJ-79 | DMS Foundation | Independently buildable but larger than PROJ-76. Requires only deployed PROJ-2, PROJ-4, and PROJ-10; should reuse PROJ-70 parser/storage hardening without merging with `context_sources`. |
| PROJ-80 | RAG-Indexierung + Quintessenz | Not independent. Requires PROJ-79 and PROJ-76; must reuse PROJ-70 `pdfjs-dist`/`mammoth` hardening decisions. |
| PROJ-81 | Skill-to-RAG-Scope | Not independent. Requires PROJ-76/77/78/79/80. |
| PROJ-82 | Skill-driven AI Proposals | Not independent. Requires PROJ-76/77/78/80/81 plus PROJ-12; persistence target is `ki_suggestions`, not an `ai_proposals` table. |
| PROJ-83 | Task-driven Content Generation | Not independent. Requires PROJ-76..82 and DMS persistence from PROJ-79. |
| PROJ-84 | KI-Kennzeichnung + erweiterter Audit-Trail | Cross-cutting. Should follow at least PROJ-80/82/83 emitters; complements PROJ-12 `ki_provenance` instead of replacing it. |

## Deployed With Deferreds Or Partial Scope

| PROJ | Status note |
|---|---|
| PROJ-1 | Deployed, partial: Domain-Claim UI not browser-tested; invite/role management depends on live service-role/multi-user verification. |
| PROJ-2 | Deployed, partial: live hard-delete was previously untestable; optimistic concurrency remains deferred. |
| PROJ-7 | Deployed MVP slice: WIP limits, velocity/burndown, resource swimlanes, phase gates, and tenant health thresholds remain deferred or assigned elsewhere. |
| PROJ-14 | Deployed plumbing slice: real adapters are separate followups PROJ-47/48/49/50. |
| PROJ-18 | Deployed: template UI, platform-default tag rename, insert provenance shape, and phase-close UX refinements remain deferred. |
| PROJ-23 | Deployed, partial: server-side viewport default not implemented; mobile handled client-side. |
| PROJ-25/25b | Deployed: backlog-sprint DnD closed by 25b; Gantt followups such as auto-schedule, touch polish, realtime cursors, undo, and critical-path math remain deferred. |
| PROJ-28 | Deployed: global redirect kill-switch + structured Sentry breadcrumb shipped 2026-06-07; tenant-scoped staged-rollout flag and full logged-in Playwright matrix remain deferred. |
| PROJ-37..41 | Deployed assistant core MVP: wake-word, external speech providers, always-listening/autonomous workflows, and full cross-browser voice validation remain deferred. |
| PROJ-42 | Deployed α: INSERT/UPDATE/Zod drift and shadow-vs-prod drift remain deferred. |
| PROJ-44 | Deployed α+β foundation: γ classifier deferred; δ/ε superseded by PROJ-70. |
| PROJ-53 | Deployed α+β: memo split, custom calendars, multi-locale, PNG/PDF export intentionally deferred. |
| PROJ-54 | Deployed α+β+γ: versioned `resource_rate_overrides` table deferred. |
| PROJ-62 | Deployed: module-active API gate, critical move-confirm, UX polish, and E2E still open. |
| PROJ-63 | Deployed: intentionally narrow CSV importer; dynamic mapping, XLSX, Entra-ID sync, free-form detection, vendor import, and incremental re-imports deferred. |

## Bookkeeping Conflicts

| PROJ | Resolution |
|---|---|
| PROJ-36 | Do not count as open: Index/spec header say β was absorbed by PROJ-9-R2; spec bookkeeping cleanup added 2026-06-07. |
| PROJ-34 | Do not count as open: old QA partial blocks are historical; Index/spec header say status closure including F-9 audit-restore is live; spec bookkeeping note added 2026-06-07. |
| PROJ-64/65 | Do not count as open: old partial blocks were later closed. |
| PROJ-71..75 | Reserved for PROJ-70 followups; new Skill/DMS/RAG specs moved to PROJ-76..84. |
