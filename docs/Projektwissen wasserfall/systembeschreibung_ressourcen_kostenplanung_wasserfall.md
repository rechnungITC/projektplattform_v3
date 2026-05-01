# Systembeschreibung: Ressourcen- und Kostenplanung für Wasserfall-/PMI-Projekte

## 1. Zweck des Moduls

Dieses Dokument beschreibt, wie die **Ressourcen- und Kostenplanung** in der Projektplattform fachlich und technisch abgebildet werden soll.

Ziel ist, dass die Software aus vorhandenen Projektphasen, Arbeitspaketen, Vorgängen, Aufwandsschätzungen und Terminplänen automatisch oder dialoggeführt einen belastbaren Ressourcen- und Kostenplan ableiten kann.

Die KI soll den Nutzer bei fehlenden Informationen gezielt befragen und anschließend die Planung so strukturieren, dass sie für folgende Zwecke nutzbar ist:

- Projektfreigabe
- Budgetplanung
- Angebotskalkulation
- Ressourcenplanung
- Kapazitätsplanung
- Liquiditätsbetrachtung
- Kostencontrolling
- Soll-Ist-Vergleich
- Earned-Value-Analyse
- Projektstatusbericht
- Management-Entscheidungsvorlage

---

## 2. Einordnung im Wasserfall-/PMI-Projektmodell

Die Ressourcen- und Kostenplanung erfolgt nach der Beschreibung der Arbeitspakete, der Aufwandsschätzung und der Ablauf-/Terminplanung.

```text
Projektauftrag
  ↓
Projektstrukturplan
  ↓
Arbeitspakete beschreiben
  ↓
Vorgänge beschreiben
  ↓
Aufwand schätzen
  ↓
Terminplan erstellen
  ↓
Ressourcenplan erstellen
  ↓
Kosten- und Finanzmittelplan erstellen
  ↓
Projektplan freigeben
```

Die Ressourcen- und Kostenplanung ist damit nicht isoliert zu betrachten. Sie hängt direkt ab von:

- Arbeitspaketen
- Verantwortlichkeiten
- Aufwandsschätzungen
- Vorgangsdauer
- Terminplanung
- Ressourcenzuordnung
- Kostenarten
- Kostenstellen
- Budgetvorgaben
- Liquiditätsanforderungen
- Freigabeprozessen

---

## 3. Fachliches Zielbild

Das System soll für jedes Projekt beantworten können:

1. **Welche Ressourcen werden benötigt?**
2. **Wann werden diese Ressourcen benötigt?**
3. **Sind die Ressourcen intern verfügbar oder extern zu beschaffen?**
4. **Welche Kosten entstehen je Arbeitspaket?**
5. **Welche Kostenarten fallen an?**
6. **In welchen Zeiträumen fallen die Kosten an?**
7. **Wie entwickelt sich der Kostengang je Periode?**
8. **Wie entwickelt sich die kumulierte Kostensumme?**
9. **Welche Budget- oder Liquiditätsrisiken entstehen?**
10. **Welche Ressourcen- oder Kapazitätskonflikte gibt es?**

---

## 4. Grundbegriffe für das System

### 4.1 Ressource

Eine Ressource ist alles, was zur Durchführung eines Arbeitspakets benötigt wird.

Beispiele:

- Mitarbeiter
- Rolle
- Abteilung
- externer Dienstleister
- Maschine
- Softwarelizenz
- Hardware
- Raum
- Material
- Reiseleistung
- Schulung
- Beratungsleistung

### 4.2 Kostenplan

Der Kostenplan beschreibt, welche Kosten im Projekt erwartet werden und wie sie sich auf Arbeitspakete, Kostenarten, Kostenstellen und Zeiträume verteilen.

### 4.3 Ressourcenplan

Der Ressourcenplan beschreibt, welche Ressourcen wann, in welchem Umfang und mit welcher Verfügbarkeit eingesetzt werden.

### 4.4 Kostenträger

Der Kostenträger ist das Objekt, für das Kosten entstehen.

