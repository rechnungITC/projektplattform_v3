# Token-Drift-Guard — warum er existiert und wie man mit ihm arbeitet

**Regel:** in `src/` stehen keine rohen Tailwind-Palette-Farben. Für Status, Risiko und Fläche gibt
es semantische Tokens in `src/app/globals.css` (`bg-risk-low/10`, `text-success`, `text-warning`,
`text-info`, `text-muted-foreground`, `bg-primary`, `--chart-1..5`, …).

**Durchsetzung:** `npm run check:token-drift`, als CI-Workflow *Token Drift Guard* auf jedem PR.
Reine Dateianalyse — kein DB-Zugang, kein Docker, keine Secrets.

## Warum ein Ratschen-Mechanismus und keine Bereinigung

Die Zahlen stammen aus **einem** Muster (dem des Guards), an den jeweiligen Revisionen gemessen:

| Stand | Treffer | Dateien |
|---|---|---|
| 2026-05-07 — direkt nach PROJ-51 γ.6 | **76** | 8 |
| 2026-06-01 | 408 | 45 |
| 2026-07-01 | 563 | 63 |
| 2026-08-01 | 655 | 75 |
| 2026-08-26 — heute | **732** | 85 |

PROJ-51 hat den Token-Layer gebaut und seine Konsumenten migriert, und es hat funktioniert: übrig
blieben 76 Treffer in 8 Dateien. Nichts hat das Ergebnis bewacht, also ist es in unter vier Monaten
auf das Zehnfache zurückgewachsen — auch in Altdateien (`gantt-view.tsx` von 10 auf 15).

Daraus folgt der Zuschnitt: **eine zweite Bereinigung wäre Arbeit ohne Sicherung gegen die
Wiederholung.** Der Guard fordert deshalb keine Null. Er friert den Bestand ein, schlägt auf alles
**Neue** hart fehl und lässt die Zahl fallen.

Die im PROJ-51-α-Audit genannten „105 Treffer in 26 Dateien" gehören **nicht** in diese Reihe: sie
wurden mit einem engeren Muster gemessen und sind nicht vergleichbar.

## Die drei Zustände

| Messung gegen `baseline.json` | Ergebnis |
|---|---|
| Datei nicht verzeichnet, hat Treffer | **Fehler** — neue Schuld |
| verzeichnete Datei hat **mehr** Treffer | **Fehler** — „darf schrumpfen, nie wachsen" |
| verzeichnete Datei hat **weniger** Treffer, oder gar keine mehr | **Warnung** + Auffrisch-Befehl |

Die Asymmetrie ist Absicht: ein Guard, der auf **Fortschritt** fehlschlägt, erzieht dazu, ihn zu
umgehen. Die Warnung ist hier ausdrücklich **nicht** das Hauptsignal (die Lehre aus PROJ-Y-130f: eine
Warnung, die niemand liest, verhindert nichts) — der Defekt, um den es geht, ist Wachstum, und
Wachstum ist ein harter Fehler. Die Warnung sagt nur, dass die Baseline veraltet ist.

## Arbeiten mit dem Guard

**Neue Fläche gebaut, Guard rot.** Der Regelfall: semantisches Token nehmen. Wenn es für den Zweck
keines gibt, ist das eine Design-System-Frage und keine Ausnahme im Vorbeigehen — dann gehört ein
Token in `globals.css`, nicht eine Palette-Farbe in die Komponente.

**Treffer entfernt, Guard warnt.** `npm run check:token-drift -- --write` schreibt die niedrigeren
Zahlen fest und wirft verwaiste Verzeichnungen weg.

**`--write` kann nicht anheben.** Findet es eine neue Datei oder eine gewachsene Zahl, verweigert es
und die Baseline bleibt unverändert. Anheben geht nur von Hand in `baseline.json` — dann steht es im
Diff und muss im Review begründet werden. Ohne diese Verweigerung wäre `--write` die
Ein-Befehl-Umgehung des ganzen Guards; genau so war der Snyk-Check aus PROJ-147 dekorativ.

## Dauerhafte Ausnahmen

Zwei, und beide stehen so in der PROJ-51-Spec unter „Bewusst nicht migriert" — sie sind nicht in
diesem Guard erfunden worden:

- `src/components/work-items/work-item-kind-badge.tsx` (49) — sieben distinkte Taxonomie-Farben je
  Work-Item-Art. Eine Farbe pro Art ist **Bedeutung**, kein Status, und lässt sich nicht auf vier
  Status-Tokens abbilden.
- `src/components/ui/toast.tsx` (3) — shadcn-Primitive, die über `variant="destructive"` gesteuert
  werden soll. Das zu ändern ist eine Primitive-Slice, keine Token-Migration.

Auch eine dauerhafte Ausnahme darf **nicht wachsen**: eine dokumentierte Entscheidung ist keine
Lizenz, mehr hinzuzufügen. Verliert eine Ausnahme ihre Treffer, warnt der Guard und verlangt, den
Eintrag zu entfernen — ein verwaister Eintrag verdeckt später einen echten Fund in derselben Datei
(die Lehre aus PROJ-Y-148e).

## Gemessene Grenzen

- **Kein rohes Hex.** Separat gemessen: 6 Dateien, und jedes Vorkommen ist berechtigt — ein
  Vorgabewert, eine Canvas-/3D-Füllung, ein Eingabe-Platzhalter, also Stellen, an denen eine
  CSS-Variable nicht greift. Eine Hex-Prüfung bräuchte eine eigene Ausnahmeliste für Fälle, die alle
  in Ordnung sind: Aufwand ohne Schutz.
- **Rohtext-Scan.** Eine Palette-Farbe in einem *Kommentar* würde als Verstoß zählen. Heute gibt es
  davon **0** in `src/` (gemessen), deshalb ist kein Kommentar-Strippen eingebaut.
- **Nur `src/`.** In `tests/` gibt es **0** Treffer (gemessen), also keine Regel, die niemand braucht.
- **Der Guard sieht Klassen, nicht Wirkung.** Er kann nicht wissen, ob ein Token *richtig gewählt*
  ist — nur, dass keine Palette-Farbe umgeht. Für die Wirkung sind die Visual-Regression-Suiten und
  `design-system-contract.test.ts` da.

## Restschuld

Heute **680 Treffer in 83 Dateien** (ohne die zwei dauerhaften Ausnahmen). Der Guard nennt die Zahl
bei jedem Lauf, damit sie nicht unsichtbar wird. Sie abzubauen ist Pflege im Vorbeigehen: wer eine
Datei sowieso anfasst, ersetzt ihre Direktfarben und frischt die Baseline auf.
