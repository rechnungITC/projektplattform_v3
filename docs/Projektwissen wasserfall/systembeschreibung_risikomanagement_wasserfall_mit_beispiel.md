# Systembeschreibung: Risikomanagement und Maßnahmenplanung für Wasserfall-/PMI-Projekte

## 1. Zweck des Moduls

Dieses Dokument beschreibt, wie **Risikoanalyse, Risikobewertung und Maßnahmenplanung** in der Projektplattform fachlich und technisch abgebildet werden sollen.

Ziel ist, dass die Software Risiken nicht nur als freie Notizen speichert, sondern als steuerbare Projektobjekte mit:

- Risikoidentifikation,
- Ursache,
- Auswirkung,
- Eintrittswahrscheinlichkeit,
- Schadensausmaß,
- Bewertung,
- Risikokategorie,
- Maßnahmen,
- Verantwortlichen,
- Termin,
- Status,
- Review-Historie,
- Eskalation,
- Freigabe,
- und späterer Auswertung im Projektcontrolling.

Die KI soll den Nutzer bei der Erstellung eines Risikoregisters dialoggeführt unterstützen und alle relevanten Informationen gezielt abfragen. Das System soll daraus eine belastbare Risikoliste, einen Maßnahmenplan, ein Risikoportfolio und Statusinformationen für Projektleitung, Lenkungskreis und Management erzeugen können.

---

## 2. Einordnung im Wasserfall-/PMI-Projektmodell

Das Risikomanagement ist Bestandteil der Planungsphase und wird in der Steuerungsphase laufend fortgeführt.

```text
Projektauftrag
  ↓
Projektstrukturplan erstellen
  ↓
Arbeitspakete beschreiben
  ↓
Aufwand, Termine, Ressourcen und Kosten planen
  ↓
Risiken analysieren
  ↓
Gegenmaßnahmen zu Risiken planen
  ↓
Projektplan erstellen
  ↓
Projektfreigabe
  ↓
Projektsteuerung / Risikoreview / Maßnahmenkontrolle
```

Das Risikomanagement darf nicht nur einmalig beim Projektstart erfolgen. Es muss über den gesamten Projektverlauf regelmäßig überprüft und aktualisiert werden.

---

## 3. Fachliches Zielbild

Das System soll folgende Fragen beantworten können:

1. Welche Risiken gefährden Projektziele, Termine, Kosten, Qualität oder Akzeptanz?
2. Welche Ursachen liegen diesen Risiken zugrunde?
3. Welche Auswirkungen entstehen, wenn das Risiko eintritt?
4. Wie wahrscheinlich ist der Eintritt?
5. Wie groß ist die Auswirkung?
6. Wie hoch ist die Risikobewertung?
7. Welche Risiken gehören in die Top-Risikoliste?
8. Welche Maßnahmen sind sinnvoll?
9. Wer ist für Risiko und Maßnahme verantwortlich?
10. Bis wann muss die Maßnahme umgesetzt werden?
11. Ist die Maßnahme wirksam?
12. Muss ein Risiko eskaliert werden?
13. Ist aus einem Risiko bereits ein Problem geworden?
14. Welche Risiken müssen in Projektstatusbericht, Lenkungskreis oder Management-Reporting angezeigt werden?

---

## 4. Grundbegriffe

### 4.1 Risiko

Ein Risiko ist ein mögliches zukünftiges Ereignis, das bei Eintritt negative Auswirkungen auf das Projekt haben kann.

Beispiele:

- Terminverzug
- Budgetüberschreitung
- Qualitätsmängel
- Ressourcenengpass
- Lieferantenproblem
- Akzeptanzproblem
- technische Integrationsprobleme
- Ausfall kritischer Systeme
- Vertrags- oder Rechtsrisiken

### 4.2 Problem

Ein Problem ist ein Risiko, das bereits eingetreten ist.

Beispiel:

```text
Risiko:
Der externe Lieferant könnte die Schnittstelle nicht rechtzeitig liefern.

Problem:
Der externe Lieferant hat die Schnittstelle nicht rechtzeitig geliefert.
```

### 4.3 Ursache

Die Ursache beschreibt, warum ein Risiko entstehen kann.

Beispiele:

- unklare Projektziele
- unvollständige Anforderungen
- ungenaue Aufwandsschätzung
- unrealistischer Terminplan
- fehlende Managementunterstützung
- fehlende Ressourcen
- unzureichende Qualifikation
- technische Abhängigkeiten
- externe Lieferantenabhängigkeit

### 4.4 Auswirkung

Die Auswirkung beschreibt, was passiert, wenn das Risiko eintritt.

Beispiele:

- Verzögerung im Projektablauf
- Budgetüberschreitung
- Qualitätsmängel
- Betriebsstörung
- Vertragsstrafe
- Imageschaden
- Nacharbeit
- zusätzlicher Ressourcenbedarf
- Mehraufwand im Projektteam

### 4.5 Eintrittswahrscheinlichkeit

Die Eintrittswahrscheinlichkeit beschreibt, wie wahrscheinlich das Risiko im Projekt eintritt.

### 4.6 Schadensausmaß / Auswirkung

