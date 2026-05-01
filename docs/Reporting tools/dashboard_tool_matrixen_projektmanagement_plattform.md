# Dashboard-Tool-Matrixen für eine Projektmanagement-Plattform

## Ziel des Dokuments

Dieses Dokument beschreibt, welche klassischen Projektmanagement-Auswertungstools aus den bereitgestellten Vorlagen als digitale Auswertungen, Dashboard-Kacheln, Diagramme und Steuerungsfunktionen innerhalb einer Projektmanagement-Plattform abgebildet werden können.

Die Matrixen sind so aufgebaut, dass sie direkt als fachliche Grundlage für Requirements, User Stories, Datenmodell, Dashboard-Design und KI-Dialoge verwendet werden können.

---

## 1. Gesamtmatrix der Dashboard-Tools

| Nr. | Dashboard-Tool | Zweck | Primäre Frage | Zielgruppe | Datengrundlage | Visualisierung | Aktualisierung |
|---:|---|---|---|---|---|---|---|
| 1 | Meilensteintrendanalyse (MTA) | Termintrend der wichtigsten Meilensteine sichtbar machen | Verschieben sich unsere Meilensteine? | Projektleiter, Lenkungsausschuss, Management | Meilensteinplan, Statusstichtage, Prognosetermine | Liniendiagramm / Trendmatrix | je Statusstichtag |
| 2 | Meilensteinstatus-Matrix | Übersicht über Plan-/Ist-Status aller Meilensteine | Welche Meilensteine sind erreicht, gefährdet oder verspätet? | Projektleitung, Auftraggeber, Lenkungsausschuss | Meilensteine, Plantermine, Isttermine, Status | Tabelle mit Ampel | laufend / je Statusbericht |
| 3 | Kosten-Soll-Ist-Vergleich | Kostenabweichungen je Arbeitspaket sichtbar machen | Liegen wir über oder unter dem geplanten Kostenwert? | Projektleiter, Controller, Management | Kostenplan, Ist-Kosten, Fertigstellungsgrad | Tabelle, Balkendiagramm, Ampel | je Statusstichtag |
| 4 | Kosten-Termin-Diagramm | Kosten- und Terminabweichungen kombiniert bewerten | Welche Arbeitspakete sind terminlich und finanziell kritisch? | Projektleitung, PMO, Controlling | Terminplan, Kostenplan, Ist-Kosten, FGR | Kombinierte Matrix / Bubble Chart / Gantt + Kosten | je Statusstichtag |
| 5 | Kosten-Trendanalyse (KTA) | Entwicklung der Projektkosten prognostizieren | Wie entwickeln sich die Kosten bis Projektende? | Management, Controlling, Lenkungsausschuss | Kostenplan, Ist-Kosten, Forecast, EAC | Linien-/Trenddiagramm | monatlich / je Reportingzyklus |
| 6 | Kostengang und Kostensummenlinie | Liquiditätsbedarf je Zeitraum darstellen | Wann fallen welche Kosten an? | Projektleitung, Finance, Controlling | Ressourcenplan, Kostenplan, Zahlungs-/Fälligkeitsdaten | Säulen + kumulierte Linie | Planungsphase + bei Änderungen |
| 7 | Earned Value Analyse (EVA) | Kosten- und Terminperformance integriert bewerten | Welchen Wert haben wir im Verhältnis zu Plan und Ist-Kosten geschaffen? | Projektleitung, Management, PMO | BAC, PV, AC, FGR/PC, EV | KPI-Kacheln, Ampel, Trendlinien | je Statusstichtag |
| 8 | Arbeitspaket-Fortschrittsmatrix | Fortschritt und Restaufwand je Arbeitspaket steuern | Welche AP sind im Plan, kritisch oder blockiert? | Projektleiter, Teilprojektleiter, AP-Verantwortliche | AP-Status, Aufwand, Restaufwand, Probleme | Tabelle mit Drilldown | wöchentlich / 14-täglich |
| 9 | Ressourcen- und Kapazitätsmatrix | Auslastung und Engpässe sichtbar machen | Sind die richtigen Ressourcen zum richtigen Zeitpunkt verfügbar? | Projektleiter, Ressourcenmanager, Teamleiter | Ressourcenplan, Verfügbarkeit, Zuordnung | Heatmap, Balkenplan | wöchentlich / bei Planänderung |
| 10 | Risikoportfolio | Kritische Risiken priorisieren | Welche Risiken brauchen aktive Maßnahmen? | Projektleiter, Lenkungsausschuss, Risk Owner | Risikoliste, Eintritt, Auswirkung, Maßnahme | Portfolio-Matrix / Top-10-Liste | je Statusmeeting |
| 11 | Change-Impact-Matrix | Auswirkungen von Änderungen bewerten | Welche Änderung beeinflusst Termine, Kosten, Scope oder Qualität? | Projektleiter, Change Board, Auftraggeber | Change Requests, betroffene AP, Aufwand, Kosten, Termine | Impact-Tabelle / Ampel | bei jedem Change Request |
| 12 | Projektstatus-Cockpit | Gesamtstatus aggregiert darstellen | Ist das Projekt insgesamt steuerbar und entscheidungsreif? | Management, Auftraggeber, Lenkungsausschuss | Alle Module | KPI-Kacheln + Ampel + Management Summary | je Reportingzyklus |

