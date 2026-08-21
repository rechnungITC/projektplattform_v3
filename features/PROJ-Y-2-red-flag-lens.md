---
id: PROJ-Y-2
title: "Red-Flag-Lens auf dem DD-Findings-Panel"
issue_type: Story
epic_code: EPIC-E
epic_title: "Risiken & Red Flags"
priority: Medium
priority_source: "Could"
labels: ["ma-platform", "epic-e", "frontend"]
dependencies: ["PROJ-114", "PROJ-116"]
roles: ["Deal Lead", "PMO"]
summary_for_jira: "[M&A] Red-Flag-Lens (Filter + EUR-Summe) auf dem DD-Findings-Panel"
---

# PROJ-Y-2: Red-Flag-Lens auf dem DD-Findings-Panel

## Status: Deployed
## Deployment Scope: full
**Created:** 2026-08-17
**Deployed:** 2026-08-18 — Tag `v2.60.0-PROJ-Y-2` auf dem Merge-Commit **`9a2d59e`** (PR #397, squash → `main`, gemergt 14:00:20Z durch `rechnungITC`)
**Origin:** Followup aus dem supersedeten PROJ-108 (CIA-Review 2026-06-26). In der
dortigen Rest-Transfer-Tabelle die einzige Zeile, die als *echter* Netto-Zuwachs
übrig blieb: „Red-Flag-Lens (Filter-Sicht `severity ≥ hoch` + EUR-Summe) →
optionaler FE-only-Followup → **PROJ-Y-2**". Registriert in
[`OPEN-DEFERRED-STATUS.md`](OPEN-DEFERRED-STATUS.md).

> **Frontend-only.** Keine neue Tabelle, keine neue Route, keine Migration, keine
> neue Dependency, kein Backend-Diff. Die Slice ist eine Linse auf Daten, die die
> Fläche ohnehin schon geladen hat.

## Warum das keine neue Tabelle sein darf

Die tragende Entscheidung ist schon gefallen und wird hier nur eingelöst: „Red
Flag" ist in diesem Datenmodell **kein eigenes Konzept**, sondern ein
hochsevere(s) `dd_finding`. PROJ-108 wurde genau darum von PROJ-114 supersediert —
eine eigene `dd_red_flags`-Tabelle wäre ein zweiter Eskalations-, Audit- und
Need-to-know-Pfad und damit ein Verstoß gegen die Shared-Core-Invariante.

Daraus folgt die eigentliche Anforderung an diese Slice: sie darf die Definition
von „Red Flag" **nicht neu erfinden**. Zwei auseinanderlaufende Lesarten wären der
eigentliche Schaden, sobald jemand die SteerCo-Zahl dieser Fläche gegen den
DD-Bericht (PROJ-116) hält.

## Die Definition ist abgeleitet, nicht erfunden

Quelle ist die WHERE-/ORDER-Klausel des **deployten** `dd_report_consolidated`
(PROJ-116), am 2026-08-17 aus `pg_get_functiondef` gegen Prod gelesen:

```sql
order by (f.severity = 'deal_breaker') desc, f.economic_impact_eur desc nulls last
from public.dd_findings f
where f.project_id = p_project_id and f.severity in ('hoch','deal_breaker')
```

Drei Dinge daran sind für die Umsetzung bindend:

1. **Zwei Schweregrade**, aufgezählt — nicht „≥ hoch" als Ordinalvergleich.
   PROJ-108 formulierte `severity ≥ hoch`; das fällt bei den heutigen vier Werten
   (`niedrig` < `mittel` < `hoch` < `deal_breaker`) mit der Aufzählung zusammen,
   ist aber die schwächere Zusage. Ein künftiger fünfter Wert würde bei einem
   Ordinalvergleich stillschweigend hinein- oder herausfallen; die Aufzählung
   erzwingt eine Entscheidung. Der erschöpfende Test über alle Schweregrade pinnt das.
2. **Kein Status-Filter.** Ein erledigter oder verworfener Befund bleibt im
   Red-Flag-Report gelistet. Die Linse zeigt bewusst dieselbe Menge — „nur offene"
   wäre eine andere Zahl als der Bericht.
3. **Die Reihenfolge gehört zur Definition**, nicht zur Kosmetik: Deal Breaker
   zuerst, dann EUR absteigend, Befunde ohne Schätzung zuletzt.

## Akzeptanzkriterien

| ID | Kriterium | Nachweis |
|---|---|---|
| AC-Y2.1 | Umschalter „Alle" / „Red Flags" auf dem DD-Findings-Panel; die Auswahl kann nicht leer werden | `dd-findings-panel.tsx` — `ToggleGroup type="single"` mit `onValueChange={(v) => v && setLens(...)}` (Radix meldet `""` beim Abwählen; ungeprüft übernommen verschwände die Tabelle) |
| AC-Y2.2 | Red Flag = `severity ∈ {hoch, deal_breaker}`, **ohne** Status-Filter — Parität mit `dd_report_consolidated` | `RED_FLAG_SEVERITIES` + `isRedFlagSeverity`; Tests „Parität mit dem deployten dd_report_consolidated" (erschöpfend über alle 4 Schweregrade) und „blendet erledigte und verworfene Red Flags NICHT aus" |
| AC-Y2.3 | Zähler je Linse (`Alle (N)` / `Red Flags (M)`) plus Deal-Breaker-Zahl | `findingTotals` / `redFlagTotals`; Toggle-Labels + `CardDescription` |
| AC-Y2.4 | EUR-Summe als SteerCo-Schnellsicht, der Linse folgend, mit Angabe der Befunde **ohne** Schätzung | `activeTotals`; `nullEurCount`-Disclosure nach PROJ-116-H5-Muster |
| AC-Y2.5 | Sortierung Deal Breaker → EUR absteigend → ohne Schätzung zuletzt | `compareRedFlags`; 3 Sortier-Tests, red-green gepinnt |
| AC-Y2.6 | Leerer Zustand, wenn unter den sichtbaren Befunden keine Red Flags sind | „Keine Red Flags unter den sichtbaren Befunden." |
| AC-Y2.7 | Kein zweites Berechtigungstor, kein Aggregat-Leck: keine neue Abfrage, Route, Tabelle, Migration oder Dependency | siehe „Sicherheitsbetrachtung"; Diff umfasst 3 Dateien, keine davon serverseitig |
| AC-Y2.8 | Bestehendes Panel-Verhalten unberührt (Anlegen/Bearbeiten, Eskalations-Karte, `manage_members`-Gating) | keine Änderung an Dialog, `handleAck` oder `canManage`; Gates grün |

## Sicherheitsbetrachtung — warum die Zähler kein Aggregat-Leck sind

Die Hausregel ist scharf: „Aggregates leak. Any RPC that counts, sums, or produces
a pre-read must be `SECURITY INVOKER`". Für diese Slice gilt sie in der
angenehmsten Form — **es wurde nichts hinzugefügt, das lecken könnte.**

Gegen Prod verifiziert (nicht aus Kommentaren übernommen):

| Prüfung | Ergebnis |
|---|---|
| `dd_findings_summary` — Speisung der Kennzahlen | `prosecdef = false` → **SECURITY INVOKER**, die Need-to-know-Policies des Aufrufers greifen |
| `dd_report_consolidated` — Quelle der Definition | `prosecdef = false` → SECURITY INVOKER |
| Summary-Route `GET …/dd-findings/summary` | session-gebundener Client aus `getAuthenticatedUserId()` + `requireProjectAccess(…, "view")`, **kein** Service-Role-Key |
| Listen-Route `GET …/dd-findings` | dieselbe Absicherung, `.limit(500)` |
| Neue Abfragen dieser Slice | **keine** — `findingTotals`/`redFlagTotals` rechnen auf dem bereits geladenen `summary`-State, `applyFindingsLens` filtert den bereits geladenen `findings`-State |

Die Linse ist damit strukturell unfähig, mehr zu zeigen als der Server dem
Aufrufer ohnehin geliefert hat. Sie ist ein Filter **hinter** dem Tor, kein
zweites Tor — und weil sie kein eigenes Tor aufmacht, kann sie das bestehende auch
nicht umgehen.

Zwei bewusste Ehrlichkeits-Hinweise in der Oberfläche fallen daraus ab:

- Die Kennzahl folgt der Linse (`activeTotals`), damit Überschrift und Tabelle nie
  auseinanderlaufen. Eine Summe über alle Befunde neben einer auf Red Flags
  gefilterten Liste liest sich wie ein Widerspruch.
- Aggregat (unbeschränkt) und gelistete Zeilen (max. 500) können abweichen. Statt
  die Differenz stumm zu lassen, benennt sie ein Hinweis unter der Tabelle.

## Nachweise

**Definition gegen die deployte Wahrheit** — `pg_get_functiondef` beider Funktionen
am 2026-08-17 gegen Prod gelesen; `severity in ('hoch','deal_breaker')`,
`order by (severity = 'deal_breaker') desc, economic_impact_eur desc nulls last`,
kein Status-Filter. Die Lib spiegelt das wörtlich.

**Unit-Tests** `src/components/projects/ma/red-flag-lens.test.ts` — **16/16**,
u. a. erschöpfend über alle vier Schweregrade, PostgREST-`numeric`-als-String-Coercion
(ohne die würde `+` verketten: `"250000" + "900000"`), Sortier-Parität,
Immutabilität der Eingabe.

**Rot-Grün-Gegenprobe** (die Tests laufen nicht leer):

| Kontrolle | Erwartung | Ergebnis |
|---|---|---|
| Status-Filter `f.status === "open"` eingeschmuggelt | Parität mit dem Report bricht | **1 Test rot** |
| Deal-Breaker-Vorrang aus `compareRedFlags` entfernt | Reihenfolge bricht | **2 Tests rot** |

Danach zurückgesetzt (per Datei-Kopie, nicht `git checkout` — das hätte die
uncommittete Panel-Arbeit gelöscht); Diff gegen den Ausgangsstand leer, keine
Kontroll-Reste, wieder 16/16.

**Gates:** ESLint **0** (Exit 0; beide Dateien nachweislich im Lint-Umfang) ·
tsc **13 = Baseline / 0 neu** · vitest **grün** · `npm run build` clean ·
`npm run check:index-scope` grün.

## Deployment (2026-08-18)

**Tag `v2.60.0-PROJ-Y-2` auf dem Merge-Commit `9a2d59e`** — nicht auf dem Buchführungs-Commit dieses
Abschlusslaufs. Der Tag markiert, was ausgeliefert wurde; die Auslieferung ist der Merge nach `main`
(Vercel deployt automatisch von `main`), nicht die nachgezogene Statuszeile.

Beim Abschluss **unabhängig nachgemessen** statt aus der Spec übernommen — jedes Akzeptanzkriterium
gegen den Code auf `main` gegengelesen, nicht gegen die Nachweis-Spalte:

| Prüfung | Ergebnis |
|---|---|
| PR #397 wirklich gemergt | `state: MERGED`, `mergeCommit 9a2d59e`, `mergedAt 2026-08-18T14:00:20Z` |
| `9a2d59e` wirklich auf `main` | ist **selbst** der `origin/main`-HEAD dieses Abschlusslaufs |
| Required-Checks am PR | **8/8 SUCCESS** |
| Vercel-Produktion | `dpl_DV6hjAaiW47zY13yPji2pTRBQchD`, `target: production`, **`state: READY`**, `githubCommitSha 9a2d59e` — die Produktion ist aus **genau** dem Commit gebaut, der die Linse einführt |
| Laufzeitfehler nach dem Deploy | **0** im 6-h-Fenster |
| AC-Y2.1 | `dd-findings-panel.tsx:275–293` — `ToggleGroup` mit `onValueChange={(v) => v && setLens(...)}`; die Auswahl kann nicht leer werden |
| AC-Y2.2 | `red-flag-lens.ts:27` — `RED_FLAG_SEVERITIES = ["hoch","deal_breaker"]` als **Aufzählung**; `grep status` in der Lib → **kein Treffer**, also nachweislich kein Status-Filter |
| AC-Y2.3 | `:287` `Alle ({totals.count})` · `:291` `Red Flags ({redFlags.count})` · `:248` `{redFlags.dealBreakerCount} Deal Breaker` |
| AC-Y2.4 | `:175` `activeTotals` folgt der Linse · `:238` EUR-Summe · `:241–242` `({nullEurCount} ohne Schätzung)` |
| AC-Y2.5 | `compareRedFlags`, in den 16 Lib-Tests rot-grün gepinnt |
| AC-Y2.6 | `:297` „Keine Red Flags unter den sichtbaren Befunden." |
| AC-Y2.7 | Diffstat `9a2d59e`: 3 `src/`-Dateien, **alle** unter `components/` — keine Route, keine Migration, kein `package.json`-Diff, keine neue Abfrage |
| AC-Y2.8 | `git show 9a2d59e -- dd-findings-panel.tsx` gefiltert auf `handleAck`/`canManage`/`fetch(`/`useProjectAccess`: die einzigen Treffer sind **zwei reine Einrückungsänderungen** an `canManage`-Zeilen — Logik unberührt |
| Prod-Smoke (ergänzend) | `/projects/{id}/due-diligence`, `…/dd-findings`, `…/dd-findings/summary`, `…/dd-streams`, `/`, `/projects` → alle **307** auf `/login?next=…`, Rumpf exakt `Redirecting...` (15 Bytes), kein Leck |
| Gates | ESLint **0** · tsc **13 = Baseline / 0 neu**, keiner in den drei Dateien · vitest **3058/3058** in 385 Dateien · Build clean · index-scope 173 Zeilen/0 errors · migration-naming 0 errors |

### Warum `full`

Alle acht Akzeptanzkriterien sind erfüllt und oben einzeln am Code belegt; nichts ist zurückgestellt, kein
Critical/High offen. `mvp` und `alpha` behaupten beide benannte, zurückgestellte Original-Anforderungen —
die gibt es hier nicht: die Ursprungszeile aus PROJ-108 lautet „filter/tab für `severity ∈ {hoch,
deal_breaker}` + EUR-Summe", und beides ist ausgeliefert. `tooling-only` trifft nicht zu, weil eine
sichtbare Produktfähigkeit geliefert wurde.

Der Prod-Smoke ist **ausdrücklich nur ergänzend** geführt — die Hausregel sagt zu Recht, dass ein
Auth-Redirect allein kein funktionaler Nachweis ist. Der tragende Nachweis ist stattdessen
verhältnismäßig zur Slice: echte Bibliotheks-Tests auf dem **tatsächlich ausgelieferten** Modul
(16 Fälle, rot-grün gegengeprüft), die Herleitung der Definition aus der **deployten** Wahrheit
(`pg_get_functiondef` von `dd_report_consolidated` gegen Prod) und ein Produktions-Deployment, das
nachweislich aus genau diesem Commit gebaut ist.

Die **Waiver**-Ausnahme aus `.claude/rules/general.md` wird **nicht** in Anspruch genommen und war nicht
nötig — sie greift nur, wenn ein Kriterium wörtlich unerfüllt bleibt. Hier bleibt keines unerfüllt;
D-Y2.1 betrifft die *Nachweistiefe*, nicht ein Kriterium (Begründung dort).

## Abweichungen

- **D-Y2.1 — kein authentifizierter Playwright-Durchlauf.** Die Fläche ist
  modul- **und** projekttyp-gegatet (`requiresProjectType: "ma"` plus DD-Streams als
  Vorbedingung), und der E2E-Mandant hat kein M&A-Projekt mit aktivierten Streams.
  Ein Auth-Gate-Spec wäre hier leerlaufend: es gibt **keine neue Route**, die
  bestehenden `dd-findings`-Routen sind durch PROJ-114 bereits auth-gate-getestet.
  Ein Test, der nichts Neues bewacht, wurde bewusst nicht committet. Die Logik ist
  stattdessen auf Lib-Ebene rot-grün gepinnt.
  **Einordnung beim Abschluss (nachgeprüft, nicht übernommen):** das ist eine
  Abweichung in der *Nachweistiefe*, **keine** zurückgestellte Original-Anforderung.
  Geprüft wurde das an der AC-Tabelle selbst — keines der acht Kriterien verlangt
  einen Browser-Durchlauf, und die Kriterien, die das Aussehen betreffen
  (AC-Y2.1/.3/.4/.6), sind oben Zeile für Zeile am ausgelieferten Code belegt.
  Damit ist nichts an einen Folgeschritt abgegeben und `full` bleibt zutreffend.
  Was **wirklich** offen bleibt und darum nicht verschwiegen wird: die gerenderte
  Oberfläche wurde nie in einer angemeldeten Sitzung beobachtet. Der Weg dahin ist
  keine Test-Ergänzung, sondern eine Fixture — ein E2E-Mandant mit
  `project_type='ma'` und aktivierten DD-Streams, wie ihn PROJ-Y-144d für die
  Assistant-Fläche gebaut hat. Weil das mehreren M&A-Flächen zugleich nützt und
  nicht zu dieser Slice gehört, ist es als **spätere Erweiterung** unter
  **PROJ-Y-2a** registriert (keine zurückgestellte Anforderung; `full` unberührt,
  weil die Regel offene spätere Erweiterungen ausdrücklich zulässt, solange sie
  kein Akzeptanzkriterium verschieben).
- **D-Y2.2 — `nullEurCount`-Angabe ergänzt.** Die Followup-Zeile nennt „Filter +
  EUR-Summe". Die Zahl der Befunde ohne Schätzung ist nicht Beiwerk, sondern die
  Bedingung dafür, dass die Summe ehrlich lesbar ist (PROJ-116-H5-Präzedenz). Ohne
  sie läse sich die Summe als vollständig.
- **D-Y2.3 — Umschalter statt Reiter.** Die Followup-Zeile lässt „Filter/Tab"
  offen. Ein `ToggleGroup` gewinnt, weil die Fläche schon in einer Karte mit
  eigener Kopfzeile sitzt; ein zweites Reiter-Register daneben hätte eine
  Navigationsebene vorgetäuscht, die es nicht gibt.

## Nicht in dieser Slice

Bewusst nicht mitgebaut, weil jeweils eigene Fläche und eigener Nachweis:
serverseitiger Red-Flag-Filter auf der Listen-Route (heute unnötig — die Linse
arbeitet auf ≤ 500 geladenen Zeilen), Export der gefilterten Sicht (der
Red-Flag-Report ist PROJ-116 und existiert), sowie das Quellen-/Dokumentenfeld an
`dd_findings` (**PROJ-Y-1**, eigener Followup).
