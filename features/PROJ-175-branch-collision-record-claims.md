# PROJ-175 — Der Kollisions-Guard sagt „frei" über eine vergebene Kennung

## Status: Planned
## Deployment Scope: —

## Problem

`check:branch-collision` beantwortet **eine** Frage — „hält gerade jemand diese Slice?" — und gibt
darauf eine Antwort, die wie die Antwort auf eine **andere** Frage klingt:

```
branch-collision: free — nobody is holding this slice.     (index.ts:164)
```

Der Satz ist wahr und irreführend. „Niemand hält sie" folgt aus der Ref-Lage; „die Kennung ist frei"
folgt daraus **nicht**. Am 2026-09-04 hat der Guard beim Vergeben einer Kennung `PROJ-171` als `free`
gemeldet, obwohl PR #548 sie zwei Stunden zuvor verbraucht hatte — nach dem Merge löscht GitHub den
Head-Branch, es existierte also kein Ref mehr. Gefangen hat es der Blick in `features/INDEX.md`, nicht
der Guard. Ohne ihn wäre es die **vierte** Doppelvergabe nach `PROJ-Y-1` (fünffach), `PROJ-Y-151d`
(doppelt) und `PROJ-145`/`PROJ-Y-145`.

## Die drei belegten Fälle brauchen drei verschiedene Signale

Gemessen am 2026-09-04, nicht aus den Registereinträgen übernommen:

| Fall | INDEX-Zeile | Spec-Datei | Prosa-Treffer | Refs | Guard heute |
|---|---|---|---|---|---|
| **PROJ-171** — nach Merge, Branch gelöscht | **1** | **1** | 7 | 0 | ❌ `free` |
| **PROJ-Y-151b** — vor der Branch-Anlage (PROJ-Y-150e) | 1 | 1 | 34 | **2** | ✅ blockiert |
| **PROJ-159** — nur in Prosa versprochen (PROJ-163) | 0 | 0 | **37** | 0 | ❌ `free` |

Zwei Befunde daraus:

1. **PROJ-Y-150e ist heute nicht mehr reproduzierbar.** `PROJ-Y-151b` trägt inzwischen Tags, der Guard
   blockiert. Der Registereintrag beschreibt einen Zustand, den es nicht mehr gibt — von den drei
   Fällen sind **zwei** offen.
2. **Es gibt kein gemeinsames Signal.** `PROJ-171` braucht die INDEX-Zeile, `PROJ-159` **ausschließlich**
   die Prosa (0 INDEX-Zeile, 0 Spec-Datei). Eine einzige Quelle nachzurüsten schließt höchstens den
   halben Befund.

## Die Messung, die den naheliegenden Fix ausschließt

Naheliegend wäre „INDEX-Zeile vorhanden → blockieren". Gegen den echten Korpus gemessen — **200
PR-Branches** aus der Projekthistorie:

- **77** distinkte Kennungen
- **44 davon (57 %) mehrfach verzweigt**, zusammen **133 Branches = 66 % aller PRs**
- Spitzenreiter `proj-45` mit **17** Branches, `proj-80` 9, `proj-155` 8, `proj-151` 8 — **alle** tragen
  eine INDEX-Zeile