---

## 2. Tool-Matrix: Meilensteintrendanalyse (MTA)

### Zweck

Die Meilensteintrendanalyse zeigt je Berichtszeitpunkt, wie sich die prognostizierten Termine der wichtigsten Meilensteine entwickeln. Sie ist besonders geeignet für Management- und Lenkungsausschuss-Dashboards.

### Eingabematrix

| Feld | Beschreibung | Pflichtfeld | Quelle | Beispiel |
|---|---|---:|---|---|
| Projekt-ID | Eindeutige Projektkennung | Ja | Projektstammdaten | PRJ-2026-001 |
| Meilenstein-ID | Eindeutige Meilensteinkennung | Ja | Meilensteinplan | MS-01 |
| Meilensteinname | Bezeichnung des Meilensteins | Ja | Meilensteinplan | Lastenheft abgenommen |
| Baseline-Termin | Ursprünglich freigegebener Plantermin | Ja | Projektbaseline | 30.06.2026 |
| Statusstichtag | Datum der Statusmeldung | Ja | Statusbericht | 15.05.2026 |
| Prognosetermin | Aktuell erwarteter Meilensteintermin | Ja | Projektleitung / Statusbericht | 10.07.2026 |
| Ist-Termin | Tatsächlicher Erreichungstermin | Nein | Abnahme / Statusbericht | 08.07.2026 |
| Status | Im Plan / unkritisch verzögert / kritisch verzögert / erreicht | Ja | Systemlogik / PL | kritisch verzögert |
| Ursache | Grund für Terminabweichung | Nein | Statusbericht | Verzögerung im Fachbereichstest |
| Maßnahme | Gegenmaßnahme zur Stabilisierung | Nein | Maßnahmenplan | Testressourcen erhöhen |

### Berechnungsmatrix

| Kennzahl | Formel / Logik | Interpretation | Dashboard-Nutzung |
|---|---|---|---|
| Terminabweichung in Tagen | Prognosetermin - Baseline-Termin | Positive Werte zeigen Verzögerung | Ampel / KPI |
| Trendrichtung | Aktueller Prognosetermin vs. vorheriger Prognosetermin | steigend = Verschlechterung, fallend = Verbesserung | Trendpfeil |
| Meilenstein erreicht | Ist-Termin vorhanden | Meilenstein abgeschlossen | Status-Haken |
| Kritikalität | Abweichung > Toleranz oder kritischer Meilenstein betroffen | Eskalationsbedarf | Warnliste |
| Prognosestabilität | Anzahl Terminänderungen je Meilenstein | Hohe Anzahl = unsichere Planung | Management-Hinweis |

### Beispielmatrix

| Statusstichtag | MS-01 Planung abgenommen | MS-02 Lastenheft abgenommen | MS-03 Testfreigabe | MS-04 Go-Live |
|---|---:|---:|---:|---:|
| Baseline | 31.03.2026 | 30.04.2026 | 31.07.2026 | 30.09.2026 |
| 15.03.2026 | 31.03.2026 | 30.04.2026 | 31.07.2026 | 30.09.2026 |
| 31.03.2026 | 03.04.2026 | 05.05.2026 | 31.07.2026 | 30.09.2026 |
| 15.04.2026 | erreicht | 10.05.2026 | 07.08.2026 | 07.10.2026 |
| 30.04.2026 | erreicht | 15.05.2026 | 14.08.2026 | 14.10.2026 |

### Dashboard-Komponenten

| Komponente | Darstellung | Nutzen |
|---|---|---|
| MTA-Liniendiagramm | Statusstichtage auf X-Achse, prognostizierte Meilensteintermine auf Y-Achse | Termintrend erkennen |
| Meilenstein-Ampel | Grün/Gelb/Rot je Meilenstein | schneller Statusüberblick |
| Kritische Meilensteine | Top-Liste nach Abweichung | Management-Fokus |
| Ursachenliste | Abweichung mit Ursache und Maßnahme | Entscheidungsgrundlage |

---

## 3. Tool-Matrix: Kosten-Soll-Ist-Vergleich

### Zweck

Der Kosten-Soll-Ist-Vergleich bewertet Arbeitspakete nicht nur nach verbrauchtem Budget, sondern berücksichtigt den tatsächlichen Fortschritt. Dadurch wird verhindert, dass ein Arbeitspaket positiv wirkt, nur weil wenig Kosten angefallen sind, obwohl kaum Fortschritt erzielt wurde.

### Eingabematrix

| Feld | Beschreibung | Pflichtfeld | Quelle | Beispiel |
|---|---|---:|---|---|
| Arbeitspaket-ID | Eindeutige AP-Kennung | Ja | PSP / AP-Liste | AP-2.3 |
| Arbeitspaketname | Bezeichnung | Ja | PSP | Datenmigration vorbereiten |
| Budget / Plankosten | genehmigtes AP-Budget | Ja | Kostenplan | 20.000 € |
| Fertigstellungsgrad | aktueller Fortschritt in % | Ja | AP-Statusbericht | 60 % |
| anteilige Plankosten | Fortschrittsbezogener Planwert | Ja | Systemberechnung | 12.000 € |
| Ist-Kosten | bisher tatsächlich angefallene Kosten | Ja | Zeiterfassung / Kostenbuchung | 15.500 € |
| Kostenabweichung absolut | Differenz Ist zu fortschrittsbezogenem Plan | Ja | Systemberechnung | +3.500 € |
| Kostenabweichung % | prozentuale Abweichung | Ja | Systemberechnung | +29,2 % |
| Kostenstatus | Grün/Gelb/Rot | Ja | Systemlogik | Rot |
| Kommentar | Begründung der Abweichung | Nein | Projektleitung | Externe Dienstleistung teurer |

