# Systembeschreibung: Ablauf- und Terminplanung für Wasserfall-/PMI-Projekte

## 1. Zweck der Funktion

Diese Beschreibung definiert, wie Arbeitspakete, Vorgänge, Abhängigkeiten, Termine, Meilensteine und Termincontrolling in einer Projektmanagement-Software geplant werden sollen.

Die Funktion unterstützt insbesondere klassische Wasserfall- und PMI-orientierte Projektmodelle. Sie baut auf dem Projektstrukturplan, der Arbeitspaketbeschreibung und der Aufwandsschätzung auf und überführt diese Informationen in eine logisch und terminlich planbare Projektstruktur.

Ziel ist, dass die Software aus beschriebenen Arbeitspaketen automatisch oder dialoggeführt einen Ablaufplan, Terminplan, Meilensteinplan und eine Grundlage für späteres Termincontrolling erzeugen kann.

---

## 2. Grundprinzip

Die Software soll nicht nur Termine als freie Datumsfelder speichern, sondern eine echte Planungslogik bereitstellen.

Ein Projekt wird dazu in folgende Planungsebenen gegliedert:

```text
Projekt
├── Projektphasen
│   ├── Sammelvorgänge
│   │   ├── Arbeitspakete / Vorgänge
│   │   │   ├── Aufwand
│   │   │   ├── Dauer
│   │   │   ├── Ressourcen
│   │   │   ├── Abhängigkeiten
│   │   │   ├── Starttermin
│   │   │   ├── Endtermin
│   │   │   └── Status
│   │   └── Meilensteine
│   └── Phasenübergänge
└── Gesamtterminplan
```

Die Planung beginnt nicht mit beliebigen Start- und Enddaten, sondern mit:

1. Projektstrukturplan,
2. Arbeitspaketen,
3. Aufwandsschätzung,
4. Ressourcenzuordnung,
5. Vorgangsbeziehungen,
6. Terminberechnung,
7. Meilensteinplanung,
8. Freigabe des Terminplans als Baseline.

---

## 3. Fachlicher Ablauf im System

## 3.1 Vom Projektstrukturplan zum Terminplan

Die Software soll aus dem Projektstrukturplan die planbaren Elemente ableiten.

Dabei gilt:

- Teilaufgaben und Phasen werden als Sammelvorgänge geführt.
- Arbeitspakete werden als konkrete Vorgänge geplant.
- Vorgänge erhalten Dauer, Ressourcen und Abhängigkeiten.
- Zusammengehörige Vorgänge werden logisch gruppiert.
- Aus Vorgängen und Abhängigkeiten entsteht ein Terminplan.

### Dialogfragen der KI

Die KI soll bei der Planung fragen:

```text
Welche Projektphase gehört zu diesem Arbeitspaket?
Ist das Arbeitspaket ein einzelner Vorgang oder Teil eines Sammelvorgangs?
Gibt es Vorgänge, die vor diesem Arbeitspaket abgeschlossen sein müssen?
Kann dieses Arbeitspaket parallel zu anderen Vorgängen starten?
Gibt es fachliche oder technische Abhängigkeiten?
Welches Ergebnis muss vorliegen, damit dieses Arbeitspaket starten darf?
Welches Ergebnis markiert das Ende des Arbeitspakets?
```

---

## 3.2 Vorgangsdauer aus Aufwand und Ressourceneinsatz berechnen

Die Software soll zwischen Aufwand und Dauer unterscheiden.

- **Aufwand** beschreibt die benötigte Arbeit, z. B. in Personentagen oder Personenstunden.
- **Dauer** beschreibt die kalendarische Zeitspanne von Start bis Ende.

Die Dauer ergibt sich aus dem geschätzten Aufwand und dem geplanten Ressourceneinsatz.

```text
Vorgangsdauer = Arbeitsumfang / effektiver Personaleinsatz
```

### Beispiel

```text
Aufwand: 6 Personentage
Ressourceneinsatz: 1 Person zu 100 %
Dauer: 6 Arbeitstage

Aufwand: 6 Personentage
Ressourceneinsatz: 2 Personen zu je 100 %
Dauer: 3 Arbeitstage

Aufwand: 6 Personentage
Ressourceneinsatz: 1 Person zu 50 %
Dauer: 12 Arbeitstage
```

