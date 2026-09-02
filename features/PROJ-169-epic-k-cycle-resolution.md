# PROJ-169 — Auflösung des Abhängigkeitszyklus in Epic K (PMI)

## Status: Deployed
## Deployment Scope: tooling-only

**Created:** 2026-09-02
**Auftrag:** Nutzer-Entscheid „lös den epic-k zyklus auf, proj-127 zuerst"

## Problem

Die Erdung PROJ-167 hatte am 2026-09-02 einen **Abhängigkeitszyklus** in Epic K benannt und die
Auflösung ausdrücklich `/requirements` überlassen, weil sie eine fachliche Entscheidung ist und
keine Messung:

```
PROJ-125 → { PROJ-126, PROJ-127 }
PROJ-126 → { PROJ-127 }
PROJ-127 → { PROJ-125, PROJ-126 }
```

Keine der drei war zuerst baubar, und PROJ-124 hing zusätzlich an zwei von ihnen. Damit war das
**gesamte Epic K nicht startbar** — vier Stories, die sich gegenseitig als Voraussetzung nennen.

## Wie aufgelöst wurde: gemessen, nicht gesetzt

„Eine Abhängigkeit streichen" wäre die halbe Arbeit gewesen. Die entscheidende Frage ist, **wofür**
eine Story ihre Geschwister wirklich braucht — und die Antwort steht in ihren eigenen
Akzeptanzkriterien, nicht in der Abhängigkeitsliste. Gezählt wurde daher je Kante, wie oft die
Zielstory im **reinen AC-Block** der Quellstory vorkommt (isoliert zwischen
`**Akzeptanzkriterien:**` und `**Abgrenzungen`, jede Story hat genau fünf Kriterien).