### Berechnungsmatrix

| Kennzahl | Formel | Bedeutung |
|---|---|---|
| Anteiliges Planbudget | Plankosten × Fertigstellungsgrad | Bewertet, welche Kosten bei aktuellem Fortschritt angemessen wären |
| Kostenabweichung absolut | Ist-Kosten - anteiliges Planbudget | Positive Werte zeigen Mehrkosten |
| Kostenabweichung % | Kostenabweichung / anteiliges Planbudget | Relative Abweichung |
| Restbudget | Plankosten - Ist-Kosten | Verbleibendes Budget |
| Restaufwand monetär | geschätzter Restaufwand × Kostensatz | Erwartete Restkosten |
| erwartete Gesamtkosten AP | Ist-Kosten + erwartete Restkosten | Forecast je Arbeitspaket |

### Beispielmatrix

| AP-ID | Arbeitspaket | Plankosten | FGR | anteilige Plankosten | Ist-Kosten | Abweichung € | Abweichung % | Status |
|---|---|---:|---:|---:|---:|---:|---:|---|
| AP-1.1 | Anforderungen erheben | 8.000 € | 100 % | 8.000 € | 7.500 € | -500 € | -6,25 % | Grün |
| AP-1.2 | Prozesse analysieren | 12.000 € | 80 % | 9.600 € | 11.000 € | +1.400 € | +14,6 % | Gelb |
| AP-2.1 | Schnittstelle konzipieren | 18.000 € | 50 % | 9.000 € | 14.500 € | +5.500 € | +61,1 % | Rot |
| AP-2.2 | Datenmigration vorbereiten | 20.000 € | 60 % | 12.000 € | 15.500 € | +3.500 € | +29,2 % | Rot |
| AP-3.1 | Schulung vorbereiten | 6.000 € | 30 % | 1.800 € | 1.200 € | -600 € | -33,3 % | Grün |

### Dashboard-Komponenten

| Komponente | Darstellung | Nutzen |
|---|---|---|
| Kostenabweichung je AP | Balkendiagramm | zeigt Budgettreiber |
| Top-10 Kostenrisiken | Tabelle | Management-Fokus |
| Kostenstatus nach Phase | Heatmap | strukturelle Kostenprobleme erkennen |
| Drilldown je AP | Detailansicht | Ursachen und Maßnahmen dokumentieren |

---

## 4. Tool-Matrix: Kosten-Termin-Diagramm

### Zweck

Das Kosten-Termin-Diagramm verbindet Terminstatus und Kostenstatus je Arbeitspaket. Es zeigt, ob ein Arbeitspaket nur finanziell, nur terminlich oder in beiden Dimensionen kritisch ist.

### Auswertungsmatrix

| Terminstatus | Kostenstatus | Bedeutung | Dashboard-Ampel | empfohlene Maßnahme |
|---|---|---|---|---|
| im Plan | im Budget | Arbeitspaket stabil | Grün | beobachten |
| im Plan | über Budget | Kostenproblem ohne Terminproblem | Gelb/Rot | Kostenursache prüfen |
| verspätet | im Budget | Terminproblem ohne Kostenproblem | Gelb | Ressourcen / Abhängigkeiten prüfen |
| verspätet | über Budget | kritisches Arbeitspaket | Rot | Eskalation / Maßnahmenplan |
| vor Termin | über Budget | beschleunigt, aber teuer | Gelb | Nutzen der Beschleunigung bewerten |
| vor Termin | unter Budget | sehr guter Verlauf | Grün | Best Practice sichern |

### Eingabematrix

| Feld | Beschreibung | Quelle |
|---|---|---|
| AP-ID | Arbeitspaketkennung | PSP |
| Planstart | geplanter Start | Terminplan |
| Planende | geplantes Ende | Terminplan |
| Ist-Start | tatsächlicher Start | Statusbericht |
| Ist-Ende / Prognose-Ende | tatsächliches oder erwartetes Ende | Statusbericht |
| Plankosten | Budget des AP | Kostenplan |
| Ist-Kosten | gebuchte Ist-Kosten | Kostenbuchung / Zeiterfassung |
| Fertigstellungsgrad | Fortschritt in % | AP-Statusbericht |
| Terminabweichung | Prognose-Ende - Planende | Systemberechnung |
| Kostenabweichung | Ist-Kosten - anteilige Plankosten | Systemberechnung |

### Beispielmatrix

| AP-ID | AP-Name | Terminabweichung | Kostenabweichung | FGR | Quadrant | Status |
|---|---|---:|---:|---:|---|---|
| AP-1.1 | Anforderungen erheben | 0 Tage | -500 € | 100 % | im Plan / unter Budget | Grün |
| AP-1.2 | Prozessanalyse | +5 Tage | +1.400 € | 80 % | verspätet / über Budget | Rot |
| AP-2.1 | Schnittstelle konzipieren | +10 Tage | +5.500 € | 50 % | verspätet / über Budget | Rot |
| AP-2.2 | Datenmigration vorbereiten | -3 Tage | +3.500 € | 60 % | vor Termin / über Budget | Gelb |
| AP-3.1 | Schulung vorbereiten | +2 Tage | -600 € | 30 % | leicht verspätet / unter Budget | Gelb |

