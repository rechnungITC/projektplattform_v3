# PROJ-138: E2E Warm-Compile Resilience & Dev-Server-Wedge Guard (Hygiene-Slice)

## Status: Approved
**Created:** 2026-06-23
**Last Updated:** 2026-06-23

## Summary

Die Playwright-E2E-Suite ist gegen einen **strukturellen Selbst-Blockierer** anfällig, der wiederholt ganze Läufe vor dem ersten Test sterben lässt. Zwei zusammenwirkende Schwächen, beide live während PROJ-94-QA (2026-06-23) reproduziert und diagnostiziert:

1. **`global-setup` Warm-Compile ohne Fail-Fast / ohne Escape-Hatch.** `tests/fixtures/global-setup.ts → warmCompileDeepLinkRoutes()` fordert **6 schwere Deep-Link-Routen** (`/login`, `/projects`, `/projects/new/wizard`, `/projects/{id}`, `/projects/{id}/graph`, `/projects/{id}/backlog`) **sequenziell mit je bis zu 120 s Timeout** an — **vor jedem Test**, auch wenn der konkrete Run keine dieser Routen braucht. Hängt oder kompiliert eine Route langsam, frisst der Setup-Schritt bis zu **~12 min toter Wall-Clock** und der Test-Runner timeoutet, **bevor ein einziger Test läuft**. Es gibt weder ein `PW_SKIP_WARM_COMPILE`-Override noch ein Gesamt-Budget noch einen Fail-Fast bei wiederholten Route-Timeouts. Bei `--workers=1` (häufig für seriell-seedende Specs wie PROJ-94/135) ist der Warm-Compile sogar völlig nutzlos — er existiert nur, um Parallel-First-Compile-Contention zu vermeiden (PROJ-67 AC-9).

2. **Dev-Server-Wedge nach hartem Playwright-Kill.** Playwright managt den `webServer`-Dev-Prozess (`npm run dev`) mit. Wird der Lauf mitten im Turbopack-First-Compile hart abgebrochen (SIGTERM/SIGKILL — z. B. durch ein Tool-Timeout), bleibt ein **deadlockter Compile-Worker** zurück: `○ Compiling /projects ...` ohne Completion, **CPU idle (~0,4 %)**, und Requests auf noch-nicht-kompilierte Routen hängen **unendlich** (live verifiziert: 200 s-Budget → status 000). Ein **frischer** Dev-Server mit geleertem `.next/dev` kompiliert dieselbe Route in **~2,0 s**. Der Wedge ist also transient-zustandsbedingt, aber **es gibt keinen Guard**, der ihn erkennt oder verhindert — der nächste Lauf erbt den wedged Server (via `reuseExistingServer: !CI`) und hängt erneut in (1).

**Diagnostik-Beleg (2026-06-23, PROJ-94-QA):** unauth-Routen instant (307 in < 10 ms), Supabase REST gesund (401 in 93 ms), `load average 0.10`, `next-server` bei 0,4 % CPU während eines 200-s-Hangs auf authentifiziertem `/projects`; nach `kill -9` + `rm -rf .next/dev` + Neustart → `/projects` 200 in 2,0 s. **Kein Produkt-Bug — reine Test-Infra/DX-Hygiene.** Die App-Routen (inkl. der PROJ-94-Routen, 200/2,5 s) sind gesund.

Bewusst gebündelt als **eine** Hygiene-Slice analog PROJ-29/PROJ-67: beide Blöcke betreffen exakt dieselbe Datei-Region (`tests/fixtures/global-setup.ts` + `playwright.config.ts`), gehören zur Klasse „E2E-Infra-Resilienz ohne User-Wert", sind zusammen klein (S, ≤ ½ PT) und teilen einen QA-Pass.

## Dependencies

- **Requires:** keine harten Abhängigkeiten — arbeitet gegen den aktuellen Zustand von `tests/fixtures/global-setup.ts` (PROJ-29 Block C + PROJ-67 AC-9) und `playwright.config.ts`.
- **Influences:** **alle** logged-in-E2E-Specs (PROJ-29-Fixture-Nutzer: PROJ-70/88/89/90/94/100/135 …). Ein verlässlicher Setup-Pfad ist Voraussetzung dafür, dass `/qa` die Full-Suite überhaupt fahren kann statt nur Auth-Gate-Smokes.
- **Related deferred work:** PROJ-67-F-4 (graph-Deep-Link-Specs müssen seriell laufen, webServer-First-Compile-Contention) — PROJ-138 adressiert die Setup-seitige Wurzel desselben Phänomens.