### Dialogfragen der KI

```text
Wie hoch ist der geschätzte Aufwand für dieses Arbeitspaket?
In welcher Einheit soll geplant werden: Stunden, Personentage oder Manntage?
Wie viele Personen können gleichzeitig daran arbeiten?
Mit welcher Verfügbarkeit stehen diese Personen zur Verfügung?
Ist eine parallele Bearbeitung fachlich möglich oder gibt es Sequenzen innerhalb des Arbeitspakets?
Soll die Dauer automatisch aus Aufwand und Verfügbarkeit berechnet werden?
Oder ist eine feste Dauer vorgegeben?
```

---

## 4. Vorgangsbeziehungen und Abhängigkeiten

Die Software muss Abhängigkeiten zwischen Arbeitspaketen abbilden können.

## 4.1 Unterstützte Abhängigkeitstypen

| Beziehung | Bedeutung | Beispiel |
|---|---|---|
| Ende-Anfang (EA) / Normalfolge | Vorgang B kann erst starten, wenn Vorgang A abgeschlossen ist | Konzeption vor Umsetzung |
| Anfang-Anfang (AA) / Anfangsfolge | Vorgang B kann starten, sobald Vorgang A gestartet ist | Testdokumentation beginnt mit Testlauf |
| Ende-Ende (EE) / Endefolge | Vorgang B kann erst enden, wenn Vorgang A endet | Testbericht endet mit Testabschluss |
| Anfang-Ende (AE) / Sprungfolge | Vorgang B endet abhängig vom Start von Vorgang A | Altsystem endet nach Start Neusystem |

## 4.2 Überlappung und Verzögerung

Die Software soll Verzögerungen und Überlappungen unterstützen.

Beispiele:

```text
EA + 5 Tage
Nachfolger startet 5 Tage nach Ende des Vorgängers.

AA + 50 %
Nachfolger startet, wenn 50 % des Vorgängers erreicht sind.

EA - 2 Tage
Nachfolger darf 2 Tage vor Ende des Vorgängers beginnen.
```

### Dialogfragen der KI

```text
Welche Vorgänge müssen vor diesem Arbeitspaket abgeschlossen sein?
Welche Vorgänge können parallel laufen?
Gibt es eine Mindestwartezeit zwischen Vorgängen?
Darf der Nachfolger bereits vor vollständigem Abschluss starten?
Ist die Abhängigkeit technisch, organisatorisch, fachlich oder vertraglich begründet?
Ist die Abhängigkeit zwingend oder nur empfohlen?
```

---

## 5. Terminberechnung

Die Software soll zwei Berechnungsarten unterstützen.

## 5.1 Vorwärtskalkulation

Die Vorwärtskalkulation wird verwendet, wenn der Projektstart feststeht.

```text
Projektstart + Dauer + Abhängigkeiten = frühester Projektendtermin
```

### Anwendungsfall

```text
Das Projekt startet am 01.03.
Die Software berechnet aus allen Vorgängen, Dauern und Abhängigkeiten den frühestmöglichen Endtermin.
```

## 5.2 Rückwärtskalkulation

Die Rückwärtskalkulation wird verwendet, wenn der Projektendtermin feststeht.

```text
Projektendtermin - Dauer - Abhängigkeiten = spätester Projektstart
```

### Anwendungsfall

```text
Der Go-Live muss am 30.09. stattfinden.
Die Software berechnet rückwärts, wann welche Arbeitspakete spätestens starten müssen.
```

### Dialogfragen der KI

```text
Ist der Projektstart fest vorgegeben?
Ist der Projektendtermin fest vorgegeben?
Soll die Planung vorwärts vom Starttermin berechnet werden?
Soll die Planung rückwärts vom Zieltermin berechnet werden?
Gibt es nicht verschiebbare Fixtermine?
Gibt es externe Fristen, Meilensteine oder vertragliche Termine?
```

---

