# PROJ-167 — Portfolio-Erdung Tranche 3: M&A Transaktion und PMI (PROJ-121 · 123–127)

## Status: Deployed
## Deployment Scope: tooling-only

**Created:** 2026-09-02

## Problem

Sechs Stories der M&A-Kette Transaktion/Closing/PMI standen seit dem **2026-06-10** unverändert,
während das umgebende Epic in denselben Monaten fast vollständig ausgeliefert wurde. Sie notieren
ihre Abhängigkeiten als **Epic-Codes** (`I1`, `J1`, `K2`, `L3`, …) statt als PROJ-IDs — eine Form,
die aus dem M&A-Backlog-Import stammt und die man nicht lesen kann, ohne sie erst aufzulösen. Genau
deshalb war unbekannt, welche der sechs heute baubar ist und welche nicht.

## Wie gemessen wurde

Das Mapping Epic-Code → PROJ-ID ist **aus den Specs selbst** abgeleitet (`summary_for_jira`-Kennung
je Frontmatter), nicht geraten:

| Epic-Code | PROJ | Stand |
|---|---|---|
| I1 · I2 | PROJ-120 · PROJ-121 | `Deployed / mvp` · **offen** |
| J1 · J2 · J3 | PROJ-122 · PROJ-123 · PROJ-124 | `Deployed / mvp` · **offen** · **offen** |
| K1 · K2 · K3 | PROJ-125 · PROJ-126 · PROJ-127 | **offen** · **offen** · **offen** |
| A2 · C1 · E1 · F1 · F2 · G3 · L3 · M1 | PROJ-95 · 101 · 107 · 110 · 111 · 114 · 130 · 131 | alle `Deployed` |

Dazu eine **Live-Abfrage gegen Prod** (2026-09-02) und Struktur-Messungen an den Migrationen.

## Die zwei tragenden Befunde

### 1. Der Abhängigkeitszyklus in Epic K — Epic K ist nicht startbar

```
PROJ-125 (K1)  braucht  K2, K3
PROJ-126 (K2)  braucht  K3
PROJ-127 (K3)  braucht  K1, K2
```

**Keine der drei PMI-Stories ist zuerst baubar.** Das ist kein technisches Hindernis: von den
Abhängigkeiten außerhalb des Zyklus ist **jede** ausgeliefert (125: fünf von sieben, 126: fünf von
sechs, 127: vier von sechs). Blockierend sind ausschließlich die Geschwister.

Es ist ein **Struktur-Defekt der Abhängigkeitsangaben**: die drei wurden gegenseitig verdrahtet, weil
sie fachlich zusammengehören — nicht, weil eine die andere voraussetzt. Und es erklärt, warum die
drei seit dem 2026-06-10 unangetastet liegen: es gab keinen legitimen Startpunkt.

**PROJ-124 hängt am Zyklus mit** (`J2` + `K1` + `K2`), ist damit die am tiefsten blockierte Story der
Tranche.

### 2. Null Nutzung in Produktion — und das ordnet alles ein

Live gemessen am 2026-09-02: **0** Projekte mit `project_type = 'ma'` (auch keine weich gelöschten),
**0** Profile, **0** Bewertungen, **0** SPA-Issues, **0** DD-Findings, **0** DD-Fragen, **0**
Stage-Gates, **0** Phasen — bei **34** ausgelieferten M&A-Slices (1 superseded, 6 offen).

Das macht keine Story falsch. Es heißt: **heute wartet niemand auf sie.** Die offene MVP-Pflicht
(PROJ-123) blockiert keinen Nutzer, und die Reihenfolge der verbleibenden Arbeit ist eine
Produktentscheidung statt einer technischen Notwendigkeit. Der erste Pilot ist ERP, nicht M&A.

## Die sechs Urteile

