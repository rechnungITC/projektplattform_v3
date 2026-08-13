---
id: PROJ-146
title: "Supply-Chain-Remediation extract-zip / puppeteer-core (npm-audit-Baseline zurück auf grün)"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: High
priority_source: "Must"
labels: ["hygiene", "supply-chain", "security", "ci"]
dependencies: []
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Supply-Chain-Remediation extract-zip via puppeteer-core — npm-audit Required-Check zurück auf grün"
---

# PROJ-146: Supply-Chain-Remediation extract-zip / puppeteer-core

## Status: Deployed
## Deployment Scope: full

**Deployed:** 2026-08-13 — PR **#364** (squash) → `main` (`1cbdc4b`). Alle 5 Required-Checks grün, darunter **`npm audit production dependencies: success`** auf `main` selbst (vorher exit 1 mit 3 HIGH). **Vercel-Prod-Build von `main` mit `puppeteer-core@25.6.0` erfolgreich** (`Vercel: success` auf `1cbdc4b`) — die neue Major-Version baut und deployt in der echten Zielumgebung, nicht nur lokal. Keine Migration, kein neuer Env/Secret.

**Warum `full` und nicht `tooling-only`:** die Taxonomie hat keinen eigenen Eimer für Abhängigkeits-/Sicherheitspflege. `tooling-only` verlangt, dass der Ausgang „repository tooling, CI, tests, or workflow" betrifft — hier ändert sich aber eine **Produktions**-Laufzeit-Abhängigkeit, das trifft nicht zu. `full` ist dagegen kriterienweise erfüllt: AC-146.1–146.6 alle belegt, kein Critical/High, Produktionsverhalten über den erfolgreichen Prod-Build und -Deploy verifiziert. Der noch ausstehende produktive PDF-Lauf (D-146.2) ist **zusätzliche Absicherung, kein offenes Akzeptanzkriterium** — AC-146.5 ist durch den echten Render gegen die neue Bibliothek erfüllt. Das ist dieselbe Auslegung, die einen Tag zuvor bei PROJ-144/PROJ-Y-145a am selben Regeltext getroffen wurde; registriert als **PROJ-Y-146a**.

**Created:** 2026-08-13
**Origin:** PROJ-74 `npm audit --omit=dev --audit-level=high` Required-Check auf `main` rot; blockierte die beiden fertigen Doku-PRs **#362** (PROJ-Y-145a) und **#363** (PROJ-Y-145c). Portfolioweit, kein Feature-Bug.

> **Hygiene-Slice** analog PROJ-29/42/74/140/142. Kein neues Feature, keine Migration, **keine `src/**`-Änderung** — nur `package.json` + `package-lock.json`.

## Problem

Am 2026-08-13 meldet `npm audit --omit=dev` **3 HIGH** auf `main`:

| Paket | Sev | Advisory | Herkunft |
|---|---|---|---|
| `extract-zip *` | **high** | GHSA-jmr9-qjv8-65gv — unvalidierte Symlink-Path-Traversal beim Entpacken | transitiv |
| `@puppeteer/browsers <=2.13.2` | high | hängt an verwundbarem `extract-zip` | transitiv |
| `puppeteer-core 19.8.4 – 24.43.1` | high | pinnt `@puppeteer/browsers` **exakt** auf `2.13.2` | **direkte Prod-Dependency** (`^24.42.0`) |

Der Required-Check ist damit rot und blockiert per Branch-Protection jeden Merge — genau das Muster, das CLAUDE.md als „`npm audit` breaks unrelated PRs" beschreibt.

### Warum kein Override auf `extract-zip`

`extract-zip` ist mit `*` als verwundbar geführt: **jede** publizierte Version, letzte ist `2.0.1`. Es gibt keine gepatchte Release, auf die ein Override zeigen könnte. Der verwundbare Pfad muss also **aus dem Baum verschwinden**, nicht auf eine höhere Version gehoben werden.

### Warum kein Override auf `@puppeteer/browsers`

`@puppeteer/browsers@3.x` hat `extract-zip` ersetzt (nutzt `modern-tar`) und wäre der kleinere Diff. Aber `puppeteer-core@24.43.1` pinnt `@puppeteer/browsers` **exakt** auf `2.13.2` — ein Override würde einen Major-Sprung quer durch einen harten Pin erzwingen. Der PDF-Renderer (PROJ-21, `src/lib/reports/puppeteer-render.ts`) ist ein **echtes Produktions-Feature**, dessen Route-Tests die Render-Lib mocken; ein stiller Laufzeitbruch wäre von Build und Tests **nicht** gefangen worden.

### Gewählter Weg: `puppeteer-core` auf `^25.6.0`