Im Projektkontext ist das in der Regel:

- Arbeitspaket
- Vorgang
- Teilaufgabe
- Meilenstein
- Projektergebnis
- Phase
- Gesamtprojekt

### 4.5 Kostenart

Die Kostenart beschreibt, welche Art von Kosten entsteht.

Beispiele:

- Personalkosten
- Materialkosten
- Betriebsmittelkosten
- Beratungskosten
- Reisekosten
- Schulungskosten
- Lizenzkosten
- Hardwarekosten
- externe Dienstleistungen
- Risikozuschlag
- Projektmanagement-Zuschlag
- Qualitätsmanagement-Zuschlag

### 4.6 Kostenstelle

Die Kostenstelle beschreibt, wo die Kosten organisatorisch entstehen.

Beispiele:

- Abteilung
- Fachbereich
- Standort
- Team
- Projektorganisation
- externer Lieferant

### 4.7 Kostengang

Der Kostengang beschreibt die Kosten pro Abrechnungszeitraum.

Beispiel:

| Monat | Kosten |
|---|---:|
| Mai | 18.000 € |
| Juni | 21.000 € |
| Juli | 34.000 € |
| August | 11.000 € |

### 4.8 Kostensummenlinie

Die Kostensummenlinie beschreibt die kumulierten Kosten über die Projektlaufzeit.

Beispiel:

| Monat | Kostengang | Kostensumme |
|---|---:|---:|
| Mai | 18.000 € | 18.000 € |
| Juni | 21.000 € | 39.000 € |
| Juli | 34.000 € | 73.000 € |
| August | 11.000 € | 84.000 € |

---

## 5. Datenmodell für die Software

### 5.1 Projekt

```yaml
project:
  id: string
  name: string
  project_number: string
  project_manager_id: string
  sponsor_id: string
  start_date: date
  end_date: date
  budget_total: decimal
  currency: string
  status: draft | planning | approval | approved | active | closed
```

### 5.2 Arbeitspaket

```yaml
work_package:
  id: string
  project_id: string
  phase_id: string
  wbs_code: string
  name: string
  description: text
  owner_id: string
  planned_start: date
  planned_end: date
  planned_effort_hours: decimal
  planned_effort_days: decimal
  planned_cost_total: decimal
  cost_center_id: string
  status: draft | planned | approved | in_progress | completed | closed
```

### 5.3 Ressource

```yaml
resource:
  id: string
  type: person | role | department | supplier | equipment | material | license | service
  name: string
  department_id: string
  internal_external: internal | external
  default_hourly_rate: decimal
  default_daily_rate: decimal
  availability_percent: decimal
  calendar_id: string
  cost_center_id: string
  active: boolean
```

### 5.4 Ressourcenzuordnung

```yaml
resource_assignment:
  id: string
  project_id: string
  work_package_id: string
  resource_id: string
  role: string
  planned_start: date
  planned_end: date
  planned_hours: decimal
  planned_days: decimal
  allocation_percent: decimal
  rate_type: hourly | daily | fixed
  rate: decimal
  calculated_cost: decimal
  availability_status: available | partially_available | unavailable | unknown
```

### 5.5 Kostenposition

```yaml
cost_item:
  id: string
  project_id: string
  work_package_id: string
  cost_type: personnel | material | equipment | travel | training | consulting | license | external_service | surcharge | risk_buffer | other
  cost_center_id: string
  cost_carrier_id: string
  description: text
  amount: decimal
  currency: string
  tax_mode: net | gross | not_applicable
  planned_due_date: date
  planned_period: string
  supplier_id: string
  internal_external: internal | external
  approval_required: boolean
  status: draft | planned | approved | rejected | actualized
```

### 5.6 Zuschlag

```yaml
surcharge:
  id: string
  project_id: string
  work_package_id: string
  surcharge_type: project_management | quality_management | onboarding | travel_time | communication | configuration_management | risk_management | documentation | custom
  percentage: decimal
  base_cost_type: personnel | total_work_package | custom
  calculated_amount: decimal
  enabled: boolean
  reason: text
```