### Dashboard-Komponenten

| Komponente | Darstellung | Nutzen |
|---|---|---|
| Kosten-Termin-Quadrant | X-Achse Terminabweichung, Y-Achse Kostenabweichung | kritische AP sofort erkennen |
| Bubble-Größe | Budgethöhe oder Restaufwand | Relevanz sichtbar machen |
| Farbe | Gesamtstatus | schnelle Priorisierung |
| Klick auf Bubble | AP-Detail mit Ursache, Maßnahme, Verantwortlichem | Steuerung ermöglichen |

---

## 5. Tool-Matrix: Kosten-Trendanalyse (KTA)

### Zweck

Die Kosten-Trendanalyse zeigt, wie sich die erwarteten Gesamtkosten des Projekts im Projektverlauf entwickeln. Sie beantwortet die Frage, ob das Projekt voraussichtlich im Budget bleibt oder ob eine Budgetüberschreitung droht.

### Eingabematrix

| Feld | Beschreibung | Quelle | Beispiel |
|---|---|---|---|
| Statusstichtag | Datum der Bewertung | Reporting | 30.04.2026 |
| genehmigtes Budget | freigegebener Kostenrahmen | Baseline | 250.000 € |
| kumulierte Ist-Kosten | bisher aufgelaufene Kosten | Kostenbuchung | 95.000 € |
| Restkosten Prognose | erwartete Restkosten | Projektleitung / System | 175.000 € |
| EAC | Estimate at Completion | Systemberechnung | 270.000 € |
| Abweichung Budget | EAC - Budget | Systemberechnung | +20.000 € |
| Prognosekommentar | Begründung | Projektleitung | Testaufwand steigt |

### Berechnungsmatrix

| Kennzahl | Formel | Bedeutung |
|---|---|---|
| EAC klassisch | Ist-Kosten + Restkosten-Prognose | Erwartete Gesamtkosten |
| EAC linear via CPI | BAC / CPI | Prognose bei proportional fortlaufender Kostenperformance |
| Budgetabweichung | EAC - BAC | Erwartete Über-/Unterschreitung |
| Budgetverbrauch % | Ist-Kosten / BAC | bereits verbrauchter Budgetanteil |
| Forecast-Abweichung % | Budgetabweichung / BAC | Managementrelevante Budgetabweichung |

### Beispielmatrix

| Stichtag | Budget BAC | Ist-Kosten AC | Restkosten-Prognose | EAC | Abweichung | Status |
|---|---:|---:|---:|---:|---:|---|
| 31.03.2026 | 250.000 € | 40.000 € | 205.000 € | 245.000 € | -5.000 € | Grün |
| 30.04.2026 | 250.000 € | 95.000 € | 175.000 € | 270.000 € | +20.000 € | Gelb |
| 31.05.2026 | 250.000 € | 145.000 € | 145.000 € | 290.000 € | +40.000 € | Rot |
| 30.06.2026 | 250.000 € | 185.000 € | 105.000 € | 290.000 € | +40.000 € | Rot |

### Dashboard-Komponenten

| Komponente | Darstellung | Nutzen |
|---|---|---|
| Budgetlinie | horizontale Linie | genehmigter Rahmen |
| EAC-Trend | Linie über Statusstichtage | Prognoseentwicklung |
| Ist-Kosten kumuliert | Linie / Fläche | tatsächlicher Verbrauch |
| Abweichung zum Budget | KPI-Kachel | Entscheidungsbedarf |
| Forecast-Kommentar | Textfeld | Managementkontext |

---

## 6. Tool-Matrix: Kostengang und Kostensummenlinie

### Zweck

Kostengang und Kostensummenlinie zeigen, wann Kosten im Projekt anfallen und wie sich diese kumulieren. Das ist relevant für Liquidität, Budgetfreigaben und finanzielle Steuerung.

### Eingabematrix

| Feld | Beschreibung | Quelle |
|---|---|---|
| Zeitraum | Monat, KW oder Abrechnungsperiode | Projektkalender |
| Kostenart | Personal, Beratung, Hardware, Software, Reise, Material | Kostenplan |
| Arbeitspaket | zugeordneter Kostenträger | PSP / Kostenplan |
| geplante Kosten | Kosten je Zeitraum | Kostenplan |
| tatsächliche Kosten | gebuchte Ist-Kosten | Buchhaltung / Zeiterfassung |
| kumulierte Kosten | Summe bis Stichtag | Systemberechnung |
| verfügbare Budgetmittel | Budget je Zeitraum | Finance / Budgetplan |

### Beispielmatrix

| Kostenart | Mai | Juni | Juli | August | Gesamt |
|---|---:|---:|---:|---:|---:|
| Beratung | 5.000 € | 3.000 € | 4.000 € | 5.000 € | 17.000 € |
| Hardware | 0 € | 25.000 € | 0 € | 0 € | 25.000 € |
| Programmierung | 10.000 € | 18.000 € | 5.000 € | 0 € | 33.000 € |
| Reisekosten | 3.000 € | 0 € | 0 € | 6.000 € | 9.000 € |
| Kostengang | 18.000 € | 46.000 € | 9.000 € | 11.000 € | 84.000 € |
| Kostensumme | 18.000 € | 64.000 € | 73.000 € | 84.000 € | 84.000 € |