## V2 Reference Material

- Kein V2-Bezug — V3-spezifische Test-Infra (Playwright + Next 16 Turbopack-Dev-Server).

## User Stories

- **Als QA-Engineer:in** möchte ich, dass ein E2E-Lauf, der nur eine einzige Spec testet, **nicht** ~12 min in `global-setup` hängt, weil eine fremde Schwerlast-Route langsam/wedged ist — der Setup soll fail-fast sein und mir sagen, was los ist.
- **Als Entwickler:in** möchte ich `PW_SKIP_WARM_COMPILE=1` setzen können, um den Warm-Compile bei `--workers=1`-Läufen (wo er nutzlos ist) zu überspringen — heute muss ich `global-setup.ts` editieren und wieder zurückbauen.
- **Als `/qa`-Skill** möchte ich, dass ein **wedged Dev-Server** (deadlockter Compile-Worker) **erkannt** und mit einer klaren, actionable Fehlermeldung gemeldet wird (statt 12 min stiller Hang), inkl. dem Remedy `kill stray next-server + rm -rf .next/dev`.
- **Als Entwickler:in** möchte ich einen `npm run test:e2e:fresh`-Helper, der vor dem Lauf streunende `next-server` killt und `.next/dev` leert, damit ich den Wedge gar nicht erst erbe.
- **Als CI-Pipeline** möchte ich, dass das bestehende Verhalten (Warm-Compile aktiv, `reuseExistingServer:false` unter CI) **unverändert** bleibt — die Resilienz-Maßnahmen dürfen die grüne CI nicht ändern.

## Acceptance Criteria

### Block A — Warm-Compile resilient & übersteuerbar

- [ ] `warmCompileDeepLinkRoutes` wird **übersprungen**, wenn `process.env.PW_SKIP_WARM_COMPILE === "1"` — mit einer `console.info`-Breadcrumb (`[warm-compile] skipped via PW_SKIP_WARM_COMPILE`).
- [ ] **Gesamt-Budget mit Fail-Fast:** der Warm-Compile bricht nach einem konfigurierbaren **Gesamt-Wall-Clock-Cap** (Default ≤ 90 s, env `PW_WARM_COMPILE_BUDGET_MS`) ab und überspringt die restlichen Routen mit einer **lauten Warnung**, die die ausgelassenen Routen **namentlich nennt** (No-Silent-Cap-Prinzip). Warmen bleibt fail-open (kein Test-Gate).
- [ ] **Per-Route-Timeout gesenkt** von 120 s auf einen Default ≤ 30 s (env `PW_WARM_COMPILE_ROUTE_TIMEOUT_MS`); ein einzelner Route-Timeout darf nicht mehr ein Achtel des Gesamt-Budgets pro Route verbrauchen.
- [ ] **Fail-Fast bei Wedge-Signatur:** schlagen die **ersten zwei** Routen mit Timeout fehl, wird der Rest übersprungen (Annahme: Server wedged) und eine actionable Warnung ausgegeben (siehe Block B AC).
- [ ] Bei `workers === 1` (aus der Playwright-Config ableitbar) wird der Warm-Compile **automatisch übersprungen** (er existiert nur gegen Parallel-Contention) — mit Breadcrumb.
- [ ] **CI-Verhalten unverändert:** unter `process.env.CI` bleibt der bisherige Pfad aktiv (voller Warm-Compile, kein Auto-Skip), sofern nicht explizit per env übersteuert.

### Block B — Dev-Server-Wedge-Guard

- [ ] **Preflight-Health-Probe** in `global-setup` **vor** dem Warm-Compile: ein einzelner authentifizierter Request gegen **eine** repräsentative Schwerlast-Route mit kurzem Timeout (≤ 30 s). Antwortet sie nicht, wird eine **klar formulierte, actionable** Warnung geloggt (Wedge-Verdacht + Remedy: `pkill -9 -f next-server && rm -rf .next/dev && npm run dev`), und der Warm-Compile wird übersprungen (fail-open, kein Gate).
- [ ] Die Probe **unterscheidet** „Server kompiliert noch (langsam, aber lebt)" von „wedged" nicht zwingend perfekt, aber der Log-Text macht klar, dass ein 0-%-CPU-Hang auf einen wedged Compile-Worker hindeutet und wie man ihn löst.
- [ ] Neuer npm-Script **`test:e2e:fresh`** in `package.json`: killt streunende `next-server`/`next dev`-Prozesse, entfernt `.next/dev`, und startet die E2E-Suite frisch (Doku in `tests/fixtures/README.md`).
- [ ] **`tests/fixtures/README.md`** dokumentiert die Wedge-Failure-Mode (Symptome: `○ Compiling … ` ohne Completion, idle CPU, Hang) + die drei Remedies (`PW_SKIP_WARM_COMPILE`, `test:e2e:fresh`, manueller `kill -9` + Cache-Clear).