## 6. Kalender, Ausnahmen und arbeitsfreie Zeiten

Die Software muss Projektkalender unterstützen.

Zu berücksichtigen sind:

- Wochenenden,
- Feiertage,
- Betriebsferien,
- Urlaubssperren,
- projektspezifische Sperrzeiten,
- Ressourcenverfügbarkeiten,
- Teilzeitverfügbarkeiten,
- Standortkalender,
- länderspezifische Kalender.

### Beispielhafte Kalenderausnahme

```text
Sommerpause: 16.07. bis 31.08.
Weihnachten / Neujahr: 22.12. bis 02.01.
Ostern: 03.04. bis 06.04.
```

### Systemanforderung

Wenn ein Vorgang in eine arbeitsfreie Zeit fällt, soll die Software:

- die Dauer auf Arbeitstage verteilen,
- den Endtermin automatisch verschieben,
- Konflikte sichtbar machen,
- bei fixierten Terminen eine Warnung ausgeben.

### Dialogfragen der KI

```text
Welcher Projektkalender gilt für dieses Projekt?
Gibt es arbeitsfreie Zeiträume?
Gibt es Feiertage oder Betriebsferien?
Arbeiten alle Ressourcen nach demselben Kalender?
Gibt es Ressourcen mit abweichender Verfügbarkeit?
Darf die Software Termine automatisch verschieben, wenn arbeitsfreie Zeiten betroffen sind?
```

---

## 7. Pufferzeiten und kritischer Pfad

Die Software soll Pufferzeiten und den kritischen Pfad berechnen.

## 7.1 Gesamtpuffer

Der Gesamtpuffer beschreibt, wie lange sich ein Vorgang verzögern darf, ohne das Projektende zu verschieben.

## 7.2 Freier Puffer

Der freie Puffer beschreibt, wie lange sich ein Vorgang verzögern darf, ohne einen Nachfolger zu verzögern.

## 7.3 Kritischer Vorgang

Ein kritischer Vorgang ist ein Vorgang ohne Pufferzeit.

## 7.4 Kritischer Pfad

Der kritische Pfad ist die längste Abhängigkeitskette durch das Projekt. Verzögert sich ein Vorgang auf diesem Pfad, verschiebt sich das Projektende.

### Systemanforderungen

Die Software soll:

- kritische Vorgänge markieren,
- den kritischen Pfad visualisieren,
- Pufferzeiten berechnen,
- Terminrisiken anzeigen,
- Auswirkungen von Terminverschiebungen simulieren,
- Warnungen bei Pufferverbrauch ausgeben.

### Dialogfragen der KI

```text
Soll für dieses Projekt der kritische Pfad berechnet werden?
Welche Vorgänge dürfen sich nicht verschieben?
Welche Vorgänge haben vertragliche oder externe Fixtermine?
Welche Arbeitspakete haben bewusst eingeplante Puffer?
Soll Puffer zentral auf Phasenebene oder dezentral je Vorgang geplant werden?
```

---

## 8. Terminplanungsansichten im System

Die Software soll mehrere Darstellungsformen unterstützen.

## 8.1 Terminliste

Eine tabellarische Liste aller Vorgänge.

Pflichtfelder:

| Feld | Beschreibung |
|---|---|
| Vorgangs-ID | eindeutige Nummer |
| PSP-Code | Zuordnung zum Projektstrukturplan |
| Bezeichnung | Name des Vorgangs |
| Phase | Projektphase |
| Dauer | geplante Dauer |
| Aufwand | geplanter Aufwand |
| Start Plan | geplanter Start |
| Ende Plan | geplantes Ende |
| Start Ist | tatsächlicher Start |
| Ende Ist | tatsächliches Ende |
| Vorgänger | abhängige Vorgänge |
| Nachfolger | abhängige Folgeaktivitäten |
| Verantwortlicher | zuständige Person |
| Status | geplant, aktiv, abgeschlossen, verzögert |

## 8.2 Gantt-Diagramm

Das Gantt-Diagramm zeigt Vorgänge auf einer Zeitachse.

Es soll darstellen:

- Phasen,
- Sammelvorgänge,
- Arbeitspakete,
- Meilensteine,
- Abhängigkeiten,
- Überlappungen,
- Ist-Fortschritt,
- kritischen Pfad,
- Plan-/Ist-Abweichungen.

## 8.3 Vernetztes Balkendiagramm

Das vernetzte Balkendiagramm ergänzt das Gantt-Diagramm um sichtbare Abhängigkeitslinien.

## 8.4 Netzplan

Für komplexe Projekte soll eine Netzplanlogik verfügbar sein.

Diese dient zur Berechnung von:

- frühestem Start,
- frühestem Ende,
- spätestem Start,
- spätestem Ende,
- Gesamtpuffer,
- freiem Puffer,
- kritischem Pfad.

---

## 9. Meilensteinplanung

Meilensteine sind zentrale Kontrollpunkte im Projekt.

Sie markieren wichtige, messbare Zwischenereignisse, z. B.:

- Projektplanung freigegeben,
- Lastenheft abgenommen,
- Pflichtenheft freigegeben,
- Umsetzung abgeschlossen,
- Testabnahme erfolgt,
- Go-Live durchgeführt,
- Projektabschluss abgenommen.

## 9.1 Pflichtfelder für Meilensteine

| Feld | Beschreibung |
|---|---|
| Meilenstein-ID | eindeutige Nummer |
| Name | Kurzbezeichnung |
| Beschreibung | Inhalt und Bedeutung |
| Mess-/Prüfkriterien | Woran wird die Erreichung erkannt? |
| Plantermin | geplanter Termin |
| Prognosetermin | aktuell erwarteter Termin |
| Ist-Termin | tatsächlicher Termin |
| Status | im Plan, unkritische Verzögerung, kritische Verzögerung, erreicht |
| Freigabe durch | z. B. Projektleiter, Auftraggeber, Lenkungskreis |
| Freigabeprotokoll | Kommentar, Zeitpunkt, Entscheidung |

## 9.2 Digitale Freigabe statt Unterschrift

Die klassische Unterschrift im Meilensteinplan soll im System durch einen digitalen Freigabeprozess ersetzt werden.

Ablauf:

1. Meilenstein wird zur Freigabe eingereicht.
2. Verantwortliche Person erhält eine Mail oder Systemnachricht.
3. Die Person öffnet den Meilenstein.
4. Die Person prüft Ergebnis, Prüfkriterien und Anlagen.
5. Die Person entscheidet per Button:
   - Freigeben,
   - Ablehnen,
   - Rückfrage stellen,
   - Nacharbeit anfordern.
6. Entscheidung wird im Audit-Log gespeichert.
7. Status des Meilensteins wird automatisch aktualisiert.

### Dialogfragen der KI

```text
Welcher Meilenstein gehört zu dieser Phase?
Welche Ergebnisse müssen für den Meilenstein vorliegen?
Welche Prüfkriterien gelten?
Wer darf den Meilenstein freigeben?
Ist die Freigabe durch Projektleitung ausreichend?
Muss ein Lenkungskreis oder Auftraggeber freigeben?
Welche Dokumente oder Nachweise müssen beigefügt werden?
Was passiert bei Ablehnung?
```

---

## 10. Meilensteintrendanalyse

Die Software soll eine Meilensteintrendanalyse ermöglichen.

Dabei wird zu jedem Berichtszeitpunkt eine neue Prognose für jeden relevanten Meilenstein gespeichert.

Ziel:

- Terminverschiebungen früh erkennen,
- Trends sichtbar machen,
- Managementtermine überwachen,
- Entscheidungsbedarf ableiten.

## 10.1 Datenstruktur

| Feld | Beschreibung |
|---|---|
| Stichtag | Datum des Berichtszeitpunkts |
| Meilenstein | betroffener Meilenstein |
| Plantermin | ursprünglicher Termin |
| Prognosetermin | aktuell erwarteter Termin |
| Abweichung | Differenz zum Plantermin |
| Trend | stabil, fallend, steigend |
| Kommentar | Begründung der Änderung |
| Maßnahme | geplante Steuerungsmaßnahme |

