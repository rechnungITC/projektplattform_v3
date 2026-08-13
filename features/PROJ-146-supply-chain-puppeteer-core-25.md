# PROJ-146: Supply-Chain-Remediation `puppeteer-core` 24 → 25 (extract-zip HIGH)

## Status: Approved
## Deployment Scope: —
**Created:** 2026-08-13
**Last Updated:** 2026-08-13

## Kontext

`npm audit production dependencies` (Required-Check aus PROJ-74) wurde über Nacht rot und blockierte
damit **jeden** offenen PR im Repo, nicht nur einen — der Auslöser war ein fertiger, rein
dokumentarischer PR (#362), der mit dem Advisory nichts zu tun hat. Genau das Muster, das CLAUDE.md
beschreibt: „npm audit breaks unrelated PRs."

**Advisory:** [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) —
`extract-zip`, unvalidierter Symlink-Path-Traversal beim Entpacken, **HIGH**.

Kette in unseren Prod-Dependencies:

```
puppeteer-core ^24.42.0   (direkte Prod-Dependency, dependencies nicht devDependencies)
└── @puppeteer/browsers 2.13.2   (exakt gepinnt von puppeteer-core 24)
    └── extract-zip *             ← keine gepatchte Version existiert
```

## Warum der Weg über `puppeteer-core` 25 der einzige ist

Drei Wege geprüft, zwei verworfen — am Registry-Stand gemessen, nicht geschätzt:

| Weg | Befund |
|---|---|
| `extract-zip` hochziehen | **Unmöglich.** Advisory-Range ist `*`, letzte Version 2.0.1 ist selbst betroffen. Es gibt keinen Patch. |
| `@puppeteer/browsers` ^3.2.0 overriden, `puppeteer-core` auf 24 lassen | **Verworfen.** 3.x ist der Ort, an dem `extract-zip` rausgeflogen ist (ersetzt durch `modern-tar`), aber `puppeteer-core@24.43.1` pinnt `"@puppeteer/browsers": "2.13.2"` **exakt** — ein erzwungener Major über einen exakten Pin ist ein Wagnis am Launch-Pfad eines Live-Features. |
| `puppeteer-core` → `^25.6.0` | **Gewählt.** 25.6.0 zieht regulär `@puppeteer/browsers@3.2.0`, also die bereinigte Kette, ohne einen Pin zu überschreiben. |

`npm audit fix --force` wurde **nicht** benutzt — es hätte hier zwar dasselbe Ziel getroffen, ist aber
das in PROJ-140/142 belegte Risiko (dort hätte es Next.js und `pdfjs-dist` in *ältere, unsicherere*
Majors zurückgedreht). Gezielter Bump statt Automatik.

## Risikolage — und warum sie milder ist, als das Advisory klingt

Der verwundbare Code entpackt heruntergeladene Browser-Archive. **Dieser Pfad wird hier nie betreten:**
`resolveExecutablePath()` (`src/lib/reports/puppeteer-render.ts:79`) liefert immer einen *expliziten*
`executablePath` — `PUPPETEER_EXECUTABLE_PATH`, sonst in Nicht-Produktion ein System-Chrome, sonst
`@sparticuz/chromium`s mitgeliefertes Binary. Ein Browser-Download über `@puppeteer/browsers` findet
nicht statt, damit läuft `extract-zip` nie.

Das ist ein Argument für **Gelassenheit bei der Dringlichkeit**, kein Argument fürs Nichtstun: der
Required-Check bewertet das Advisory, nicht die Erreichbarkeit, und ein dauerhaft roter
Supply-Chain-Gate blockiert das ganze Repo. Festgehalten wird beides.

## Betroffene Fläche

`puppeteer-core` trägt genau ein Produktivfeature: die synchrone PDF-Erzeugung der Report-Snapshots
(PROJ-21) in `src/lib/reports/puppeteer-render.ts`, aufgerufen aus den Snapshot-Routen
(`.../snapshots/route.ts`, `.../snapshots/[sid]/render-pdf/route.ts`). Kein anderer Aufrufer.

## Acceptance Criteria

| # | Kriterium | Ergebnis |
|---|---|---|
| AC-146.1 | `npm run audit:prod` beendet mit 0, keine HIGH-Advisories mehr | ✅ `found 0 vulnerabilities`, exit 0 (vorher exit 1, 3 HIGH) |
| AC-146.2 | `extract-zip` ist vollständig aus dem Prod-Baum verschwunden | ✅ `npm ls extract-zip` → nicht mehr im Baum |
| AC-146.3 | Jede von `puppeteer-render.ts` benutzte puppeteer-API funktioniert un-gemockt weiter | ✅ **17/17 PASS** gegen das echte Prod-Binary (Tabelle unten) |
| AC-146.4 | Keine neuen Typfehler durch den Major-Bump | ✅ tsc **13 = Baseline / 0 neu**, keiner in `reports/` oder puppeteer-bezogen |
| AC-146.5 | Regression frei: Lint, Tests, Build | ✅ ESLint 0 · vitest **2922/2922** · Build clean |
| AC-146.6 | Der nächste Bump kann nicht mehr still durchrutschen | ✅ `npm run verify:pdf-render` committet (Begründung unten) |

## Nachweis: un-gemockter Render-Durchlauf, 17/17 PASS

Der Kern der Slice. Die Route-Tests mocken `renderSnapshotPdf` **vollständig** — ein brechender
puppeteer-Upgrade wäre also grün durch die Suite gelaufen. Dieselbe Lücken-Klasse, die PROJ-142 bei
`pdfjs-dist` getroffen hat (gemockter Parser überlebte einen Major-Sprung) und PROJ-Y-142b für die
Dokument-Parser geschlossen hat. Deshalb: echtes Binary, echte Args, echtes HTTP.

Gefahren gegen **`HeadlessChrome/147.0.7727.0`**, extrahiert aus `@sparticuz/chromium@147.0.0` —
also gegen genau das Binary, das auf Vercel läuft — mit `chromium.args` (dem Lambda-Argumentsatz aus
der Produktion) und einem echten lokalen HTTP-Server, weil der Produktivcode auf
`response.ok()`/`status()` verzweigt und eine `data:`-URL dort `null` liefern würde.

| Aufrufstelle in `puppeteer-render.ts` | Ergebnis |
|---|---|
| `puppeteer.launch({args: chromium.args, defaultViewport, executablePath, headless})` | PASS |
| `browser.version()` über CDP | PASS — `HeadlessChrome/147.0.7727.0` |
| `browser.connected` | PASS |
| `browser.newPage()` | PASS |
| `page.setExtraHTTPHeaders({cookie})` — Cookie kommt wirklich an | PASS — Server sah `sb-probe=1` |
| `page.goto(..., {waitUntil:"domcontentloaded", timeout})` liefert Response ≠ null | PASS |
| `response.ok()` / `response.status()` | PASS — 200 |
| `page.waitForSelector("[data-report-print-ready='true']")` | PASS |
| `page.emulateMediaType("print")` | PASS |
| `page.evaluate(asyncFn, arg)` in der Form von `waitForPageAssets` | PASS — 1 Bild abgewartet |
| `page.pdf({format:"A4", printBackground, margin})` | PASS |
| PDF ist echt (`%PDF-`-Magic) und `.byteLength` nutzbar | PASS — 14.339 Bytes |
| Rückgabetyp bleibt `Uint8Array` (was der Supabase-Upload frisst) | PASS |
| Nicht-OK-Antwort wird über `response.ok()` erkannt | PASS — 404 |
| `page.close()` | PASS |

**Der Prüfstand ist nicht leerlaufend** — gegengeprüft: Selektor auf ein nicht existierendes Attribut
gedreht → `FAIL … Waiting for selector failed`, exit 1; danach zurück, wieder 17/17. Ohne diese
Gegenprobe wäre „17/17 grün" keine Aussage.

## Nebeneffekt: kleinere Angriffsfläche

`@puppeteer/browsers` 3.x hat den ganzen Entpack-/Proxy-Unterbau abgeworfen. Lockfile-Bilanz:
**34 Pakete entfernt, 8 hinzugefügt — netto −26** transitive Abhängigkeiten, darunter `extract-zip`,
`yauzl`, `@types/yauzl`, `fd-slicer`, `basic-ftp`, `get-uri`, die `pac-proxy-agent`-Kette,
`degenerator`, `escodegen`, `esprima`, `netmask`, `ast-types`.

## Deviations

- **D-146.1 — kein CIA-Pass.** `.claude/rules/continuous-improvement.md` macht CIA für *neue* Pakete
  zur Pflicht und nimmt Versionsbumps ohne Major-Wechsel ausdrücklich aus; ein Major-Bump eines
  **bestehenden** Pakets ist in keiner der beiden Listen. Behandelt als spec-folgende Remediation nach
  dem etablierten PROJ-140/142-Muster (gezielte Bumps statt `--force`), weil kein neues Paket, keine
  Architekturentscheidung und kein neues Muster entsteht — der Ersatz ist die un-gemockte Verifikation
  gegen das Prod-Binary. Nachträglicher Review sinnvoll, falls `@sparticuz/chromium` demnächst
  ebenfalls einen Major macht (die zwei müssen zusammen passen).
- **D-146.2 — `verify:pdf-render` läuft nicht in CI.** Es extrahiert ein ~190 MB Binary und startet
  es; das gehört nicht in die Unit-Suite und nicht in einen Required-Check. Bewusst ein bewusst
  aufzurufendes Skript, im Datei-Kopf dokumentiert.
- **D-146.3 — kein Prod-Render-Durchlauf in dieser Slice.** Verifiziert ist das exakte Prod-Binary mit
  exakten Prod-Args lokal; nicht verifiziert ist ein echter Snapshot-PDF-Lauf **auf** Vercel (braucht
  eine authentifizierte Prod-Session und schreibt Snapshot-Zeilen). Deshalb steht der Scope zunächst
  offen statt auf `full` — siehe „Offene Folgearbeit".

## Offene Folgearbeit

- **PROJ-Y-146a** — echter Report-Snapshot-PDF-Lauf gegen die deployte Vercel-Runtime im
  Test-Mandanten (Snapshot anlegen → `pdf_status='ready'` → PDF im `reports`-Bucket → aufräumen).
  Schließt D-146.3 und ist die Voraussetzung, den Scope auf `full` zu heben.