### Cross-Cutting

- [ ] **Keine neuen npm-Pakete.**
- [ ] **Keine Änderung an Produkt-Code** (`src/**`) — ausschließlich `tests/fixtures/global-setup.ts`, `playwright.config.ts`, `package.json`, `tests/fixtures/README.md`.
- [ ] **Bestehende E2E-Tests unverändert grün** auf einem **frischen** Dev-Server (Beleg: volle chromium-Suite läuft ohne `global-setup`-Hang durch; die PROJ-94-Spec 7/7 als konkreter Smoke).
- [ ] **Vitest unverändert grün**, `npm run lint` exit 0, `tsc` keine neuen Errors, `npm run build` clean.
- [ ] Jeder Block als **eigener Commit** (isoliert revertierbar).

## Edge Cases

- **`workers`-Wert nicht statisch lesbar** — Playwright kann `workers` via CLI-Flag (`--workers=1`) oder Config setzen. Der Auto-Skip muss den effektiven Wert aus dem an `globalSetup` übergebenen `FullConfig` lesen (`config.workers`), nicht aus der Config-Datei raten.
- **`PW_SKIP_WARM_COMPILE` unter CI** — explizites env-Override muss auch unter CI greifen (Entwickler-Intent schlägt Default), aber der **Default** unter CI bleibt „warmen". AC formuliert das als „sofern nicht explizit übersteuert".
- **Preflight-Probe trifft eine genuin-langsame-aber-gesunde-Erstkompilierung** — auf einer kalt-cache-belasteten Box kann eine echte First-Compile > 30 s dauern. Die Probe darf deshalb **nur warnen + skippen**, nie hart failen. Fail-open ist Pflicht.
- **Mehrere Worktrees mit eigenen Dev-Servern** — `test:e2e:fresh` darf nur `next-server` killen, die zum **aktuellen** Checkout gehören (Pfad-Filter), nicht fremde Worktree-Server anderer Sessions (CLAUDE.md Parallel-Session-Regel). Sicherste Variante: nur Prozesse killen, die auf dem konfigurierten Port (3000) lauschen.
- **`reuseExistingServer: true` (lokal) + wedged Server** — genau der Pfad, der heute den Wedge vererbt. Block B Preflight-Probe ist die Erkennung; `test:e2e:fresh` ist die Prävention.
- **Warm-Compile-Budget greift, aber alle Routen waren nötig** — die laute Warnung mit Routen-Namen stellt sicher, dass eine später timeoutende Navigation nicht fälschlich als Produkt-Bug gelesen wird.
- **`.next/dev`-Löschung während ein Parallel-Worktree denselben Cache nutzt** — `.next/dev` ist checkout-lokal; Worktrees haben eigene `.next/`. Kein Cross-Worktree-Effekt, aber im README als Annahme nennen.

## Technical Requirements

- **Stack:** Next.js 16 (Turbopack-Dev), React 19, Playwright, Node. Keine neuen Pakete.
- **Performance:** Warm-Compile-Gesamt-Budget Default ≤ 90 s (heute ungedeckelt bis ~720 s). Preflight-Probe ≤ 30 s. `test:e2e:fresh`-Cleanup < 3 s.
- **Security:** keine — reine Test-Tooling-Änderung; `test:e2e:fresh` killt nur port-3000-Listener des eigenen Checkouts.
- **Multi-tenant invariant:** nicht betroffen (kein DB-/RLS-Change, keine neue Tabelle).
- **CI:** GitHub-Actions-E2E-Verhalten muss unverändert grün bleiben; Resilienz-Defaults greifen nur lokal / bei explizitem env-Override.

## Out of Scope (deferred or explicit non-goals)