Eine blockierende INDEX-Regel hätte also **zwei Drittel aller PRs dieses Repos abgewiesen**. Das ist
wörtlich der untrainierbare Guard, vor dem PROJ-150 warnt („ein Guard, der auf Fortschritt fehlschlägt,
erzieht zur Umgehung") — dort für das naive `git branch -a | grep` gemessen, hier für das
dokumentarische Signal.

**Folge: die Blockier-Regeln bleiben unangetastet.** Der Fix liegt nicht in der Schwere, sondern darin,
dass der Guard eine zweite Frage überhaupt stellt und seine Antwort nicht mehr verwechselbar formuliert.

## Locks

- **L1 — Zwei Fragen, getrennt beantwortet.** *Lebende* Beanspruchung (Worktree, Tag, unmergter Branch)
  entscheidet weiter über den Exit-Code. *Dokumentarische* Beanspruchung (INDEX-Zeile, Spec-Datei,
  Position zum `Next Available ID`, Prosa) wird **berichtet, nie blockierend** — 66 % Fehlalarm.
- **L2 — Das Wort `free` verschwindet, sobald eine dokumentarische Beanspruchung existiert.** Das ist
  der tragende Teil: die Verwechslung entstand am Wortlaut, nicht an der Schwere.
- **L3 — Kein neuer Modus, kein Flag.** Ein `--new`-Schalter für „ist die Kennung für eine *neue* Slice
  frei" wäre die Doppelvergabe-Frage maschinell prüfbar, verlangt aber, dass man ihn **erinnert** — und
  genau das Erinnern ist am 2026-09-04 ausgefallen. Ein Schalter, dessen Zweck „daran denken" ist,
  wiederholt den Fehler. Die Meldung erscheint deshalb **immer**.
- **L4 — Kein CI-Gate.** PROJ-150/D-150.1 bleibt: der Konflikt muss **vor** der Arbeit auffallen, und
  ein Required Check über 27 unmergte Branches wäre am ersten Tag rot.
- **L5 — Fail-open wie bisher.** Eine Quelle, die nicht lesbar ist, degradiert den Bericht; sie darf
  Arbeit nicht blockieren, über die der Guard nichts weiß.

## Akzeptanzkriterien

- **AC-175.1** Der Guard liest vier dokumentarische Quellen: INDEX-Zeile (mit Zeilennummer),
  Spec-Dateiname unter `features/`, `Next Available ID`-Zeiger, Prosa-Treffer in `features/` und `docs/`.
- **AC-175.2** Keine dieser Quellen setzt den Exit-Code. Blockiert wird ausschließlich wie bisher.
- **AC-175.3** Existiert eine dokumentarische Beanspruchung und keine lebende, endet der Lauf mit
  Exit **0**, aber die Schlusszeile enthält **nicht** das Wort `free` und benennt die Fundorte.
- **AC-175.4** `PROJ-171` wird als dokumentarisch belegt gemeldet (INDEX-Zeile + Spec-Datei + unterhalb
  des Zeigers) — der Fall, der die Slice ausgelöst hat.
- **AC-175.5** `PROJ-159` wird als dokumentarisch belegt gemeldet, **allein über die Prosa**.
- **AC-175.6** Eine tatsächlich freie Kennung meldet weiterhin `free` — die Meldung darf nicht für
  jede Kennung erscheinen, sonst ist sie wertlos. Die Kennung wird hier **absichtlich nicht genannt**:
  eine künftige Kennung namentlich in Prosa zu nennen macht sie belegt, und genau dieses
  Vorausversprechen hat PROJ-164 abgeschafft. Der erste Entwurf dieses Kriteriums nannte eine — und
  hat damit den eigenen Nachweis zum Fehlalarm gemacht (unten als F-175.2 festgehalten).
- **AC-175.7** Die Prosa-Suche verwechselt keine Präfixe: `PROJ-15` trifft **nicht** `PROJ-151`,
  `PROJ-153`, `PROJ-155`. Die INDEX-Zeile der Kennung selbst und die `Next Available ID`-Zeile zählen
  **nicht** als Prosa-Treffer, sonst wirkt jede Kennung belegt.
- **AC-175.8** Rot-Grün ausgeführt: die neuen Zusicherungen fallen gegen die Fassung vor dem Fix.
- **AC-175.9** Die 34 Bestandstests bleiben grün, `analyzeCollision` behält seine Signatur.

## Ausdrücklich nicht im Umfang

- **Keine Vollständigkeitsprüfung** des Registers — PROJ-157 hat gemessen, dass Vollständigkeit hier
  die falsche Achse ist (6 von 6 Erzähl-Kennungen ohne Tabellenzeile sind Konvention, kein Defekt).
- **Kein `Next Available ID`-Wächter.** PROJ-157 hat gemessen, dass er *seinen* Fall nicht gefangen
  hätte. Hier wird der Zeiger nur als **Signal** gelesen, nicht durchgesetzt.
- **Keine Automatik beim Vergeben** einer Kennung — der Guard berät, der Mensch entscheidet.

## Befunde beim Bauen

- **F-175.1 — das Prosa-Muster taugt nicht für Dateinamen, und der Fehler war unsichtbar.** Der
  Lookahead `(?![0-9A-Za-z-])` ist für Prosa richtig (sonst matcht `PROJ-15` in `PROJ-151`), verwirft
  bei `PROJ-171-spec-followup…md` aber genau das `-`, das dort legitim folgt. Die Wirkung war kein
  Fehler, sondern ein **stilles „keine Spec-Datei vorhanden"**. Zwei getrennte Funktionen statt eines
  Schalters, damit der Unterschied im Namen steht.
- **F-175.2 — die eigene Spec hat einen Fehlalarm erzeugt.** Der erste Entwurf von AC-175.6 nannte
  eine künftige Kennung namentlich; damit war sie in Prosa belegt und der Guard meldete sie
  folgerichtig als vergeben. Das ist wörtlich das ID-Vorausversprechen, das **PROJ-164** abgeschafft
  hat — hier vom eigenen Werkzeug vorgeführt. Kriterium entnummeriert.
- **F-175.3 — der eigene Prüfstand hat falsch gezählt.** Die erste Rot-Grün-Messung griff mit
  `head -1` die Zeile `Test Files 1 failed` statt `Tests N failed` und meldete für jede Sabotage „1".
  Aufgefallen, weil Sabotage 1 rechnerisch **zwei** Zusicherungen treffen musste. Vierte
  Zahlenkorrektur derselben Klasse in dieser Sitzung.
- **F-175.4 — `collectRecords` bekam die rohe Eingabe.** `recordIdPattern` verlangt die kanonische
  Form; `PROJ-171` wirft, der Wurf landete im Fail-open-Zweig, und der Bericht sagte „nichts
  gefunden". Fail-open ist richtig (L5) und verdeckt zugleich Fehler — deshalb steht der Grund jetzt
  als Kommentar an der Stelle.

## Nachweise

- **Die drei belegten Fälle gegen die echte Repo-Lage**, nicht gegen Fixtures:
  `PROJ-171` → alle vier Quellen, `NOT free`, exit 0 · `PROJ-159` → Zeiger + Prosa **allein** (0
  INDEX-Zeile, 0 Spec-Datei), `NOT free`, exit 0 · `PROJ-Y-45p` → unverändert `CLAIMED`, exit **1**.
- **Zwei Gegenkontrollen**, ohne die die Meldung nichts wert wäre: eine wirklich freie Kennung und
  eine offensichtlich unbenutzte melden weiter `free` mit exit 0.
- **Rot-Grün dreifach ausgeführt**, je über eine Dateikopie zurückgesetzt (nicht `git checkout`):
  Lookahead entfernt → **2** Zusicherungen fallen (Präfix und Sub-Slice) · Funde auf `warn` gehoben →
  **6**, davon **5 Bestandstests**, weil die Ersetzung auch die Ref-Funde traf — zusätzlicher Beleg,
  dass die Severity-Politik schon vorher gepinnt war · Dateinamen wieder mit dem Prosa-Muster → **1**,
  genau der neue Fall. Danach 46/46 grün.
- **34 Bestandstests unverändert grün**, `analyzeCollision` behält seine Signatur — die neue Analyse
  ist eine zweite exportierte Funktion, kein Umbau der ersten.

## Abweichungen

- **D-175.1** Kein CIA-Pass. Keine neue Abhängigkeit, keine Architekturentscheidung, kein
  `.claude/agents/`-Diff; Muster und Severity-Politik sind aus PROJ-150 übernommen und gemessen.
- **D-175.2** Kein eigener `/qa`-Durchgang (Präzedenz PROJ-150 · 157 · Y-148e): jedes Kriterium trägt
  einen ausgeführten Nachweis samt Rot-Grün.
