# PROJ-Y-155f + PROJ-Y-155g — Kantenbeschaffung und der Leseweg des Schalters

## Status: Deployed
## Deployment Scope: full

Die beiden High-Funde aus dem β.2-`/qa` vom 2026-09-02. Sie werden als **eine**
Slice gebaut, weil keiner von beiden allein etwas erreichbar macht: mit dem
Schalter, der sich nicht einlesen lässt, kommt niemand an die Vorschau — und
wäre er einlesbar, rechnete der Server eine leere Kaskade.

## PROJ-Y-155f — die Route sah die Kanten nicht, die es gibt

**Der `/qa`-Befund war richtig, aber nur zur Hälfte, und die andere Hälfte ist
die eigentliche Ursache.** Gemeldet war der Filter auf `from_type = 'todo' AND
to_type = 'todo'`, der in Produktion keine einzige vorhandene Kante durchlässt
(2× `work_package`, 2× `phase`, 1× gemischt). Beim Bauen kam heraus: dieselbe
Abfrage filterte zusätzlich auf **`project_id`** — und

```
select column_name from information_schema.columns
 where table_name = 'dependencies'
```

liefert `id · tenant_id · from_type · from_id · to_type · to_id ·
constraint_type · lag_days · created_at · created_by`. **Es gibt keine Spalte
`project_id`.** PostgREST antwortete darauf mit einem Fehler, `data` war `null`,
`edges ?? []` machte daraus eine leere Kantenliste — und weil der Fehler **nicht
geprüft** wurde, sah die Antwort plausibel aus (`total: 1`, leere Kaskade) statt
laut zu scheitern.

Damit ist erklärt, warum niemand es sah: nicht „ein Filter war zu eng", sondern
**ein verschluckter Fehler**. Auch mit korrektem Typfilter hätte die Abfrage nie
eine Zeile geliefert. Und kein Gate konnte greifen — der Schema-Drift-Wächter
prüft die Spalten in `.select()`, nicht die in `.eq()`; dieselbe Lücke, in die
PROJ-151 mit einem `.order()`-Argument gelaufen ist.

**Geliefert:**

- Eine geteilte Funktion `cascadeEdgesFor(nodes, rows)` in
  `src/lib/work-items/schedule-cascade.ts` — dort, wo auch die Rechnung liegt.
  Sie filtert über die **Endpunkt-Zugehörigkeit**: eine Kante zählt, wenn beide
  Enden bekannte Knoten sind. Das ist die Regel, die der Gantt schon hatte, und
  sie ist nicht aus Gewohnheit richtig: `dependencies` ist polymorph
  (`project`/`phase`/`work_package`/`todo`/`sprint`), und wer über die Endpunkte
  filtert, schliesst Phasen- und Projektkanten automatisch aus, ohne eine
  Typliste zu führen, die beim nächsten Endpunkttyp erneut auseinanderläuft.
- Route **und** Gantt rufen sie. Die Rechnung war seit β.2 an einer Stelle; ihre
  Eingabe ist es ab hier auch — und genau das war der Anspruch, mit dem β.2 sein
  Risiko R-A für aufgelöst erklärt hatte.
- Der Projektbezug kommt aus den Endpunkten: geladen werden Kanten, deren
  **Ausgangsknoten** ein Arbeitspaket dieses Projekts ist; `cascadeEdgesFor`
  verlangt zusätzlich ein bekanntes Ziel. Die Mandantengrenze trägt die RLS.
- **Der Fehler wird geprüft.** Eine leere Kaskade heisst ab jetzt „keine
  Kanten", nicht „die Abfrage ist gescheitert".

## PROJ-Y-155g — der Schalter liess sich setzen, aber nicht einlesen

`planung-client.tsx:71` liest `project?.settings?.autoScheduleSuccessors` aus
`useProject` (**Einzahl**); dessen SELECT führte `settings` nicht — β.2 hatte die
Spalte nur in `use-projects.ts` (**Mehrzahl**) ergänzt. Der Schalter rendete
deshalb immer als „aus", und Vorschau, Geisterbalken, Escape-Abbruch und
Übernehmen waren über die Oberfläche unerreichbar.

**Geliefert:** `settings` **und** `project_method` in SELECT und Abbildung.
`project_method` ist mitgekommen, weil dort derselbe Widerspruch latent bestand —
der Typ verspricht das Feld, der Hook lieferte `undefined`. Heute liest es kein
Konsument dieses Hooks (alle acht geprüft); genau darum war es unauffällig, und
genau darum gehört es behoben, bevor der erste Konsument darauf baut.

## F-3 — warum beide Drift-Wächter geschwiegen haben

`type-vs-select-drift.test.ts` erklärte je Typ **einen** `primarySelect`; für
`Project` war das `use-projects.ts`. Die Spalte dort zu ergänzen hat den Wächter
befriedigt. `hook-mapping-drift.test.ts` schwieg zu Recht — es verlangt, dass
jede **gelesene** Spalte abgebildet wird, und `settings` war in dieser Datei
weder gelesen noch abgebildet, also in sich konsistent.