## 10.2 Interpretation

| Trend | Bedeutung |
|---|---|
| waagerecht | Termin wird gehalten |
| steigend | Terminüberschreitung droht oder liegt vor |
| fallend | Terminunterschreitung / frühere Fertigstellung |
| erreicht Diagonale | Meilenstein wurde erreicht |

### Dialogfragen der KI

```text
Hat sich die Prognose für diesen Meilenstein verändert?
Warum hat sich der Termin verändert?
Ist die Verschiebung kritisch?
Welche Arbeitspakete verursachen die Verschiebung?
Welche Maßnahmen sind erforderlich?
Muss der Lenkungskreis informiert werden?
```

---

## 11. Statuslogik für Vorgänge und Termine

Die Software soll eine klare Statuslogik verwenden.

| Status | Bedeutung |
|---|---|
| Nicht geplant | Vorgang existiert, aber ohne Terminlogik |
| Geplant | Vorgang ist terminiert |
| Freigegeben | Vorgang ist Teil der Baseline |
| Startbereit | alle Vorgänger erfüllt |
| In Arbeit | Vorgang wurde gestartet |
| Blockiert | Vorgang kann nicht fortgesetzt werden |
| Verzögert | Plantermin wird überschritten |
| Kritisch verzögert | Verzögerung gefährdet Meilenstein oder Projektende |
| Abgeschlossen | Vorgang ist erledigt |
| Abgenommen | Ergebnis wurde freigegeben |

## 11.1 Automatische Hinweise

Die Software soll Hinweise erzeugen, wenn:

- ein Vorgang starten müsste, aber nicht gestartet wurde,
- ein Vorgang endet, ohne dass Nachfolger startbereit sind,
- ein kritischer Vorgang sich verschiebt,
- ein Meilenstein gefährdet ist,
- ein Vorgang ohne Vorgänger oder Nachfolger unplausibel wirkt,
- ein Fixtermin nicht mehr erreichbar ist,
- Ressourcenüberlastung Termine gefährdet.

---

## 12. Baseline und Planänderungen

Sobald der Terminplan freigegeben ist, wird er als Baseline gespeichert.

Die Baseline enthält:

- ursprüngliche Starttermine,
- ursprüngliche Endtermine,
- ursprüngliche Dauer,
- ursprüngliche Abhängigkeiten,
- ursprüngliche Meilensteintermine,
- ursprünglichen kritischen Pfad.

Änderungen nach Freigabe müssen nachvollziehbar dokumentiert werden.

## 12.1 Änderungsarten

| Änderung | Behandlung |
|---|---|
| kleine Terminaktualisierung ohne Auswirkung | Statusaktualisierung |
| Verschiebung eines Vorgangs mit Auswirkung auf Nachfolger | Terminwarnung |
| Verschiebung eines Meilensteins | Entscheidungspflicht |
| Änderung einer Abhängigkeit | Change Request empfohlen |
| Änderung des Projektendtermins | formaler Change Request erforderlich |

## 12.2 Dialogfragen der KI

```text
Soll die Änderung nur als Prognose gespeichert werden?
Soll der Basisplan geändert werden?
Welche Vorgänge oder Meilensteine sind betroffen?
Hat die Änderung Auswirkungen auf Kosten, Ressourcen oder Qualität?
Ist ein Change Request erforderlich?
Wer muss die Änderung freigeben?
```

---

## 13. KI-gestützter Planungsdialog

Die KI soll die Planung nicht vollständig raten, sondern strukturiert abfragen.

## 13.1 Dialogstruktur

```text
1. Projektkontext verstehen
2. Phasen identifizieren
3. Arbeitspakete erfassen
4. Aufwand je Arbeitspaket prüfen
5. Ressourceneinsatz klären
6. Dauer berechnen oder bestätigen
7. Abhängigkeiten erfassen
8. Start-/Endlogik festlegen
9. Meilensteine definieren
10. Kalender und Sperrzeiten berücksichtigen
11. Terminplan berechnen
12. kritischen Pfad prüfen
13. Meilensteinplan erzeugen
14. Freigabeprozess starten
15. Baseline speichern
```

