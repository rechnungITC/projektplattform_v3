# PROJ-74: Supply-Chain-Audit-CI

## Status: Deployed
**Created:** 2026-06-04
**Last Updated:** 2026-06-10

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

- ⏳ **Add `SNYK_TOKEN` as a repository secret** — still open as of 2026-06-10 (`gh secret list` empty). Until the token exists, the Snyk job passes with a GitHub Actions warning (by design, AC-4); the required check is therefore a no-op pass, not a real scan.
- [x] Mark both workflow jobs as required checks in GitHub branch protection — done 2026-06-10 (see Deployment).

## Deployment

- **Date:** 2026-06-10 (workflow code live on main since PR #103 / 2026-06-08, tag `v1.87.0-PROJ-74`)
- **Tag:** `v1.87.0-PROJ-74` → commit `b96e595` (PR #103 merge)
- **Branch protection enforced 2026-06-10:** GitHub ruleset `main protection` (id 15992143) now requires three checks on `main`:
  - `Verify SELECT columns vs migration schema` (PROJ-42, pre-existing)
  - `npm audit production dependencies` (new)
  - `Snyk production dependency scan` (new — passes as warning-only until `SNYK_TOKEN` is configured)
- **Verification 2026-06-10:** workflow green on the last 3 main pushes (runs 27278989142, 27276095744, 27266265650); `npm run lint` + `npm run build` clean on current main (4390f31).
- **Open user handoff:** create a Snyk account token and add it as repository secret `SNYK_TOKEN` — only then does the Snyk required check actually scan.