### 5.7 Kostengang pro Periode

```yaml
cost_period:
  id: string
  project_id: string
  period_start: date
  period_end: date
  period_label: string
  planned_cost: decimal
  cumulative_planned_cost: decimal
  actual_cost: decimal
  cumulative_actual_cost: decimal
  forecast_cost: decimal
  cumulative_forecast_cost: decimal
```

---

## 6. Berechnungslogik

### 6.1 Personalkosten

```text
Personalkosten = geplante Personentage × Tagessatz
```

oder

```text
Personalkosten = geplante Personenstunden × Stundensatz
```

### 6.2 Arbeitspaketkosten

```text
Arbeitspaketkosten =
  Personalkosten
+ Materialkosten
+ Betriebsmittelkosten
+ Reisekosten
+ Beratungskosten
+ Lizenzkosten
+ externe Dienstleistungen
+ Zuschläge
+ Risikopuffer
```

### 6.3 Projektkosten

```text
Projektkosten = Summe aller Arbeitspaketkosten
```

### 6.4 Kosten je Phase

```text
Phasenkosten = Summe aller Arbeitspaketkosten innerhalb der Phase
```

### 6.5 Kostengang

```text
Kostengang je Periode = Summe aller Kostenpositionen mit Fälligkeit in dieser Periode
```

### 6.6 Kostensumme

```text
Kostensumme Periode n =
  Kostensumme Periode n-1
+ Kostengang Periode n
```

### 6.7 Verfügbarkeitsprüfung

```text
Verplante Kapazität einer Ressource je Zeitraum
≤ verfügbare Kapazität der Ressource je Zeitraum
```

### 6.8 Budgetprüfung

```text
Geplante Projektkosten ≤ genehmigtes Projektbudget
```

Wenn die geplanten Projektkosten größer als das genehmigte Budget sind, muss das System eine Budgetabweichung anzeigen und eine Entscheidung anfordern.

---

## 7. Standard-Zuschläge im System

Wenn bestimmte Kostenarten nicht explizit geplant wurden, kann das System Zuschläge vorschlagen.

| Zuschlag | Vorschlagswert |
|---|---:|
| Projektmanagement | 10–15 % |
| Qualitätsmanagement | 10 % |
| Einarbeitung | 5 % |
| Reisezeit | 10 % |
| Kommunikation | 10–20 % |
| Konfigurationsmanagement | 5 % |
| Risikomanagement | 5–20 % |
| Projektdokumentation | 5 % |

Diese Zuschläge dürfen nicht blind automatisch gebucht werden. Die KI soll sie vorschlagen, begründen und vom Nutzer bestätigen lassen.

---

## 8. KI-Dialog zur Ressourcen- und Kostenplanung

Die KI soll den Nutzer strukturiert durch die Planung führen.

### 8.1 Startfrage

```text
Möchtest du für dieses Projekt einen Ressourcen- und Kostenplan erstellen?
Ich benötige dafür die vorhandenen Arbeitspakete, Aufwandsschätzungen, Termine und Budgetvorgaben.
```

### 8.2 Prüfung vorhandener Basisdaten

Die KI prüft automatisch:

- Gibt es einen Projektstrukturplan?
- Gibt es Arbeitspakete?
- Gibt es Aufwandsschätzungen?
- Gibt es geplante Start- und Endtermine?
- Gibt es Vorgänger/Nachfolger?
- Gibt es ein Projektbudget?
- Gibt es interne oder externe Ressourcen?
- Gibt es Tagessätze oder Stundensätze?
- Gibt es Kostenstellen?
- Gibt es Kostenarten?
- Gibt es Fälligkeiten oder Abrechnungsperioden?

### 8.3 Dialogblock: Ressourcen erfassen