Das Schadensausmaß beschreibt, wie stark das Projekt betroffen wäre, wenn das Risiko eintritt.

### 4.7 Bewertung

Die Bewertung ist eine rechnerische oder kategorische Einstufung des Risikos.

Eine einfache Bewertungslogik kann sein:

```text
Bewertung = Eintrittswahrscheinlichkeit × Auswirkung / 2
```

Alternativ kann bei finanziellen Risiken gelten:

```text
Bewertung = Eintrittswahrscheinlichkeit × finanzielle Schadenshöhe
```

Die Software sollte beide Bewertungsmodelle unterstützen können.

---

## 5. Risikokategorien

Die Software soll Risiken kategorisieren können. Die Kategorien helfen der KI, gezielte Fragen zu stellen und Risiken systematisch zu sammeln.

| Kategorie | Beschreibung | Beispiel |
|---|---|---|
| Technisch | Risiken aus System, Architektur, Schnittstellen, Daten oder Infrastruktur | Schnittstelle ist nicht stabil |
| Terminlich | Risiken für Ablauf, Meilensteine und Projektende | Abhängiges Arbeitspaket verzögert sich |
| Finanziell | Budget-, Liquiditäts- oder Mehrkostenrisiken | Externe Kosten steigen |
| Personell | Risiken durch Verfügbarkeit, Qualifikation oder Ausfall von Personen | Key User steht nicht zur Verfügung |
| Organisation | Risiken aus Rollen, Entscheidungswegen, Zuständigkeiten | Keine klare Freigabeinstanz |
| Methodisch | Risiken im Vorgehen, in Planung, Test oder Steuerung | Anforderungen wurden nicht sauber priorisiert |
| Qualität | Risiken für Ergebnisqualität oder Abnahmefähigkeit | Lieferobjekte erfüllen Anforderungen nicht |
| Stakeholder / Akzeptanz | Risiken aus fehlender Einbindung, Widerstand oder Kommunikation | Fachbereich akzeptiert neue Lösung nicht |
| Vertraglich / Rechtlich | Risiken aus Verträgen, Compliance, Datenschutz oder Haftung | Vertragsstrafe bei Terminverzug |
| Extern | Risiken durch Lieferanten, Partner, Markt oder Umfeld | Lieferant fällt aus |

---

## 6. Risiko-Lifecycle im System

Ein Risiko soll im System einen klaren Lebenszyklus haben.

```text
Entwurf
  ↓
Identifiziert
  ↓
Bewertet
  ↓
Maßnahmen geplant
  ↓
In Überwachung
  ↓
Reduziert / Akzeptiert / Eskaliert / Eingetreten
  ↓
Geschlossen
```

### 6.1 Statuswerte für Risiken

| Status | Bedeutung |
|---|---|
| Draft | Risiko wurde angelegt, aber noch nicht bewertet |
| Identified | Risiko wurde fachlich beschrieben |
| Assessed | Eintrittswahrscheinlichkeit und Auswirkung wurden bewertet |
| Mitigation Planned | Maßnahmen wurden definiert |
| In Monitoring | Risiko wird aktiv überwacht |
| Reduced | Risiko wurde durch Maßnahmen reduziert |
| Accepted | Risiko wird bewusst akzeptiert |
| Escalated | Risiko wurde an Projektleitung / Lenkungskreis eskaliert |
| Occurred | Risiko ist eingetreten und wird zum Problem |
| Closed | Risiko ist erledigt oder nicht mehr relevant |

---

## 7. Prozesslogik für die Software

### 7.1 Schritt 1: Risiken identifizieren

Die KI soll den Nutzer systematisch fragen:

```text
Welche Projektziele könnten gefährdet werden?
Welche Arbeitspakete sind kritisch?
Welche Abhängigkeiten bestehen zu externen Lieferanten?
Welche Termine sind nicht verschiebbar?
Welche Ressourcen sind knapp?
Welche technischen Unsicherheiten bestehen?
Welche fachlichen Entscheidungen sind noch offen?
Welche Annahmen sind noch nicht bestätigt?
Welche Stakeholder könnten die Umsetzung blockieren?
Welche Qualitäts- oder Abnahmerisiken bestehen?
```

Das System soll Risiken aus folgenden Quellen vorschlagen können:

- Projektauftrag
- Arbeitspakete
- Aufwandsschätzung
- Terminplan
- Ressourcenplan
- Kostenplan
- Qualitätsplan
- Änderungsprotokoll
- offene Entscheidungen
- Abhängigkeiten
- Lessons Learned aus früheren Projekten
- bestehender Risiko- und Maßnahmenkatalog

---

### 7.2 Schritt 2: Ursache und Auswirkung erfassen

Für jedes Risiko müssen Ursache und Auswirkung getrennt erfasst werden.

```text
Risiko: Terminverzug bei Datenmigration
Ursache: Quellsystemdaten sind unvollständig und müssen bereinigt werden.
Auswirkung: Go-Live verschiebt sich, Fachbereich kann nicht rechtzeitig testen, zusätzliche externe Kosten entstehen.
```

Die KI soll aktiv nachschärfen, wenn Risiko, Ursache und Auswirkung vermischt werden.

Beispiel:

```text
Nutzer: „Die Migration klappt vielleicht nicht.“

KI fragt:
- Was genau könnte bei der Migration nicht funktionieren?
- Wodurch könnte das entstehen?
- Welche Projektziele wären betroffen?
- Wäre der Schaden eher terminlich, finanziell, qualitativ oder fachlich?
```

---

### 7.3 Schritt 3: Risiko bewerten

Die Software soll mindestens zwei Bewertungsmodelle unterstützen.

#### Modell A: qualitative Skala

| Wert | Eintrittswahrscheinlichkeit | Bedeutung |
|---:|---|---|
| 1 | sehr unwahrscheinlich | bis 0,1 % |
| 2 | unwahrscheinlich | 0,1 % bis 1 % |
| 3 | wenig wahrscheinlich | 1 % bis 10 % |
| 4 | ziemlich wahrscheinlich | 10 % bis 30 % |
| 5 | sehr wahrscheinlich | 30 % bis 100 % |

| Wert | Auswirkung | Bedeutung |
|---:|---|---|
| 1 | vernachlässigbar | kaum Auswirkung |
| 2 | spürbar | geringe Projektbelastung |
| 3 | verkraftbar | relevante Auswirkung, aber steuerbar |
| 4 | gefährlich | starke Auswirkung auf Projektziele |
| 5 | katastrophal | Projektziel stark gefährdet |

#### Bewertungsformel

```text
Risikowert = Eintrittswahrscheinlichkeit × Auswirkung / 2
```

#### Ampellogik

| Risikowert | Status | Bedeutung |
|---:|---|---|
| 0 bis 5 | Grün | akzeptabel / beobachten |
| > 5 bis 15 | Gelb | relevant / Maßnahme prüfen |
| > 15 | Rot | kritisch / Maßnahme und Eskalation erforderlich |

---

#### Modell B: finanzielle Bewertung

Für Risiken mit klar bezifferbarem Schaden kann zusätzlich eine finanzielle Bewertung genutzt werden.

```text
Erwartungswert = Eintrittswahrscheinlichkeit × Schadenshöhe
```

Beispiel:

| Risiko | Eintrittswahrscheinlichkeit | Schadenshöhe | Erwartungswert | Maßnahme | Kosten Maßnahme |
|---|---:|---:|---:|---|---:|
| Stromausfall | 1:100 | 10.000 € | 100 € | USV | 1.000 € |
| Blitzeinschlag | 1:100.000 | 1.000.000 € | 10 € | Ersatzrechenzentrum | 10.000 € |
| Kabelbruch | 1:1.000 | 5.000 € | 5 € | keine | 0 € |
| Sabotage | 1:1.000 | 100.000 € | 100 € | Versicherung | 2.000 € |

Das System sollte bei finanzieller Bewertung zusätzlich prüfen:

```text
Kosten der Maßnahme <= erwarteter vermiedener Schaden?
```

Diese Prüfung darf nicht automatisch entscheiden, sondern soll eine Entscheidungshilfe liefern.

---

## 8. Maßnahmenplanung

Für jedes relevante Risiko soll mindestens eine Maßnahme definiert werden.

### 8.1 Maßnahmenarten

| Maßnahmenart | Beschreibung | Beispiel |
|---|---|---|
| Präventiv | Reduziert Eintrittswahrscheinlichkeit | Ressourcen frühzeitig reservieren |
| Mindernd | Reduziert Schadensausmaß | Backup-Prozess definieren |
| Notfallmaßnahme | Wird bei Eintritt aktiviert | Rollback-Plan beim Go-Live |
| Übertragung | Risiko wird vertraglich oder versicherungstechnisch übertragen | Versicherung / Vertragsklausel |
| Akzeptanz | Risiko wird bewusst akzeptiert | Kleinrisiko ohne Maßnahme |
| Eskalation | Entscheidung durch höhere Instanz erforderlich | Budgetfreigabe im Lenkungskreis |

### 8.2 Pflichtfelder für Maßnahmen

| Feld | Pflicht | Zweck |
|---|---|---|
| Maßnahmentitel | Ja | Kurze Bezeichnung |
| Beschreibung | Ja | Was wird konkret getan? |
| Maßnahmenart | Ja | Präventiv, mindernd, Notfall usw. |
| Verantwortlicher | Ja | Wer setzt die Maßnahme um? |
| Zieltermin | Ja | Bis wann? |
| Kosten der Maßnahme | Optional | Aufwand / Budgetbedarf |
| Status | Ja | Offen, in Arbeit, erledigt, unwirksam |
| Wirksamkeitsprüfung | Ja, bei Abschluss | Hat die Maßnahme geholfen? |
| Rest-Risiko | Ja, bei Bewertung | Risiko nach Maßnahme |

---

## 9. Datenmodell für die Software

### 9.1 Risiko

```yaml
risk:
  id: string
  project_id: string
  work_package_id: string | null
  milestone_id: string | null
  title: string
  description: text
  category: technical | schedule | financial | resource | quality | stakeholder | organization | method | legal | external
  cause: text
  impact: text
  risk_owner_id: string
  probability_score: integer
  impact_score: integer
  risk_score: decimal
  financial_damage_min: decimal | null
  financial_damage_max: decimal | null
  expected_monetary_value: decimal | null
  status: draft | identified | assessed | mitigation_planned | monitoring | reduced | accepted | escalated | occurred | closed
  escalation_level: none | project_manager | steering_committee | sponsor
  created_at: datetime
  updated_at: datetime
```