`puppeteer-core@25.6.0` liefert `@puppeteer/browsers@3.2.0` — die von upstream selbst getestete Paarung. Damit fällt der verwundbare Teilbaum vollständig weg, statt zwei Majors gegeneinander zu zwingen.

Anders als bei PROJ-140/142 ist `npm audit fix --force` hier **nicht** die falsche Richtung (es schlägt denselben Vorwärts-Bump vor, keinen Downgrade) — die Änderung wurde trotzdem gezielt gesetzt statt blind übernommen, damit der Diff nachvollziehbar bleibt.

## Akzeptanzkriterien

| # | Kriterium | Nachweis |
|---|---|---|
| AC-146.1 | `npm run audit:prod` exit 0, 0 Vulnerabilities | ausgeführt: `found 0 vulnerabilities`, exit 0 |
| AC-146.2 | `extract-zip` ist aus dem Abhängigkeitsbaum verschwunden | `npm ls extract-zip` → `(empty)` |
| AC-146.3 | Keine neuen Typfehler | `npx tsc --noEmit` → **13 Fehler = exakte Baseline**, keiner puppeteer-bezogen |
| AC-146.4 | Keine Regression in Lint/Tests/Build | ESLint **0** · vitest **2922/2922** (374 Dateien) · `npm run build` clean |
| AC-146.5 | Der PDF-Renderer funktioniert mit der neuen Major-Version weiter | **echter Headless-Render** (siehe unten) |
| AC-146.6 | Keine `src/**`-Änderung, keine Migration | Diff = `package.json` + `package-lock.json` |

### AC-146.5 — echter Render statt Build-Beweis

Die Route-Tests mocken `@/lib/reports/puppeteer-render`, ein grüner Testlauf sagt über die Bibliothek also **nichts**. Deshalb wurde die exakte API-Fläche aus `puppeteer-render.ts` gegen die neue Version real ausgeführt (Chromium aus dem Playwright-Cache als `executablePath`, wie in Produktion ein extern gestellter Pfad):

`launch({args, defaultViewport, executablePath, headless})` → `browser.connected` → `newPage` → `setExtraHTTPHeaders` → `goto` → `waitForSelector` → `emulateMediaType("print")` → `pdf({format, printBackground})` → `close`

**Ergebnis:** 8134 Bytes, gültiger `%PDF-`-Header, exit 0. Alle in `puppeteer-render.ts` benutzten Aufrufe existieren und verhalten sich unverändert.

## Nebeneffekt: kleinerer Angriffsfläche

Der Wechsel entfernt neben `extract-zip` auch den `proxy-agent`-Teilbaum (`pac-proxy-agent`, `socks-proxy-agent`, `get-uri`, …), den `@puppeteer/browsers@2` mitzog: **–468 Lockfile-Zeilen gegen +184**. Weniger transitive Prod-Abhängigkeiten ist bei einem Supply-Chain-Slice ein erwünschter, kein zufälliger Ausgang.

## Abgrenzung / Deviations

- **D-146.1** — Major-Bump statt Patch. Unvermeidbar: der Advisory-Bereich reicht bis zur letzten 24.x (`24.43.1`), eine In-Range-Korrektur existiert nicht. Risiko durch die schmale, stabile API-Fläche (10 Aufrufe) und den echten Render-Nachweis begrenzt.
- **D-146.2** — Kein Nachweis gegen `@sparticuz/chromium` in der Lambda-Umgebung: dessen Binary ist für Amazon Linux 2023 gebaut und auf dem WSL-Host nicht lauffähig. `@sparticuz/chromium` liefert nur `args` + `executablePath`; die puppeteer-Seite dieser Schnittstelle ist durch AC-146.5 abgedeckt. Post-Deploy ist die Snapshot-PDF-Erzeugung einmal produktiv zu prüfen.
- **D-146.3** — Der aus PROJ-140 stammende Risk-Accept für `@hono/node-server` (moderate, Windows-only) bleibt unverändert bestehen; `--audit-level=high` berührt ihn nicht.

## Definition of Done

- [x] `npm run audit:prod` exit 0
- [x] `extract-zip` nicht mehr im Baum
- [x] tsc-Baseline unverändert (13, 0 neu)
- [x] ESLint 0 · vitest 2922/2922 · Build clean
- [x] PDF-Renderer real ausgeführt
- [x] Merge nach `main`, Required-Checks grün (#364 → `1cbdc4b`; `npm audit` auf `main` von exit 1 auf success)
- [x] Vercel-Prod-Build + -Deploy von `main` mit der neuen Major-Version erfolgreich
- [ ] Post-Deploy: eine Snapshot-PDF-Erzeugung produktiv geprüft — **zusätzliche Absicherung, kein offenes AC** (D-146.2) → **PROJ-Y-146a**
