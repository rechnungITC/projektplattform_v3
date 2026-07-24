---
id: PROJ-140
title: "Supply-Chain-Advisory-Remediation (npm-audit-Baseline zurück auf grün)"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: High
priority_source: "Must"
labels: ["hygiene", "supply-chain", "security", "ci"]
dependencies: []
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Supply-Chain-Advisory-Remediation — npm-audit Required-Check zurück auf grün"
---

# PROJ-140: Supply-Chain-Advisory-Remediation

## Status: Deployed (2026-07-23)
**Deployed:** 2026-07-23 — PR #248 → main (`5c04f1a`), Tag `v2.16.0-PROJ-140`. Alle Required-Checks grün (npm audit + Snyk exit 0, schema-drift, migration-naming, Vercel). Vercel auto-deploy von main (Runtime-Dep-Bump `next@16.2.11` + `sharp@0.35.3` live). Entblockt PROJ-103.
**Created:** 2026-07-22
**Origin:** PROJ-74 `npm audit --omit=dev --audit-level=high` Required-Check über Nacht rot; blockierte den ansonsten fertigen PROJ-103-Merge. Portfolioweit, kein Feature-Bug.

> **Hygiene-Slice** analog PROJ-29/42/74. Kein neues Feature, keine Migration, keine `src/**`-Logikänderung — nur `package.json`/`package-lock.json` + ggf. Regressionstests. CIA-pflichtig (Dep-Änderungen mit Security-Implikation über zwei deployte Features).

## Problem

Am 2026-07-22 meldet `npm audit --omit=dev` **8 Vulnerabilities (3 moderate, 5 high)** in 5 transitiven/direkten Paketen. Der PROJ-74-Required-Check (`--audit-level=high`) ist damit rot und blockiert per Branch-Protection jeden Auto-Merge auf `main`.

`npm audit fix --force` ist **kein gangbarer Weg**: es schlägt sicherheits-absurde Breaking-Downgrades vor (`next` 16 → 14.2.35 wegen `sharp`; `@modelcontextprotocol/sdk` 1.29 → 1.24.3 wegen `@hono/node-server`). Die Remediation muss gezielt sein — `overrides` (Parent-Pin nach oben) + Patch-Bumps statt Blanket-Force.

### Advisory-Inventar (Stand 2026-07-22)

| # | Paket | Sev | Advisory | Herkunft | Feature-Kontext |
|---|-------|-----|----------|----------|-----------------|
| 1 | `@hono/node-server <2.0.5` | moderate | GHSA-frvp-7c67-39w9 — serve-static Path-Traversal (**Windows-only**, `%5C`) | transitiv via `@modelcontextprotocol/sdk` | PROJ-48 MCP-Bridge (Vercel/Linux) |
| 2 | `fast-uri 3.0.0-3.1.3` | **high** ×2 | GHSA-v2hh-gcrm-f6hx, GHSA-4c8g-83qw-93j6 — host confusion | transitiv via `ajv` (MCP-SDK + Sentry/webpack) | build/runtime |
| 3 | `hono 4.0.0-4.12.26` | moderate ×3 | GHSA-xgm2-5f3f-mvvc, GHSA-hvrm-45r6-mjfj, GHSA-w62v-xxxg-mg59 | transitiv via MCP-SDK | kein hono/jsx-Nutzung im Code |
| 4 | `linkify-it <=5.0.1` | **high** | GHSA-v245-v573-v5vm — ReDoS via `mailto:`-Validator | transitiv via `mailparser` | **PROJ-70 .eml-Upload (realer Angreifer-Vektor)** |
| 5 | `sharp <0.35.0` | **high** | GHSA-f88m-g3jw-g9cj — geerbte libvips-CVEs | transitiv via `next` | Next.js Image-Optimization |

## User Story

**Als** Plattform-Betreiber
**möchte ich**, dass die deklarierten Supply-Chain-Advisories gezielt remediiert werden (ohne die deployten Features PROJ-48/70/Next-Image zu brechen),
**damit** der PROJ-74-Required-Check wieder grün ist und Feature-Merges nicht durch portfolioweite Dep-Advisories blockiert werden.

## Acceptance Criteria

- **AC-140.1** — `npm audit --omit=dev --audit-level=high` läuft auf `main` wieder **grün** (exit 0), d.h. 0 offene HIGH/CRITICAL in Prod-Deps. Moderate werden geschlossen wo non-breaking; ein bewusst zurückgestellter Rest ist im Spec dokumentiert und begründet (Risk-Accept nur mit CIA-Zustimmung).
- **AC-140.2** — Kein Breaking-Downgrade von `next` oder `@modelcontextprotocol/sdk`. Bevorzugt `overrides`/Patch-Bumps statt `audit fix --force`.
- **AC-140.3** — PROJ-70 `.eml`/`.msg`-Parsing regressionsgetestet (bestehende Parser-Tests grün + gezielter Live-/Unit-Nachweis, dass `mailparser`-Bump nichts bricht).
- **AC-140.4** — PROJ-48 MCP-Bridge regressionsgetestet (Route-/SDK-Round-Trip grün nach etwaigem `@hono/node-server`-Override).
- **AC-140.5** — Gates grün: `npm run lint` 0, `tsc` 0 neu (Baseline 14), `npm run build` clean, volle vitest-Suite grün.
- **AC-140.6** — CIA-Bewertung der Strategie dokumentiert (Findings pro Position, Exposure-Einschätzung, gewählte Maßnahme) in den Implementation Notes.

## Out of Scope