### 9.2 Maßnahme

```yaml
risk_measure:
  id: string
  risk_id: string
  title: string
  description: text
  measure_type: preventive | mitigating | emergency | transfer | acceptance | escalation
  owner_id: string
  due_date: date
  planned_cost: decimal | null
  planned_effort_hours: decimal | null
  status: open | in_progress | done | overdue | ineffective | cancelled
  effectiveness_rating: effective | partly_effective | ineffective | not_reviewed
  residual_probability_score: integer | null
  residual_impact_score: integer | null
  residual_risk_score: decimal | null
  created_at: datetime
  updated_at: datetime
```

### 9.3 Risikoreview

```yaml
risk_review:
  id: string
  risk_id: string
  review_date: date
  reviewed_by_id: string
  old_probability_score: integer
  old_impact_score: integer
  old_risk_score: decimal
  new_probability_score: integer
  new_impact_score: integer
  new_risk_score: decimal
  comment: text
  decision: keep_monitoring | update_measure | escalate | accept | close
```

### 9.4 Risiko-Portfolio

```yaml
risk_portfolio_item:
  risk_id: string
  x_axis_impact: decimal
  y_axis_probability: decimal
  bubble_size: decimal | null
  color_status: green | yellow | red
```

---

## 10. KI-Dialog zur Risikoerstellung

Die KI soll Risiken nicht einfach frei formulieren, sondern strukturiert abfragen.

### 10.1 Dialogstart

```text
Für welches Projekt, welche Phase oder welches Arbeitspaket möchtest du Risiken erfassen?
```

Optionen:

- Gesamtprojekt
- Phase
- Arbeitspaket
- Meilenstein
- Lieferobjekt
- Schnittstelle
- Go-Live
- externer Lieferant

---

### 10.2 Risiko identifizieren

```text
Was könnte das Projektziel gefährden?
```

Falls der Nutzer unsicher ist, bietet die KI Kategorien an:

```text
Ich kann dich durch typische Risikobereiche führen:
1. Termine
2. Kosten
3. Ressourcen
4. Qualität
5. Technik / Schnittstellen
6. Daten / Migration
7. Lieferanten
8. Stakeholder / Akzeptanz
9. Verträge / Compliance
10. Projektorganisation
```

---

### 10.3 Ursache abfragen

```text
Wodurch könnte dieses Risiko entstehen?
```

Beispiele für Hilfsfragen:

```text
Liegt die Ursache in unklaren Anforderungen?
Gibt es externe Abhängigkeiten?
Sind Ressourcen unsicher?
Gibt es technische Unklarheiten?
Sind Entscheidungen noch offen?
Sind Aufwände oder Termine realistisch geschätzt?
```

---

### 10.4 Auswirkung abfragen

```text
Was passiert, wenn das Risiko eintritt?
```

Hilfsfragen:

```text
Hat das Auswirkungen auf Termine?
Hat das Auswirkungen auf Kosten?
Hat das Auswirkungen auf Qualität?
Ist ein Meilenstein oder Go-Live gefährdet?
Entsteht zusätzlicher Aufwand?
Muss der Lenkungskreis entscheiden?
```

---

### 10.5 Bewertung abfragen

```text
Wie wahrscheinlich ist der Eintritt?
```

Auswahl:

```text
1 = sehr unwahrscheinlich
2 = unwahrscheinlich
3 = wenig wahrscheinlich
4 = ziemlich wahrscheinlich
5 = sehr wahrscheinlich
```

```text
Wie groß wäre die Auswirkung?
```

Auswahl:

```text
1 = vernachlässigbar
2 = spürbar
3 = verkraftbar
4 = gefährlich
5 = katastrophal
```

Die Software berechnet danach automatisch:

```text
Risikowert = Eintrittswahrscheinlichkeit × Auswirkung / 2
```

---

### 10.6 Maßnahme abfragen

```text
Welche Maßnahme soll das Risiko verhindern, reduzieren oder beherrschbar machen?
```

Hilfsfragen:

```text
Kann die Eintrittswahrscheinlichkeit reduziert werden?
Kann der Schaden reduziert werden?
Brauchen wir einen Notfallplan?
Muss eine Entscheidung vorbereitet werden?
Muss Budget oder Kapazität reserviert werden?
Soll das Risiko akzeptiert oder eskaliert werden?
```

---

### 10.7 Verantwortlichkeit und Termin abfragen

```text
Wer ist für das Risiko verantwortlich?
Wer ist für die Maßnahme verantwortlich?
Bis wann muss die Maßnahme erledigt sein?
Wann soll das Risiko erneut geprüft werden?
```

---

## 11. Beispiel: Risikoliste für ein Wasserfall-/Softwareprojekt

### 11.1 Beispielprojekt