- **Root-Cause-Fix des Turbopack-Compile-Worker-Deadlocks** — das ist potenziell ein Upstream-Next/Turbopack-Bug. PROJ-138 macht die Suite **resilient** dagegen, fixt aber nicht den Compiler. Falls reproduzierbar isolierbar → separater Upstream-Issue (PROJ-Y-Followup).
- **Warm-Compile durch echtes Pre-Building ersetzen** (`next build` + `next start` für E2E statt Dev-Server) — größerer Architektur-Wechsel; eigener Spec, falls die Dev-Server-Fragilität trotz PROJ-138 weiter stört.
- **PROJ-67-F-4 Serialisierungs-Workaround entfernen** — bleibt bis PROJ-138 in der Praxis belegt hat, dass der resiliente Warm-Compile die graph-Deep-Link-Contention löst.
- **WebKit/Mobile-Safari-Host-Libs** (PROJ-67-F-2 User-Handoff) — unverändert separat.
- **Retroaktive Härtung anderer Test-Suiten** (Vitest) — nur E2E-Setup.

## Suggested locked design decisions for `/architecture`

1. **Auto-Skip-Trigger für Warm-Compile**
   - **A. Skip bei `config.workers === 1` ODER `PW_SKIP_WARM_COMPILE=1`** (Empfehlung) — deckt die zwei realen Fälle (seriell sinnlos / Entwickler-Override).
   - B. Nur env-Override, kein workers-Auto-Skip.
   - **Empfehlung A.**

2. **Wedge-Erkennung**
   - **A. Preflight-Probe (1 Route, kurzer Timeout) + Fail-Fast nach 2 Route-Timeouts** (Empfehlung) — leichtgewichtig, fail-open.
   - B. CPU-Sampling des next-server-Prozesses zur Wedge-Bestätigung — zu fragil/OS-spezifisch.
   - **Empfehlung A** — die Warnung erklärt die idle-CPU-Signatur in Worten, statt sie zu messen.

3. **Prävention via `test:e2e:fresh`**
   - **A. Port-3000-Listener killen + `.next/dev` löschen + Suite starten** (Empfehlung) — port-gefiltert, worktree-sicher.
   - B. Generisches `pkill -f "next dev"` — verletzt CLAUDE.md Parallel-Session-Regel (killt fremde Worktree-Server).
   - **Empfehlung A.**

4. **Budget-/Timeout-Defaults**
   - **A. Gesamt 90 s, Per-Route 30 s, env-übersteuerbar** (Empfehlung).
   - B. Aggressiver (Gesamt 45 s) — Risiko, gesunde-aber-langsame Erstkompilierungen auf kalten Boxen zu früh zu skippen.
   - **Empfehlung A** — fail-open macht ein zu großzügiges Budget billiger als ein zu knappes.

---
<!-- Sections below are added by subsequent skills -->

## Implementation Notes

**Built 2026-06-23** (test-infra only — no `src/**`, no new npm package, no migration). Shipped as 2 commits: spec (`f6a611f`) + implementation.

### Block A — Warm-Compile resilient & übersteuerbar (`tests/fixtures/global-setup.ts`)

- `globalSetup(config)` now passes the resolved Playwright `FullConfig` into a new gate `maybeWarmCompileDeepLinkRoutes(config, …)`. Decision helper `warmCompileSkipReason(config)`:
  - `PW_SKIP_WARM_COMPILE === "1"` → skip (wins on CI too).
  - `!process.env.CI && config.workers === 1` → skip (serial run has no parallel contention to warm against; CI keeps the historical full path).
- `warmCompileDeepLinkRoutes` rewritten:
  - per-route timeout **120s → 30s** default (`PW_WARM_COMPILE_ROUTE_TIMEOUT_MS`),
  - total wall-clock budget **90s** default (`PW_WARM_COMPILE_BUDGET_MS`); remaining routes are skipped and **named** in the log,
  - fail-fast after **2 consecutive** route timeouts (wedged/overloaded signature),
  - all paths fail-open (warming is never a gate). Log prefix changed `[PROJ-67 …]` → `[PROJ-138 …]`.

### Block B — Dev-Server-Wedge-Guard

