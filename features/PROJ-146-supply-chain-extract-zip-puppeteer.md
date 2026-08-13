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

### Nachtrag 2026-08-13 — gegen das **echte Prod-Binary**, 17/17, und als Skript committet

Zwei Dinge waren an der Fassung oben verbesserungsfaehig; beide sind jetzt erledigt.

**1. Die Praemisse von D-146.2 traf nicht zu.** Dort stand, das Binary von `@sparticuz/chromium` sei
fuer Amazon Linux 2023 gebaut und auf dem WSL-Host nicht lauffaehig, weshalb die Lambda-Seite der
Schnittstelle lokal nicht pruefbar sei. Nachgemessen statt angenommen: `await
chromium.executablePath()` entpackt nach `/tmp/chromium` (196.676.728 Bytes) und **startet** —
`browser.version()` meldet ueber CDP `HeadlessChrome/147.0.7727.0`. Der Render ist damit nicht mehr
nur gegen ein *fremdes* Chromium aus dem Playwright-Cache bewiesen, sondern gegen **genau das Binary,
das auf Vercel laeuft**, mit `chromium.args` als Argumentsatz. Die Annahme duerfte von der
Lambda-Zielplattform des Pakets herruehren; das Binary selbst ist ein gewoehnliches linux-x64-Chromium.

**2. Der Nachweis war ein Einwegskript.** Genau daran ist PROJ-142 gescheitert: ein gemockter Parser
ueberlebte einen Major-Sprung, weil niemand die echte Bibliothek fuhr. Der Durchlauf lebt jetzt als
`npm run verify:pdf-render` im Repo (`scripts/verify-pdf-render.mjs`), damit der naechste
`puppeteer-core`- oder `@sparticuz/chromium`-Bump nicht still durchrutscht.

Abgedeckt sind jetzt **alle 17** Aufrufstellen statt 9. Neu gegenueber oben sind `browser.version()`
ueber CDP, `page.evaluate(asyncFn, arg)` in der Form von `waitForPageAssets`, die `margin`-Option, der
Rueckgabetyp `Uint8Array` (den der Supabase-Upload frisst) und vor allem die **HTTP-Verzweigungen**:
der Produktivcode wirft bei `!response` und bei `!response.ok()`, was nur gegen einen echten
HTTP-Server pruefbar ist — eine `data:`-URL liefert dort `null`. Verifiziert mit lokalem Server:
`response.ok()`/`status()` = 200 auf der Druckseite, sauber erkannter **404** auf der Fehlerroute, und
der ueber `setExtraHTTPHeaders` gesetzte Cookie kam serverseitig wirklich an.

**Ergebnis:** 17/17 PASS, PDF 14.339 Bytes mit `%PDF-`-Magic. **Pruefstand gegengeprueft, nicht nur
gruen:** Selektor auf ein nicht existierendes Attribut gedreht → `FAIL … Waiting for selector failed`,
exit 1; danach zurueck → wieder 17/17. Ohne diese Gegenprobe waere „17/17" keine Aussage.

Bewusst **ausserhalb** von CI und der Unit-Suite: das Skript entpackt ~190 MB und startet einen
Browser. Es ist zum absichtlichen Aufruf gedacht, im Datei-Kopf so dokumentiert.

**Was das an der Restarbeit aendert:** die lokale Haelfte von D-146.2 ist geschlossen — offen bleibt
allein ein Snapshot-PDF *innerhalb* der ausgelieferten Serverless-Funktion (PROJ-Y-146a), nicht mehr
die Lauffaehigkeit des Binaries.

## Nebeneffekt: kleinerer Angriffsfläche

Der Wechsel entfernt neben `extract-zip` auch den `proxy-agent`-Teilbaum (`pac-proxy-agent`, `socks-proxy-agent`, `get-uri`, …), den `@puppeteer/browsers@2` mitzog: **–468 Lockfile-Zeilen gegen +184**. Weniger transitive Prod-Abhängigkeiten ist bei einem Supply-Chain-Slice ein erwünschter, kein zufälliger Ausgang.

### PROJ-Y-146a erledigt 2026-08-13 — Render **innerhalb der deployten Funktion**, 13/13

Die letzte offene Zeile der Definition of Done. Bewiesen ist jetzt nicht mehr nur die Bibliothek und
das Binary, sondern dass die **ausgelieferte Serverless-Funktion** den Schreibpfad ausführt.