```text
Projekt: Einführung einer Projektplattform
Vorgehen: Wasserfall-/PMI-orientiertes Projektmodell
Phasen: Analyse, Konzeption, Umsetzung, Test, Rollout, Abschluss
```

### 11.2 Beispiel-Risikoliste

| Nr. | Risiko | Kategorie | Ursache | Auswirkung | E | A | Bewertung | Ampel | Maßnahme | Verantwortlich |
|---:|---|---|---|---|---:|---:|---:|---|---|---|
| 1 | Zeitüberschreitung im Projekt | Terminlich | Aufwand wurde unterschätzt, Abhängigkeiten sind nicht vollständig geplant | Meilensteine verschieben sich, Go-Live gefährdet | 4 | 4 | 8,0 | Gelb | Terminplan reviewen, kritischen Pfad prüfen, Reserven einplanen | Projektleiter |
| 2 | Kostenüberschreitung im Projekt | Finanziell | Externe Leistungen und Change Requests sind nicht ausreichend budgetiert | Budget wird überschritten, Nachfreigabe erforderlich | 4 | 3 | 6,0 | Gelb | Kostenbaseline erstellen, Change-Prozess verpflichtend machen | Projektcontroller |
| 3 | Mangelhafte Qualität der Lieferobjekte | Qualität | Anforderungen sind zu ungenau und Abnahmekriterien fehlen | Nacharbeit, Abnahmeverzug, Unzufriedenheit der Stakeholder | 3 | 4 | 6,0 | Gelb | Abnahmekriterien je Arbeitspaket definieren, Testfälle ableiten | QA-Verantwortlicher |
| 4 | Akzeptanzproblem im Fachbereich | Stakeholder | Key User werden zu spät eingebunden | Lösung wird nicht angenommen, Schulungsaufwand steigt | 3 | 3 | 4,5 | Grün | Key-User-Workshops früh einplanen, Kommunikationsplan erstellen | Change Manager |
| 5 | Datenmigration verzögert Go-Live | Technisch | Quelldaten sind unvollständig oder inkonsistent | Test und Produktivstart verschieben sich | 4 | 5 | 10,0 | Gelb | Datenanalyse vorziehen, Migrations-Probelauf einplanen | Datenmigration Lead |
| 6 | Elementarschaden / Systemausfall | Extern / Betrieb | Infrastruktur- oder Umweltereignis | Projektarbeit oder Produktivbetrieb fällt aus | 2 | 5 | 5,0 | Grün | Backup, Notfallplan, Wiederanlaufverfahren prüfen | IT-Betrieb |
| 7 | Vertragsrisiko mit Lieferant | Vertraglich | Lieferumfang und Abnahme nicht eindeutig geregelt | Streit über Mehrleistungen, Termin- und Kostenrisiko | 3 | 4 | 6,0 | Gelb | Leistungsbeschreibung und Abnahmeprozess vertraglich konkretisieren | Einkauf / PL |
| 8 | Projektabbruch | Organisation | Managementunterstützung fehlt oder Prioritäten ändern sich | Vorleistungen werden abgeschrieben, Nutzen wird nicht erreicht | 2 | 5 | 5,0 | Grün | Regelmäßige Lenkungskreisberichte und Entscheidungsbedarfe vorbereiten | Sponsor |

---

## 12. Beispiel: Maßnahmenplan

| Risiko | Maßnahme | Art | Kosten | Termin | Status | Verantwortlich | Wirksamkeitsprüfung |
|---|---|---|---:|---|---|---|---|
| Zeitüberschreitung im Projekt | Projektplanung mit Arbeitspaketen, Terminen, Verantwortlichkeiten und Ressourcen regelmäßig aktualisieren | Präventiv | 0 € | wöchentlich | Offen | Projektleiter | Terminabweichungen sinken oder bleiben stabil |
| Zeitüberschreitung im Projekt | Kunden und Benutzer frühzeitig einbeziehen | Präventiv | 0 € | vor Konzeptabnahme | Offen | Product Owner | Offene fachliche Fragen reduzieren sich |
| Kostenüberschreitung im Projekt | Aufwand realistisch abschätzen und durch Experten reviewen lassen | Präventiv | 0 € | vor Baseline-Freigabe | Offen | Projektcontroller | Abweichung zwischen Schätzung und Ist sinkt |
| Kostenüberschreitung im Projekt | Änderungsmanagement-Prozess verbindlich nutzen | Mindernd | 0 € | ab Projektstart | Offen | Projektleiter | Neue Anforderungen haben bewertete Auswirkungen |
| Mangelhafte Qualität der Lieferobjekte | Abnahmekriterien je Lieferobjekt definieren | Präventiv | 0 € | vor Umsetzung | Offen | QA-Verantwortlicher | Abnahme ohne wesentliche Nacharbeit möglich |
| Datenmigration verzögert Go-Live | Datenqualitätsanalyse durchführen | Präventiv | 2.000 € | vor Testphase | Offen | Datenmigration Lead | Fehlerquote im Migrationslauf sinkt |
| Vertragsrisiko mit Lieferant | Abnahme und Leistungsgrenzen vertraglich regeln | Präventiv | 0 € | vor Vertragsabschluss | Offen | Einkauf | Keine ungeklärten Leistungsgrenzen im Vertrag |