### Dashboard-Komponenten

| Komponente | Darstellung | Nutzen |
|---|---|---|
| Kostengang | Säulendiagramm je Zeitraum | Kostenbelastung je Periode |
| Kostensumme | kumulierte Linie | Budgetverbrauch über Zeit |
| Kostenarten-Stack | gestapelte Säulen | Kostenstruktur sichtbar machen |
| Liquiditätswarnung | Ampel | Budgetengpässe erkennen |

---

## 7. Tool-Matrix: Earned Value Analyse für das Dashboard

### Zweck

Die Earned Value Analyse verbindet Termin-, Kosten- und Fortschrittsbewertung. Sie eignet sich als Management-KPI für klassische Wasserfallprojekte mit belastbarer Baseline.

### Eingabematrix

| Feld | Bedeutung | Quelle |
|---|---|---|
| BAC | Budget at Completion / Gesamtbudget | Kostenbaseline |
| PV | Planned Value / geplanter Wert zum Stichtag | Termin- und Kostenplan |
| AC | Actual Cost / Ist-Kosten zum Stichtag | Kostenbuchung |
| PC / FGR | Percent Complete / Fertigstellungsgrad | Statusbericht |
| EV | Earned Value / Fertigstellungswert | Systemberechnung |

### Berechnungsmatrix

| Kennzahl | Formel | Bedeutung | Dashboard-Ampel |
|---|---|---|---|
| EV | PC × BAC | erwirtschafteter Planwert | Fortschrittswert |
| CV | EV - AC | Kostenabweichung | negativ = kritisch |
| SV | EV - PV | Terminplanabweichung | negativ = kritisch |
| CPI | EV / AC | Kosteneffizienz | < 0,90 kritisch / beobachtungswürdig |
| SPI | EV / PV | Termineffizienz | < 0,90 kritisch / beobachtungswürdig |
| EAC | BAC / CPI | erwartete Gesamtkosten | > BAC kritisch |
| ETC | EAC - AC | erwartete Restkosten | Budgetbedarf |
| VAC | BAC - EAC | erwartete Budgetabweichung am Ende | negativ = Mehrkosten |

### Beispielmatrix

| Kennzahl | Wert | Interpretation | Status |
|---|---:|---|---|
| BAC | 250.000 € | genehmigtes Gesamtbudget | Info |
| PV | 120.000 € | geplanter Wert zum Stichtag | Info |
| AC | 130.000 € | tatsächlich verbrauchte Kosten | Info |
| PC / FGR | 40 % | gemeldeter Fortschritt | Info |
| EV | 100.000 € | erwirtschafteter Wert | Info |
| CV | -30.000 € | über Budget bezogen auf Fortschritt | Rot |
| SV | -20.000 € | hinter Plan bezogen auf geplanten Wert | Rot |
| CPI | 0,77 | Kosteneffizienz kritisch | Rot |
| SPI | 0,83 | Termineffizienz kritisch | Gelb |
| EAC | 324.675 € | erwartete Gesamtkosten | Rot |
| ETC | 194.675 € | erwartete Restkosten | Info |
| VAC | -74.675 € | erwartete Mehrkosten | Rot |

---

## 8. Tool-Matrix: Arbeitspaket-Fortschrittsmatrix

### Zweck

Die Arbeitspaket-Fortschrittsmatrix ist die operative Grundlage für Statusberichte, Kostenvergleiche, Termincontrolling und EVA.

### Statusmatrix

| AP-ID | AP-Name | Verantwortlicher | Planstart | Planende | Prognose-Ende | FGR | geleistete Stunden | Reststunden | Ist-Kosten | Probleme | Status |
|---|---|---|---|---|---|---:|---:|---:|---:|---|---|
| AP-1.1 | Anforderungen erheben | Müller | 01.03. | 15.03. | 15.03. | 100 % | 80 | 0 | 7.500 € | keine | Grün |
| AP-1.2 | Prozessanalyse | Becker | 16.03. | 31.03. | 05.04. | 80 % | 95 | 20 | 11.000 € | Fachbereich fehlt | Gelb |
| AP-2.1 | Schnittstelle konzipieren | Yilmaz | 01.04. | 30.04. | 15.05. | 50 % | 130 | 90 | 14.500 € | technische Klärung offen | Rot |

### Dashboard-Auswertungen

| Auswertung | Logik | Nutzen |
|---|---|---|
| Fortschritt nach Phase | gewichteter FGR der AP | Phasenstatus |
| kritische AP | Rot oder Termin-/Kostenabweichung über Toleranz | Fokusliste |
| Restaufwand | Summe Reststunden je Phase/Rolle | Kapazitätssteuerung |
| Blocker-Liste | AP mit Problemstatus | Eskalationsliste |
| AP ohne Statusmeldung | Statusdatum älter als Zyklus | Reportingqualität |

---

## 9. Tool-Matrix: Ressourcen- und Kapazitätsdashboard

### Zweck

Das Ressourcen- und Kapazitätsdashboard zeigt, ob geplante Arbeitspakete mit verfügbaren internen oder externen Ressourcen realistisch umgesetzt werden können.