**Nachweiskette, an Zeitstempeln verankert statt erschlossen:**

| Glied | Belegt durch |
|---|---|
| Produktions-Deployment `542f412` | GitHub-Deployment `Production`, `state=success`, 10:23:32Z |
| Dieses Deployment enthält den Bump | `git merge-base --is-ancestor 1cbdc4b 542f412` → ja; `542f412:package.json` pinnt `puppeteer-core: ^25.6.0` |
| Der Lauf fand **danach** statt | Probe-Fenster 10:26:10–10:26:27Z bzw. 10:30:29–10:30:37Z |

Damit hängt das Ergebnis nachweislich an `puppeteer-core@25`, nicht an einer alten Instanz — genau die
Lücke, die ein bloßes „hat funktioniert“ offen gelassen hätte.

**Ergebnis:** `POST /api/projects/{id}/snapshots` gegen `https://projektplattform-v3.vercel.app` →
**HTTP 200**, `pdf_status='available'`, PDF **33.190 Bytes** mit `%PDF-`-Magic im `reports`-Bucket, in
der Datenbank gegengeprüft. Zweimal unabhängig gefahren (11,9 s / 13,3 s Kaltstart), zweiter Lauf
**13/13 PASS**.

**Warum die Prüfung nicht leerlaufen kann:** die Route fängt einen Render-Fehler und setzt
`pdf_status='failed'` (`snapshots/route.ts`, catch-Zweig) — `'available'` ist also nur erreichbar,
wenn die Funktion Chromium wirklich gestartet, die Druckseite über HTTP geholt und ein PDF erzeugt
hat. Zusätzlich verlangt die Probe das Objekt im Bucket, die `%PDF-`-Magic und die Übereinstimmung mit
der Datenbank, statt der Antwort zu glauben.

**Kundendaten unberührt:** die Probe legt einen eigenen Wegwerf-Mandanten mit aktivem
`output_rendering` an, statt das Modul auf einem geteilten E2E-Mandanten umzuschalten (Begründung wie
PROJ-Y-144d: geteilter Fixture-Zustand kollidiert mit parallel laufenden Specs). Gegenprobe nach dem
Aufräumen: `report_snapshots` über **alle** Mandanten = 10, also exakt der Bestand des
Produktivmandanten von vor dem Lauf — es ist dort kein 11. Snapshot entstanden. Die geteilte
E2E-Identität ist wieder bei genau 2 Mitgliedschaften.

Reproduzierbar als `scripts/verify-prod-snapshot-render.mts`, **ohne** npm-Alias und hinter
`PROD_WRITE_ACK=1`, damit niemand beim Testlauf hineinstolpert.

#### Zwei Nebenbefunde, die der Lauf zutage gebracht hat

**1. Ein Mandant lässt sich nicht hart löschen.** `enforce_admin_invariant` feuert BEFORE DELETE auf
den letzten Admin — und weil `tenant_memberships.tenant_id` mit `ON DELETE CASCADE` hängt, bricht
damit auch das Löschen des **Mandanten selbst** ab. Über die API bzw. `supabase-js` ist der Teardown
also unmöglich; die letzten zwei Zeilen brauchen eine SQL-Sitzung mit
`session_replication_role = replica`. Kein Produktfehler (Offboarding läuft über PROJ-17, nicht über
Hard-Delete), aber eine Falle für jede Wegwerf-Fixture in Produktion → dokumentiert in
**PROJ-Y-146b**. Das Skript räumt alles Räumbare weg, meldet die zwei Zeilen ehrlich und druckt das
fertige SQL.

