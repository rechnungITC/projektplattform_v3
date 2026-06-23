# PROJ-138: E2E Warm-Compile Resilience & Dev-Server-Wedge Guard (Hygiene-Slice)

## Status: Planned
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