```text
Welche Ressourcen werden für das Arbeitspaket benötigt?

Bitte gib je Ressource an:
- Mitarbeiter, Rolle oder externer Dienstleister
- Abteilung oder Kostenstelle
- intern oder extern
- geplanter Aufwand in Stunden oder Tagen
- geplante Verfügbarkeit in %
- geplanter Zeitraum
- Stundensatz oder Tagessatz
```

### 8.4 Dialogblock: Kostenarten erfassen

```text
Welche Kostenarten fallen zusätzlich an?

Mögliche Kostenarten:
- Material
- Hardware
- Software/Lizenzen
- Beratung
- externe Dienstleistungen
- Reise
- Schulung
- Betriebsmittel
- sonstige Kosten
```

### 8.5 Dialogblock: Zuschläge prüfen

```text
Für dieses Arbeitspaket wurden bisher keine Zuschläge für Projektmanagement, Qualitätssicherung, Kommunikation oder Risikomanagement geplant.

Soll ich Vorschläge für übliche Zuschläge berechnen?
```

### 8.6 Dialogblock: Kostengang planen

```text
Wann fallen die geplanten Kosten an?

Bitte wähle:
1. gleichmäßig über die Laufzeit verteilen
2. vollständig am Anfang buchen
3. vollständig am Ende buchen
4. nach monatlichen Fälligkeiten erfassen
5. nach Meilensteinen erfassen
6. manuell je Periode erfassen
```

### 8.7 Dialogblock: Budget- und Liquiditätsprüfung

```text
Das geplante Projektbudget beträgt <Budget>.
Die aktuell berechneten Projektkosten betragen <Kosten>.

Ergebnis:
- Abweichung: <Betrag>
- Abweichung in %: <Prozent>
- kritische Kostenperioden: <Perioden>

Möchtest du:
1. die Planung übernehmen
2. Ressourcen anpassen
3. Kostenpositionen prüfen
4. Budgeterhöhung vorbereiten
5. Projektumfang reduzieren
```

### 8.8 Dialogblock: Freigabe

```text
Der Ressourcen- und Kostenplan ist vollständig genug für die Freigabe.

Soll ein Freigabeprozess gestartet werden?
Empfänger:
- Projektleiter
- Teilprojektleiter
- Auftraggeber
- PAG / Lenkungskreis
```

---

## 9. Automatische Prüfungen durch die Software

### 9.1 Vollständigkeitsprüfung

Das System prüft:

- jedes Arbeitspaket hat mindestens eine Ressource oder eine Begründung
- jede Ressource hat Aufwand und Zeitraum
- jede Ressource hat Kostenlogik
- jede externe Leistung hat Kostenposition
- jede Kostenposition hat Kostenart
- jede Kostenposition hat Kostenträger
- jede Kostenposition hat Fälligkeit oder Periodenlogik
- jedes Arbeitspaket hat geplante Gesamtkosten
- jede Phase hat aggregierte Kosten
- das Gesamtprojekt hat eine Kostensumme

### 9.2 Plausibilitätsprüfung

Das System prüft:

- Aufwand passt zur Dauer
- Ressource ist im Zeitraum verfügbar
- Ressource ist nicht überplant
- Kostenpositionen sind nicht negativ
- externe Kosten haben Lieferant oder Begründung
- Zuschläge sind nicht doppelt enthalten
- Kostenstellen sind vorhanden
- Budgetüberschreitungen sind markiert
- Kostenverteilung passt zur Projektlaufzeit
- Kostensumme entspricht der Summe aller Perioden

### 9.3 Abweichungsprüfung

Das System erkennt:

- Budgetüberschreitung
- fehlende Liquidität in Periode
- Ressourcenüberlastung
- nicht zugewiesene Arbeitspakete
- nicht geplante Kostenarten
- unklare externe Beschaffungen
- unplausibel niedrige Schätzungen
- fehlende Risikopuffer

---

## 10. Ausgabeformate im System

### 10.1 Ressourcenplan

| AP-Code | Arbeitspaket | Ressource | Rolle | Abteilung | Zeitraum | Aufwand | Satz | Kosten |
|---|---|---|---|---|---|---:|---:|---:|