### Ressourcenmatrix

| Ressource | Rolle | Abteilung | Verfügbarkeit pro Woche | geplante Auslastung | Ist-Auslastung | Überlastung | betroffene AP | Status |
|---|---|---|---:|---:|---:|---:|---|---|
| Müller | Business Analyst | Fachbereich | 20 h | 18 h | 22 h | +2 h | AP-1.1, AP-1.2 | Gelb |
| Becker | Entwickler | IT | 40 h | 45 h | 42 h | +5 h | AP-2.1 | Rot |
| Yilmaz | Architekt | IT | 16 h | 12 h | 10 h | -4 h | AP-2.1 | Grün |

### Dashboard-Komponenten

| Komponente | Darstellung | Nutzen |
|---|---|---|
| Kapazitäts-Heatmap | Ressource × Kalenderwoche | Überlastungen erkennen |
| Rollenbedarf | Bedarf je Rolle über Zeit | externe Beschaffung planen |
| Engpassliste | Ressourcen mit Überlastung | Eskalation vorbereiten |
| freie Kapazität | Ressourcen mit Unterauslastung | Umplanung ermöglichen |

---

## 10. Tool-Matrix: Risikoportfolio und Maßnahmenstatus

### Zweck

Das Risikoportfolio zeigt, welche Risiken aufgrund von Eintrittswahrscheinlichkeit und Auswirkung priorisiert behandelt werden müssen.

### Risikomatrix

| Risiko-ID | Risiko | Kategorie | Eintritt | Auswirkung | Bewertung | Maßnahme | Verantwortlicher | Status |
|---|---|---|---:|---:|---:|---|---|---|
| R-01 | Key User nicht verfügbar | personell | 4 | 5 | 20 | Vertretung benennen | PL | Rot |
| R-02 | Schnittstelle technisch unklar | technisch | 3 | 5 | 15 | Architekturreview | Architekt | Rot |
| R-03 | Kosten für Dienstleister steigen | finanziell | 3 | 4 | 12 | Rahmenvertrag prüfen | Einkauf | Gelb |
| R-04 | Akzeptanz im Fachbereich gering | organisatorisch | 2 | 4 | 8 | Kommunikationsmaßnahmen | Change Lead | Gelb |

### Dashboard-Komponenten

| Komponente | Darstellung | Nutzen |
|---|---|---|
| Risikoportfolio | Eintritt × Auswirkung | Priorisierung |
| Top-10 Risiken | Tabelle | Management-Fokus |
| Maßnahmenstatus | offen / in Arbeit / erledigt | Steuerbarkeit |
| Risikoentwicklung | Bewertung über Zeit | Trendanalyse |

---

## 11. Ampel- und Schwellenwertmatrix

Die konkreten Schwellenwerte sollten in der Software konfigurierbar sein. Folgende Startlogik ist für klassische Wasserfallprojekte sinnvoll.

| Bewertungsbereich | Grün | Gelb | Rot |
|---|---|---|---|
| Terminabweichung AP | ≤ 0 Tage oder innerhalb Toleranz | 1 bis 10 Arbeitstage Verzögerung | > 10 Arbeitstage oder kritischer Pfad betroffen |
| Meilensteinabweichung | keine Abweichung | unkritische Verzögerung | kritische Verzögerung / Managementtermin gefährdet |
| Kostenabweichung | ≤ 5 % | > 5 % bis 10 % | > 10 % |
| CPI | ≥ 0,90 | 0,80 bis < 0,90 | < 0,80 |
| SPI | ≥ 0,90 | 0,80 bis < 0,90 | < 0,80 |
| Risiko | Bewertung niedrig | Bewertung mittel | Bewertung hoch |
| Ressourcenbelastung | ≤ 100 % | 101 % bis 110 % | > 110 % |
| Statusmeldung | aktuell | leicht überfällig | deutlich überfällig |

---

## 12. Dashboard-Persona-Matrix

| Rolle | Benötigte Sicht | Relevante Tools | Detailtiefe |
|---|---|---|---|
| Geschäftsführung | Gesamtstatus, Budget, Meilensteine, Entscheidungen | Projektstatus-Cockpit, MTA, KTA, Top-Risiken | hoch aggregiert |
| Auftraggeber | Zielerreichung, Meilensteine, Abnahmen, Changes | Meilensteinstatus, MTA, Change-Impact, Statusbericht | Managementsicht |
| Projektleiter | operative Steuerung | alle Tools | detailliert |
| PMO / Controlling | Kosten, Termine, Fortschritt, Reportingqualität | Kosten-Soll-Ist, KTA, EVA, AP-Fortschritt | detailliert |
| Teilprojektleiter | AP-Status, Ressourcen, Risiken | AP-Fortschritt, Ressourcenmatrix, Risiken | teilprojektbezogen |
| AP-Verantwortlicher | eigene Arbeitspakete | AP-Status, Restaufwand, Freigaben | operativ |
| Finance | Budget, Kostengang, Forecast | Kostengang, KTA, Ressourcen-/Kostenplan | kostenbezogen |

---

## 13. Datenmodell-Matrix für die Software

