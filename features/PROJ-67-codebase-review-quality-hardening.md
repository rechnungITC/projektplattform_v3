# PROJ-67 - Codebase Review Quality Hardening

## Status: Deployed — 2026-06-15 (Tag `v1.91.0-PROJ-67`). 9/9 ACs PASS, L-1 behoben. Slice-Code war bereits via PRs #128/#131/#133/#135 live; Deploy = Closure + L-1-Fix + Tag.

## Deployment

- **Date:** 2026-06-15 (Closure; Hardening-Code lief seit den Einzel-PRs #128/#131/#133/#135 live, da reine Test-/Tooling-/Config-Ebene ohne separaten Runtime-Deploy)
- **Tag:** `v1.91.0-PROJ-67`
- **Enthält:** L-1-Fix (Shadow-DB Loopback-Bind) + die kumulierten F1–F9-Closures
- **Kein Runtime-Deploy nötig:** PROJ-67 ändert ausschließlich Test-Infrastruktur (`playwright.config.ts`, `global-setup.ts`, Visual-Baseline), Dev-Tooling (`scripts/check-schema-drift/local-shadow.sh`) und Doku — kein `src/`-Prod-Pfad, keine Migration. Vercel-Prod ist unberührt.
- **Offene User-Handoffs (kein Bug, dokumentiert):** `sudo npx playwright install-deps webkit` (F2, Mobile-Safari-E2E); Docker-Desktop-WSL-Integration (F6, Schema-Drift-Happy-Path).
- **Schluss-QA 2026-06-12:** 9/9 ACs PASS, vitest 1799/1799, chromium-E2E 90/0 parallel, 0 Critical/High. Siehe „QA Test Results — Schlussabnahme".

## Implementation Notes — AC-9/F9 (2026-06-12)

- **F9/AC-9 — Graph-Deep-Link-Spec-Stabilität:** Umgesetzt über die im Plan bevorzugte Variante **Warm-Compile** (kein `test.describe.configure({mode:'serial'})` — das hätte die Test-Semantik geändert: Folge-Tests würden bei einem Fail geskippt). Neue Funktion `warmCompileDeepLinkRoutes` in `tests/fixtures/global-setup.ts`: nach dem Auth-Setup werden 6 schwere Routen (`/login`, `/projects`, `/projects/new/wizard`, Project-Room, `/graph`, `/backlog`) einmal **sequenziell authentifiziert** angefordert, bevor parallele Worker starten — der Next-Dev-Server kompiliert on-first-hit, die First-Compile-Contention entfällt strukturell. Empirisch bestätigt: webServer läuft bereits, wenn globalSetup ausgeführt wird (Warm-up ~8,8s, alle Routen 200/307). Fail-open: Server nicht erreichbar → Skip mit Log, nie ein Gate.
- **Verifiziert:** 5 Deep-Link-Specs (PROJ-58-graph, PROJ-58-graph-3d, PROJ-65-epsilon1, PROJ-70-epsilon-wizard, PROJ-70-delta-dnd) mit Default-Parallel-Workern 14/14 grün; volle chromium-Suite **90 passed / 5 skipped / 0 failed** in 24s — ohne globalen `workers: 1`-Zwang.

## Implementation Notes — F7 final (2026-06-12, ersetzt die Deviation vom selben Tag)

- **F7/AC-7 — AUFGELÖST durch Versions-Upgrade, keine Deviation mehr.** Beim Vorbereiten des Upstream-Issues stellte sich heraus: die Root-Cause (lazy-FTS-Build vs. hardcoded read-only Query-Connections) war upstream **bereits am 2026-05-10 in gitnexus v1.6.4 gefixt** (Issues #1287, #1403; Segfault-Report #1160 ebenfalls closed). Unsere Umgebung hing auf einem **npx-Cache-Pin auf 1.6.3**.
  - **Fix:** `GITNEXUS_LBUG_EXTENSION_INSTALL=auto npx gitnexus@1.6.7 analyze --repair-fts` (einmalig; installiert die LadybugDB-FTS-Extension und baut die Indexe). Seither baut `analyze` die FTS-Indexe selbst — kein Repair nach Re-Index mehr nötig.
  - **Verifiziert:** `npx gitnexus@1.6.7 query "tenant ai provider"` → **0 ReadOnly-Warnungen, 27 Prozess-Treffer** (u. a. `POST → StubProvider`, `POST → IsExternalAIBlocked`); FTS übersteht erneuten `analyze`. **AC-7 im vollen Wortlaut erfüllt.**
  - **Aufgeräumt:** Das in PR #131 gelieferte Workaround-Skript `scripts/gitnexus-build-fts.mjs` + `npm run gitnexus:fix-fts` ist durch das Upgrade obsolet und wieder entfernt (Historie im Git). Die dort dokumentierte Segfault-Analyse bleibt als Diagnose-Protokoll im PR-#131-Verlauf erhalten — sie betraf die 1.6.3-Codebasis.
  - **Umgebungs-Hinweis:** Bare `npx gitnexus` (ohne Versionspin) ist auf diesem Host unzuverlässig (npm-11-Arborist-Fehler `Cannot destructure property 'package'`, teils stale 1.6.3-Auflösung trotz geleertem Cache). **Empfohlene Invocation: `npx gitnexus@latest <cmd>` bzw. explizit `npx gitnexus@1.6.7`.** Kein Upstream-Issue nötig — Befund ist npm-seitig, nicht gitnexus-seitig.

## Implementation Notes — F1/F2/F3/F6 (2026-06-11)

- **F1/AC-1 — Visual-Regression `settings-tenant.png`:** Diff-Analyse (Expected vs. Actual) zeigte: Baseline stammt von VOR PROJ-66 — sie enthält noch die rechte Settings-Zusatznavigation (Profile/Workspace/Allgemein/…), die PROJ-66 (Deployed) bewusst entfernt hat; Actual zeigt die freigegebene UI (Settings in linker Main-Sidebar, Content full-width, +160px Höhe durch Stammdaten-Wachstum). → Baseline bewusst aktualisiert (`--update-snapshots`), Re-Run grün. Anschließend volle Visual-Suite chromium: **11/11 grün.**
- **F2/AC-2 — Mobile Safari/WebKit:** WebKit-Browser ist installiert, aber Host-Libs fehlen (`libgtk-4.so.1` u. a.); `sudo` nicht non-interaktiv verfügbar. → Explizites Gating in `playwright.config.ts`: `ldd`-Check auf dem WebKit-MiniBrowser-Binary; bei fehlenden Libs wird das Mobile-Safari-Projekt mit lauter, actionable Warning übersprungen (Remedy-Hinweis `sudo npx playwright install-deps webkit`), Override via `PW_FORCE_WEBKIT=1`. Detection-Fehler gaten nie (fail-open, damit Coverage nicht still verschwindet). **User-Handoff:** einmalig `sudo npx playwright install-deps webkit` ausführen, dann läuft Mobile Safari wieder automatisch mit.
- **F3/AC-3 — Hydration-Warnungen:** Root-Cause ist **kein App-Bug**, sondern ein Playwright-Artefakt: `toHaveScreenshot` mit Default `caret: "hide"` schreibt Inline-Styles auf Elemente; der Browser re-serialisiert dabei die `style`-Attribute (Shorthand→Longhand-Expansion, `caret-color` verbleibt). Wird die React-Hydration im Dev-Server erst nach dem Screenshot fertig, difft sie gegen das mutierte DOM → Warnings auf Settings/Profile/Resources/Signup-Inputs (deckungsgleich mit den 3 reproduzierten Blöcken: Resources-Radix-Switch-BubbleInput, TenantSettings-Form-Inputs, Profile-DisplayName). → Fix: `expect.toHaveScreenshot = { caret: 'initial', stylePath: 'tests/fixtures/screenshot-stabilize.css' }` — caret-Ausblendung per Stylesheet statt Inline-Mutation. Verifiziert: **0 `tree hydrated`-Warnungen** im WebServer-Log, 11/11 Visual-Tests grün ohne Baseline-Änderung.
- **F6/AC-6 — Schema-Drift lokal:** Neues `scripts/check-schema-drift/local-shadow.sh` (automatisierter Docker-Pfad: postgres:17-Wegwerf-Container + Supabase-Stub-Provisioning + Migration-Apply mit CI-identischer REVOKE-Toleranz + `check:schema-drift` mit gesetzter `DATABASE_URL`) + Runbook `docs/production/schema-drift-local.md` (Pfad A Docker, Pfad B manuelle `DATABASE_URL`, Troubleshooting, Sync-Warnung CI↔lokal). Docker-Detection via `docker info` (der Windows-Shim auf WSL2-PATH täuscht `command -v` — getestet). **Hinweis:** Happy-Path lokal nicht ausführbar, solange Docker-Desktop-WSL-Integration deaktiviert ist (User-Handoff); Fehlerpfad verifiziert, Logik spiegelt den grünen CI-Workflow 1:1.

**Created:** 2026-05-28
**Origin:** Codebase Review 2026-05-28
**Review Report:** [docs/codebase-review-2026-05-28.md](../docs/codebase-review-2026-05-28.md)

## Problem Statement

Der vollständige Review zeigt eine grundsätzlich stabile Codebase, aber mehrere Qualitäts- und QA-Lücken, die zusammen die Verlässlichkeit von Releases schwächen:

- Chromium-E2E hat eine Tenant-Settings-Visual-Regression.
- Full-E2E ist lokal wegen Mobile-Safari-Systembibliotheken nicht vollständig reproduzierbar.
- React-Hydration-Warnungen treten während E2E auf.
- React Compiler überspringt Optimierung in zwei Komponenten wegen `form.watch(...)`.
- Dependency-Audit meldet 7 moderate Findings.
- Lokaler Schema-Drift-Check ist ohne `DATABASE_URL` nicht ausführbar.
- GitNexus Query-CLI ist durch ein ReadOnly-FTS-Problem eingeschränkt.

Dieses PROJ bündelt diese Review-Funde als Hardening-Slice. Ziel ist nicht, neue Produktfunktionalität zu bauen, sondern die Release-Sicherheit wieder auf ein sauberes Niveau zu bringen.

## Dependencies

- PROJ-29 Hygiene-Slice: Lint-/Disable-Policy.
- PROJ-42 Schema-Drift-CI-Guard: lokale/CI-Prüfbarkeit.
- PROJ-51 Modern UI/UX & Motion System: Visual-Regression-Baselines.
- GitNexus AGENTS.md Workflow: Query/Impact/Detect-Changes.

## Findings

| ID | Severity | Bereich | Befund |
|---|---|---|---|
| F1 | Medium | UI/E2E | `settings-tenant.png` Visual-Regression: expected 1280x4305, actual 1280x4465, diff ratio 0.05. |
| F2 | Medium | E2E Infra | Full-E2E bricht in Mobile Safari wegen fehlender WebKit/Systembibliotheken ab. |
| F3 | Medium | SSR/React | Hydration-Mismatch-Warnungen in Settings/Profile/Resources/Signup während E2E. |
| F4 | Medium | React Compiler | `form.watch(...)` in `goal-detail-panel.tsx` und `edit-work-item-dialog.tsx` erzeugt Compiler-Warnungen. |
| F5 | Medium | Security/Deps | `npm audit` meldet 7 moderate Findings, 0 high/critical. |
| F6 | Low/Medium | Schema QA | `npm run check:schema-drift` lokal ohne `DATABASE_URL` nicht ausführbar. |
| F7 | Low/Medium | Tooling | `gitnexus query` meldet FTS-Index-Writeversuch auf read-only DB und liefert keine belastbaren Query-Ergebnisse. |
| F8 | Low | Hygiene | 23 `eslint-disable`-Treffer in `src`; Review/Reduktion sinnvoll. |
| F9 | Info | E2E Infra | Graph-Deep-Link-Specs (Herkunft: PROJ-70-ε QA-Finding "F-4 INFO", 2026-06-08) müssen aktuell seriell laufen: bei parallelen Playwright-Workern erzeugt der webServer-First-Compile Contention und sporadische Timeouts. Mit `--workers=1` ergibt sich 25 passed / 5 skipped / 0 failed. Kandidat fürs CI-Hardening — **nicht** blind die Playwright-Config global auf `workers: 1` setzen (würde die gesamte Suite verlangsamen); Ziel ist eine gezielte Lösung (z. B. nur die betroffenen Deep-Link-Specs serialisieren oder den Dev-Server vor der Suite warm kompilieren). |

## Acceptance Criteria

- [x] AC-1: `npm run test:e2e -- --project=chromium` läuft grün oder die Tenant-Settings-Baseline wurde nach sichtbarer UI-Freigabe bewusst aktualisiert. **Erledigt 2026-06-11** — Baseline war pre-PROJ-66 (rechte Settings-Nav); bewusst aktualisiert, 11/11 Visual-Tests grün.
- [x] AC-2: `npm run test:e2e` ist lokal/CI reproduzierbar oder Mobile Safari wird in Umgebungen ohne WebKit-Systembibliotheken explizit und nachvollziehbar übersprungen. **Erledigt 2026-06-11** — ldd-basiertes Gating + laute Warning + `PW_FORCE_WEBKIT=1`-Override in `playwright.config.ts`.
- [x] AC-3: E2E-WebServer-Logs enthalten keine React-Hydration-Mismatch-Warnungen mehr für Settings/Profile/Resources/Signup. **Erledigt 2026-06-11** — Playwright-caret-Artefakt; Fix via `caret: 'initial'` + `stylePath`; verifiziert 0 Warnungen.
- [x] AC-4: `npm run lint` läuft ohne React-Compiler-Warnungen; insbesondere keine `form.watch(...)`-Reads direkt im JSX/Renderpfad der zwei betroffenen Komponenten. **Erledigt 2026-05-30** — `goal-detail-panel.tsx` (3 sites: source_ref.kind, auto_pull_date ×2) und `edit-work-item-dialog.tsx` (3 sites: phase_id, planned_start, planned_end) auf `useWatch({ control: form.control, name: ... })` umgestellt; `npm run lint` jetzt 0 errors + 0 warnings (vorher 0 errors + 2 warnings).
- [x] AC-5: `npm audit --json` ist triagiert; alle 7 moderate Findings sind entweder durch kontrollierte Upgrades behoben oder mit Exploitability/Owner/Follow-up dokumentiert. **Erledigt 2026-05-29 via PR #77** — 5 von 7 moderate CVEs via `npm audit fix` non-breaking aufgelöst (ws < 8.20.1, uuid < 11.1.1, svix transitive, resend transitive). Verbleibende 2: transitives `postcss` über `next/node_modules/postcss` — `npm audit fix` würde nur via breaking Next-Downgrade auflösen; wartet auf upstream Next-Bump.
- [x] AC-6: `npm run check:schema-drift` hat einen dokumentierten lokalen Pfad mit frischer Shadow-DB oder ein klares Runbook mit `DATABASE_URL`-Setup. **Erledigt 2026-06-11** — `scripts/check-schema-drift/local-shadow.sh` + `docs/production/schema-drift-local.md`; Docker-Happy-Path pending WSL-Integration (User-Handoff).
- [x] AC-7: `gitnexus query` funktioniert ohne ReadOnly-FTS-Warnungen und liefert wieder Prozess-/Symboltreffer. **Voll erfüllt 2026-06-12** — Root-Cause war upstream in gitnexus v1.6.4 gefixt, Umgebung hing auf npx-Cache-Pin 1.6.3; Upgrade auf 1.6.7 + einmaliges `--repair-fts` → 0 Warnungen, 27 Prozess-Treffer, FTS persistiert über `analyze`. Details in Implementation Notes F7 final.
- [x] AC-8: Alle `eslint-disable`-Treffer in `src` sind entweder entfernt oder mit knapper Begründung und Owner-Entscheidung bestätigt. **Erledigt 2026-05-31** — `rg -n "eslint-disable" src` zeigt 23 Treffer in 19 Files; vier fehlende Inline-Begründungen ergänzt (`EditWbsCodeDialog`, `BacklogClient`, `CreateWorkItemLinkDialog`, `BacklogTree`), die übrigen 19 Treffer hatten bereits knappe Owner-Entscheidungen.
- [x] AC-9 (F9): Die Graph-Deep-Link-E2E-Specs laufen ohne globalen `workers: 1`-Zwang zuverlässig — entweder durch gezielte Serialisierung nur der betroffenen Specs oder durch Warm-Compile des Dev-Servers vor der Suite. **Erledigt 2026-06-12** — Warm-Compile-Variante in `global-setup.ts` (`warmCompileDeepLinkRoutes`, 6 Routen sequenziell-authentifiziert vor Worker-Start); volle chromium-Suite 90/0 parallel grün. Details in Implementation Notes AC-9/F9.

## Non-Goals

- Keine neuen Produktfeatures.
- Keine große UI-Neugestaltung der Settings-Seiten.
- Kein blindes Dependency-Auto-Fix, wenn dadurch Framework-Versionen unerwartet springen oder zurückfallen.
- Keine Änderung an RLS-/DB-Policies ohne eigene GitNexus-/Migration-Review.

## Suggested Implementation Plan

1. Visual-Regression isolieren:
   - `npm run test:e2e -- --project=chromium tests/PROJ-51-visual-regression-authenticated.spec.ts -g "Tenant settings page"`
   - Actual/Diff prüfen.
   - UI-Fix oder Snapshot-Freigabe.
2. Playwright-Infra stabilisieren:
   - WebKit-Dependencies installieren oder Projekt-Gating dokumentieren.
   - Full-E2E erneut ausführen.
3. Hydration-Warnungen beseitigen:
   - Betroffene Radix/Form/Input/Switch-Renderpfade prüfen.
   - SSR-/Client-Style-Unterschiede vermeiden.
4. React-Compiler-Warnungen fixen:
   - `form.watch(...)` durch `useWatch` oder stabil abgeleitete Werte ersetzen.
5. Dependency-Audit triagieren:
   - `next`, `postcss`, `resend`, `svix`, `uuid`, `ws`, `brace-expansion` kontrolliert aktualisieren.
6. Schema-Drift-Local-Runbook ergänzen.
7. GitNexus Query-ReadOnly-Problem beheben oder upstream/workaround dokumentieren.
8. Graph-Deep-Link-E2E-Serialisierung (F9) gezielt lösen:
   - Reproduktion: `npm run test:e2e -- tests/PROJ-70-epsilon-wizard.spec.ts` parallel vs. `--workers=1`.
   - Bevorzugt: nur die betroffenen Specs serialisieren (`test.describe.configure({ mode: 'serial' })` bzw. Projekt-spezifisches `workers`-Setting) oder den Dev-Server vor der Suite warm kompilieren.
   - **Nicht** die globale Playwright-Config blind auf `workers: 1` setzen.

## QA Plan

```bash
npm run lint
npm run test
npm run build
npm run test:e2e -- --project=chromium
npm run test:e2e
npm audit --json
npm run check:schema-drift
npx gitnexus@latest query "auth tenant ai provider"
```

## Review Evidence

- Unit: 187 files / 1557 tests passed.
- Build: Next.js 16.2.4 production build passed; 66 static pages generated.
- Chromium E2E: 68 passed, 5 skipped, 1 failed.
- Full E2E: 122 passed, 12 skipped, 14 failed.
- Audit: 7 moderate, 0 high, 0 critical.

## QA Test Results — Schlussabnahme 2026-06-12

**Scope:** Gesamtabnahme aller 9 ACs auf aktuellem main (36c6936, inkl. AC-9-Merge #135), frischer Worktree, frisches `npm ci`.

### Acceptance Criteria: 9/9 PASS

| AC | Verifikation | Ergebnis |
|---|---|---|
| AC-1 Visual chromium | Volle chromium-Suite inkl. 16 Visual-Tests (settings-tenant auf PROJ-66-Baseline) | ✅ PASS |
| AC-2 WebKit-Gating | Ohne Flag: 0 Mobile-Safari-Tests + laute Warning; `PW_FORCE_WEBKIT=1`: 95 Tests gelistet | ✅ PASS |
| AC-3 Hydration | Volles E2E-WebServer-Log: **0** `tree hydrated`-Warnungen | ✅ PASS |
| AC-4 React-Compiler | `npm run lint`: 0 errors, 0 warnings | ✅ PASS |
| AC-5 Dependency-Audit | `npm audit`: 2 moderate (bekannte transitive postcss via next, dokumentiert), 0 high/critical; `audit:prod`-Gate pass | ✅ PASS |
| AC-6 Schema-Drift lokal | Runbook + Skript vorhanden, `bash -n` OK, Fehlerpfad (kein Docker) liefert klare Anleitung; Happy-Path = dokumentierter WSL-Integration-Handoff | ✅ PASS |
| AC-7 GitNexus Query | `npx gitnexus@latest query`: 0 ReadOnly-FTS-Warnungen, 30 Treffer-Zeilen | ✅ PASS |
| AC-8 eslint-disable | 26 Treffer (23 bei Erstabnahme + 3 neue aus PROJ-88/89) — **alle 26** mit ` -- `-Inline-Begründung | ✅ PASS |
| AC-9 Parallel-E2E | Volle chromium-Suite **90 passed / 5 skipped / 0 failed** (45s) mit Default-Workern; Warm-Compile aktiv (Log-Nachweis) | ✅ PASS |

### Suiten (Regression)

- vitest: **1799/1799** grün (Suite seit Review-Baseline 1557 → 1799 gewachsen)
- chromium-E2E: **90 passed / 5 skipped / 0 failed** (5 Skips = dokumentierte `@setup-only`/Gating-Fälle)
- Mobile Safari: AC-2-konform übersprungen (WebKit-Host-Libs-Handoff offen); Firefox ist nicht Teil der Projekt-Suite-Definition (out of scope)

### Security-Audit (Red-Team auf Slice-Änderungen)

- `playwright.config.ts` (`execFileSync('ldd', …)`): statischer Befehl, Pfade aus `homedir()`-Discovery, kein User-Input → keine Injection-Fläche; reine devDependency-Logik, kein Prod-Pfad.
- `global-setup.ts` Warm-Compile: sendet E2E-Test-Cookies nur an `PLAYWRIGHT_BASE_URL` — identische Vertrauensannahme wie das bestehende storageState-Design, kein neues Risiko-Delta.
- `screenshot-stabilize.css`, Baseline-PNG: keine Angriffsfläche.
- **L-1 (Low):** `local-shadow.sh` published den Wegwerf-Postgres mit `-p "$PORT:5432"` → bindet 0.0.0.0; während des Laufs ist eine DB mit Trivial-Passwort `test` im LAN erreichbar. Empfehlung: `-p "127.0.0.1:$PORT:5432"`. Kurzlebig + reines Dev-Tooling → Low.

### Findings

| ID | Severity | Befund |
|---|---|---|
| L-1 | Low | ✅ **Behoben 2026-06-15**: Shadow-DB-Port bindet jetzt `127.0.0.1:$PORT:5432` (war 0.0.0.0); `localhost`-DATABASE_URL bleibt kompatibel. |
| I-1 | Info | gitnexus@1.6.7 verlangt `engines.node >= 22`, Host läuft Node 20 — funktioniert, aber EBADENGINE-Warning; bei Node-Upgrade-Planung berücksichtigen |
| I-2 | Info | eslint-disable-Zähler 23 → 26 seit Erstabnahme; Hygiene hält (alle begründet), Konvention wird von neuen Features eingehalten |

### Neue Tests

Keine neuen Tests erforderlich: alle ACs sind durch bestehende automatisierte Suiten abgedeckt (Visual-Specs = AC-1, volle parallele Suite = AC-3/9 als permanente Regression; AC-2/6/7 sind Tooling-/Config-Verhalten, das bei jedem Suite-Lauf implizit mitgeprüft wird).

### Production-Ready: **READY** (0 Critical / 0 High; 1 Low + 2 Info dokumentiert)
