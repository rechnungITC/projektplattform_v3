# PROJ-74: Supply-Chain-Audit-CI

## Status: Approved
**Created:** 2026-06-04
**Last Updated:** 2026-06-07

## Summary
Supply-chain hardening follow-up from PROJ-70 gamma/delta. Adds a production-dependency audit workflow for pull requests and main pushes, wires a Sentry `beforeSend` scrubber for parser output, and documents the Snyk token handoff needed before branch protection can make the Snyk job fully required.

## Dependencies
- Requires: PROJ-42 (GitHub Actions required-check pattern)
- Requires: PROJ-70 gamma/delta parser hardening context
- Compatible with: PROJ-67 dependency-audit hardening

## Acceptance Criteria

- [x] `npm audit --omit=dev --audit-level=high` runs in CI on pull requests and pushes to `main`.
- [x] The production audit command is exposed as `npm run audit:prod`.
- [x] Snyk scan job exists in CI and runs `npx snyk test --severity-threshold=high --fail-on=all` when `SNYK_TOKEN` is configured.
- [x] Missing `SNYK_TOKEN` is surfaced as a GitHub Actions warning with branch-protection handoff text instead of silently pretending Snyk ran.
- [x] Sentry `beforeSend` strips parser excerpts and raw parser-output fields such as `content_excerpt`, `*_excerpt`, `parser_output`, `rawParserOutput`, `source_metadata`, and PROJ-70 email metadata.
- [x] Scrubber is shared across server, edge, and client Sentry entrypoints.
- [x] Unit tests cover key detection, recursive scrubbing, and cyclic event objects.

## Out of Scope

- Enforcing GitHub branch-protection settings. This must be configured in repository settings after the workflow lands.
- Snyk organization/project policy tuning beyond high-severity blocking.
- Automatically applying `npm audit fix`.

## Implementation Notes

- Added `.github/workflows/supply-chain-audit.yml`.
- Added `audit:prod` package script.
- Added `src/lib/sentry-config.ts` and `src/lib/sentry-config.test.ts`.
- Wired `beforeSend` in `sentry.server.config.ts`, `sentry.edge.config.ts`, and `instrumentation-client.ts`.

## QA Test Results

### Local QA Pass — 2026-06-07

- `npm run test -- src/lib/sentry-config.test.ts` — PASS, 3/3 tests.
- `npm run lint` — PASS.
- `npm run audit:prod` — PASS as a high/critical gate. Current audit output still reports the pre-existing 2 moderate Next/PostCSS findings, but the PROJ-74 gate intentionally fails only at high/critical severity.
- `npm run build` — PASS, Next.js production build and TypeScript successful.

### Remaining Handoff

- Add `SNYK_TOKEN` as a repository secret.
- Mark both workflow jobs as required checks in GitHub branch protection after the workflow has run once:
  - `npm audit production dependencies`
  - `Snyk production dependency scan`

## Deployment

Pending PR/merge. After merge, configure branch protection to require:

- `npm audit production dependencies`
- `Snyk production dependency scan`