### 10.2 Kostenplan nach Arbeitspaketen

| AP-Code | Arbeitspaket | Personalkosten | Sachkosten | Extern | Zuschläge | Gesamt |
|---|---|---:|---:|---:|---:|---:|

### 10.3 Kostenplan nach Kostenarten

| Kostenart | Gesamtbetrag | Anteil am Projektbudget |
|---|---:|---:|

### 10.4 Kostenplan nach Kostenstellen

| Kostenstelle | Gesamtbetrag | Anteil am Projektbudget |
|---|---:|---:|

### 10.5 Kostengang und Kostensumme

| Periode | Kostengang geplant | Kostensumme geplant | Kostengang Ist | Kostensumme Ist | Abweichung |
|---|---:|---:|---:|---:|---:|

### 10.6 Kapazitätsplan

| Ressource | Zeitraum | verfügbar | geplant | Auslastung | Konflikt |
|---|---|---:|---:|---:|---|

---

## 11. Workflow für die Software

```text
1. Arbeitspakete vorhanden?
   ↓
2. Aufwand je Arbeitspaket vorhanden?
   ↓
3. Terminplan vorhanden?
   ↓
4. Ressourcen je Arbeitspaket zuordnen
   ↓
5. Kosten je Ressource berechnen
   ↓
6. Sach- und Fremdkosten erfassen
   ↓
7. Zuschläge prüfen
   ↓
8. Kosten je AP aggregieren
   ↓
9. Kosten je Phase aggregieren
   ↓
10. Projektkosten berechnen
   ↓
11. Kostengang je Periode berechnen
   ↓
12. Kostensummenlinie berechnen
   ↓
13. Kapazitäts- und Budgetprüfung durchführen
   ↓
14. Plan zur Freigabe einreichen
   ↓
15. Baseline für Controlling einfrieren
```

---

## 12. Freigabeprozess

Der Ressourcen- und Kostenplan darf erst als verbindliche Planungsgrundlage genutzt werden, wenn er freigegeben wurde.

### 12.1 Freigabestatus

```text
Draft
↓
In Prüfung
↓
Freigegeben
oder
Zur Überarbeitung zurückgegeben
```

### 12.2 Freigabe per Systemnachricht

```text
Der Ressourcen- und Kostenplan für Projekt <Projektname> wurde zur Freigabe eingereicht.

Bitte prüfe:
- Ressourcenplanung
- Kostenplanung
- Budgeteinhaltung
- Kostengang / Liquidität
- externe Beschaffungen
- Zuschläge
- Risiken

[Freigeben] [Zurückweisen] [Kommentar hinzufügen]
```

### 12.3 Audit-Log

Jede Freigabe oder Änderung wird protokolliert:

```yaml
approval_log:
  id: string
  object_type: resource_cost_plan
  object_id: string
  action: submitted | approved | rejected | changed
  actor_id: string
  timestamp: datetime
  comment: text
  previous_status: string
  new_status: string
```

---

## 13. Verbindung zum Controlling

Nach Freigabe wird der Ressourcen- und Kostenplan als Baseline genutzt.

Aus der Baseline entstehen:

- Plan-Kosten je Arbeitspaket
- Plan-Kosten je Periode
- Plan-Kosten je Kostenart
- Plan-Kosten je Kostenstelle
- geplante Ressourcenauslastung
- geplante Kostensumme
- Budget at Completion für EVA
- Planned Value je Stichtag

Während der Projektsteuerung werden die Ist-Kosten gegen diese Baseline verglichen.

---

## 14. User Stories für die Umsetzung

### User Story 1: Ressourcenplan je Arbeitspaket erstellen

```markdown
Als Projektleiter möchte ich jedem Arbeitspaket Ressourcen mit Aufwand, Zeitraum, Verfügbarkeit und Kostensatz zuordnen, damit die Projektplattform einen belastbaren Ressourcen- und Kostenplan erstellen kann.
```

#### Akzeptanzkriterien