- **PROJ-121 (Kaufpreis-Bridge) — baubar.** Alle fünf Abhängigkeiten ausgeliefert. Das von AC-3
  verlangte Versionsmuster **existiert** in `ma_valuations`; neu wäre die Struktur (Kopf plus
  Bestandteile-Kind-Tabelle), nicht die Mechanik. Ein Andockpunkt fehlt:
  `ma_valuation_links.linked_kind` trägt einen CHECK mit **genau einem** Wert, während AC-2 Quellen
  auf `spa_issues` und `decisions` verlangt — PROJ-120 hat dafür einen Erweiterungs-Kontrakt
  hinterlegt. AC-4 („Indikativ → Final → Closing") hängt am offenen 123/124.
- **PROJ-123 (Closing Conditions) — baubar, und die einzige MVP-Pflicht der Kette.**
  `Highest / Must (MVP)`, alle vier Abhängigkeiten ausgeliefert, und `dd_questions` ist Feld für Feld
  fast deckungsgleich (Titel · Detail · Priorität · Frist · Verantwortlicher · Status · Belegverweis ·
  Vertraulichkeit). Neu wären nur die Typ-Spalte und der Erfüllungsgrad je Typ. Auch die Eskalation
  hat ein Vorbild (`dd_finding_escalations` an Deal Lead **und** Sponsor, sichtbar in der
  PROJ-64-Inbox). **Fallstrick:** AC-4 schreibt „Gate 7 (Closing)", doch das Gate-Preset ist
  copy-on-create und driftfähig — PROJ-122 hat für dieselbe Klasse gemessen, dass `gate_8` das
  Signing trägt.
- **PROJ-124 (Closing-Durchführung) — blockiert.** Die Folge 123 → 124 ist fachlich echt; die
  zusätzlich notierte Abhängigkeit auf `K1`/`K2` ist zu prüfen.
- **PROJ-125 (Day-1/100-Tage) — nicht startbar.** Teil des Zyklus.
- **PROJ-126 (Synergie-Tracking) — nicht startbar, aber die am besten vorbereitete Story.** Vier
  gemessene Andockpunkte warten auf sie: ein ausdrücklicher Erweiterungs-Kontrakt in PROJ-120, zwei
  Sichtbarkeits-Zweige mit dem Kommentar „PROJ-126-Kontrakt: Zweig hier ergänzen", eine
  Steering-Report-Kachel, die bewusst `n/a` zeigt, und eine von PROJ-117 geseedete Gremien-Vorlage
  `synergy_review`. Dazu nennt Phase 10 des PROJ-95-Presets die Synergien. **Gebaut ist davon
  nichts** — `ma_synerg*` und `pmi_*` je 0 Treffer.
- **PROJ-127 (PMI-Workstreams/IMO) — nicht startbar, aber der Knoten.** Der Zyklus hängt in beide
  Richtungen an ihm, was die Auflösung hier am aussichtsreichsten macht. Prior-Art-Frage vor der
  ersten Tabelle: reicht das ausgelieferte `workstreams` (PROJ-102)?

## Ein dritter Befund: der Readiness-Guide war in jeder Zeile überholt

`docs/ma-project-execution-readiness.md` ist die Datei, auf die **CLAUDE.md und der INDEX** für
M&A-Readiness verweisen. Ihr Stand war der **2026-06-23** und damit falsch in jeder Statuszeile:
PROJ-94 als „PR #168 offen" (ist `Deployed / full`), die DD-Kette als „offen" (alle fünf `Deployed`),
Transaktion/PMI als „geplant" (120 und 122 `Deployed`).

Am gewichtigsten: der Abschnitt „Aktuelle Entscheidung" empfahl die Kette
`PROJ-100b → 95 → 97 → 99/128/129 → 112 → 113 → 114 → 108 → 110/111 → 116` als nächste Arbeit und
schloss mit „Erst danach lohnen Kaufpreis-Bridge, SPA, Closing und PMI". **Diese Kette ist
vollständig abgearbeitet** (PROJ-108 superseded, alle übrigen deployed) — das „danach" ist eingetreten,
während das Dokument es als Zukunft führte. Wer den Guide las, arbeitete an einer erledigten Liste.

Nachgezogen: Statustabelle (8 statt 6 Zeilen, PMI getrennt von Transaktion), Nutzungsmessung, und der
Entscheidungsblock mit den vier real offenen Positionen. Das ist eine **bewusste Ausweitung** dieser
Slice — begründet, weil die Datei genau die Kette erklärt, die hier geerdet wird, und verlinkt ist.

## Akzeptanzkriterien

- **AC-167.1** — Jede der sechs Specs trägt einen datierten Erdungsabschnitt und einen Status-Hinweis
  im Kopf, der „baubar", „blockiert" oder „nicht startbar" ausspricht.
- **AC-167.2** — Das Mapping Epic-Code → PROJ-ID ist **aus den Specs abgeleitet** und in der Erdung
  sichtbar, damit die nächste Sitzung es nicht erneut rekonstruieren muss.
- **AC-167.3** — Der Zyklus in Epic K ist als Zyklus benannt, mit allen drei Kanten, und als
  Struktur-Defekt der Angaben eingeordnet — nicht als technisches Hindernis.
- **AC-167.4** — Die Nutzungsmessung ist live gegen Prod erhoben und steht in der Erdung **jeder**
  betroffenen Zeile, weil sie die Dringlichkeit aller sechs gleichermaßen einordnet.
- **AC-167.5** — Der Readiness-Guide führt keinen überholten Stand mehr und empfiehlt keine
  abgearbeitete Kette.
- **AC-167.6** — Was diese Erdung **nicht** entschieden hat, ist je Story benannt (Zyklus-Auflösung,
  AC-4-Zuschnitt bei 121, Gate-Nummer bei 123, `workstreams`-Wiederverwendung bei 127).
- **AC-167.7** — Kein `src/`-Diff, keine Migration, kein Paket; alle Datei-Wächter grün.

## Bewusste Abweichungen und Grenzen

- **D-167.1:** die Nutzungsmessung ist eine **eigene Live-Abfrage** gegen Prod — anders als in
  Tranche 2, wo dokumentierte Messungen anderer Slices genügten. Hier war sie nötig, weil die
  Dringlichkeitsfrage („wartet jemand auf diese Stories?") ohne sie nicht beantwortbar ist.
- **D-167.2:** der Readiness-Guide ist eine **Ausweitung** über die sechs Stories hinaus. Begründet
  und benannt statt stillschweigend mitgenommen.
- **D-167.3:** der Zyklus wird **nicht aufgelöst**. Welche der drei PMI-Stories ohne die anderen
  auskommt, ist eine Fachentscheidung für `/requirements`; eine Erdung, die sie nebenbei trifft,
  nimmt dem Nutzer die Entscheidung. Eine begründete **Empfehlung** ist gegeben (PROJ-127 zuerst),
  keine Festlegung.
- **D-167.4:** kein CIA-Pass, kein eigener `/qa`-Durchgang (Präzedenz PROJ-150 · 157 · Y-148e).
- **D-167.5:** die Akzeptanzkriterien der sechs Stories sind **unverändert**. Anders als bei
  PROJ-165 (Tranche 1) war hier keines widerlegt — die Stories sind nicht überholt, sie sind
  blockiert oder unbeachtet. Geändert sind nur Status-Hinweise und Erdungsabschnitte.

## Nebenbefund dieser Sitzung: D-163.2 ist eingelöst

PROJ-163 (`grill-me`) hatte eine Grenze ausgesprochen: dass der Skill in der Skill-Liste
**erscheint**, sei nicht beobachtet, weil die Liste beim Sitzungsstart geladen wird — belegt sei nur
die Form (Pfad und Frontmatter deckungsgleich mit den neun Bestandsskills). Gleiche Klasse wie
D-Y150a.1 beim Branch-Hook.

**In dieser Sitzung ist der Skill tatsächlich in der Liste aufgetaucht** — nachgeladen, ohne
Neustart, mit seiner Beschreibung und neben `requirements` und `architecture`. Damit ist die
Installation nicht nur formgleich, sondern nachweislich wirksam. Nachgetragen in Spec und
INDEX-Zeile von PROJ-163, weil eine ausgesprochene Grenze, die eingelöst wurde, sonst dauerhaft als
offen gelesen wird.

## Nachweise

- Mapping und Abhängigkeits-Auflösung über ein Skript gegen **alle** Spec-Frontmatter und die
  INDEX-Statuszellen — reproduzierbar, nicht handgezählt.
- Live-Abfrage gegen Prod: neun Zähler, alle 0.
- Struktur-Messungen: `ma_valuations` (19 Spalten, Versionskette), `ma_valuation_links_kind_check`
  (genau ein Wert), `dd_questions` (18 Spalten, Feldvergleich gegen AC-1), `synerg`-Treffer in
  Migrationen (6, alle Kommentar/Preset/Vorlage), `ma_synerg*`/`pmi_*`/`closing_condition`/`day_one`
  (je 0).
- Jede Textersetzung mit `count == 1`-Ankerprüfung.
- Umfang: `src/` 0 Dateien, `supabase/migrations/` 0, `package.json` 0.

## Deployment

**Deployed 2026-09-02: Tag `v2.97.0-PROJ-167` auf dem Merge-Commit `69f562f6` (PR #533, squash → `main`).**

Der Merge **ist** die Auslieferung — kein `src/`-Diff, keine Migration, kein Paket. Tragend sind die
**zehn grünen CI-Checks**, davon sieben Required.

**Scope `tooling-only`:** Dokumentation und Portfolio-Buchführung, keine Produkt-Laufzeitfähigkeit.

**Alle sieben Kriterien erfüllt, nichts zurückgestellt.** Die vier ausdrücklich nicht entschiedenen
Fragen (Zyklus-Auflösung, AC-4-Zuschnitt bei 121, Gate-Nummer bei 123, `workstreams`-Wiederverwendung
bei 127) sind **Ertrag** der Slice, keine Auslassung — AC-167.6 verlangt, dass sie benannt sind.

**Der Weg zum Merge ist erwähnenswert, weil er die Lage im Repo zeigt:** der Branch wurde **zweimal**
`BEHIND`, weil die parallele Spur währenddessen PROJ-155-β.2 und dessen Buchführung mergte; jedes
Nachziehen startete den Vercel-Build neu, was wie ein Hänger aussah und keiner war (der Build war
beim ersten Verdacht erst sieben Minuten alt). Zwischenzeitlich standen alle sieben Required-Checks
grün, während der nicht enrollte Vercel-Build lief — an ihm vorbeizumergen wäre möglich und nach
Ruleset zulässig gewesen, wurde aber **nicht** getan, weil dieselbe Zusage vier Slices zuvor
ausgesprochen worden war.

**Nebenbefund zur Versionierung:** `v2.93.0` ist doppelt belegt — die parallele Spur setzte
`v2.93.0-PROJ-155-beta2`, diese Sitzung `v2.93.0-PROJ-163`. Die Tag-**Namen** bleiben eindeutig; im
Bestand geübte Praxis (die PROJ-144-Zeile hält denselben Fall für `v2.52.0` fest). Alle vier Tags
dieser Sitzung wurden gegengeprüft: sie zeigen auf die richtigen Merge-Commits und sind Vorfahren
von `main`.