## 13.2 Beispielprompt für die Software-KI

```text
Ich unterstütze dich jetzt bei der Ablauf- und Terminplanung.
Wir gehen schrittweise vor.

Zuerst prüfe ich, welche Arbeitspakete bereits existieren.
Danach frage ich Aufwand, Ressourcen, Dauer und Abhängigkeiten ab.
Anschließend berechne ich daraus einen Terminplan und schlage Meilensteine vor.

Bitte bestätige zuerst:
Soll das Projekt vom Starttermin aus vorwärts geplant werden oder vom Zieltermin rückwärts?
```

---

## 14. Beispiel: Arbeitspaketplanung im Dialog

## Beispielarbeitspaket

```text
AP 2.4 Installation Verschlüsselung
```

## KI-Fragen

```text
Zu welcher Phase gehört AP 2.4?
Was ist das konkrete Ergebnis dieses Arbeitspakets?
Welcher Aufwand wurde geschätzt?
Welche Personen oder Rollen arbeiten daran?
Wie hoch ist deren Verfügbarkeit?
Gibt es Vorgänger-Arbeitspakete?
Kann AP 2.4 parallel zu anderen Arbeitspaketen laufen?
Gibt es einen frühesten Starttermin?
Gibt es einen spätesten Endtermin?
Welcher Meilenstein hängt von AP 2.4 ab?
Wer muss das Ergebnis freigeben?
```

## Beispielhafte Systemableitung

```yaml
arbeitspaket_id: AP-2.4
name: Installation Verschlüsselung
phase: Umsetzung
aufwand_pt: 10
ressourcen:
  - rolle: Systemadministrator
    verfuegbarkeit: 100
    anzahl: 1
dauer_arbeitstage: 10
vorgaenger:
  - AP-2.3
beziehung: EA
fruehester_start: 2026-06-01
berechneter_start: 2026-06-01
berechnetes_ende: 2026-06-12
meilenstein: Technische Installation abgeschlossen
freigabe_durch: Projektleiter
freigabeprozess: digital
status: geplant
```

---

## 15. Datenmodell für die Software

## 15.1 Entity: WorkPackage / Arbeitspaket

```yaml
WorkPackage:
  id: string
  project_id: string
  psp_code: string
  phase_id: string
  name: string
  description: text
  goal: text
  deliverable: text
  planned_effort_value: decimal
  planned_effort_unit: hours | person_days
  planned_duration_days: decimal
  calculated_duration_days: decimal
  fixed_duration: boolean
  responsible_user_id: string
  status: enum
  baseline_start: date
  baseline_end: date
  planned_start: date
  planned_end: date
  forecast_start: date
  forecast_end: date
  actual_start: date
  actual_end: date
  percent_complete: decimal
  milestone_id: string
  created_at: datetime
  updated_at: datetime
```

## 15.2 Entity: Dependency / Vorgangsbeziehung

```yaml
Dependency:
  id: string
  project_id: string
  predecessor_work_package_id: string
  successor_work_package_id: string
  dependency_type: EA | AA | EE | AE
  lag_value: decimal
  lag_unit: days | percent
  is_mandatory: boolean
  reason: text
```

## 15.3 Entity: Milestone / Meilenstein

```yaml
Milestone:
  id: string
  project_id: string
  phase_id: string
  name: string
  description: text
  verification_criteria: text
  baseline_date: date
  planned_date: date
  forecast_date: date
  actual_date: date
  status: on_track | minor_delay | critical_delay | achieved
  approval_required: boolean
  approval_user_id: string
  approval_status: pending | approved | rejected | rework_required
```

## 15.4 Entity: ScheduleBaseline / Terminbaseline

```yaml
ScheduleBaseline:
  id: string
  project_id: string
  version: string
  approved_by: string
  approved_at: datetime
  approval_comment: text
  is_active: boolean
```

## 15.5 Entity: MilestoneTrendEntry / MTA-Eintrag