- [ ] Ressourcen können je Arbeitspaket hinzugefügt werden.
- [ ] Ressourcen können als intern oder extern gekennzeichnet werden.
- [ ] Aufwand kann in Stunden oder Tagen erfasst werden.
- [ ] Zeitraum und Verfügbarkeit können gepflegt werden.
- [ ] Stundensatz oder Tagessatz können hinterlegt werden.
- [ ] Personalkosten werden automatisch berechnet.
- [ ] Ressourcenüberlastungen werden angezeigt.

---

### User Story 2: Kostenplan automatisch berechnen

```markdown
Als Projektleiter möchte ich, dass die Projektplattform aus Ressourcen, Aufwand, Sätzen und Sachkosten automatisch die geplanten Arbeitspaket- und Projektkosten berechnet, damit ich die Budgetplanung nachvollziehbar erstellen kann.
```

#### Akzeptanzkriterien

- [ ] Kosten werden je Arbeitspaket berechnet.
- [ ] Kosten werden je Phase aggregiert.
- [ ] Projektkosten werden als Summe aller Arbeitspaketkosten berechnet.
- [ ] Kostenarten werden separat ausgewiesen.
- [ ] Kostenstellen werden separat ausgewiesen.
- [ ] Budgetüberschreitungen werden angezeigt.
- [ ] Berechnungsgrundlagen sind nachvollziehbar.

---

### User Story 3: Kostengang und Kostensumme berechnen

```markdown
Als Projektleiter möchte ich die geplanten Kosten je Abrechnungsperiode und kumuliert über die Projektlaufzeit sehen, damit ich Budget- und Liquiditätsanforderungen bewerten kann.
```

#### Akzeptanzkriterien

- [ ] Kostenpositionen können Perioden zugeordnet werden.
- [ ] Kostengang wird je Periode berechnet.
- [ ] Kostensumme wird kumuliert berechnet.
- [ ] Kostengang und Kostensumme können als Tabelle angezeigt werden.
- [ ] Kostengang und Kostensumme können als Diagramm angezeigt werden.
- [ ] Perioden mit ungewöhnlich hohen Kosten werden markiert.

---

### User Story 4: Zuschläge vorschlagen und bestätigen

```markdown
Als Projektleiter möchte ich, dass die KI fehlende Zuschläge für Projektmanagement, Qualitätssicherung, Kommunikation, Dokumentation oder Risikomanagement vorschlägt, damit nicht offensichtliche indirekte Projektkosten vergessen werden.
```

#### Akzeptanzkriterien

- [ ] System erkennt, wenn relevante Zuschläge fehlen.
- [ ] KI schlägt mögliche Zuschläge mit Prozentsatz vor.
- [ ] Nutzer kann Zuschläge annehmen, ändern oder ablehnen.
- [ ] Zuschläge werden als eigene Kostenposition dokumentiert.
- [ ] Doppelte Zuschläge werden erkannt.

---

### User Story 5: Ressourcen- und Kostenplan freigeben

```markdown
Als Projektleiter möchte ich den Ressourcen- und Kostenplan digital zur Freigabe geben, damit der Plan als verbindliche Baseline für Projektsteuerung und Controlling genutzt werden kann.
```

#### Akzeptanzkriterien

- [ ] Ressourcen- und Kostenplan kann zur Freigabe eingereicht werden.
- [ ] Freigabeempfänger erhalten eine Nachricht.
- [ ] Freigabe kann per Button bestätigt oder abgelehnt werden.
- [ ] Ablehnung erfordert optional einen Kommentar.
- [ ] Freigabe wird im Audit-Log dokumentiert.
- [ ] Nach Freigabe wird eine Plan-Baseline erzeugt.

---

## 15. Definition of Ready

Ein Ressourcen- und Kostenplan ist bereit zur Erstellung, wenn:

