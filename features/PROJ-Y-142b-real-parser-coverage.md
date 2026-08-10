---
id: PROJ-Y-142b
title: "Un-gemockte Parser-Abdeckung (mammoth · msgreader · file-type-Dispatch) + Sniff-Fix"
issue_type: Chore
epic_code: HYGIENE
epic_title: "Hygiene & Supply-Chain"
priority: High
priority_source: "Should"
labels: ["hygiene", "testing", "security"]
dependencies: ["PROJ-142"]
roles: ["Platform"]
summary_for_jira: "[HYGIENE] Un-gemockte Parser-Abdeckung für die Kickoff-Ingestion + Full-Buffer-Sniff-Fix"
---

# PROJ-Y-142b: Un-gemockte Parser-Abdeckung

## Status: Deployed (2026-08-10)
**Deployed:** 2026-08-10 — PR #305 → main (`e6607f3`), Tag `v2.37.0-PROJ-Y-142b`. Alle 6 Required-Checks grün. Vercel-Prod `dpl_7Sp1114P` READY auf main HEAD; Post-Deploy-Smoke `/`, `/projects`, `/api/context-sources` (der vom Sniff-Fix betroffene Upload-Pfad) → alle 307 Auth-Gate. Kein Env/Secret, keine Migration.
**Created:** 2026-08-10
**Origin:** Followup aus PROJ-142. Dort fiel auf, dass `file-parser.test.ts` seine Bibliotheken vollständig mockt und deshalb **über einen Major-Sprung hinweg grün blieb** (`pdfjs-dist` 5.6.205 → 6.2.108). PROJ-142 schloss die Lücke nur für PDF; die übrigen Parser blieben mock-only.

> **Hygiene-Slice.** Kein Feature, keine Migration, kein Schema-Change. Enthält **eine** Produktivcode-Änderung: einen Ein-Zeilen-Fix, den die neue Abdeckung aufgedeckt hat (s. u.).

## Scope-Korrektur gegenüber der ursprünglichen Followup-Notiz

Die Notiz aus PROJ-142 nannte pauschal „mammoth, mailparser, msgreader". Gegen den Code geprüft stimmte das nur zur Hälfte:

| Bibliothek | Ist-Zustand vorher | Handlungsbedarf |
|---|---|---|
| `mailparser` (.eml) | **bereits echt getestet** — `eml-parser.test.ts` fährt bewusst die reale Lib auf Inline-RFC822 | **keiner** |
| `mammoth` (.docx) | in `file-parser.test.ts` gemockt | ✅ neu abgedeckt |
| `@kenjiuno/msgreader` (.msg) | in `msg-parser.test.ts` gemockt | ✅ neu abgedeckt |
| `file-type` (Dispatch) | in `file-parser.test.ts` gemockt; PROJ-79 deckt nur den **DMS**-Pfad ab | ✅ neu abgedeckt |

## Der msgreader-Mock beruhte auf einer überholten Annahme

`msg-parser.test.ts` begründet seinen Mock mit „constructing real CFB binaries in tests is impractical". Das stimmt nicht mehr: das Paket liefert seinen **eigenen CFB-Writer** unter `lib/Burner` mit. Damit lassen sich echte Compound-File-Bytes erzeugen und mit dem echten Reader zurücklesen — **ohne neue Dependency und ohne eingecheckte Binär-Fixture**.

**Ehrliche Grenze, dokumentiert im Fixture:** Writer und Reader stammen aus demselben Paket. Der Test beweist damit *nicht* die Kompatibilität mit Outlook-erzeugten Dateien. Er beweist, dass der echte CFB-Parse-Pfad läuft, das echte MAPI-Field-Mapping auflöst und unser Wrapper-Vertrag hält — genau die Regressionsklasse, die ein stiller Dependency-Bump sonst passieren würde.

## Gefundener und behobener Fehler: `sniffMagic` schnitt den Buffer ab

Die neue Dispatch-Abdeckung hat einen echten Defekt aufgedeckt:

`sniffMagic` übergab `file-type` nur `buffer.subarray(0, 4_100)`. `.docx` ist ein ZIP-Container; liegt der erste gespeicherte Eintrag über diesem Fenster, meldet der Kopf nur `application/zip` — das steht nicht auf der Allowlist, also wurde ein **gültiges .docx mit `unsupported_mime` (415) abgewiesen**.

- **Warum es nie auffiel:** Word schreibt `[Content_Types].xml` als ersten Eintrag, deshalb überlebt die Mehrheit realer Dateien den Slice. Empirisch geprüft: selbst mit 60 KB Media-Teil *danach* wird korrekt erkannt. Erst wenn ein großer Eintrag **davor** liegt, kippt es.
- **Warum der Bestandstest es nicht fangen konnte:** `file-type` war dort gemockt.
- **Es war bereits einmal gelöst:** PROJ-79 hat exakt diesen Fehler im DMS-Pfad gefunden und auf Full-Buffer umgestellt (`src/lib/dms/mime.ts:106-110`). Der Ingestion-Pfad blieb zurück — die beiden Upload-Wege waren uneinig darüber, ob dieselbe Datei zulässig ist.
- **Fix:** vollen Buffer übergeben, wie im DMS-Pfad. **Kein Performance-Problem:** auf einem 25-MB-Buffer gemessen 1,4 ms (gegenüber 0,0 ms für den Slice) — `file-type` liest lazy.
- **Red-Green bewiesen:** gegen den Vorher-Stand fällt genau der neue Regressionstest, die übrigen 8 der Suite bleiben grün.

## Nebenbefund: die Suites müssen in der `node`-Umgebung laufen