**2. Test-Rauschen im Audit-Trail ist nicht kostenlos.** Der Trail ist seit PROJ-130-α append-only und
sein Mandanten-FK entkoppelt — die Zeilen überleben den gelöschten Mandanten. Der erste Lauf hinterließ
**8** permanente Zeilen. Gegenmaßnahme aus PROJ-Y-130h angewandt und **gemessen, nicht behauptet**:
`tenants.audit_lifecycle_exempt = true` direkt nach der Mandanten-Anlage senkt den zweiten Lauf auf
**5**. Der Rest ist strukturell unvermeidbar und erklärt sich an den Zeitstempeln: `tenants.__created`
und `tenant_settings.__created` tragen **dieselbe** Zeit — die Settings-Zeile wird per Trigger bei der
Mandanten-Anlage mitgelegt, beide also zwangsläufig *vor* dem Flag; dazu die Feld-Audits
`audit_lifecycle_exempt` und `active_modules`, die das Flag bewusst **nicht** unterdrückt (wer die
Ausnahme setzt, soll seine Spur nicht verwischen können), und `report_snapshots.snapshot_created` —
das ist der Geschäftsvorfall, den wir gerade prüfen wollten. Wichtig für künftige Fixtures: das Flag
wird **nicht** aus dem `[E2E]`-Namenspräfix abgeleitet, es muss gesetzt werden.

**An der Einordnung ändert sich nichts:** PROJ-146 bleibt `Deployed` / `full`. Der Lauf war als
zusätzliche Absicherung registriert, nicht als unerfülltes Kriterium — er macht die Begründung nur
unabhängig von der Regeltext-Auslegung, über die PROJ-144/PROJ-Y-145a am Vortag entschieden wurde.

## Abgrenzung / Deviations

- **D-146.1** — Major-Bump statt Patch. Unvermeidbar: der Advisory-Bereich reicht bis zur letzten 24.x (`24.43.1`), eine In-Range-Korrektur existiert nicht. Risiko durch die schmale, stabile API-Fläche (10 Aufrufe) und den echten Render-Nachweis begrenzt.
- **D-146.2** — ~~Kein Nachweis gegen `@sparticuz/chromium` in der Lambda-Umgebung: dessen Binary ist für Amazon Linux 2023 gebaut und auf dem WSL-Host nicht lauffähig.~~ **Korrigiert 2026-08-13 (siehe Nachtrag unter AC-146.5):** die Prämisse traf nicht zu — das Binary entpackt (196.676.728 Bytes) und startet auf diesem Host, `browser.version()` meldet `HeadlessChrome/147.0.7727.0`. Der Render ist gegen **genau das Prod-Binary** mit `chromium.args` verifiziert, 17/17. Rest-Lücke präzise: nicht das Binary, sondern der Lauf *innerhalb* der ausgelieferten Serverless-Funktion. `@sparticuz/chromium` liefert nur `args` + `executablePath`; die puppeteer-Seite dieser Schnittstelle ist durch AC-146.5 abgedeckt. ~~Post-Deploy ist die Snapshot-PDF-Erzeugung einmal produktiv zu prüfen.~~ **Erledigt 2026-08-13 (PROJ-Y-146a, 13/13):** Render innerhalb der deployten Funktion bewiesen, an das Deployment `542f412` zeitlich gebunden. D-146.2 ist damit vollständig geschlossen.
- **D-146.3** — Der aus PROJ-140 stammende Risk-Accept für `@hono/node-server` (moderate, Windows-only) bleibt unverändert bestehen; `--audit-level=high` berührt ihn nicht.

## Definition of Done

- [x] `npm run audit:prod` exit 0
- [x] `extract-zip` nicht mehr im Baum
- [x] tsc-Baseline unverändert (13, 0 neu)
- [x] ESLint 0 · vitest 2922/2922 · Build clean
- [x] PDF-Renderer real ausgeführt
- [x] Merge nach `main`, Required-Checks grün (#364 → `1cbdc4b`; `npm audit` auf `main` von exit 1 auf success)
- [x] Vercel-Prod-Build + -Deploy von `main` mit der neuen Major-Version erfolgreich
- [x] Render gegen das **echte Prod-Binary** (`@sparticuz/chromium`, `HeadlessChrome/147.0.7727.0`) verifiziert, 17/17 — schließt die lokale Hälfte von D-146.2
- [x] Nachweis reproduzierbar committet als `npm run verify:pdf-render` (statt Einwegskript)
- [x] Post-Deploy: Snapshot-PDF-Erzeugung *innerhalb der deployten Funktion* produktiv geprüft — **13/13**, HTTP 200 / `pdf_status='available'` / 33.190 Bytes mit `%PDF-`-Magic, an Deployment `542f412` gebunden, Kundendaten unberührt (PROJ-Y-146a erledigt)
- [x] Probe reproduzierbar committet (`scripts/verify-prod-snapshot-render.mts`, hinter `PROD_WRITE_ACK=1`, kein npm-Alias)