| Entität | Zweck | zentrale Felder | Beziehung |
|---|---|---|---|
| Project | Projektstammdaten | ID, Name, Sponsor, PL, Start, Ende, Budget | hat Phasen, AP, Meilensteine |
| Phase | Projektphase | ID, Projekt-ID, Name, Start, Ende, Status | enthält AP und Meilensteine |
| WorkPackage | Arbeitspaket | ID, PSP-Code, Name, Verantwortlicher, Budget, Aufwand, Start, Ende | gehört zu Phase |
| Activity | Vorgang | ID, AP-ID, Name, Dauer, Vorgänger, Status | gehört zu AP |
| Milestone | Meilenstein | ID, Projekt-ID, Name, Baseline, Prognose, Ist, Status | gehört zu Projekt/Phase |
| StatusReport | Statusmeldung | ID, Projekt-ID, Stichtag, Berichtender, Kommentar | enthält AP-Status und KPI |
| WorkPackageStatus | AP-Status | AP-ID, Stichtag, FGR, Ist-Aufwand, Restaufwand, Prognose-Ende | Basis für Controlling |
| CostEntry | Kostenbuchung | AP-ID, Kostenart, Betrag, Datum, Ist/Plan | Basis für Kostenanalyse |
| ResourceAssignment | Ressourcenzuordnung | Ressource, AP, Zeitraum, Aufwand, Kosten | Basis für Kapazität |
| Risk | Risiko | Eintritt, Auswirkung, Bewertung, Maßnahme, Owner | gehört zu Projekt/AP |
| ChangeRequest | Änderung | Scope, Kosten, Termin, Risiko, Entscheidung | beeinflusst Baseline |
| DashboardSnapshot | KPI-Snapshot | Stichtag, KPI-Werte, Ampel, Kommentar | historisiert Dashboard |

---

## 14. KI-Dialogmatrix zur Erstellung von Dashboard-Auswertungen

| Dialogschritt | KI-Frage | Ziel | betroffene Tools |
|---|---|---|---|
| 1 | Welche Projektbaseline soll für das Dashboard verwendet werden? | Planbasis festlegen | alle |
| 2 | Welche Meilensteine sind managementrelevant? | MTA auf relevante MS begrenzen | MTA, Meilensteinstatus |
| 3 | Welcher Reportingzyklus gilt? | Stichtage definieren | MTA, KTA, EVA |
| 4 | Welche Toleranzen gelten für Terminabweichungen? | Ampellogik konfigurieren | MTA, Kosten-Termin |
| 5 | Welche Kostengrenzen gelten? | Budgetampeln konfigurieren | Kosten-Soll-Ist, KTA |
| 6 | Wie wird der Fertigstellungsgrad ermittelt? | EVA und Kostenvergleich stabilisieren | EVA, AP-Fortschritt |
| 7 | Welche Kostenquellen sind angebunden? | Ist-Kosten erfassen | Kosten-Soll-Ist, KTA |
| 8 | Welche Rollen/Ressourcen sollen überwacht werden? | Kapazitätsdashboard konfigurieren | Ressourcenmatrix |
| 9 | Welche Risiken sind im Managementbericht sichtbar? | Top-Risiken steuern | Risikoportfolio |
| 10 | Welche KPIs gehören auf die Startseite? | Dashboard-Priorität festlegen | Projektstatus-Cockpit |

---

## 15. Beispiel: Management-Dashboard-Matrix

| Dashboard-Bereich | KPI / Anzeige | Quelle | Ampellogik | Drilldown |
|---|---|---|---|---|
| Gesamtstatus | Gesamtampel Projekt | aggregierte Einzelstatus | schlechtester kritischer Status zieht Gesamtstatus | Statusbericht |
| Termine | Anzahl gefährdeter Meilensteine | MTA / Meilensteinplan | Rot bei kritischem Managementmeilenstein | MTA-Detail |
| Kosten | Forecast Budgetabweichung | KTA / EVA | Rot bei > 10 % Abweichung | Kostenanalyse |
| Fortschritt | gewichteter Projekt-FGR | AP-Status | Rot bei deutlicher Planabweichung | AP-Matrix |
| Performance | CPI / SPI | EVA | Schwellenwerte nach Ampelmatrix | EVA-Detail |
| Risiken | Top-5 Risiken | Risikoportfolio | Bewertung hoch = Rot | Risikoregister |
| Ressourcen | überlastete Ressourcen | Ressourcenmatrix | > 110 % = Rot | Kapazitätsplan |
| Changes | offene Changes mit Impact | Change-Log | hoher Termin-/Kostenimpact = Rot | Change Request |
| Entscheidungen | offene Managemententscheidungen | Entscheidungslog | überfällig = Rot | Entscheidungsboard |

---

## 16. Empfohlene Dashboard-Struktur

```text
Projektmanagement-Dashboard
├── 1. Management Summary
│   ├── Gesamtampel
│   ├── wichtigste Abweichungen
│   ├── Entscheidungsbedarf
│   └── nächste Meilensteine
├── 2. Termin-Dashboard
│   ├── Meilensteinstatus
│   ├── Meilensteintrendanalyse
│   ├── kritischer Pfad
│   └── Terminabweichungen je AP
├── 3. Kosten-Dashboard
│   ├── Kosten-Soll-Ist-Vergleich
│   ├── Kosten-Trendanalyse
│   ├── Kostengang und Kostensumme
│   └── Budget Forecast
├── 4. Performance-Dashboard
│   ├── EVA
│   ├── CPI / SPI
│   ├── EAC / ETC / VAC
│   └── Fortschrittsgrad
├── 5. Ressourcen-Dashboard
│   ├── Kapazitätsplan
│   ├── Auslastung je Rolle
│   ├── Engpässe
│   └── externe Ressourcen
├── 6. Risiko- und Change-Dashboard
│   ├── Risikoportfolio
│   ├── Top-10 Risiken
│   ├── Maßnahmenstatus
│   └── Change-Impact
└── 7. Operatives AP-Dashboard
    ├── AP-Statusliste
    ├── Blocker
    ├── Restaufwand
    └── überfällige Statusmeldungen
```