- Automatischer Dep-Update-Bot (Renovate/Dependabot) — separater Vorschlag falls gewünscht.
- Major-Version-Upgrades ohne Advisory-Bezug.

## Implementation Notes

### CIA-Bewertung (2026-07-23)
Der CIA-Agent bewertete alle 5 Positionen live und korrigierte die Vorabstrategie an 3 Punkten:
1. **Nur die 5 HIGHs blocken** den Required-Check (`--audit-level=high`, verifiziert in `.github/workflows/supply-chain-audit.yml`). Die 2 moderaten Positionen sind Hygiene-Kür.
2. **`@hono/node-server`-Override auf `>=2.0.5` verworfen** — MCP-SDK 1.29.0 deklariert `@hono/node-server: ^1.19.9` (installiert 1.19.14). Ein Major-Bump außerhalb der Range für eine **Windows-only, ungenutzte serve-static**-Lücke (Deploy = Vercel/Linux; MCP-Route nutzt custom `OneShotTransport`, kein serve-static) ist reines Bruchrisiko ohne Nutzen → **dokumentierter Risk-Accept** stattdessen.
3. **`sharp` muss via Override** gefixt werden — der npm-audit-Job hat keinen Ignore/Allowlist-Mechanismus, Risk-Accept technisch unmöglich.

### Umgesetzte Remediation (CIA „saubere Variante")
`package.json`:
- **`dependencies.mailparser` `3.9.9` → `3.9.14`** (direkter Patch-Bump) — schließt **HIGH** `linkify-it` GHSA-v245-v573-v5vm (ReDoS via `mailto:`); zieht `linkify-it@5.0.2` (>5.0.1). **Einzige real-exponierte Position** (PROJ-70 `.eml`-Upload = angreifer-kontrollierter Text).
- **`overrides.fast-uri: "^3.1.4"`** — schließt **HIGH ×2** GHSA-v2hh-gcrm-f6hx + GHSA-4c8g-83qw-93j6 (host confusion); in-range von ajv `^3.0.1`. Installiert `3.1.4`.
- **`overrides.sharp: "^0.35.0"`** — schließt **HIGH** GHSA-f88m-g3jw-g9cj (geerbte libvips-CVEs); erzwingt gepatchte Version außerhalb Next-Optional-Range (`^0.34.5`, daher wollte `--force` Next downgraden). Installiert `0.35.3`. Exposure nahe null (Next-Image auf Vercel plattform-optimiert, kein direkter `sharp`-Import).
- **`overrides.hono: "^4.12.31"`** — schließt 3 moderate (hono/jsx, cx()-XSS, gateway-header-dedup); in-range MCP-SDK `^4.11.4`, alle 3 Advisories betreffen ungenutzte Pfade. Installiert `4.12.31`.
- **`dependencies.next` `^16.2.6` → `^16.2.11`** — beim Neu-Auditieren (nach sharp-Override) tauchten Next.js-eigene **HIGH**-Advisories auf, die vorher vom sharp-Pfad überdeckt waren (Middleware/Proxy-Bypass, Server-Action-DoS/SSRF, Cache-Confusion, Image-Opt-SVG-DoS u.a. — GHSA-6gpp-xcg3-4w24 / m99w-x7hq-7vfj / 89xv-2m56-2m9x / … ). In-range Patch-Bump 16.2.6 → 16.2.11 (latest 16.2.x), non-breaking. Installiert `16.2.11`.

### Bewusster Risk-Accept
- **`@hono/node-server <2.0.5` (moderate, GHSA-frvp-7c67-39w9)** — serve-static Path-Traversal **nur unter Windows** via `%5C`. Deploy = Vercel/Linux; die MCP-Bridge (PROJ-48, `src/app/api/mcp/route.ts`) nutzt `buildMcpServer` + custom `OneShotTransport`, **kein `@hono/node-server`/serve-static** (per grep verifiziert). Kein Override, weil das einen riskanten Major-Bump in ein transitives MCP-SDK-Paket zwingen würde. **Revisit, sobald MCP-SDK selbst auf `@hono/node-server` 2.x zieht.** `npm audit --omit=dev` zeigt danach weiter genau 2 moderate (dieses + der MCP-SDK-Wrapper) — der Required-Check (`--audit-level=high`) bleibt grün.

### Verifikation (alle Gates grün)
- **`npm run audit:prod` exit 0** — 0 HIGH/CRITICAL in Prod-Deps; verbleibend nur die 2 dokumentierten moderate (AC-140.1 ✅, AC-140.2 ✅ — kein Next-/MCP-SDK-Downgrade).
- **PROJ-70 `.eml`/`.msg`-Regression** — `vitest src/lib/context-ingestion/` 14 eml-parser-Cases + Gesamt-context-ingestion-Suite grün mit **echtem** (nicht gemocktem) `mailparser@3.9.14`/`linkify-it@5.0.2` (AC-140.3 ✅).
- **PROJ-48 MCP-Regression** — mcp-vitest-Suite grün nach `hono`-Override (AC-140.4 ✅).
- **Next-Image / sharp** — `npm run build` clean mit `sharp@0.35.3` + `next@16.2.11`.
- **Global** — lint 0, tsc 14 baseline/0 neu, `npm run build` clean, **volle vitest-Suite 2314/2314** (AC-140.5 ✅).
- CIA-Bewertung dokumentiert (AC-140.6 ✅).

Kein `src/**`-Logik- oder Migrations-Change → kein Live-RPC-Smoke, keine Playwright-Vollsuite zwingend (Gate = Build + Audit + Dep-Regression).