```yaml
MilestoneTrendEntry:
  id: string
  project_id: string
  milestone_id: string
  reporting_date: date
  baseline_date: date
  forecast_date: date
  deviation_days: integer
  trend: stable | increasing_delay | decreasing_delay | achieved
  reason: text
  mitigation_action: text
  created_by: string
  created_at: datetime
```

---

## 16. Automatische Berechnungs- und Prüfregeln

## 16.1 Terminberechnung

```text
Wenn Starttermin bekannt und Planung vorwärts:
- berechne früheste Starts und Enden anhand Dauer und Abhängigkeiten.

Wenn Endtermin bekannt und Planung rückwärts:
- berechne späteste Starts und Enden anhand Dauer und Abhängigkeiten.
```

## 16.2 Plausibilitätsprüfungen

Die Software soll prüfen:

- Arbeitspaket ohne Aufwand,
- Arbeitspaket ohne Verantwortlichen,
- Arbeitspaket ohne Ergebnisbeschreibung,
- Arbeitspaket ohne Dauer,
- Arbeitspaket mit Dauer, aber ohne Ressourcenlogik,
- Vorgang mit zirkulärer Abhängigkeit,
- Meilenstein ohne Prüfkriterien,
- Meilenstein ohne Freigabeverantwortlichen,
- Vorgang auf kritischem Pfad mit Verzögerung,
- Projektende überschreitet Zieltermin,
- Ressourcenüberlastung durch parallele Vorgänge.

## 16.3 Warnlogik

| Situation | Warnung |
|---|---|
| Vorgang hat keinen Vorgänger und liegt mitten im Projekt | Abhängigkeit prüfen |
| Vorgang hat keinen Nachfolger und ist kein Abschlussvorgang | Folgeabhängigkeit prüfen |
| Meilenstein hat keine Prüfkriterien | Meilenstein nicht messbar |
| Arbeitspaket hat Aufwand, aber keine Ressource | Dauer nicht belastbar berechenbar |
| Kritischer Vorgang verschiebt sich | Projektendtermin gefährdet |
| Prognose überschreitet Baseline | Terminabweichung dokumentieren |

---

## 17. User Stories für die Softwarefunktion

# User Story: Vorgänge aus Arbeitspaketen planen

## User Story

Als Projektleiter möchte ich aus beschriebenen Arbeitspaketen planbare Vorgänge erzeugen, damit ich daraus einen belastbaren Terminplan ableiten kann.

## Akzeptanzkriterien

- [ ] Arbeitspakete können einer Phase oder einem Sammelvorgang zugeordnet werden.
- [ ] Aufwand und Dauer können getrennt gepflegt werden.
- [ ] Dauer kann aus Aufwand und Ressourceneinsatz berechnet werden.
- [ ] Vorgänger und Nachfolger können gepflegt werden.
- [ ] Die Software erkennt fehlende oder unplausible Angaben.
- [ ] Die KI kann fehlende Angaben dialoggeführt abfragen.

---

# User Story: Vorgangsbeziehungen pflegen

## User Story

Als Projektleiter möchte ich Abhängigkeiten zwischen Arbeitspaketen definieren, damit die Reihenfolge der Projektarbeit korrekt geplant werden kann.

## Akzeptanzkriterien

- [ ] EA-, AA-, EE- und AE-Beziehungen werden unterstützt.
- [ ] Verzögerungen und Überlappungen können gepflegt werden.
- [ ] Abhängigkeiten können begründet werden.
- [ ] Zirkuläre Abhängigkeiten werden erkannt.
- [ ] Änderungen an Abhängigkeiten zeigen Auswirkungen auf den Terminplan.

---

# User Story: Terminplan automatisch berechnen

## User Story

Als Projektleiter möchte ich aus Aufwand, Ressourcen, Dauer und Abhängigkeiten automatisch einen Terminplan berechnen lassen, damit ich schnell einen belastbaren Projektablauf erhalte.

## Akzeptanzkriterien

- [ ] Vorwärtskalkulation wird unterstützt.
- [ ] Rückwärtskalkulation wird unterstützt.
- [ ] Projektkalender und arbeitsfreie Zeiten werden berücksichtigt.
- [ ] Start- und Endtermine werden automatisch berechnet.
- [ ] Fixtermine werden berücksichtigt.
- [ ] Konflikte werden sichtbar gemacht.

