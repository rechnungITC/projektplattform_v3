# PROJ-145: Portfolio-Migration — `Deployment Scope` als eigene Spalte

## Status: Approved
## Deployment Scope: —
**Zum Scope:** leer, weil für `Approved` kein Scope zulässig ist. Beim Deploy wird
`tooling-only` gesetzt — die Slice liefert keine Produkt-Laufzeitfähigkeit, sondern eine
Registerspalte, einen ausführbaren Wächter und zwei nachgeholte Buchungen.
**Created:** 2026-08-12
**Last Updated:** 2026-08-12

## Summary

`.claude/rules/general.md` und `CLAUDE.md` machen **Deployment Scope** zu einem eigenen Pflichtfeld
neben dem Lifecycle-Status: der Status sagt, wo eine Slice im Arbeitsablauf steht, der Scope sagt,
**was** tatsächlich ausgeliefert wurde. `features/INDEX.md` führte diese Spalte nicht — und weil die
Regel in diesem Fall ausdrücklich verlangt, die Buchführung **abzubrechen** statt Scopes zu raten,
war jede weitere `Deployed`-Buchung blockiert. Getroffen hat es zwei fertige, live laufende Slices:
**PROJ-130** (Audit-Trail, α–ε gebaut und live verifiziert, Tag `v2.51.0`) und **PROJ-144**
(Work-Item-Anlage aus Spracheingabe, Tag `v2.52.0`).

Diese Slice führt die Spalte ein, bucht die zwei wartenden Zeilen evidenzbasiert, macht die Regel
maschinell prüfbar und schreibt die Altlast **sichtbar** auf, statt sie zu erfinden.

Der Anlass ist kein Formalismus. Die Regel entstand, weil „Deployed" mehrfach für Arbeit vergeben
wurde, die in Teilen deferiert war (PROJ-141-γ1) — ein Register, das 139-mal „fertig" sagt und
dabei Verschiedenes meint, ist als Steuerungsinstrument wertlos.

## Nutzer-Entscheid (Lock)

Der Weg war vor dem Bau festgelegt und ist bindend:

> Spalte einführen, neue/verifizierte Slices sofort korrekt klassifizieren, Altzeilen **explizit**
> als „– nicht klassifiziert –" markieren und die Schuld sichtbar lassen statt zu raten; danach
> zeilenweise Audit gegen Spec/AC/QA/Code.

Daraus folgt der Zuschnitt: **die 139 Altzeilen werden hier NICHT klassifiziert.** Das ist keine
Abkürzung, sondern die Anwendung der Regel — „do not bulk-infer scope from existing `Deployed`
labels". Eine Klassifikation aus dem alten Etikett heraus wäre genau die Unwahrheit, gegen die die
Regel geschrieben wurde, nur mit mehr Spalten.

## Erhebung (gemessen, nicht geschätzt)

| Größe | Wert | Messweg |
|---|---|---|
| PROJ-Zeilen in `features/INDEX.md` | **164** | Zeilen mit Präfix `\| PROJ-` |
| davon mit `Deployed`-Status | **139** | Status-Zelle end-verankert geparst, `startsWith("Deployed")` |
| davon vor-Deployment (`Planned`/`In Review`/`Approved`) | **24** | Gegenprobe: 139 + 24 + 1 = 164 |
| `Superseded` | **1** | PROJ-108 |
| Zeilen mit **unescapten** Pipes in der Prosa | **4** | PROJ-78 · 79 · 142 · 144 |

**Zwei Korrekturen an vorher notierten Zahlen** — beide stammen aus dieser Slice, nicht aus einem
fremden Fehler, und beide sind der Grund, Zahlen zu messen statt weiterzureichen:

- **„138 Deployed-Altzeilen" war um eins daneben; korrekt sind 139.** Eine Substring-Suche nach
  `Deployed` zählt PROJ-130 mit, dessen Status `Approved (… Deployed/Scope pending
  Portfolio-Migration)` das Wort in der Klammer trägt. Die frühere Angabe „139" aus dem ersten Lauf
  war zwar richtig, aber über eine Ganzzeilen-Suche gewonnen und damit methodisch nicht belastbar —
  sie stimmte nur zufällig.
- **„Fünf Zeilen tragen Pipes in der Prosa" waren vier.** PROJ-92 und PROJ-Y-142a tragen
  ausschließlich **escapte** Pipes (`\|`) und sind unauffällig; dafür trägt PROJ-144 drei
  unescapte — eingebracht durch den Messtext, der genau dieses Problem beschreibt.

## Acceptance Criteria

- **AC-145.1** `features/INDEX.md` führt `Deployment Scope` als **eigene Spalte** zwischen `Status`
  und `Spec`; Kopf- und Trennzeile passen dazu.
- **AC-145.2** Jede der 164 Feature-Zeilen trägt genau sechs Zellen; keine Zeile verliert Inhalt.
- **AC-145.3** Die vier Zeilen mit unescapten Prosa-Pipes sind repariert (`\|`), damit die Tabelle
  überhaupt gültig ist — Voraussetzung für jede Zellzählung.