| Kante | Bezug im AC-Block | Urteil |
|---|---|---|
| **127 → K1** (125) | **0** | **gestrichen** |
| **127 → K2** (126) | 2 inhaltlich (1 als Code, 1 implizit), beide **additiv** | **nach β** |
| **126 → K3** (127) | 1, explizit | **bleibt** — die einzige explizit belegte Kante |
| **125 → K2** (126) | **0** | **gestrichen** |
| **125 → K3** (127) | 0 explizit, **1 implizit** („je Workstream") | **bleibt** |
| **124 → K1** (125) | **0** | **gestrichen** |
| **124 → K2** (126) | **0** | **gestrichen** |

**Vier von sieben Kanten trugen keinen Bezug**, eine fünfte nur einen additiven. Der Zyklus bestand
also nicht aus fachlichen Zwängen, sondern aus einer Abhängigkeitsliste, die „gehört fachlich
zusammen" mit „setzt voraus" verwechselt hat.

### Der Nutzer-Entscheid hat sich als richtig erwiesen

„PROJ-127 zuerst" war die Empfehlung aus PROJ-167 und ist durch die Messung bestätigt: PROJ-127s
`K1`-Kante hat **0** Bezüge, seine `K2`-Kante nur additive — es ist die einzige der drei, die ohne
beide Geschwister baubar ist, **und beide brauchen sie**. Eine IMO-Steuerung ist fachlich die
Klammer, die Synergie-Tracking und 100-Tage-Plan trägt, nicht ihr Ergebnis.

### Warnung zur Methode — sie hat sich an dieser Auflösung selbst bewährt

Eine reine Zählung der Epic-Codes hätte **fünf** unbelegte Kanten gemeldet statt vier und damit
`125 → K3` fälschlich gestrichen, denn AC-2 von PROJ-125 sagt „je Workstream" **ohne** den Code.
Zwei weitere Abhängigkeiten derselben Story sind ebenso implizit und wären mitgefallen: `F1`
(AC-3 nennt „Gate 8 — Integration Readiness") und `A2` (die PMI-Phase aus dem 10-Phasen-Preset von
PROJ-95). Für `125 → K3` wäre das Ergebnis eine Story, die Workstreams verplant, ohne von ihnen zu
wissen. **Gezählt und gelesen** ist die Untergrenze.

## Die neue Reihenfolge

```
PROJ-127-α   IMO-Steuerung: Workstreams, Lead, Aufgaben, Risiken, Ampel, "in Linie übergeben"
   ├── PROJ-126   Synergie-Tracking            (braucht K3 für AC-2)
   │      └── PROJ-127-β   Synergie-Initiative am Workstream + Synergie-KPI im Ampelstatus
   └── PROJ-125   Day-1-/100-Tage-Plan         (braucht Workstreams für "je Workstream")

PROJ-124   Closing-Durchführung → wartet nur noch auf PROJ-123
```

**PROJ-126 und PROJ-125 laufen parallel** — sie brauchen sich nicht gegenseitig.

**PROJ-124 ist der größte Einzelgewinn.** Die Erdung hatte es als „am tiefsten blockiert" geführt
(drei Blocker, zwei davon zyklisch). Übrig bleibt **ein** Blocker, `J2` (PROJ-123), und der ist
fachlich echt: ohne nachverfolgte Closing Conditions gibt es kein Closing durchzuführen.

## Vorbereitet, nicht entschieden: die Architekturfrage für PROJ-127-α

`workstreams` (PROJ-102) ist am **2026-07-02** ausgeliefert worden — also **nach** dieser Spec vom
2026-06-10, weshalb AC-1 mit `dd_streams` vergleicht und den näheren Kandidaten nicht kennt. Live
gemessen deckt es ab: `lead_user_id`, `label`/`goal`/`scope`, `rag_status check in
('green','amber','red')`, `confidentiality_level`, `sort_order`, `work_items.workstream_id`,
`risks.workstream_id`, `workstream_dashboard` (INVOKER).

**Es fehlen vier Dinge:** ein **Typ**-Merkmal (PMI gegen Deal), die Vorlage der sieben
PMI-Workstreams, der Übergangsstatus „in Linie übergeben" und ein **gerechneter** Ampelstatus —
`rag_status` ist heute manuell, während AC-3 konfigurierbare KPIs verlangt (PROJ-45-δ hat dafür das
Muster „gerechnetes Signal **neben** der manuellen Ampel", statt sie zu ersetzen).

Erweitern oder spiegeln bleibt `/architecture`. Der PROJ-45-α-Präzedenzfall wählte **spiegeln**,
aber mit einer Begründung, die hier nicht greift: dort ging es um einen Mandanten-**Katalog** plus
Projektzuordnung, und `workstreams.label` ist `NOT NULL` und Anzeigequelle von fünf Auswertungen.
PMI-Workstreams sind fachlich **dasselbe** wie Deal-Workstreams, nur später im Lebenszyklus.

## Akzeptanzkriterien

- [x] **AC-169.1** Der Zyklus ist aufgelöst: für jede der vier Stories ist gemessen, welche ihrer
      gelisteten Abhängigkeiten durch ein Akzeptanzkriterium belegt sind.
- [x] **AC-169.2** Unbelegte Kanten sind **gestrichen und begründet**, nicht stillschweigend
      entfernt; die Zahl der Bezüge steht je Kante in der Tabelle.
- [x] **AC-169.3** Kein Akzeptanzkriterium ist inhaltlich verändert. PROJ-127s AC-2 und AC-3 sind in
      `(α)`/`(β)` **aufgeteilt**, der Wortlaut bleibt vollständig lesbar.
- [x] **AC-169.4** Implizite Abhängigkeiten sind **benannt statt gezählt** — die drei Fälle von
      PROJ-125 (`K3`, `F1`, `A2`) stehen mit ihrem Fundort in der Spec.
- [x] **AC-169.5** Die neue Reihenfolge steht in der Spec, im INDEX und im Readiness-Guide, und die
      drei Fassungen widersprechen sich nicht.
- [x] **AC-169.6** PROJ-167s Befund 1 ist als **aufgelöst** gekennzeichnet, ohne die
      Bestandsaufnahme zu löschen; Befund 2 und 3 bleiben unverändert offen.
- [x] **AC-169.7** Die Architekturfrage für `α` ist mit gemessener Ausgangslage **vorbereitet und
      ausdrücklich nicht entschieden** — eine Erdung, die nebenbei Architektur festlegt, nimmt
      `/architecture` seine Aufgabe.
- [x] **AC-169.8** Alle fünf Datei-Wächter grün, kein `src/`-Diff, keine Migration, kein Paket.

## Abweichungen

- **D-169.1 — Eine eigene Ungenauigkeit korrigiert, sichtbar statt stillschweigend.** Die erste
  Fassung strich `A2` bei PROJ-125 als unbelegt und behielt `F1` als implizit, obwohl **beide gleich
  implizit** sind. `A2` ist wiederhergestellt; die Inkonsistenz ist in der PROJ-125-Spec vermerkt.
- **D-169.2 — Die Zahl „fünf unbelegte Kanten" war falsch und ist korrigiert.** Die erste Zählung
  lief über einen zu weit gefassten Bereich (bis zum Erdungs-Abschnitt statt bis `**Abgrenzungen`).
  Die Nachmessung des reinen AC-Blocks ergibt **vier** ohne jeden Bezug; die fünfte (`125 → K3`) ist
  implizit belegt und **behalten**. Die Korrektur belegt die Methodenwarnung, die daneben steht.
- **D-169.3 — Kein CIA-Pass.** Es wird keine Technologie eingeführt, kein Refactoring geplant und
  kein Agent geändert; die Architekturfrage ist bewusst offen und gehört in `/architecture`, wo der
  CIA-Trigger greift (Präzedenz PROJ-165/166/167/168).
- **D-169.4 — Kein eigener `/qa`-Durchgang.** Reine Portfolio-Buchführung ohne Laufzeitverhalten;
  jedes Kriterium trägt einen ausgeführten Nachweis (Präzedenz PROJ-150 · 157 · Y-148e).
- **D-169.5 — `PROJ-127-β` ist kein eigener Sub-Slice mit eigener Spec**, sondern eine Markierung an
  zwei Kriterien derselben Story. Ein β mit eigener Kennung anzulegen hätte eine Slice versprochen,
  die niemand beauftragt hat.

## Nebenbefund

**`Next Available ID` war irreführend.** Die Zeile sagte `PROJ-161`, während die faktische Reihe bei
PROJ-168 stand: 161 und 162 sind durch die Entnummerierung der Mail-Kette (PROJ-164) frei geworden,
aber niemand nimmt sie, weil die Vergabe längst weitergelaufen ist. Wer der Zeile folgt, bekommt
eine Kennung, die in Prosa als Mail-Slice versprochen war — genau die Fäulnis, die PROJ-164
aufgeräumt hat. Auf `PROJ-170` korrigiert, mit einer Notiz zu 161/162.