---

# User Story: Kritischen Pfad berechnen

## User Story

Als Projektleiter möchte ich den kritischen Pfad erkennen, damit ich terminrelevante Arbeitspakete aktiv überwachen kann.

## Akzeptanzkriterien

- [ ] Gesamtpuffer wird berechnet.
- [ ] Freier Puffer wird berechnet.
- [ ] Kritische Vorgänge werden markiert.
- [ ] Der kritische Pfad wird visuell angezeigt.
- [ ] Terminverschiebungen auf dem kritischen Pfad erzeugen Warnungen.

---

# User Story: Meilensteinplan erstellen

## User Story

Als Projektleiter möchte ich Meilensteine mit Prüfkriterien und Freigabeprozess planen, damit zentrale Projektfortschritte messbar und steuerbar werden.

## Akzeptanzkriterien

- [ ] Meilensteine können Phasen zugeordnet werden.
- [ ] Meilensteine enthalten Prüfkriterien.
- [ ] Plan-, Prognose- und Ist-Termine werden gepflegt.
- [ ] Status wird über Ampellogik dargestellt.
- [ ] Digitale Freigabe ist möglich.
- [ ] Freigaben werden revisionssicher protokolliert.

---

# User Story: Meilensteintrendanalyse nutzen

## User Story

Als Projektleiter möchte ich Meilensteinprognosen je Stichtag speichern, damit Termintrends frühzeitig sichtbar werden.

## Akzeptanzkriterien

- [ ] Prognosetermine können je Stichtag gespeichert werden.
- [ ] Terminabweichungen werden berechnet.
- [ ] Trends werden grafisch dargestellt.
- [ ] Kommentare und Maßnahmen können erfasst werden.
- [ ] Kritische Trends erzeugen Entscheidungsbedarf.

---

## 18. Definition of Ready für Terminplanung

Ein Projekt ist bereit für die Terminplanung, wenn:

- [ ] Projektstrukturplan vorhanden ist,
- [ ] Arbeitspakete beschrieben sind,
- [ ] Ergebnisse je Arbeitspaket definiert sind,
- [ ] Aufwandsschätzung je Arbeitspaket vorliegt,
- [ ] Ressourcen oder Rollen grob bekannt sind,
- [ ] Projektkalender definiert ist,
- [ ] bekannte Fixtermine vorliegen,
- [ ] Meilensteinlogik grob abgestimmt ist,
- [ ] Abhängigkeiten fachlich geklärt werden können.

---

## 19. Definition of Done für Terminplanung

Die Terminplanung ist abgeschlossen, wenn:

- [ ] alle relevanten Arbeitspakete terminiert sind,
- [ ] Vorgangsbeziehungen gepflegt sind,
- [ ] Dauer und Aufwand plausibel sind,
- [ ] Projektkalender berücksichtigt wurde,
- [ ] kritischer Pfad berechnet wurde,
- [ ] Meilensteinplan erstellt wurde,
- [ ] Terminrisiken sichtbar sind,
- [ ] Plan wurde geprüft,
- [ ] Freigabeprozess wurde durchgeführt,
- [ ] Baseline wurde gespeichert.

---

## 20. Zusammenfassung für die Softwarelogik

Die Ablauf- und Terminplanung im System soll folgende Kernfähigkeit bereitstellen:

```text
Aus Arbeitspaketen werden planbare Vorgänge.
Aus Aufwand und Ressourcen wird Dauer.
Aus Abhängigkeiten wird Ablauf.
Aus Ablauf und Kalender wird Terminplan.
Aus Meilensteinen wird Managementsteuerung.
Aus Prognosen wird Termincontrolling.
Aus Freigaben wird eine verbindliche Baseline.
```

Damit wird die Terminplanung nicht nur dokumentiert, sondern aktiv durch die Software unterstützt, geprüft, berechnet und später für Controlling, Abweichungsanalyse und Projektsteuerung nutzbar gemacht.