---

## 17. User Story: Dashboard-Tool-Matrixen bereitstellen

```markdown
# User Story: Projektmanagement-Auswertungstools im Dashboard bereitstellen

## Status
Proposed

## User Story
Als Projektleiter möchte ich klassische Projektmanagement-Auswertungstools wie Meilensteintrendanalyse, Kosten-Soll-Ist-Vergleich, Kosten-Trendanalyse und Earned Value Analyse im Dashboard nutzen, damit ich Projektstatus, Abweichungen, Risiken und Prognosen faktenbasiert steuern kann.

## Akzeptanzkriterien
- [ ] Das Dashboard kann Meilensteintrends je Statusstichtag darstellen.
- [ ] Das Dashboard kann Kosten-Soll-Ist-Abweichungen je Arbeitspaket auswerten.
- [ ] Das Dashboard kann Kostenentwicklungen und Forecasts über Zeit darstellen.
- [ ] Das Dashboard kann Termin- und Kostenabweichungen kombiniert je Arbeitspaket anzeigen.
- [ ] Das Dashboard kann EVA-Kennzahlen wie EV, CV, SV, CPI, SPI, EAC, ETC und VAC berechnen.
- [ ] Das Dashboard kann Risiken und Maßnahmen als Portfolio und Top-Liste darstellen.
- [ ] Die Ampellogik ist konfigurierbar.
- [ ] Jeder KPI ist bis auf Arbeitspaket-, Meilenstein- oder Risikodetail drilldownfähig.
- [ ] Jede Auswertung basiert auf einer freigegebenen Baseline oder einem dokumentierten Stichtag.
- [ ] Änderungen an Planwerten werden versioniert und beeinflussen historische Dashboards nicht rückwirkend ohne Kennzeichnung.

## Nicht-Akzeptanzkriterien
- [ ] Dashboards dürfen keine Werte ohne nachvollziehbare Datenquelle anzeigen.
- [ ] Manuelle KPI-Überschreibungen ohne Kommentar und Audit-Log sind nicht zulässig.
- [ ] Projektstatus darf nicht nur subjektiv gepflegt werden, wenn Plan-, Ist- und Fortschrittsdaten vorhanden sind.
- [ ] EVA darf nicht berechnet werden, wenn BAC, PV, AC oder FGR fehlen.

## Definition of Ready
- [ ] Projektbaseline ist definiert.
- [ ] Arbeitspakete, Meilensteine, Kosten und Termine sind strukturiert erfasst.
- [ ] Reportingstichtage sind definiert.
- [ ] Ampelschwellen sind fachlich abgestimmt.
- [ ] Ist-Kosten- und Statusdatenquellen sind bekannt.

## Definition of Done
- [ ] Alle Dashboard-Tools sind im System auswählbar.
- [ ] Die Berechnungslogik ist dokumentiert.
- [ ] Beispielprojekt kann vollständig ausgewertet werden.
- [ ] Managementansicht und Projektleiteransicht sind verfügbar.
- [ ] Drilldowns auf AP, Meilenstein, Risiko und Kostenposition funktionieren.
- [ ] Export als PDF/Excel/Management Summary ist möglich.
```

---

## 18. Priorisierte Umsetzungsempfehlung

| Priorität | Tool | Grund |
|---|---|---|
| 1 | Arbeitspaket-Fortschrittsmatrix | Basis für alle weiteren Auswertungen |
| 2 | Meilensteinstatus und MTA | schnell hoher Managementnutzen |
| 3 | Kosten-Soll-Ist-Vergleich | direkte Budgetsteuerung |
| 4 | Ressourcen- und Kapazitätsmatrix | wichtig für realistische Terminplanung |
| 5 | Kosten-Trendanalyse | Forecast für Management und Finance |
| 6 | Risikoportfolio | Steuerung kritischer Unsicherheiten |
| 7 | EVA | hoher Nutzen, aber nur bei sauberer Baseline und belastbarem FGR |
| 8 | Change-Impact-Matrix | wichtig für Governance und Baseline-Änderungen |

---

## 19. Abschlusslogik für die Software

Die Excel-Tools sollten nicht als einzelne isolierte Auswertungen nachgebaut werden. Sinnvoller ist eine gemeinsame Steuerungslogik:

```text
Projektbaseline
+ Statusstichtag
+ Arbeitspaketstatus
+ Meilensteinprognose
+ Ist-Kosten
+ Restaufwand
+ Risiken / Changes
= Dashboard-Snapshot
```

Jeder Dashboard-Snapshot sollte historisiert werden. Dadurch kann die Plattform später Trends, Managementberichte, Lessons Learned und Projektvergleiche erzeugen.