msgreader prüft `arrayBuffer.buffer instanceof ArrayBuffer` (`DataStream.js:42`). Unter der Repo-Default-Umgebung `jsdom` gehört der globale `ArrayBuffer` einem anderen Realm an als der `.buffer` eines Node-`Buffer`, sodass **jeder** echte Parse mit „Unknown arrayBuffer" scheitert. Das ist ein Harness-Artefakt, kein Produktfehler — diese Parser laufen ausschließlich serverseitig (`/api/context-sources`). Die betroffenen Suites tragen deshalb `@vitest-environment node` und laufen damit dort, wo auch die Produktion läuft.

Wert dieses Befunds: ein naiver echter Test unter jsdom hätte ausgesehen wie „die Bibliothek ist kaputt".

## Acceptance Criteria

- **AC-Y142b.1** `parseDocx` läuft in mindestens einem Test gegen das echte `mammoth` mit einem echten `.docx`.
- **AC-Y142b.2** `parseMsg` läuft gegen das echte `@kenjiuno/msgreader` mit echten CFB-Bytes (Magic `d0cf11e0a1b11ae1` assertiert).
- **AC-Y142b.3** `parseFile` wird end-to-end mit echtem `file-type` geprüft: korrektes Routing für PDF/DOCX/CFB/EML, Magic schlägt lügenden Caller-Hint, Allowlist- und Undetectable-Ablehnung getrennt.
- **AC-Y142b.4** Keine neue Dependency, keine eingecheckte Binär-Fixture.
- **AC-Y142b.5** Jeder aufgedeckte Produktivfehler ist behoben und durch einen Test gepinnt, dessen Red-Green nachgewiesen ist.
- **AC-Y142b.6** Volle Regression grün; keine neuen tsc-/Lint-Fehler.

## Umsetzung

| Datei | Art | Inhalt |
|---|---|---|
| `src/lib/context-ingestion/real-document-fixtures.ts` | neu | `buildPdf` / `buildDocx` (jszip) / `buildMsg` (msgreader-Burner) + `MSG_PROP`-Tags |
| `src/lib/context-ingestion/docx-parser.real.test.ts` | neu | echtes mammoth: Extraktion, Excerpt-Cap vs. `full_text`, Size-Cap, Fehler-Propagation (4 Fälle) |
| `src/lib/context-ingestion/msg-parser.real.test.ts` | neu | echtes msgreader: Field-Mapping, HTML-Fallback (AC-δH-5), `msg_parse_failed` (AC-δH-4), Size-Cap (4 Fälle) |
| `src/lib/context-ingestion/file-parser.dispatch.real.test.ts` | neu | echtes file-type + echte Parser: 9 Dispatch-Fälle inkl. Sniff-Regression |
| `src/lib/context-ingestion/pdf-parser.real.test.ts` | geändert | nutzt den gemeinsamen `buildPdf` statt einer lokalen Kopie |
| `src/lib/context-ingestion/file-parser.ts` | **Fix** | `sniffMagic`: voller Buffer statt 4100-Byte-Slice + Doc-Korrektur |

Die Bestands-Mocks in `file-parser.test.ts` / `msg-parser.test.ts` bleiben absichtlich bestehen: sie decken schnell die Verzweigungs- und Guard-Logik ab. Die neuen Suites treten daneben und decken das ab, was ein Mock prinzipiell nicht kann.

## Quality Gates

| Gate | Ergebnis |
|---|---|
| vitest | **2627/2627** (342 Files, +17 neu gegenüber 2610) |
| context-ingestion isoliert | 92/92 über 9 Files |
| ESLint | **0**, Exit 0 |
| tsc | **13 vorbestehend, 0 neu** |
| Build | ✓ Compiled successfully (12,6 s) |
| Red-Green Sniff-Fix | gegen Vorher-Stand genau 1 Fehlschlag (der neue Test), 8 grün |
| Full-Buffer-Sniff auf 25 MB | 1,4 ms |

## Deviations

- **D-Y142b.1** — `mailparser` war entgegen der ursprünglichen Followup-Notiz bereits real getestet; kein Handlungsbedarf. Die Notiz war zu breit formuliert.
- **D-Y142b.2** — Der MSG-Test nutzt den Writer desselben Pakets; Outlook-Datei-Kompatibilität bleibt ungeprüft (im Fixture dokumentiert). Eine eingecheckte echte Outlook-`.msg` wäre die einzige Alternative und wurde gegen AC-Y142b.4 abgewogen.
- **D-Y142b.3** — `real-document-fixtures.ts` liegt unter `src/`, obwohl es reiner Test-Support ist; das Repo hat keine `__fixtures__`-Konvention, und vitest sammelt nur `*.test.ts`. Von Produktivcode nie importiert.
- **D-Y142b.4** — `jszip` wird transitiv über `mammoth` bezogen statt als direkte devDependency (Präzedenz: PROJ-79 `mime.ooxml.test.ts`). Vertretbar, weil wir DOCX **für** mammoth bauen; fiele mammoth weg, entfiele auch der Test.

## Follow-ups

- ~~**PROJ-Y-142c** — Route-Level-Smoke für denselben Fall.~~ **Erledigt 2026-08-10** → [PROJ-Y-142c](PROJ-Y-142c-route-level-upload-smoke.md): `route.upload.real.test.ts` bestätigt **201 statt 415** am Endpunkt (red-green: `expected 415 to be 201`), plus Negativkontrollen, dass das Allowlist-Tor unverändert greift. Nebenbei die erste Testabdeckung für `route.ts` überhaupt.
