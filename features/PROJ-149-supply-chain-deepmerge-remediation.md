---
id: PROJ-149
title: "Supply-Chain-Remediation deepmerge-ts (npm-audit- und OSV-Baseline zurück auf grün)"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: High
priority_source: "Must"
labels: ["hygiene", "supply-chain", "security", "ci"]
dependencies: []
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Supply-Chain-Remediation deepmerge-ts via Override — npm-audit + OSV Required-Checks zurück auf grün"
---

# PROJ-149: Supply-Chain-Remediation `deepmerge-ts`

## Status: Deployed
## Deployment Scope: full

**Created:** 2026-08-18
**Deployed:** 2026-08-18 — Tag `v2.59.0-PROJ-149` auf dem Merge-Commit **`4d9321a`** (PR #401, squash → `main`, gemergt 13:31:11Z durch `rechnungITC`)
**PR:** #401 — alle **8** Required-Checks grün, `mergeStateStatus: CLEAN` → **gemergt**
**Origin:** Der PROJ-74-Required-Check `npm audit production dependencies` ist auf `main` **selbst** rot
und blockiert per Branch-Protection **alle** offenen PRs (#397, #398, #399). Unabhängig nachgemessen:
`package.json` und `package-lock.json` sind byte-identisch mit `origin/main` (`git diff origin/main`
leer) — das Advisory ist also **nach** mains letztem grünen Lauf veröffentlicht worden, nichts im Repo
hat sich verschlechtert. Portfolioweit, kein Feature-Bug.

> **Hygiene-Slice** analog PROJ-29/42/74/140/142/146. Kein neues Feature, keine Migration,
> **keine `src/**`-Produktivcode-Änderung** — `package.json` + `package-lock.json`, plus **ein**
> zusätzlicher Regressionstest (siehe AC-149.6).

## Problem

`npm audit --omit=dev --audit-level=high` meldet **3 HIGH** über eine einzige Wurzel:

| Paket | Sev | Advisory | Herkunft |
|---|---|---|---|
| `deepmerge-ts <8.0.0` | **high** | GHSA-ggr8-5vv4-36mx — stack exhaustion beim Mergen rekursiver Objektgraphen (CVSS **8.2**) | transitiv |
| `html-to-text >=10.0.0` | high | hängt an verwundbarem `deepmerge-ts` | transitiv |
| `mailparser >=3.9.9` | high | hängt an verwundbarem `html-to-text` | **direkte Prod-Dependency** (`3.9.14`, exakt gepinnt) |

Installierter Baum vorher (gemessen, nicht vermutet):

```
projektplattform@0.1.0
└─┬ mailparser@3.9.14
  └─┬ html-to-text@10.0.0
    └── deepmerge-ts@7.1.5
```

Derselbe Befund unabhängig aus der **zweiten** Advisory-Quelle: der OSV-Scanner (PROJ-147) findet auf
dem `origin/main`-Lockfile genau **eine** Zeile — `deepmerge-ts 7.1.5 → GHSA-ggr8-5vv4-36mx`, CVSS 8.2 —
und der Schwellen-Gate `check:osv-gate` bricht mit exit 1 ab. Die Rotfärbung beider Gates hat also
**dieselbe einzige Ursache**, es steckt kein Dev-Dependency-Rauschen darin.

### Warum `npm audit fix --force` verboten ist

`npm audit` schlägt es selbst vor und benennt die Folge: *„Will install mailparser@3.9.8, which is a
breaking change"*. **3.9.8 liegt unter 3.9.9** — und 3.9.9 ist genau die Version, in der
**CVE-2026-3455** behoben wurde und auf die PROJ-70-δ deshalb bewusst gepinnt hat (von PROJ-140 später
auf 3.9.14 gehoben). Der „Fix" würde also eine geschlossene Lücke wieder aufreißen: dasselbe
sicherheits-absurde Muster, das in PROJ-140 (Next.js/`pdfjs-dist`) und PROJ-142 (`pdfjs-dist` 6→5)
dokumentiert ist, wo `--force` in ältere, verwundbarere Majors zurückdrehen wollte.

### Warum es keinen Upstream-Weg gibt (gemessen, nicht angenommen)

Der sauberste Weg wäre ein reiner Lockfile-Bump oder ein Elternpaket-Update — beides ist hier
**nachweislich versperrt**:

| Frage | Messung | Ergebnis |
|---|---|---|
| Gibt es eine gepatchte `deepmerge-ts`? | `npm view deepmerge-ts versions` | **ja** — `8.0.0` schließt das Advisory (`<8.0.0`), latest `8.0.1` |
| Lässt `html-to-text` sie zu? | `npm view html-to-text@10.0.0 dependencies.deepmerge-ts` | **nein** — `^7.1.5`, deckelt bei `<8` |
| Löst eine neuere `html-to-text` es? | `10.0.0` **ist** latest; `9.0.x` nutzt gar kein `deepmerge-ts` | **nein** — kein Range erlaubt `^8` |
| Löst eine neuere `mailparser` es? | `3.9.15` (latest) → `html-to-text: 10.0.0` **exakt** | **nein**, alle 3.9.x pinnen `10.0.0` hart |

Damit ist die Lage **spiegelbildlich zu PROJ-146**: dort gab es *keine* gepatchte Release, also musste
das Elternpaket weichen. Hier *gibt* es die gepatchte Release, aber der Range des Elternpakets deckelt
darunter und das Elternpaket selbst bewegt sich nicht. Ein Override ist damit nicht der bequemere,
sondern der **einzige** vorwärtsgerichtete Weg.

Nicht gewählt und warum: `html-to-text` per Override auf `9.x` zu drücken würde das Advisory zwar
umgehen (`>=10.0.0` ist der betroffene Bereich), wäre aber ein **Downgrade** quer durch einen exakten
Pin von `mailparser` — genau die Richtung, die PROJ-140/142 als Anti-Muster festgehalten haben.

### Gewählter Weg: `overrides: { "deepmerge-ts": "^8.0.0" }`

Ein Major (7→8) wird durch den `^7.1.5`-Range von `html-to-text` gezwungen. Das ist die riskante Sorte
Änderung, und `mailparser` ist **echter Produktivcode** (PROJ-70-δ `.eml`-Ingestion) — deshalb wurde die
Kompatibilität nicht behauptet, sondern in drei Stufen belegt (AC-149.4/149.5/149.6).

Baum nachher:

```
projektplattform@0.1.0
└─┬ mailparser@3.9.14        ← unverändert, NICHT auf 3.9.8 gedrückt
  └─┬ html-to-text@10.0.0    ← unverändert
    └── deepmerge-ts@8.0.1   ← gepatcht
```

## Akzeptanzkriterien

| # | Kriterium | Nachweis |
|---|---|---|
| AC-149.1 | `npm run audit:prod` exit 0, 0 Vulnerabilities | ausgeführt: vorher exit **1** / 3 HIGH → nachher `found 0 vulnerabilities`, exit **0** |
| AC-149.2 | Der OSV-Gate (zweite Advisory-Quelle) ist grün | Scanner exit **1** → **0**; `check:osv-gate` exit **1** (CVSS 8.2) → **0** („0 finding(s) total") |
| AC-149.3 | `mailparser` wird **nicht** unter 3.9.9 gedrückt | `npm ls` → `mailparser@3.9.14`, `html-to-text@10.0.0`, `deepmerge-ts@8.0.1` |
| AC-149.4 | Die von `html-to-text` benutzte API verhält sich unter v8 identisch | A/B-Probe, **byte-identische** Ausgabe (siehe unten) |
| AC-149.5 | Der ungemockte `mailparser`-Nachweis läuft und **berührt den geänderten Teilbaum** | Suite 15/15; Laufzeit-Instrumentierung belegt die Kette bis in `deepmerge-ts@8.0.1` |
| AC-149.6 | Der Nachweis kann eine Degradierung des geänderten Teilbaums auch **erkennen** | Rot-Grün: neuer Test rot bei simuliertem Teil-Merge, Altfall bleibt grün |
| AC-149.7 | Keine neuen Typfehler, keine Regression in Lint/Tests/Build | tsc **13 = Baseline / 0 neu** · ESLint **0** · vitest **3042/3042** · Build clean |
| AC-149.8 | Lockfile ist selbstkonsistent (kein „nur nach `npm install`"-Effekt) | `rm -rf node_modules && npm ci` → `deepmerge-ts 8.0.1` |
| AC-149.9 | Kein `src/**`-Produktivcode, keine Migration | Diff: `package.json` (+1), `package-lock.json` (+13/−3), **1** Testdatei |

### AC-149.4 — A/B der tatsächlich benutzten API, nicht der Versionsnummer

`html-to-text` nutzt genau eine Funktion aus `deepmerge-ts`, und zwar die konfigurierbarste:
`deepmergeCustom` (`lib/html-to-text.cjs:1399` und `:1404`), mit `filterValues`, einem eigenen
`mergeArrays` und einem `metaDataUpdater`, der einen `keyPath` mitführt, um **nur** das Wurzel-Array
`selectors` zu konkatenieren statt zu überschreiben. Genau solche Optionsnamen und Callback-Signaturen
sind das, was ein Major-Sprung bricht.

Die beiden Merger wurden daher aus `html-to-text@10.0.0` **verbatim** nachgebaut (Zeilen 1394–1424) und
mit einem realistischen Optionsgraphen (Defaults + User-Optionen, verschachtelte `options`,
Selector-Dedup) gegen **7.1.5** und **8.0.1** ausgeführt.

**Ergebnis:** beide exit 0, Ausgabe **byte-identisch** (`md5 e631f1e8fa26844cb6bfc97eb4961029`). Die
Probe ist nicht leerlaufend: die Ausgabe zeigt vier zusammengeführte `selectors` an der Wurzel (beweist,
dass der `metaDataUpdater`/`keyPath`-Zweig gefeuert hat) und einen deduplizierten Selector-Satz mit
überschriebenem `options`-Objekt (beweist den zweiten Merger).

> **Zwischenfall, der die Methode belegt:** der erste Probelauf meldete „identische Ausgabe" bei exit
> **1** auf beiden Seiten — beide Prozesse waren identisch mit `MODULE_NOT_FOUND` gescheitert, weil das
> Skript außerhalb der Installationsverzeichnisse lag. Ein Vergleich zweier Fehlschläge ist keine
> Kompatibilitätsaussage. Erst nach Korrektur (Skript *in* den Paketverzeichnissen, exit 0, substanzielle
> Ausgabe) trägt der Nachweis.

### AC-149.5 — der ungemockte Nachweis, und der Beweis dass er den Teilbaum trifft

`src/lib/context-ingestion/eml-parser.test.ts` fährt — anders als die γ-`file-parser`-Tests — die
**echte** Bibliothek (Dateikopf: *„these run the REAL mailparser on small inline RFC822 strings"*);
`grep` nach `vi.mock` findet nichts. Das ist die Suite, die PROJ-142/PROJ-Y-142b als tragfähig
ausgewiesen haben.

Entscheidend war aber nicht, *dass* sie ungemockt ist, sondern **ob sie den geänderten Teilbaum
überhaupt berührt**: `mailparser` ruft `html-to-text` nur dann, wenn eine Mail einen HTML-Teil und
**keinen** Text-Teil hat (`lib/mail-parser.js:788` → `text.push(htmlToText(node.textContent))`). Eine
Mail mit beiden Teilen würde am geänderten Code vorbeilaufen und trotzdem grün melden.

Nachgesehen statt angenommen: der Fixture-Builder setzt `text/html` **oder** `text/plain`, also
gegenseitig ausschließend — der HTML-Fall ist eine echte HTML-only-Mail. Und dann **gemessen** statt
erschlossen, per temporärer Instrumentierung (danach zurückgesetzt, 0 Rückstände):

| Glied der Kette | Beleg |
|---|---|
| Test → `parseEml` → mailparser → `html-to-text` | `htmlToText`-Aufruf protokolliert mit dem Fixture-HTML als Argument |
| → `deepmerge-ts` **7.1.5** | Merger-Aufruf mit 11-Schlüssel-Optionsgraph (`selectors`, `formatters`, `limits`, …) |
| → `deepmerge-ts` **8.0.1** (nach dem Fix) | Merger-Aufruf, identischer 11-Schlüssel-Graph |

Damit ist belegt, dass die grüne Suite die **neue** Version wirklich ausführt — und zwar mit genau dem
Optionsgraphen, den die A/B-Probe aus AC-149.4 nachgebaut hat.

### AC-149.6 — neuer Regressionstest, rot-grün belegt

Die vorhandene HTML-Abdeckung bestand aus einer Zusicherung: keine `<`-Zeichen mehr, zwei Wörter
vorhanden. Das ist **Basisverhalten** und überlebt sogar einen weitgehend kaputten Optionsgraphen —
`html-to-text` strippt Tags auch dann. Eine still degradierte Optionszusammenführung (etwa ein
`mergeArrays`-Regress, bei dem User-Optionen die Defaults *ersetzen* statt zu ergänzen) hätte
Link- und Listenformatierung verloren und wäre **grün durchgelaufen**. Das ist genau die
Blindheitsklasse, die PROJ-142/PROJ-Y-142b beschreiben.

Neuer Fall *„keeps option-dependent formatting (anchor href + list markers) intact"* prüft daher
Ausgabe, die **nur** bei intaktem Optionsgraphen entsteht: den vom `a`-Selector angehängten
`Spec [https://example.test/spec]` und die `* `-Listenmarker des Listen-Formatters.

**Rot-Grün, in zwei Stufen weil die erste zu grob war:**

| Simulierte Degradierung | Ergebnis | Aussage |
|---|---|---|
| `selectors` komplett geleert | **beide** Fälle rot (`parse_failed`) | zu katastrophal — `html-to-text` wirft, zeigt den Unterschied nicht |
| nur der Basis-`*`-Selector überlebt (= realistischer Teil-Merge) | **nur der neue Fall rot**, Altfall grün (14 passed) | belegt beides: der neue Test beißt, und die Altabdeckung war blind |

Danach zurückgesetzt: Suite wieder 15/15.

## Gates

| Gate | Ergebnis |
|---|---|
| `npm run audit:prod` | **0 vulnerabilities**, exit 0 (vorher exit 1 / 3 HIGH) |
| OSV-Scanner (v2.5.0, checksum-verifiziert) + `check:osv-gate` | exit **0** / 0 Findings (vorher exit 1 / 1 HIGH, CVSS 8.2) |
| `npx eslint .` | **0**, exit 0 |
| `npx tsc --noEmit` | **13** Fehler = exakte Baseline, **0 neu**, keiner in der geänderten Datei |
| `npx vitest run` | **3042/3042** in 384 Dateien (Baseline 3041 + 1 neuer Fall) |
| `npm run build` | clean, exit 0 |
| `npm run check:index-scope` | 0 errors, exit 0 |
| `npm run check:migration-naming` | 0 errors, exit 0 (unberührt) |
| **CI am PR #401** | **8/8 pass** — darunter `npm audit production dependencies` **pass** (auf `main` vorher rot) und `OSV scan of the dependency lockfile` **pass**; dazu Schema-Drift, Migration-Naming, Index-Scope, Snyk, **Vercel-Build pass** |

## Abgrenzung / Deviations

- **D-149.1 — Override statt Upstream-Bump.** Unvermeidbar und in der Problemanalyse tabellarisch
  belegt: `deepmerge-ts@8` existiert, aber **kein** `html-to-text`- und **kein** `mailparser`-Release
  lässt sie zu. Der erzwungene Major ist durch die A/B-Probe der einen benutzten Funktion, die
  instrumentierte Laufzeitkette und den neuen Rot-Grün-Test abgesichert.
- **D-149.2 — Expositionsbewertung, kein Freibrief.** Das Advisory beschreibt stack exhaustion beim
  Mergen **rekursiver Objektgraphen**. In unserem Pfad merged `deepmerge-ts` ausschließlich den
  *Optionsgraphen* von `html-to-text` (von uns/der Bibliothek gestellt, nicht aus der E-Mail); der
  HTML-Inhalt einer hochgeladenen `.eml` wird von `htmlparser2` geparst, nicht gemerged. Die praktische
  Angreifer-Exposition über den PROJ-70-Ingestionspfad ist damit gering. Das ist als Einordnung
  festgehalten, **nicht** als Grund, das Gate zu umgehen — Required-Check ist Required-Check.
- **D-149.3 — eine Testdatei mitgeändert.** Anders als PROJ-146 („keine `src/**`-Änderung") berührt
  diese Slice `src/lib/context-ingestion/eml-parser.test.ts`. Kein Produktivcode, und die Begründung ist
  der Kern von AC-149.6: ohne den neuen Fall wäre der Nachweis gegen genau die Degradierung blind, die
  ein Major-Sprung wahrscheinlich macht.
- **D-149.4 — Instrumentierung war temporär.** Die Laufzeitbelege aus AC-149.5/149.6 entstanden durch
  Anhängen von Wrappern an Dateien in `node_modules` (nicht versioniert). Alle Änderungen wurden aus
  Sicherungskopien zurückgesetzt und mit `grep -c "PROJ-149"` → **0** gegengeprüft; danach zusätzlich
  `rm -rf node_modules && npm ci`, sodass der Endzustand nachweislich aus dem Lockfile stammt.
- **D-149.5 — `deepmerge-ts@8` verengt seine `exports`.** Beim Sondieren aufgefallen: v8 hat eine
  `exports`-Map (`import`/`require`/`types`) und stellt `./package.json` **nicht** mehr bereit, v7.1.5
  hatte gar keine Map. Ein `require('deepmerge-ts/package.json')` bricht dadurch. Für dieses Repo
  irrelevant — einziger Konsument ist `html-to-text`, das nur den Paket-Root importiert — aber
  festgehalten, weil es der eine echte Bruch ist, den der Major mitbringt.
- **D-149.6 — Merge war ein Folgeschritt.** Der Bau-Lauf endete bewusst auf `Approved`/`—`. Eingelöst am
  2026-08-18: gemergt als `4d9321a`, Scope beim Abschluss eingetragen (siehe unten).

## Deployment (2026-08-18)

**Tag `v2.59.0-PROJ-149` auf dem Merge-Commit `4d9321a`** — nicht auf dem Buchführungs-Commit dieses
Abschlusslaufs. Der Tag markiert, was ausgeliefert wurde; die Auslieferung ist der Merge nach `main`
(Vercel deployt automatisch von `main`), nicht die nachgezogene Statuszeile. Ein Tag auf dem Doku-Commit
würde auf einen Stand zeigen, der die Änderung gar nicht einführt.

Beim Abschluss **unabhängig nachgemessen** statt aus dem Bau-Lauf übernommen:

| Prüfung | Ergebnis |
|---|---|
| PR #401 wirklich gemergt | `state: MERGED`, `mergeCommit 4d9321a`, `mergedAt 2026-08-18T13:31:11Z` |
| `4d9321a` wirklich auf `main` | `git merge-base --is-ancestor 4d9321a origin/main` → **ja** |
| Required-Checks am PR | **8/8 SUCCESS**, darunter `npm audit production dependencies` und `OSV scan of the dependency lockfile` (beide Advisory-Quellen) sowie der **Vercel-Build** |
| Vercel-Produktion | `dpl_DVswsf63d9atjJ4Y2kujy1fCkZsH`, `target: production`, **`state: READY`**, `githubCommitSha 4d9321a` — der erzwungene Major baut und läuft in der echten Zielumgebung (PROJ-146-Muster) |
| Laufzeitfehler nach dem Deploy | **0** im 6-h-Fenster über beide Produktions-Deploys |
| AC-149.1 erneut | `npm run audit:prod` → `found 0 vulnerabilities`, exit **0** |
| AC-149.3 + AC-149.8 erneut | `rm -rf node_modules && npm ci` → `mailparser@3.9.14` → `html-to-text@10.0.0` → **`deepmerge-ts@8.0.1`**; `mailparser` nachweislich **nicht** unter 3.9.9 gedrückt |
| AC-149.9 erneut | Diffstat von `4d9321a`: `package.json` +1, `package-lock.json` +13/−3, **1** Testdatei, 2 `features/`-Dateien — **kein** Produktivcode, keine Migration |

**Fund beim Abschluss (Umgebung, nicht Produkt):** der Abschluss-Worktree war mit einer
hardlink-kopierten `node_modules` bestückt, die **vor** dem Override entstanden war — auf der Platte lag
noch `deepmerge-ts@7.1.5` (`npm ls` meldete `invalid: "^8.0.0" from node_modules/html-to-text`), während
Sperrdatei und `package.json` korrekt auf `8.0.1`/`^8.0.0` standen. `npm audit` liest die Sperrdatei und
meldete deshalb schon vorher grün; jeder **Test-** oder **Build**-Lauf in diesem Worktree hätte aber den
Zustand *vor* dem Fix gemessen und wäre trotzdem grün gewesen. Genau die Blindheitsklasse, gegen die
AC-149.8 geschrieben ist. Behoben durch `rm -rf node_modules && npm ci` (betrifft nur das eigene
Verzeichnis — das Entfernen einer Hardlink-Referenz lässt die übrigen Worktrees unberührt); alle unten
protokollierten Gates sind **danach** gemessen, laufen also gegen `deepmerge-ts@8.0.1`.

### Warum `full` und nicht `tooling-only`

Nach der in PROJ-146 getroffenen und dort begründeten Auslegung, hier eigens gegengeprüft: die Taxonomie
hat keinen eigenen Eimer für Abhängigkeits-/Sicherheitspflege, und `tooling-only` verlangt, dass der
Ausgang „repository tooling, CI, tests, or workflow" betrifft. Das trifft **nicht** zu — getauscht wird
eine **Produktions**-Laufzeitabhängigkeit im `.eml`-Ingestionspfad (PROJ-70-δ); `mailparser` steht in
`dependencies`, nicht in `devDependencies`, und `html-to-text` wird zur Laufzeit für HTML-only-Mails
aufgerufen. `mvp` und `alpha` behaupten beide zurückgestellte Arbeit, die es hier nicht gibt. Damit ist
`full` der einzige zutreffende Wert, und er ist kriterienweise erfüllt: AC-149.1–149.9 alle belegt,
nichts zurückgestellt, kein Critical/High offen. Gleiche Einordnung wie die drei Präzedenzfälle
PROJ-140, PROJ-142 und PROJ-146.

Die **Waiver**-Ausnahme aus `.claude/rules/general.md` wird **nicht** in Anspruch genommen und war nicht
nötig: kein Akzeptanzkriterium ist wörtlich unerfüllt.

### Gates beim Abschluss (nach `npm ci`, auf `main`-Stand `9a2d59e`)

| Gate | Ergebnis |
|---|---|
| `npm run audit:prod` | **0 vulnerabilities**, exit 0 |
| `npx eslint .` | **0**, exit 0 |
| `npx tsc --noEmit` | **13** = exakte Baseline, **0 neu**, keiner in `eml-parser.test.ts` |
| `npm test` (vitest) | **3058/3058** in 385 Dateien, exit 0 |
| `npm run build` | clean, exit 0 |
| `npm run check:index-scope` | 173 Zeilen, **0 errors**, exit 0 |
| `npm run check:migration-naming` | 217 Migrationen, **0 errors**, exit 0 (unberührt — keine Migration in dieser Slice) |

## Definition of Done

- [x] `npm run audit:prod` exit 0, 0 Vulnerabilities
- [x] OSV-Scanner + `check:osv-gate` grün (zweite Advisory-Quelle)
- [x] `mailparser` **nicht** unter 3.9.9 gedrückt (bleibt 3.9.14)
- [x] Kein Upstream-Weg existiert — tabellarisch gemessen, nicht behauptet
- [x] A/B der benutzten `deepmergeCustom`-API: byte-identisch v7.1.5 vs v8.0.1
- [x] Ungemockter `mailparser`-Nachweis 15/15, HTML-Pfad **belegt** durchlaufen bis `deepmerge-ts@8.0.1`
- [x] Neuer Regressionstest rot-grün bewiesen (Altfall bleibt bei Teil-Merge blind)
- [x] tsc-Baseline unverändert (13, 0 neu) · ESLint 0 · vitest 3042/3042 · Build clean
- [x] Lockfile selbstkonsistent (`npm ci` aus sauberem Zustand)
- [x] `node_modules`-Instrumentierung restlos zurückgesetzt
- [x] Required-Checks **am PR** grün: #401, **8/8 pass**, `mergeStateStatus: CLEAN` — beide Supply-Chain-Gates bestätigen den Fix in CI, nicht nur lokal; der **Vercel-Build** belegt zusätzlich, dass der erzwungene Major in der echten Zielumgebung baut (PROJ-146-Muster)
- [x] Merge nach `main` (`4d9321a`, 2026-08-18 13:31:11Z) → Status `Deployed` + Scope `full` eingetragen
- [x] Vercel-Produktions-Deploy von `4d9321a` **READY** verifiziert; 0 Laufzeitfehler danach
- [x] Nachziehen der blockierten PRs: #397 (PROJ-Y-2) und #398 (PROJ-Y-143b/k/l) sind seither **gemergt**
      — der Zweck der Slice (Repo entblocken) ist damit belegt eingetreten. #399 (PROJ-80-α-Frontend) ist
      eine eigene, weiterhin offene Slice; das war schon im Bau-Lauf als „Folgeschritt, nicht Teil dieser
      Slice" abgegrenzt und ist deshalb **kein** zurückgestelltes Akzeptanzkriterium dieser Slice.