**Geliefert:** ein Typ darf **mehrere** Leseorte erklären, und jeder muss jedes
nicht-berechnete Feld liefern. `use-project.ts` ist als zweiter Leseort für
`Project` eingetragen. Damit ist die Klasse geschlossen, nicht nur der Fall.

## Akzeptanzkriterien

- **AC-Y155f.1** Route und Gantt beschaffen ihre Kanten aus **einer** Funktion.
- **AC-Y155f.2** Kein Filter auf `from_type`/`to_type` und keiner auf die nicht
  existierende Spalte `project_id`; die Eingrenzung läuft über die
  Ausgangsknoten des Projekts.
- **AC-Y155f.3** Ein Fehler der Kantenabfrage führt zu einem Fehler der Route,
  nicht zu einer leeren Kaskade.
- **AC-Y155f.4** Eine `work_package → work_package`-Kante wirkt — der Fall, den
  Produktion ausschliesslich hat.
- **AC-Y155g.1** `useProject` liefert `settings`; der Schalter liest seinen
  Zustand in der Oberfläche zurück.
- **AC-Y155g.2** Der Drift-Wächter prüft **alle** erklärten Leseorte eines Typs
  und schlägt an, wenn einer ein Feld nicht holt.
- **AC-Y155fg.3** Die drei aus dem `/qa` offenen Kriterien sind im Browser
  geführt: **AC-13** (Vorschau erscheint, Übernehmen schreibt beide), **AC-14**
  (Verwerfen **und** Escape schreiben nichts), **AC-12** erneut — jetzt belegt er
  eine echte Verzweigung statt des einzigen erreichbaren Zweigs.
- **AC-Y155fg.4** Keine Migration, kein neues Paket.

## Nachweise

**Die QA-Kette ist von 9 auf 11 gewachsen und trägt jetzt die drei Kriterien, die
im `/qa` offen blieben — `tests/PROJ-155-beta2-qa-chain.spec.ts` 11/11 chromium:**

- **AC-13/14** Ziehen erzeugt die Vorschau, und die Datenbank bleibt dabei
  **unberührt** — geprüft am gezogenen Knoten *und* am Nachfolger. Ohne diese
  zweite Hälfte belegte der Fall nur, dass ein Text auftaucht.
- **AC-14** ein eigener Fall für **Escape**, getrennt vom Verwerfen-Knopf: der
  eine ruft `onDiscard`, der andere hängt am Tastatur-Handler des Diagramms;
  einer kann brechen, ohne den anderen zu berühren.
- **AC-13** Übernehmen aus der Vorschau schreibt **beide** — gezogenen Knoten und
  Nachfolger —, und zwar über die Oberfläche statt über die Route.
- **AC-12** erneut gefahren. Er belegt jetzt eine echte Verzweigung: vorher
  bestand er auch deshalb, weil F-2 den Schalter nie auf „an" brachte.
- **F-1 umgedreht statt gelöscht** (Muster PROJ-Y-148d): der Fall hielt fest,
  dass der Server auf eine leere Kaskade kommt und das als Abweichung meldet.
  Jetzt prüft er, dass Vorschau und Server **übereinstimmen** — die Zusicherung
  ist dadurch stärker, sie schlägt an, wenn die beiden wieder auseinanderlaufen.

**Rot-Grün, beidseitig und mit aussagekräftiger Trefferzahl** (zurückgesetzt über
Dateikopien, nie `git checkout`):

| Sabotage | Ergebnis |
|---|---|
| `settings` aus dem Einzel-Hook entfernt | **Browser-Fall AC-13/14 rot UND der Drift-Wächter rot** — das Paar, das vorher fehlte |
| Typfilter in der Route wieder eingebaut | genau **1** rot (der neue Struktur-Test), die **18** Ergebnis-Tests bleiben grün — der Beweis, dass sie blind waren |
| zweiter Leseort aus dem Wächter genommen | Wächter grün, obwohl die Spalte fehlt — deshalb steht er drin |

**Der Struktur-Test ist der einzige dieser Datei, der eine Abfrage prüft statt
einer Antwort**, und er existiert, weil die Antwort den Defekt nicht zeigen
konnte. Er pinnt drei Dinge: Eingrenzung über die Ausgangsknoten (positiv, sonst
wären die Negativ-Zusicherungen trivial), **kein** `project_id` (die Spalte
existiert nicht), **kein** `from_type`/`to_type`. Dazu ein zweiter Fall: ein
Fehler der Kantenabfrage führt zu **500** und die Schreib-RPC wird **nicht**
gerufen — genau die Stelle, an der F-1 unsichtbar wurde.