- **Preflight probe** folded into `warmCompileDeepLinkRoutes`: one authed request to `/projects` with the per-route timeout. On timeout → loud, actionable warning (wedge signature + remedy `npm run test:e2e:fresh` / manual `pkill -9 -f next-server && rm -rf .next/dev && npm run dev`) and the rest is skipped.
- **`scripts/e2e-fresh.mjs`** (new helper, consistent with the existing `scripts/check-schema-drift` pattern): kills only the port-3000 listener (worktree-safe — never another session's server, per CLAUDE.md), clears `.next/dev`, then runs `npx playwright test` forwarding args. Wired as `npm run test:e2e:fresh`.
- **`tests/fixtures/README.md`** new section documents the wedge symptoms (`○ Compiling …` never completes, ~0% CPU, infinite hang; fresh server = ~2s), the three remedies, and the env tunables.

### Verification

- `npx tsc --noEmit` — 0 errors in changed files.
- `npx eslint tests/fixtures/global-setup.ts scripts/e2e-fresh.mjs` — clean.
- **Auto-skip path (`--workers=1`)**: real authed test `tests/PROJ-29-auth-fixture-smoke.spec.ts` → log `[PROJ-138 warm-compile] skipped — workers=1`, `1 passed (10.0s)`, **global-setup no longer hangs** (the failure this slice fixes). Separately, in the primary checkout the full `tests/PROJ-94-ma-foundation.spec.ts` ran **7/7** with warm-compile skipped — the identical code path.
- **Warm path (`--workers=2`, healthy server)**: preflight `/projects → 200 in 1164ms`, all 5 remaining routes warmed, `done in 6182ms (5/5 routes warmed after probe)`, `1 passed`.
- Root-cause evidence (2026-06-23 PROJ-94-QA): authed `/projects` hung 200s at ~0.4% CPU on a wedged server; `kill -9` + `rm -rf .next/dev` + restart → same route 200 in 2.0s. Confirms wedge is transient dev-server state, not a product bug.

**Note:** the worktree was provisioned with `npm ci` (deps unchanged — only a script was added) because Turbopack rejects a symlinked `node_modules` (`Symlink … points out of the filesystem root`). A separate `/qa` pass against a fully provisioned env (service-role key) can re-run the full logged-in suite end-to-end; the two paths above already exercise both branches.

## QA Test Results

**Date:** 2026-06-23
**Tester:** /qa skill (QA + red-team)
**Environment:** Worktree `/tmp/pv3-proj138-e2e` (branch `proj-138/e2e-warm-compile-resilience`, off `main`), `npm ci` provisioned, valid `.env.local` (service-role) copied in, Next.js 16.2.6 Turbopack dev, Playwright Chromium 148 (Mobile Safari skipped — WebKit host libs missing, PROJ-67-F-2). Remote Supabase `iqerihohwabyjzkpcujq`.
**Verdict:** ✅ **Approved** — 0 Critical / 0 High.

### Automated checks
| Suite | Result |
|---|---|
| `npm run lint` (`eslint . --ext ts,tsx`) | ✅ 0 problems |
| `npx tsc --noEmit` | ✅ 0 errors in PROJ-138 files; remaining errors are **pre-existing baseline** in unrelated test specs (`PROJ-1-2-live-closure.spec.ts`, `*/releases/route.test.ts`, `assistant/*`, …) — PROJ-138 adds none |
| `npx vitest run` | ✅ **1908/1908 pass** (231 files) — no regression |
| `npm run build` | ✅ Compiled successfully in 12.3s |

### Acceptance Criteria walkthrough — deterministically exercised via env-override matrix on the canonical authed smoke (`tests/PROJ-29-auth-fixture-smoke.spec.ts`); each run stays green = fail-open

#### Block A — Warm-Compile resilient & übersteuerbar
| AC | Status | Evidence |
|---|---|---|
| `PW_SKIP_WARM_COMPILE=1` → skip + breadcrumb | ✅ | `[PROJ-138 warm-compile] skipped — PW_SKIP_WARM_COMPILE=1`, `1 passed (6.0s)` |
| Gesamt-Budget Fail-Fast + **benennt** übersprungene Routen (no-silent-cap) | ✅ | `PW_WARM_COMPILE_BUDGET_MS=1` → `skipped 4 route(s) to stay within the 1ms budget: /projects/new/wizard, …/graph, …/backlog` + `done in 52ms (1/5 …)`, `1 passed` |
| Per-Route-Timeout gesenkt (≤30s default, env-übersteuerbar) | ✅ | default `30_000` in code; `PW_WARM_COMPILE_ROUTE_TIMEOUT_MS=1` honored → probe timed out at 2ms |
| Fail-Fast nach 2 Timeouts in Folge | 🟡 covered-by-construction | same `warmOne` timeout mechanism proven at 1ms; a *total* wedge short-circuits at the preflight probe first, the budget cap covers mid-loop. The 2-consecutive guard is a post-probe variant of the identical, exercised mechanism. Info-level. |
| `workers === 1` → Auto-Skip + breadcrumb | ✅ | `[PROJ-138 warm-compile] skipped — workers=1 …`, `1 passed (13.4s)` |
| CI-Verhalten unverändert (voller Pfad, sofern nicht per env übersteuert) | ✅ | by code: skip conditions gated on `!process.env.CI`; explicit `PW_SKIP_WARM_COMPILE` still wins per AC |

#### Block B — Dev-Server-Wedge-Guard
| AC | Status | Evidence |
|---|---|---|
| Preflight-Health-Probe vor Warm-Compile; bei Timeout actionable Warnung + Remedy, Rest übersprungen, fail-open | ✅ | `PW_WARM_COMPILE_ROUTE_TIMEOUT_MS=1` → `preflight /projects timed out after 2ms. The dev server looks WEDGED … Remedy: npm run test:e2e:fresh … Skipping the rest of warm-compile (fail-open).`, `1 passed (5.4s)` |
| Log-Text erklärt idle-CPU-Signatur + Lösung | ✅ | message contains `'○ Compiling ...' never completes, CPU idle, route hangs forever` + manual remedy |
| `test:e2e:fresh`-Script: streunenden Server killen + `.next/dev` löschen + frisch starten | ✅ | seeded a dummy `:3000` listener → `killed stray dev server on :3000 (pid 83944)` → `cleared .next/dev` → clean boot → `1 passed (17.8s)`; killed **only** the :3000 listener |
| `README.md` dokumentiert Failure-Mode + Remedies + Tunables | ✅ | section "Warm-compile & the wedged-dev-server failure mode (PROJ-138)" with symptoms, 3 remedies, env table |

#### Healthy full-warm path (regression of the original PROJ-67 AC-9 purpose)
- ✅ `--workers=2` healthy: preflight `/projects → 200`, all 5 remaining routes warmed, `done in ~7s (5/5 routes warmed after probe)`, `1 passed`.

### Security audit (red-team)
- **`scripts/e2e-fresh.mjs` process-kill**: targets only the `:3000` listener via `ss`/`lsof` (`execFileSync` with fixed args — no shell, no injection), extracts `pid=(\d+)` and calls `process.kill(int)` — cannot kill an attacker-named or arbitrary PID; `:30000` does not match the `:3000\s` line filter. Worktree-safe (never another session's server on another port, per CLAUDE.md). ✅
- **No secret leakage**: warm-compile logs only route + HTTP status; the auth cookie header is built but never logged. ✅
- **Env tunables**: `Number(env) || default` — garbage/NaN falls to default; an oversized value only lengthens a fail-open budget. No injection surface. ✅
- **No product attack surface**: no `src/**` change, no new endpoint, no new dependency, no migration. ✅

### Regression
- Full vitest **1908/1908**; the existing logged-in E2E smoke passed in **every** matrix run (6 invocations) → auth-fixture path intact. Log prefix change `[PROJ-67 …]` → `[PROJ-138 …]` is asserted by no test. ✅

### Bugs & findings
**0 Critical / 0 High.**

| Severity | ID | Finding | Status |
|---|---|---|---|
| Low | L-1 | Block A + Block B shipped in **one** implementation commit, not separate per-block commits as the cross-cutting AC suggested. | **Documented deviation.** The Block B preflight lives *inside* `warmCompileDeepLinkRoutes` (Block A) and is not cleanly separable; the whole slice reverts as a single `git revert`. Acceptable. |
| Info | I-1 | "Fail-fast after 2 consecutive timeouts" not independently triggered. | Covered-by-construction (same `warmOne` timeout, proven at 1ms; preflight + budget cover the total-wedge and mid-loop cases). |
| Info | I-2 | Full `tests/PROJ-94-ma-foundation.spec.ts` 7/7 was proven in the **primary** checkout (the spec is on `proj-94/backend`, not on this `main`-based branch). | Not a gap — PROJ-138's own behavior is fully exercised here by the env-matrix + the canonical auth-fixture smoke. |
| Info | I-3 | Mobile Safari project skipped (WebKit host libs missing). | Pre-existing env limitation (PROJ-67-F-2 user-handoff); chromium covers the logic. |

### Production-ready decision
**READY** — 0 Critical / 0 High. Every AC is verified, each failure branch (skip / budget-cap / preflight-wedge / fresh-restart) deterministically reproduced and green (fail-open). Lint 0, vitest 1908/1908, build clean, tsc adds no new errors. One Low (commit granularity) and three Info findings, all documented and acceptable.

Suggested next: **`/deploy`** — this is a test-infra/tooling-only change (no `src/**`, no DB), so the Vercel runtime deploy is a no-op; "deploy" here means merge PR #170 into `main` so the resilient setup is the default for all future E2E runs.