- [ ] Projektauftrag oder Projektentwurf existiert.
- [ ] Projektstrukturplan ist vorhanden.
- [ ] Arbeitspakete sind beschrieben.
- [ ] Aufwandsschätzung je Arbeitspaket ist vorhanden oder kann abgefragt werden.
- [ ] Terminplanung ist vorhanden oder kann abgeleitet werden.
- [ ] Kostenarten sind definiert.
- [ ] Kostenstellen sind definiert oder können abgefragt werden.
- [ ] interne und externe Ressourcen können erfasst werden.
- [ ] Stundensätze oder Tagessätze sind verfügbar oder können hinterlegt werden.
- [ ] Projektbudget ist bekannt oder als offen markiert.

---

## 16. Definition of Done

Ein Ressourcen- und Kostenplan ist vollständig, wenn:

- [ ] jedem relevanten Arbeitspaket Ressourcen oder Kostenpositionen zugeordnet sind.
- [ ] Personalkosten berechnet wurden.
- [ ] Sach- und Fremdkosten erfasst wurden.
- [ ] Zuschläge geprüft wurden.
- [ ] Kosten je Arbeitspaket berechnet wurden.
- [ ] Kosten je Phase aggregiert wurden.
- [ ] Projektgesamtkosten berechnet wurden.
- [ ] Kostengang je Periode berechnet wurde.
- [ ] Kostensumme berechnet wurde.
- [ ] Kapazitätskonflikte geprüft wurden.
- [ ] Budgetabweichungen geprüft wurden.
- [ ] Plan zur Freigabe eingereicht oder freigegeben wurde.
- [ ] Plan-Baseline erzeugt wurde.

---

## 17. Nicht-Ziele

Nicht Bestandteil dieses Moduls sind:

- vollständige Finanzbuchhaltung
- Rechnungsstellung
- Zahlungsverkehr
- Einkaufsabwicklung im ERP
- automatische Vertragsgenerierung
- steuerliche Bewertung
- Lohnabrechnung
- permanente Ist-Kosten-Erfassung ohne Controlling-Modul

Diese Themen können über Schnittstellen oder spätere Module angebunden werden.

---

## 18. Schnittstellen zu anderen Modulen

| Modul | Verbindung |
|---|---|
| Projektstrukturplan | liefert Phasen und Arbeitspakete |
| Arbeitspaketbeschreibung | liefert Tätigkeiten, Verantwortliche und Ziele |
| Aufwandsschätzung | liefert Aufwand in PT/Ph |
| Terminplanung | liefert Start, Ende und Perioden |
| Ressourcenmanagement | liefert Mitarbeiter, Rollen, Verfügbarkeiten |
| Kostencontrolling | nutzt den freigegebenen Kostenplan als Baseline |
| EVA | nutzt BAC, PV und AC aus Kostenplanung und Controlling |
| Berichtswesen | nutzt Kostenstatus, Budgetstatus und Liquiditätsverlauf |
| Freigabeprozess | genehmigt Plan und Änderungen |
| Änderungsmanagement | steuert Budget- oder Ressourcenänderungen |

---

## 19. KI-Verhalten bei fehlenden Informationen

Wenn Informationen fehlen, darf die KI keine endgültige Planung erzeugen. Sie soll fehlende Informationen gezielt abfragen.

Beispiel:

```text
Für das Arbeitspaket "Schnittstellenkonzept erstellen" fehlen noch:
- verantwortliche Ressource
- Aufwand in Stunden oder Tagen
- Kostenstelle
- Stundensatz oder Tagessatz
- Fälligkeitszeitraum der Kosten

Soll ich diese Punkte jetzt einzeln mit dir durchgehen?
```

---

## 20. Ergebnis für die Softwareplanung

Diese Beschreibung kann als Grundlage für folgende Systemelemente genutzt werden:

- Datenmodell
- KI-Dialog
- Formularlogik
- Validierungslogik
- Ressourcenplanungsmodul
- Kostenplanungsmodul
- Kapazitätsprüfung
- Budgetprüfung
- Kostengangberechnung
- Kostensummenlinie
- Freigabeprozess
- Controlling-Baseline
- User Stories für die Entwicklung