- `cascadeEdgesFor` mit **6** eigenen Fällen, darunter der F-1-Fall wörtlich
  (`work_package → work_package` bleibt), der Ausschluss von Phasenkanten, und
  einer, der belegt, dass die gebildeten Kanten **wirklich in der Rechnung
  wirken** — ohne ihn belegten die anderen nur die Form der Liste.
- Gates: vitest **4235/4235** (+8) · ESLint **0 Fehler** (4 Warnungen, alle in
  einer fremden PROJ-153-Datei) · tsc **11 = Baseline**, keiner in einer Datei
  dieser Slice · Build exit 0 · fünf Datei-Wächter OK.
- **Eine Messfalle unterwegs:** der erste tsc-Lauf meldete **3** statt 11 — die
  `.next`-Falle aus PROJ-Y-143e, bei der eine halb geschriebene
  `validator.ts` tsc früh abbrechen lässt und *weniger* wie *besser* aussieht.
  Nach `rm -rf .next` wieder 11.
- **Ein eigener Fehler am Wächter, gefunden nur durch die Rot-Probe:** meine
  Regex-Umschreibung erzeugte 8 Leerzeichen Einrückung, das Folge-`replace`
  suchte 6 — der zweite Leseort war **nie eingetragen**, und die Rot-Probe
  bestand fälschlich. Ein Wächter, der nichts bewacht, ist genau der Defekt, den
  F-3 beschreibt; er wäre ohne die Probe mitgeliefert worden.

## Abweichungen

- **D-Y155fg.1** Kein CIA-Pass: zwei Defektbehebungen ohne neue Abhängigkeit,
  ohne Migration und ohne Architekturentscheidung. Die geteilte Funktion liegt in
  derselben Datei wie die Rechnung, deren Ort β.2 bereits entschieden hat.
- **D-Y155fg.2** `project_method` ist über den gemeldeten Umfang hinaus ergänzt.
  Begründet: derselbe Widerspruch, dieselbe Datei, und der Wächter verlangt ab
  jetzt Vollständigkeit je Leseort — ohne die Ergänzung wäre er für `Project`
  nicht einschaltbar gewesen.
- **D-Y155fg.3** Mobile Safari umgebungsbedingt übersprungen, Firefox nicht
  konfiguriert. Alle Browser-Zahlen sind chromium-only.

## Deployment

**Ausgeliefert 2026-09-03: Tag `v3.1.0-PROJ-Y-155fg` auf dem Merge-Commit
`1ef5fcf` (PR #542, squash).** Alle 10 CI-Checks grün, am aktuellen Head-SHA
gemessen — nicht an dem, den `gh pr checks` nach einem `update-branch`
manchmal noch zeigt (dieser Fehler ist mir in derselben Sitzung an PR #541
unterlaufen und deshalb hier ausdrücklich anders gemacht).

**Der Merge ist die Auslieferung, und mit ihm wird β.2 erstmals wirksam.** Die
Flächen liefen seit dem β.2-Merge, aber der Schalter war nicht einlesbar und die
serverseitige Kaskade immer leer — das Verhalten, das β.2 verspricht, entsteht
in Produktion erst mit diesem Stand. Keine Migration, kein Runtime-DB-Change.

Zum Zeitpunkt dieser Buchung stand das jüngste **Produktions**-Deployment noch
auf `3c8ef2d` (der PROJ-170-Buchung); der Auto-Deploy von `main` für `1ef5fcf`
war noch nicht angelegt. Gesagt statt gerundet — dieselbe Genauigkeit wie bei
PROJ-170 in derselben Sitzung.

**Scope `full`:** alle acht Kriterien erfüllt, nichts zurückgestellt.
`tooling-only` trifft nicht — geliefert wird Produkt-Laufzeitverhalten (Route,
Gantt, Hook), nicht Werkzeug oder CI. `mvp`/`alpha` behaupten zurückgestellte,
namentlich geführte Arbeit, die es hier nicht gibt.

**Der Scope von PROJ-155 bleibt `alpha`** und wird davon **nicht** gehoben: β.2
hat weiterhin keinen eigenen `/qa`-Durchgang, und die `alpha`-Definition
verlangt für einen Sub-Slice ausdrücklich abgeschlossene QA **und**
Auslieferung. Diese Slice behebt Funde, sie ersetzt keine Abnahme.

**Ein Fund über den Auftrag hinaus, als Followup registriert:** der
Schema-Drift-Wächter prüft die Spalten in `.select()`, aber nicht die in
`.eq()`, `.in()` oder `.order()`. Ein Filter auf eine nicht existierende Spalte
läuft an ihm vorbei — zwei belegte Instanzen (PROJ-151 mit `.order()`, diese
Slice mit `.eq()`), also ein Muster und kein Einzelfall → **PROJ-Y-42a**.
Bewusst nicht mitgenommen: es ist die Fläche einer fremden Slice und hätte den
Diff dieser Behebung verbreitert.