---

## 13. Beispiel aus dem Maßnahmenkatalog

Das System soll einen frei editierbaren Maßnahmenkatalog unterstützen. Daraus kann die KI Maßnahmen vorschlagen.

### 13.1 Projektteam

- Persönliches Engagement der Projektleitung sicherstellen
- Zeit, Fach- und Sozialkompetenz der Projektleitung sicherstellen
- Fachliche Kompetenz des Projektteams sicherstellen
- Benötigte Ressourcen der Projektmitglieder sicherstellen
- Experten hinzuziehen
- Anreize für Projektteam einführen

### 13.2 Umfeld

- Volle Unterstützung des Managements sicherstellen
- Management periodisch informieren
- Kunden bzw. Benutzer frühzeitig einbeziehen
- Kunden bzw. Benutzer periodisch informieren
- Risiken bezüglich negativer Medienberichterstattung identifizieren
- Potenzielle Interessenkonflikte proaktiv offenlegen

### 13.3 Projektmanagement

- Projektziele und Lieferobjekte klar definieren
- Projektumfang klar abgrenzen
- Projektumfang auf das Notwendige limitieren
- Komplexität mit Arbeitspaketen reduzieren
- Komplexität mit schrittweisem Vorgehen reduzieren
- Projektplanung unterhalten
- Aufwand realistisch abschätzen
- Zeitliche Reserven einplanen
- Finanzielle Reserven einplanen
- Änderungsmanagement-Prozess unterhalten
- Monatliches Projektcontrolling durchführen
- Lieferobjekte überprüfen und abnehmen lassen
- Nur bewährte Tools und Systeme einsetzen
- Vertraulichkeit im Projekt sicherstellen

### 13.4 Vertragsmanagement

- Verzugsgründe vertraglich eingrenzen
- Fremdverschuldete Verzögerungen bestätigen lassen
- Einhaltung der Arbeitsbestimmungen überprüfen
- Geheimhaltungspflicht sicherstellen
- Geheimhaltungsvereinbarung abschließen
- Versicherungsdeckung prüfen
- Konventionalstrafen eingrenzen
- Haftungsklauseln prüfen
- Monatliche Zahlungen mit kurzer Fälligkeit vereinbaren
- Pflichten von Subunternehmern vertraglich absichern
- Leistungen bezüglich Schnittstellen präzise abgrenzen
- Abnahme umfassend regeln
- Änderungen im Projekt vertraglich absichern
- Ausstiegsklauseln vorsehen

---

## 14. Risikoportfolio

Die Software soll Risiken in einem Risikoportfolio darstellen.

### 14.1 Achsen

```text
X-Achse: Auswirkung / Schadenshöhe
Y-Achse: Eintrittswahrscheinlichkeit
```

### 14.2 Quadrantenlogik

| Bereich | Bedeutung | Systemverhalten |
|---|---|---|
| Niedrige Wahrscheinlichkeit / niedriger Schaden | Beobachten | Keine Eskalation nötig |
| Hohe Wahrscheinlichkeit / niedriger Schaden | Überwachen | Maßnahmen prüfen |
| Niedrige Wahrscheinlichkeit / hoher Schaden | Notfallplan prüfen | Managementhinweis möglich |
| Hohe Wahrscheinlichkeit / hoher Schaden | Kritisch | Top-Risiko, Maßnahme und Eskalation erforderlich |

### 14.3 Portfolio-Regel

```text
Risiken mit hoher Eintrittswahrscheinlichkeit und hoher Auswirkung werden automatisch als Top-Risiken markiert.
```

---

## 15. Top-10-Risikoliste

Nach Analyse und Gewichtung soll das System automatisch eine Top-Risikoliste bilden.

### Sortierlogik

1. Höchster Risikowert
2. Rote Risiken vor gelben Risiken
3. Risiken mit überfälligen Maßnahmen höher priorisieren
4. Risiken mit Meilensteinbezug höher priorisieren
5. Risiken mit Lenkungskreisentscheidung höher priorisieren

### Anzeige im Dashboard

| Kennzahl | Beschreibung |
|---|---|
| Anzahl Risiken gesamt | Alle aktiven Risiken |
| Anzahl rote Risiken | Kritische Risiken |
| Anzahl gelbe Risiken | Relevante Risiken |
| Überfällige Maßnahmen | Maßnahmen mit Terminüberschreitung |
| Neue Risiken seit letztem Review | Veränderung seit letztem Statusbericht |
| Eingetretene Risiken | Risiken, die zu Problemen wurden |
| Risiko-Trend | Entwicklung der Risikosumme über Zeit |

---

## 16. Integration mit anderen Modulen

### 16.1 Arbeitspakete

Risiken können direkt an Arbeitspakete gehängt werden.

Beispiel:

```text
AP 3.4 Datenmigration
Risiko: Quelldaten sind unvollständig
Maßnahme: Datenqualitätsanalyse vor Migrationskonzept durchführen
```

### 16.2 Terminplanung

Risiken mit Terminwirkung sollen im Terminplan sichtbar sein.

Beispiel:

```text
Risiko: Lieferant liefert Schnittstelle verspätet
Auswirkung: Vorgang 4.2 kann nicht starten
Systemaktion: Markierung im Terminplan und Hinweis auf kritischen Pfad
```

### 16.3 Kostenplanung

Risiken mit Kostenwirkung sollen als Risikoreserve oder Kostenrisiko darstellbar sein.

Beispiel:

```text
Risiko: zusätzlicher Beratungsaufwand
Finanzielle Auswirkung: 15.000 €
Systemaktion: Hinweis im Kostenplan / Risikobudget
```

### 16.4 Qualitätsmanagement

Qualitätsrisiken sollen mit Prüfkriterien und Abnahmekriterien verknüpft werden.

### 16.5 Change Management

Wenn eine Risikomaßnahme Scope, Termin oder Budget verändert, soll automatisch ein Change Request vorgeschlagen werden.

### 16.6 Projektstatusbericht

Top-Risiken und überfällige Maßnahmen sollen automatisch in den Projektstatusbericht übernommen werden.

---

## 17. Freigabe- und Eskalationsprozess

### 17.1 Freigabe der Risikoliste

Die initiale Risikoliste sollte im Planungsprozess freigegeben werden.

Mögliche Freigeber:

- Projektleiter
- Teilprojektleiter
- Sponsor
- Lenkungskreis
- Auftraggeber

### 17.2 Digitale Freigabe

Das System soll die Freigabe digital abbilden.

```text
1. Risikoliste wird erstellt.
2. KI prüft Vollständigkeit.
3. Projektleiter erhält Freigabeanfrage.
4. Projektleiter prüft Risiken und Maßnahmen.
5. Freigabe, Ablehnung oder Kommentierung per Button.
6. System schreibt Freigabe in Audit-Log.
```

### 17.3 Eskalation

Eine Eskalation soll automatisch vorgeschlagen werden, wenn:

- Risikowert rot ist,
- Maßnahme überfällig ist,
- Risiko ein kritisches Arbeitspaket betrifft,
- Risiko einen Meilenstein gefährdet,
- zusätzliche Kosten oder Ressourcenfreigaben nötig sind,
- Entscheidung außerhalb des Projektteams erforderlich ist.

---

## 18. Beispiel für KI-Dialog

```text
KI:
Für welches Projekt oder Arbeitspaket möchtest du ein Risiko erfassen?

Nutzer:
Für das Arbeitspaket Datenmigration.

KI:
Was könnte bei der Datenmigration schiefgehen?

Nutzer:
Die Quelldaten könnten unvollständig sein.

KI:
Wodurch könnte das entstehen?

Nutzer:
Die Daten liegen in mehreren Altsystemen und wurden bisher nicht bereinigt.

KI:
Welche Auswirkungen hätte das?

Nutzer:
Der Test verzögert sich und der Go-Live könnte verschoben werden.

KI:
Bitte bewerte die Eintrittswahrscheinlichkeit von 1 bis 5.

Nutzer:
4.

KI:
Bitte bewerte die Auswirkung von 1 bis 5.

Nutzer:
5.

KI:
Der berechnete Risikowert beträgt 10,0. Das Risiko wird als relevant eingestuft. Welche Maßnahme soll geplant werden?

Nutzer:
Datenqualitätsanalyse vorziehen und einen Probelauf machen.

KI:
Wer ist verantwortlich und bis wann soll die Maßnahme abgeschlossen sein?

Nutzer:
Datenmigration Lead, bis Ende der Konzeptphase.

KI:
Ich lege das Risiko mit Maßnahme an und markiere es für den nächsten Projektstatusbericht.
```

---

## 19. User Story: Risikomanagement dialoggeführt erstellen

```markdown
# User Story: Risiken dialoggeführt erfassen und bewerten

## Status
Proposed

## User Story
Als Projektleiter möchte ich Risiken dialoggeführt durch die KI erfassen, bewerten und mit Maßnahmen versehen können, damit Risiken frühzeitig erkannt, priorisiert und gesteuert werden können.

## Akzeptanzkriterien
- [ ] Die KI fragt Risiko, Ursache und Auswirkung getrennt ab.
- [ ] Die KI unterstützt bei der Auswahl einer Risikokategorie.
- [ ] Eintrittswahrscheinlichkeit und Auswirkung können auf einer Skala von 1 bis 5 bewertet werden.
- [ ] Der Risikowert wird automatisch berechnet.
- [ ] Das System weist dem Risiko automatisch eine Ampel zu.
- [ ] Für relevante Risiken kann mindestens eine Maßnahme angelegt werden.
- [ ] Jede Maßnahme enthält Verantwortlichen, Termin, Status und Beschreibung.
- [ ] Risiken können Arbeitspaketen, Phasen oder Meilensteinen zugeordnet werden.
- [ ] Top-Risiken werden automatisch in eine priorisierte Liste übernommen.
- [ ] Überfällige Maßnahmen werden sichtbar markiert.
- [ ] Änderungen an Bewertung oder Maßnahme werden historisiert.
- [ ] Risiken können in Projektstatusberichte übernommen werden.

## Nicht-Akzeptanzkriterien
- [ ] Risiko, Ursache und Auswirkung dürfen nicht in einem einzigen Freitextfeld ohne Struktur verschwinden.
- [ ] Kritische Risiken dürfen nicht ohne Verantwortlichen gespeichert werden.
- [ ] Maßnahmen dürfen nicht ohne Fälligkeit als abgeschlossen gelten.
- [ ] Ein Risiko darf nicht als geschlossen gelten, wenn keine Begründung oder Wirksamkeitsprüfung dokumentiert wurde.

## Definition of Ready
- [ ] Risikokategorien sind definiert.
- [ ] Bewertungsskala ist fachlich freigegeben.
- [ ] Ampellogik ist definiert.
- [ ] Rollen für Risiko-Owner und Maßnahmen-Owner sind definiert.
- [ ] Zuordnung zu Projekt, Phase, Meilenstein oder Arbeitspaket ist geklärt.

## Definition of Done
- [ ] Risikoerfassung funktioniert über Dialog und manuelle Eingabe.
- [ ] Risikowert und Ampel werden automatisch berechnet.
- [ ] Maßnahmenplan ist angebunden.
- [ ] Dashboard zeigt Top-Risiken und überfällige Maßnahmen.
- [ ] Risikoänderungen werden im Audit-Log gespeichert.
- [ ] Export in Projektstatusbericht ist möglich.
```