- **AC-145.4** Vor-Deployment-Zeilen tragen `—`; `Superseded` trägt `superseded`.
- **AC-145.5** Die 139 Alt-`Deployed`-Zeilen tragen den ausdrücklichen Übergangsmarker
  `– nicht klassifiziert –` (kein erfundener Scope).
- **AC-145.6** PROJ-130 und PROJ-144 sind aus ihren Akzeptanzkriterien und Nachweisen klassifiziert
  und auf `Deployed` gebucht; die Begründung steht in beiden Specs.
- **AC-145.7** Die Regel ist **ausführbar**: `npm run check:index-scope` prüft Spalte, Zellenzahl,
  erlaubte Werte und erlaubte Status/Scope-Kombinationen, hard-failt bei Verstoß und weist die Zahl
  der unklassifizierten Zeilen als Warnung aus.
- **AC-145.8** Der Wächter ist rot-grün belegt — nicht nur „grün auf einer korrekten Datei".
- **AC-145.9** Die offene Altlast ist als Folgearbeit registriert, mit Umfang und Methode.

## Klassifikation der zwei wartenden Zeilen

Beide aus Spec, AC-Liste, QA-Ergebnis und Deploy-Nachweis abgeleitet — nicht aus dem Status-Etikett.

### PROJ-130 → `mvp`

Alle fünf geplanten Sub-Slices (α β γ δ ε) sind gebaut, live und per Live-Pentest gegen Prod
verifiziert. `full` ist trotzdem **nicht** zulässig:

- **AC-5 („konfigurierbare Speicherdauer") wurde per PO-Lock umgekehrt statt erfüllt** — die Spec
  sagt das selbst so (Z. 124/162: „Das AC wird nicht erfüllt, sondern begründet aufgehoben"). Die
  Umkehr ist produktlich stärker als das Original (unbegrenzte Aufbewahrung schützt den Trail), aber
  formal ist das Kriterium offen.
- **Kein Legal-Hold** — bewusst weggelassen und als Abweichung dokumentiert.
- **Restabdeckung** der 132 mandantenbezogenen Tabellen ist nicht Teil von β → PROJ-Y-130d.

Damit greift die `mvp`-Definition wörtlich: eine ausdrücklich freigegebene, nutzbare Grenze ist
ausgeliefert, und jede weggelassene Original-Anforderung ist benannt und verfolgt (PROJ-Y-130a…o).

### PROJ-144 → `full`

Kein offenes Akzeptanzkriterium (F-8 wurde durch PROJ-Y-144d geschlossen, 3/3 chromium), QA 0
Critical/0 High, und die Nachweislage trifft genau die Arten, die die Regel selbst zulässt: **Live-
RLS-Pentest 17/17 gegen die Prod-Datenbank** (Datenschicht in Produktion), **E2E-Kette** über
Diktat → Korrektur → Bestätigung → genau ein Work-Item (Anwendungsschicht), **Produktions-Smoke**
plus `READY`-Deployment, aktives Assistant-Modul im Prod-Mandanten und 0 Laufzeitfehler.

**D-144.1 ist keine Deferrierung**, sondern eine Unmöglichkeit: AC-144.23 verlangt ein
Modul-Gate „Backlog", aber `ModuleKey` hat keinen Backlog-Schalter, weil Backlog Kern ist. Die
Hälfte, die existieren kann, ist erfüllt.

**Abweichende Bewertung gegenüber der Schwester-Lane, mit Grund:** der PROJ-144-Deploy-Nachtrag
notierte, ein *mutierender* Durchlauf durch die deployte Vercel-Laufzeit fehle und sei „beim Upgrade
auf Scope `full` nachzuholen". Entschieden wird hier am Regeltext, nicht nach Gefühl: die Regel
verlangt für `full` „production behavior is verified" und nennt als taugliche Nachweise
ausdrücklich „API/RPC/RLS tests, UI/E2E checks, production smoke" — alle drei liegen vor. Der
zusätzliche Durchlauf über die Kombination *deployte Laufzeit + Prod-Datenbank* ist zusätzliche
Absicherung, kein unerfülltes Kriterium; er ist als PROJ-Y-145a registriert. Was die Regel
ausschließt, ist der Auth-Redirect **allein** — der ist hier nicht die Grundlage.

## Methode

**Am Zeilenende verankern, nie an Feldnummern.** Jede Zeile endet auf
`| <status> | <spec> | <datum> |`; die vier rechten und zwei linken strukturellen Pipes bilden den
Rahmen, alles dazwischen ist Prosa. Eine feldbasierte Ersetzung hätte die vier Zeilen mit
Prosa-Pipes zerrissen — genau jene, die ohnehin schon falsch rendern.

Ablauf: Prosa-Pipes escapen → Zeile in fünf Zellen zerlegen → Scope-Zelle an Position 4 einsetzen →
Kopf/Trennzeile ersetzen. Danach drei unabhängige Prüfungen, davon eine tragend:

1. Zellenzahl je Zeile = 6.
2. **Inhaltstreue:** neue Scope-Zelle entfernen, Escaping rückgängig machen, mit der Vorher-Datei
   vergleichen — es dürfen ausschließlich die zwei Zeilen abweichen, deren Status absichtlich
   geändert wurde. Ergebnis: 162 von 164 Zeilen byte-identisch, abweichend nur PROJ-130 und
   PROJ-144. Das ist der eigentliche Beweis, dass nichts verlorenging.
3. Status/Scope-Kombinationen gegen die Regeltabelle.

Das Umbau-Skript ist einmalig und bleibt im Scratchpad; im Repo landet stattdessen der **dauerhafte**
Wächter, weil eine Regel, die niemand ausführen kann, zurückdriftet.

## Out of Scope

- **Klassifikation der 139 Altzeilen** (Nutzer-Lock) → PROJ-Y-145b.
- Keine Änderung an Zeileninhalten außer den vier Pipe-Reparaturen und den zwei Statuswechseln.
- Kein Eintrag in die Branch-Protection: der neue Check muss vom Repo-Eigner als Required Check
  eingetragen werden (offener Handoff, wie bei PROJ-42/74/134).

## Deviations

- **D-145.1** — Die Slice läuft unter der ID **PROJ-145** (nächste freie laut INDEX). Eine
  Parallel-Session hatte sie kurz zuvor als `PROJ-Y-145` im Register angelegt; ein `PROJ-Y-`-Präfix
  bezeichnet hier den Folgekandidaten eines Elternfeatures, und ein Elternteil „145" gibt es nicht.
  Der Registereintrag ist auf PROJ-145 zusammengeführt — zwei IDs für eine Sache wären genau die
  Buchhaltungsfäule, die diese Slice behebt.
- **D-145.2** — `– nicht klassifiziert –` ist bewusst **kein** Scope-Wert. Der Wächter behandelt ihn
  als gezählten Übergangszustand: erlaubt auf `Deployed`-Zeilen, verboten überall sonst, und in jedem
  Lauf als Warnung mit Anzahl ausgewiesen.
- **D-145.3** — Die vier Pipe-Reparaturen sind ein Bestandsfund und formal nicht Teil der Migration.
  Sie werden hier behoben, weil ohne gültige Tabelle keine Zellzählung und damit kein Wächter
  möglich ist.

## Implementation Notes

**Gebaut 2026-08-12** in eigenem Worktree (`projektplattform_v3-proj145`), weil im Haupt-Checkout
eine Parallel-Session und sechs weitere Lanes aktiv waren.

- `features/INDEX.md`: Spalte eingeführt, 164 Zeilen umgebaut, 7 Prosa-Pipes in 4 Zeilen escapt,
  neue PROJ-145-Zeile, „Next Available ID" auf PROJ-146.
- `scripts/check-index-scope/{analyze,index}.ts` + `analyze.test.ts`, `npm run check:index-scope`,
  Workflow `.github/workflows/index-scope.yml` (reine Dateianalyse, keine Secrets).
- PROJ-130 → `Deployed`/`mvp`, PROJ-144 → `Deployed`/`full`, jeweils mit Begründung in der Spec.

**Zwei eigene Fehler, von den Tests gefangen:**

- Die „keine PROJ-Zeilen gefunden"-Prüfung hing an der Liste **erfolgreich geparster** Zeilen. Eine
  einzige kaputte Zeile hätte damit zusätzlich „ist die Tabelle noch da?" gemeldet — bei einer
  wirklich zerschossenen Tabelle die falsche Diagnose. Jetzt zählt sie die *gefundenen* Zeilen.
- `Deployed + superseded` erzeugte zwei Fehlermeldungen für einen Defekt. Jetzt genau eine, mit
  eigenem Wortlaut, weil dieser Fall zwei Regeln gleichzeitig bricht.

**Rot-Grün am echten File** (nicht nur an Fixtures): Scope von PROJ-144 auf `—` zurückgedreht →
`::error PROJ-144 (INDEX.md:204) Deployed requires one of …`, exit 1. Unescapte Pipe in PROJ-78
wieder eingeführt → `::error PROJ-78 (INDEX.md:97) row has 7 cells, expected 6`, und der Zeilenzähler
fiel sichtbar von 164 auf 163. Danach beides zurückgesetzt, exit 0.

**Gates:** `check:index-scope` 0 Fehler / 1 Warnung (139 Altzeilen) · neue Tests 14/14 ·
ESLint 0 · tsc 13 = Baseline / 0 neu · Build clean.

## Followups

- **PROJ-Y-145a** — mutierender Durchlauf durch die deployte Vercel-Laufzeit gegen die
  Prod-Datenbank (zusätzliche Absicherung für PROJ-144, kein offenes AC).
- **PROJ-Y-145b** — zeilenweises, evidenzbasiertes Audit der 139 Altzeilen gegen Spec/AC/QA/Code.
  Der Wächter nennt die Restzahl bei jedem Lauf, damit die Schuld nicht einschläft.
- **PROJ-Y-145c** — Eintrag von `Verify lifecycle status vs deployment scope in features/INDEX.md`
  als Required Check im `main`-Ruleset (Repo-Eigner-Handoff).