---

## 20. Prüfregeln für die KI

Die KI soll bei der Risikoerstellung folgende Qualitätsregeln anwenden:

```text
Wenn keine Ursache angegeben ist:
  Frage nach der Ursache.

Wenn keine Auswirkung angegeben ist:
  Frage nach Termin-, Kosten-, Qualitäts- oder Scope-Auswirkung.

Wenn Eintrittswahrscheinlichkeit oder Auswirkung fehlen:
  Starte Bewertungsdialog.

Wenn Risikowert gelb oder rot ist und keine Maßnahme existiert:
  Fordere eine Maßnahme an.

Wenn Maßnahme ohne Verantwortlichen existiert:
  Frage nach Maßnahmenverantwortlichem.

Wenn Maßnahme ohne Termin existiert:
  Frage nach Fälligkeit.

Wenn Risiko rot ist:
  Schlage Eskalation an Projektleiter oder Lenkungskreis vor.

Wenn Risiko ein Arbeitspaket mit kritischem Pfad betrifft:
  Markiere Terminrisiko als besonders relevant.

Wenn Risiko Kostenwirkung hat:
  Frage nach geschätzter finanzieller Auswirkung.

Wenn Risiko eingetreten ist:
  Wandle Risiko optional in Problem / Issue um.
```

---

## 21. Reporting und Auswertung

### 21.1 Projektstatusbericht

Der Projektstatusbericht soll folgende Risikoinformationen enthalten:

- Top-5-Risiken
- neue Risiken seit letztem Bericht
- geschlossene Risiken
- eingetretene Risiken
- überfällige Maßnahmen
- eskalationspflichtige Risiken
- Veränderung der Risikobewertung
- Entscheidungsbedarf

### 21.2 Dashboard

Das Dashboard sollte mindestens anzeigen:

```text
Risikoampel gesamt
Anzahl Risiken nach Kategorie
Anzahl Risiken nach Status
Top-Risiken
Überfällige Maßnahmen
Risikoportfolio
Risikotrend über Zeit
```

---

## 22. Mindestanforderungen für die Umsetzung

### Must-have

- Risikoliste je Projekt
- Risiko-Kategorien
- Ursache und Auswirkung
- Eintrittswahrscheinlichkeit
- Auswirkung / Schadensausmaß
- automatische Bewertung
- Ampellogik
- Maßnahmenplan
- Verantwortlicher und Termin
- Status je Risiko und Maßnahme
- Top-Risikoliste
- Export in Projektstatusbericht

### Should-have

- Risikoportfolio
- Maßnahmenkatalog
- KI-Dialog zur Risikoerstellung
- Risikoreview-Historie
- Eskalationslogik
- Verknüpfung mit Arbeitspaketen und Meilensteinen

### Could-have

- finanzielle Erwartungswertberechnung
- automatische Risikovorschläge aus Projektplan
- Lessons-Learned-Risikokatalog
- Risiko-Trendanalyse
- E-Mail- oder Systembenachrichtigung bei überfälligen Maßnahmen

---

## 23. Zusammenfassung

Das Risikomanagement-Modul soll Risiken als steuerbare Projektobjekte behandeln. Die KI unterstützt den Nutzer dabei, Risiken strukturiert zu erfassen, Ursachen und Auswirkungen sauber zu trennen, Bewertungen vorzunehmen und geeignete Maßnahmen abzuleiten.

Für Wasserfall-/PMI-Projekte ist das Modul besonders wichtig, weil Risiken bereits in der Planungsphase identifiziert und mit Maßnahmen versehen werden müssen. In der Steuerungsphase werden diese Risiken regelmäßig überprüft, eskaliert, reduziert oder geschlossen.

Das System soll damit nicht nur eine Risikoliste erzeugen, sondern einen vollständigen Risiko-Regelkreis unterstützen:

```text
Identifizieren → Bewerten → Maßnahmen planen → Überwachen → Evaluieren → Berichten
```
