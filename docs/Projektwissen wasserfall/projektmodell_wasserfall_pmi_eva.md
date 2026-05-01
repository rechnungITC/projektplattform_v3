# Projektmodell für Wasserfall-/PMI-Projekte mit integrierter Projektsteuerung und Earned Value Analyse

## 1. Ziel des Dokuments

Dieses Dokument beschreibt, wie ein klassisches Projekt nach einem Wasserfall- bzw. PMI-orientierten Vorgehensmodell aufgebaut werden kann. Grundlage sind die vorhandenen Projektmanagement-Dokumente, Tabellen-Reiter und die Unterlagen zur Projektsteuerung, zum Controlling und zur Earned Value Analyse.

Das Ziel ist, aus den vorhandenen Dokumenten und Tabellen eine strukturierte Projektlogik abzuleiten, die später als Grundlage für:

- Projektphasen,
- Arbeitspakete,
- Epics,
- User Stories,
- Projektcontrolling,
- Earned Value Analyse,
- Meilensteinsteuerung,
- Ressourcenplanung,
- Kostenplanung,
- Risikomanagement,
- Qualitätsmanagement,
- Projektabschluss und Evaluation

verwendet werden kann.

Die enthaltene Earned Value Analyse soll dabei nicht nur als Controlling-Methode verstanden werden, sondern auch als eigenständige Story bzw. Funktion für die Projekt-Evaluierung in einer digitalen Projektplattform nutzbar sein.

---

## 2. Grundidee des Projektmodells

Ein Projekt sollte nicht nur als Aufgabenliste aufgebaut werden, sondern als vollständiges Steuerungsmodell.

```text
Projekt
├── Projektauftrag
├── Projektstrukturplan / PSP
├── Phasen
│   ├── Arbeitspakete
│   ├── Lieferobjekte
│   ├── Meilensteine
│   └── Abnahmekriterien
├── Terminplan
├── Ressourcenplan
├── Kostenplan
├── Risikoplan
├── Qualitätsplan
├── Kommunikations- und Berichtswesen
├── Change-Management
├── Projektcontrolling
│   ├── Soll-Ist-Vergleich
│   ├── Fertigstellungsgrad
│   ├── Meilensteintrendanalyse
│   ├── Kostenvergleich
│   └── Earned Value Analyse
└── Abschluss / Evaluation
```

Der zentrale Gedanke lautet:

```text
Planungsdaten + Ist-Daten + Bewertungslogik = steuerbares Projekt
```

---

## 3. Ausgangsbasis aus den vorhandenen Reitern und Dokumenten

| Dokument / Reiter | Bedeutung für das Projektmodell | Daraus ableitbares Modul / Story |
|---|---|---|
| Projektauftrag | Projektziel, Auftraggeber, Rahmen, Budget, Verantwortung | Projekt anlegen / Projektauftrag erstellen |
| Projektstruktur | Gliederung in Teilprojekte, Phasen, Arbeitspakete | Projektstrukturplan / Work Breakdown Structure |
| Aufwaende | Optimistischer, pessimistischer und wahrscheinlicher Aufwand | Aufwandsschätzung je Arbeitspaket |
| Terminplan | Start, Ende, Dauer, Vorgänger und Abhängigkeiten | Terminplanung / Abhängigkeitslogik |
| Meilenst.-Plan | Meilensteine mit Prüfkriterien und Status | Meilensteinplanung / Quality Gates |
| Kosten+Ressourcen | Rollen, Personentage, Kosten und sonstige Kosten | Ressourcen- und Kostenplanung |
| Risiken | Risiko, Ursache, Auswirkung, Bewertung und Maßnahme | Risikomanagement |
| Qualitaet | Qualitätsziele, Maßnahmen und Abweichungsmaßnahmen | Qualitätsmanagement |
| Berichtswesen | Berichtswege, Empfänger, Zeitpunkt und Form | Kommunikations- und Reportingplan |
| Basisplan | Eingefrorene Planversion | Baseline / Version 0 |
| eineDimension | Einfacher Soll-Ist-Vergleich | Termin- und Kostenstatus |
| zweiDimensionen | Soll-Ist-Vergleich mit Fertigstellungsgrad | Fortschrittscontrolling |
| 0-20-100 | Statusbewertung nach Fortschrittsregel | FGR-Methode / Statuslogik |
| Arb.Forts-Diagr. | Soll-Ist-Fortschrittsdiagramm | Fortschrittsdashboard |
| SollIstMSPlan | Meilenstein-Soll-Ist-Vergleich | Meilensteincontrolling |
| MTA | Meilensteintrendanalyse | Termintrend / Forecast |
| Kost.VergDiagr / KostVerglTab. | Kostenvergleich und Kostentrend | Kostencontrolling |
| V1_Tln_EV / EVA | Earned Value Analyse | Projektbewertung / Projektforecast |

---

## 4. Phasenmodell für ein Wasserfall-/PMI-Projekt

Das folgende Phasenmodell kann als Standardstruktur für ein klassisches Projekt genutzt werden.

```text
0. Projektinitiierung
1. Projektplanung / Baseline
2. Analyse / Anforderungen
3. Lösungskonzept / Make-or-Buy / Pflichtenheft
4. Umsetzung / Implementierung
5. Test / Qualitätssicherung
6. Rollout / Go-Live
7. Projektabschluss / Evaluation
```

---

# Phase 0: Projektinitiierung

## Ziel der Phase

In der Initiierungsphase wird geklärt, warum das Projekt durchgeführt werden soll, welchen Nutzen es hat, wer beteiligt ist und ob das Projekt grundsätzlich freigegeben werden soll.

## Typische Inhalte

| Inhalt | Arbeitsergebnis |
|---|---|
| Projektidee aufnehmen | Projektsteckbrief |
| Zielbild definieren | Zielkatalog |
| Auftraggeber, Sponsor und Projektleitung klären | Rollenübersicht |
| Groben Scope definieren | Scope-Abgrenzung |
| Budgetrahmen erfassen | Budgetindikation |
| Erste Risiken erfassen | Initiales Risikoregister |
| Entscheidung zur Projektfreigabe vorbereiten | Projektauftrag |

## Beispiel-Arbeitspakete

```text
0.1 Projektauftrag erstellen
0.2 Stakeholder identifizieren
0.3 Zielkatalog abstimmen
0.4 Grobe Wirtschaftlichkeitsbetrachtung erstellen
0.5 Projektfreigabe vorbereiten
```

## Beispiel-User-Story

```markdown
# User Story: Projektauftrag erstellen

## Status
Proposed

## User Story
Als Projektleiter möchte ich einen strukturierten Projektauftrag erstellen, damit Ziel, Nutzen, Scope, Budget, Rollen und Entscheidungsgrundlage für das Projekt verbindlich dokumentiert sind.

## Akzeptanzkriterien
- [ ] Projektziel ist eindeutig beschrieben.
- [ ] Auftraggeber, Sponsor und Projektleitung sind benannt.
- [ ] Grober Scope und Nicht-Ziele sind dokumentiert.
- [ ] Budgetrahmen und Zeitrahmen sind erfasst.
- [ ] Erste Risiken sind dokumentiert.
- [ ] Eine Freigabeentscheidung kann auf Basis des Projektauftrags getroffen werden.

## Nicht-Akzeptanzkriterien
- [ ] Eine reine Projektidee ohne Ziel, Budget und Verantwortliche gilt nicht als Projektauftrag.
- [ ] Ein Projekt darf nicht ohne dokumentierte Freigabe in die Planungsphase übergehen.

## Definition of Ready
- [ ] Projektidee liegt vor.
- [ ] Auftraggeber ist bekannt.
- [ ] Grobe Zielsetzung wurde formuliert.

## Definition of Done
- [ ] Projektauftrag ist erstellt.
- [ ] Projektauftrag wurde mit Auftraggeber abgestimmt.
- [ ] Freigabeentscheidung ist dokumentiert.
```

---

# Phase 1: Projektplanung / Baseline

## Ziel der Phase

In dieser Phase wird der Projektplan erstellt und als Baseline eingefroren. Diese Baseline bildet später die Grundlage für Soll-Ist-Vergleiche, Controlling und Earned Value Analyse.

## Typische Inhalte

| Inhalt | Arbeitsergebnis |
|---|---|
| Projektstrukturplan erstellen | PSP / WBS |
| Arbeitspakete definieren | AP-Liste |
| Aufwand schätzen | Aufwandsschätzung |
| Rollen und Ressourcen planen | Ressourcenplan |
| Kosten planen | Kostenplan |
| Termine und Abhängigkeiten planen | Terminplan |
| Meilensteine definieren | Meilensteinplan |
| Qualität definieren | Qualitätsplan |
| Berichtswesen definieren | Kommunikationsplan |
| Risiken bewerten | Risikoregister |
| Basisplan einfrieren | Baseline Version 0 |

## Beispiel-Arbeitspakete

```text
1.1 Projektstrukturplan erstellen
1.2 Arbeitspakete beschreiben
1.3 Aufwandsschätzung nach optimistisch / wahrscheinlich / pessimistisch durchführen
1.4 Terminplan mit Vorgängern und Abhängigkeiten erstellen
1.5 Ressourcen- und Kostenplan erstellen
1.6 Meilensteinplan mit Prüfkriterien erstellen
1.7 Qualitätsplan erstellen
1.8 Risikoplan erstellen
1.9 Berichtswesen und Statuszyklen definieren
1.10 Projektbaseline freigeben
```

## Beispiel-User-Story

```markdown
# User Story: Projektbaseline erstellen und freigeben

## Status
Proposed

## User Story
Als Projektleiter möchte ich eine freigegebene Projektbaseline erstellen, damit spätere Abweichungen bei Terminen, Kosten, Ressourcen und Fortschritt eindeutig bewertet werden können.

## Akzeptanzkriterien
- [ ] Alle Arbeitspakete sind mit Verantwortlichen dokumentiert.
- [ ] Für jedes Arbeitspaket sind geplante Start- und Endtermine erfasst.
- [ ] Für jedes Arbeitspaket sind geplante Aufwände und Kosten erfasst.
- [ ] Meilensteine sind mit Prüfkriterien definiert.
- [ ] Risiken sind initial bewertet.
- [ ] Reportingzyklen sind festgelegt.
- [ ] Die Baseline ist versioniert und freigegeben.

## Nicht-Akzeptanzkriterien
- [ ] Eine nicht freigegebene Planung darf nicht als Baseline genutzt werden.
- [ ] Arbeitspakete ohne Verantwortliche gelten nicht als planungsreif.
- [ ] Kosten- oder Terminplanung ohne Arbeitspaketbezug gilt nicht als ausreichend.

## Definition of Ready
- [ ] Projektauftrag ist freigegeben.
- [ ] Projektziel und Scope sind bekannt.
- [ ] Relevante Stakeholder sind benannt.

## Definition of Done
- [ ] Baseline Version 0 ist erstellt.
- [ ] Baseline wurde freigegeben.
- [ ] Baseline kann für Soll-Ist-Vergleiche genutzt werden.
```

---

# Phase 2: Analyse / Anforderungen

## Ziel der Phase

In der Analysephase werden Ist-Situation, Anforderungen, Prozesse, Systeme, Daten und fachliche Ziele detailliert aufgenommen. Das Ergebnis ist ein belastbarer Anforderungskatalog bzw. ein Lastenheft.

## Typische Inhalte

| Inhalt | Arbeitsergebnis |
|---|---|
| Ist-Prozesse aufnehmen | Prozessaufnahme |
| Pain Points erfassen | Schwachstellenanalyse |
| Soll-Prozesse entwerfen | Soll-Prozessmodell |
| Anforderungen erfassen | Anforderungskatalog |
| Anforderungen priorisieren | Priorisiertes Lastenheft |
| Abnahmekriterien definieren | Messbare Kriterien |
| Lastenheft abnehmen | Meilensteinfreigabe |

## Beispiel-Arbeitspakete

```text
2.1 Ist-Prozesse je Fachbereich aufnehmen
2.2 Systemlandschaft und Schnittstellen analysieren
2.3 Datenobjekte und Stammdaten identifizieren
2.4 Anforderungen fachlich erfassen
2.5 Anforderungen priorisieren
2.6 Nicht-Ziele und Out-of-Scope definieren
2.7 Lastenheft erstellen
2.8 Lastenheft-Review durchführen
2.9 Lastenheft abnehmen
```

## Beispiel-User-Story

```markdown
# User Story: Anforderungen strukturiert erfassen und priorisieren

## Status
Proposed

## User Story
Als Business Analyst möchte ich Anforderungen strukturiert erfassen, priorisieren und mit Akzeptanzkriterien versehen, damit daraus belastbare Arbeitspakete, Pflichtenheftinhalte oder spätere Stories abgeleitet werden können.

## Akzeptanzkriterien
- [ ] Jede Anforderung hat eine eindeutige ID.
- [ ] Jede Anforderung ist einer Fachdomäne oder einem Prozessbereich zugeordnet.
- [ ] Jede Anforderung hat eine Priorität.
- [ ] Jede Anforderung besitzt messbare Akzeptanzkriterien.
- [ ] Abhängigkeiten zu anderen Anforderungen sind dokumentiert.
- [ ] Out-of-Scope-Punkte sind separat dokumentiert.

## Nicht-Akzeptanzkriterien
- [ ] Unklare Wünsche ohne Nutzenbeschreibung gelten nicht als vollständige Anforderung.
- [ ] Anforderungen ohne Akzeptanzkriterien gelten nicht als umsetzungsreif.

## Definition of Ready
- [ ] Relevante Fachbereiche sind bekannt.
- [ ] Workshoptermine sind geplant.
- [ ] Vorlage für Anforderungen ist vorhanden.

## Definition of Done
- [ ] Anforderungen sind dokumentiert.
- [ ] Anforderungen sind priorisiert.
- [ ] Lastenheft ist reviewfähig.
```

---

# Phase 3: Lösungskonzept / Make-or-Buy / Pflichtenheft

## Ziel der Phase

In dieser Phase wird aus den Anforderungen ein konkretes Lösungskonzept abgeleitet. Je nach Projekt kann hier eine Make-or-Buy-Entscheidung, eine Softwareauswahl, eine Architekturentscheidung oder ein Pflichtenheft entstehen.

## Typische Inhalte

| Inhalt | Arbeitsergebnis |
|---|---|
| Lösungsoptionen bewerten | Bewertungsmatrix |
| Make-or-Buy prüfen | Entscheidungsvorlage |
| Anbieter / Systeme vergleichen | Shortlist |
| Zielarchitektur entwerfen | Lösungsarchitektur |
| Pflichtenheft erstellen | Pflichtenheft |
| Entscheidung vorbereiten | Managemententscheidung |
| Vertrag / Beschaffung vorbereiten | Kauf- oder Projektvertrag |

## Beispiel-Arbeitspakete

```text
3.1 Bewertungskriterien für Lösungen definieren
3.2 Make-or-Buy-Analyse durchführen
3.3 Anbieter / Systeme vergleichen
3.4 Zielarchitektur beschreiben
3.5 Integrationskonzept erstellen
3.6 Datenmigrationskonzept erstellen
3.7 Berechtigungskonzept erstellen
3.8 Pflichtenheft erstellen
3.9 Entscheidungsvorlage vorbereiten
3.10 Lösungsauswahl abnehmen
```

## Beispiel-User-Story

```markdown
# User Story: Lösungsauswahl anhand definierter Bewertungskriterien durchführen

## Status
Proposed

## User Story
Als Projektleiter möchte ich mögliche Lösungsoptionen anhand definierter Bewertungskriterien vergleichen, damit eine nachvollziehbare Make-or-Buy- oder Anbieterentscheidung getroffen werden kann.

## Akzeptanzkriterien
- [ ] Bewertungskriterien sind dokumentiert.
- [ ] Kriterien sind gewichtet.
- [ ] Jede Lösungsoption wird gegen dieselben Kriterien bewertet.
- [ ] Fachliche, technische, wirtschaftliche und organisatorische Aspekte werden berücksichtigt.
- [ ] Risiken und Abhängigkeiten je Option sind dokumentiert.
- [ ] Eine Entscheidungsempfehlung wird erstellt.

## Nicht-Akzeptanzkriterien
- [ ] Eine Entscheidung ohne Bewertungsmatrix gilt nicht als nachvollziehbar.
- [ ] Reine Kostenbetrachtung ohne fachlich-technische Bewertung ist nicht ausreichend.

## Definition of Ready
- [ ] Anforderungen liegen priorisiert vor.
- [ ] Bewertungsdimensionen sind abgestimmt.
- [ ] Relevante Lösungsoptionen sind bekannt.

## Definition of Done
- [ ] Bewertungsmatrix ist erstellt.
- [ ] Entscheidungsvorlage liegt vor.
- [ ] Managemententscheidung ist dokumentiert.
```

---

# Phase 4: Umsetzung / Implementierung

## Ziel der Phase

In der Umsetzungsphase wird die geplante Lösung realisiert. Dies kann Softwareentwicklung, Customizing, Systemintegration, Migration, Konfiguration, Infrastrukturaufbau oder organisatorische Umsetzung umfassen.

## Typische Inhalte

| Inhalt | Arbeitsergebnis |
|---|---|
| Systemumgebung bereitstellen | Entwicklungs- und Testsystem |
| Konfiguration / Customizing durchführen | Konfiguriertes System |
| Schnittstellen bauen | Integrationen |
| Migration vorbereiten | Migrationspakete |
| Rollen und Rechte umsetzen | Berechtigungsmodell |
| Reports / Dashboards erstellen | Reporting |
| Dokumentation erstellen | Technische und fachliche Dokumentation |

## Beispiel-Arbeitspakete

```text
4.1 Projektumgebung einrichten
4.2 Basiskonfiguration durchführen
4.3 Rollen- und Berechtigungskonzept umsetzen
4.4 Stammdatenmodell umsetzen
4.5 Schnittstellen entwickeln
4.6 Migrationslogik entwickeln
4.7 Reports und Dashboards erstellen
4.8 Systemdokumentation erstellen
4.9 Betriebsübergabe vorbereiten
```

## Beispiel-User-Story

```markdown
# User Story: Arbeitspaketstatus während der Umsetzung erfassen

## Status
Proposed

## User Story
Als Arbeitspaketverantwortlicher möchte ich den Status meines Arbeitspakets regelmäßig erfassen, damit Projektleitung und Controlling den tatsächlichen Projektfortschritt bewerten können.

## Akzeptanzkriterien
- [ ] Geleisteter Aufwand kann erfasst werden.
- [ ] Geschätzter Restaufwand kann erfasst werden.
- [ ] Fertigstellungsgrad kann nach definierter Methode angegeben werden.
- [ ] Erwarteter Endtermin kann aktualisiert werden.
- [ ] Probleme und Risiken können gemeldet werden.
- [ ] Statusmeldung ist einem Stichtag zugeordnet.
- [ ] Änderung gegenüber vorherigem Status ist nachvollziehbar.

## Nicht-Akzeptanzkriterien
- [ ] Eine reine Freitextmeldung ohne messbare Werte ist nicht ausreichend.
- [ ] Statusmeldungen ohne Stichtag dürfen nicht für Controlling-Auswertungen verwendet werden.

## Definition of Ready
- [ ] Arbeitspaket ist geplant.
- [ ] Verantwortlicher ist benannt.
- [ ] Reportingzyklus ist festgelegt.

## Definition of Done
- [ ] Status wurde vollständig erfasst.
- [ ] Status ist für Soll-Ist-Vergleich nutzbar.
- [ ] Abweichungen sind sichtbar.
```

---

# Phase 5: Test / Qualitätssicherung

## Ziel der Phase

Die Testphase stellt sicher, dass die Lösung fachlich, technisch und organisatorisch die definierten Anforderungen erfüllt. Sie dient der Qualitätssicherung und Vorbereitung der Abnahme.

## Typische Inhalte

| Inhalt | Arbeitsergebnis |
|---|---|
| Testkonzept erstellen | Testplan |
| Testfälle definieren | Testszenarien |
| Integrationstest durchführen | Testergebnisse |
| Migrationstest durchführen | Migrationsprotokoll |
| User Acceptance Test durchführen | Fachbereichsabnahme |
| Fehler bewerten | Defect-Liste |
| Qualität prüfen | Qualitätsstatus |
| Testabnahme durchführen | Testfreigabe |

## Beispiel-Arbeitspakete

```text
5.1 Teststrategie erstellen
5.2 Testfälle aus Anforderungen ableiten
5.3 Testdaten bereitstellen
5.4 Integrationstest durchführen
5.5 Migrationstest durchführen
5.6 Performance- und Usabilitytest durchführen
5.7 Fachbereichstest durchführen
5.8 Fehlerbehebung steuern
5.9 Testabnahme durchführen
```

## Beispiel-User-Story

```markdown
# User Story: Testfälle aus Anforderungen ableiten

## Status
Proposed

## User Story
Als Testmanager möchte ich Testfälle direkt aus den freigegebenen Anforderungen ableiten, damit geprüft werden kann, ob die Lösung die fachlichen und technischen Erwartungen erfüllt.

## Akzeptanzkriterien
- [ ] Jede priorisierte Anforderung ist mindestens einem Testfall zugeordnet.
- [ ] Jeder Testfall enthält Vorbedingungen, Testschritte und erwartetes Ergebnis.
- [ ] Testergebnisse können dokumentiert werden.
- [ ] Fehler können einem Testfall und einer Anforderung zugeordnet werden.
- [ ] Nicht bestandene Tests sind auswertbar.

## Nicht-Akzeptanzkriterien
- [ ] Tests ohne Bezug zu Anforderungen gelten nicht als vollständiger Abnahmetest.
- [ ] Tests ohne erwartetes Ergebnis gelten nicht als prüfbar.

## Definition of Ready
- [ ] Anforderungen sind freigegeben.
- [ ] Akzeptanzkriterien sind vorhanden.
- [ ] Testumgebung ist verfügbar.

## Definition of Done
- [ ] Testfälle sind dokumentiert.
- [ ] Testabdeckung ist nachvollziehbar.
- [ ] Testergebnisse sind auswertbar.
```

---

# Phase 6: Rollout / Go-Live

## Ziel der Phase

In dieser Phase wird die Lösung produktiv gesetzt. Dazu gehören Schulung, Cutover, Go-Live-Readiness, Produktivsetzung, Hypercare und Betriebsübergabe.

## Typische Inhalte

| Inhalt | Arbeitsergebnis |
|---|---|
| Schulungen durchführen | Schulungsnachweise |
| Cutover planen | Cutover-Plan |
| Produktivsetzung vorbereiten | Go-Live-Checkliste |
| Pilot durchführen | Pilotfreigabe |
| Rollout durchführen | Produktives System |
| Hypercare starten | Supportphase |
| Alt-System abschalten | Abschaltprotokoll |

## Beispiel-Arbeitspakete

```text
6.1 Schulungskonzept finalisieren
6.2 Key-User schulen
6.3 Endanwender schulen
6.4 Cutover-Plan erstellen
6.5 Go-Live-Readiness prüfen
6.6 Produktivsetzung durchführen
6.7 Hypercare durchführen
6.8 Betriebsübergabe abschließen
```

## Beispiel-User-Story

```markdown
# User Story: Go-Live-Readiness prüfen

## Status
Proposed

## User Story
Als Projektleiter möchte ich vor dem Go-Live eine strukturierte Readiness-Prüfung durchführen, damit nur produktiv gesetzt wird, wenn System, Daten, Nutzer, Betrieb und Support vorbereitet sind.

## Akzeptanzkriterien
- [ ] Offene kritische Fehler sind bewertet.
- [ ] Migrationsergebnis ist geprüft.
- [ ] Schulungen sind durchgeführt oder geplant.
- [ ] Support- und Hypercare-Struktur ist definiert.
- [ ] Betrieb ist informiert.
- [ ] Cutover-Aktivitäten sind geplant.
- [ ] Go-Live-Entscheidung ist dokumentiert.

## Nicht-Akzeptanzkriterien
- [ ] Go-Live ohne dokumentierte Freigabe ist nicht zulässig.
- [ ] Kritische offene Fehler dürfen nicht ignoriert werden.

## Definition of Ready
- [ ] Testphase ist abgeschlossen oder Restpunkte sind bewertet.
- [ ] Cutover-Plan liegt vor.
- [ ] Verantwortliche sind benannt.

## Definition of Done
- [ ] Readiness-Check ist abgeschlossen.
- [ ] Go-Live-Freigabe ist dokumentiert.
- [ ] Hypercare ist vorbereitet.
```

---

# Phase 7: Projektabschluss / Evaluation

## Ziel der Phase

Der Projektabschluss bewertet, ob das Projekt seine Ziele erreicht hat. Neben der fachlichen Abnahme werden Termine, Kosten, Qualität, Risiken, Änderungen und Lessons Learned ausgewertet.

Die Earned Value Analyse kann hier als zentrale Methode zur Projektbewertung eingesetzt werden.

## Typische Inhalte

| Inhalt | Arbeitsergebnis |
|---|---|
| Projektergebnis bewerten | Abschlussbericht |
| Kosten, Termine und Qualität auswerten | Projektbewertung |
| EVA durchführen | Earned-Value-Auswertung |
| Nutzen / Zielerreichung bewerten | Zielerreichungsbericht |
| Lessons Learned erfassen | Lessons-Learned-Dokument |
| Abschlussabnahme durchführen | Abnahmeprotokoll |
| Projekt archivieren | Projektdokumentation |

## Beispiel-Arbeitspakete

```text
7.1 Abschlussstatusbericht erstellen
7.2 EVA-Auswertung zum Projektende erstellen
7.3 Zielerreichung bewerten
7.4 Abweichungen und Ursachen dokumentieren
7.5 Lessons-Learned-Workshop durchführen
7.6 Abschlussdokumentation erstellen
7.7 Projektabnahme durchführen
7.8 Projekt formal schließen
```

## Beispiel-User-Story

```markdown
# User Story: Projektabschluss und Evaluation durchführen

## Status
Proposed

## User Story
Als Projektleiter möchte ich das Projekt nach Abschluss strukturiert evaluieren, damit Zielerreichung, Kosten, Termine, Qualität, Risiken und Lessons Learned nachvollziehbar dokumentiert werden.

## Akzeptanzkriterien
- [ ] Projektziele werden gegen erreichte Ergebnisse geprüft.
- [ ] Terminabweichungen werden dokumentiert.
- [ ] Kostenabweichungen werden dokumentiert.
- [ ] Qualitätsabweichungen werden dokumentiert.
- [ ] Risiken und eingetretene Probleme werden ausgewertet.
- [ ] Changes und deren Auswirkungen werden bewertet.
- [ ] Lessons Learned werden dokumentiert.
- [ ] Abschlussabnahme ist dokumentiert.

## Nicht-Akzeptanzkriterien
- [ ] Ein reines Abnahmeprotokoll ohne Projektbewertung gilt nicht als vollständige Evaluation.
- [ ] Abweichungen dürfen nicht ohne Ursachenanalyse dokumentiert werden.

## Definition of Ready
- [ ] Projekt ist fachlich abgeschlossen.
- [ ] Relevante Controllingdaten liegen vor.
- [ ] Abnahmekriterien sind bekannt.

## Definition of Done
- [ ] Abschlussbericht ist erstellt.
- [ ] Projektbewertung ist abgeschlossen.
- [ ] Lessons Learned sind dokumentiert.
- [ ] Projekt ist formal geschlossen.
```

---

# 5. Projektcontrolling als durchgängiger Steuerungsprozess

Projektcontrolling sollte nicht erst am Ende stattfinden, sondern über das gesamte Projekt hinweg regelmäßig durchgeführt werden.

## Regelkreis des Projektcontrollings

```text
1. Ist-Situation erheben
2. Soll-Ist-Vergleich durchführen
3. Abweichungsursachen ermitteln
4. Steuerungsmaßnahmen ergreifen
```

## Typische Controlling-Fragen

- Wie weit ist das Projekt wirklich?
- Halten wir den geplanten Fertigstellungstermin?
- Bleiben die Kosten im Rahmen?
- Welche Arbeitspakete sind kritisch?
- Welche Meilensteine verschieben sich?
- Wo gibt es Qualitätsprobleme?
- Welche Risiken sind neu entstanden?
- Welche Maßnahmen sind erforderlich?
- Muss ein Change Request erstellt werden?
- Muss der Lenkungskreis entscheiden?

## Controlling-Daten je Arbeitspaket

| Kennzahl / Information | Bedeutung |
|---|---|
| Geleistete Stunden | Bisher tatsächlich angefallener Aufwand |
| Restlicher Stundenaufwand | Erwarteter Aufwand bis Fertigstellung |
| Verbrauchte Sachmittel | Bereits angefallene Sachkosten |
| Restlicher Sachmittelaufwand | Erwartete Restkosten |
| Fertigstellungsgrad | Fortschritt des Arbeitspakets |
| Erwarteter Endtermin | Prognose für Abschluss |
| Probleme / Risiken | Aktuelle oder erwartete Hindernisse |

---

# 6. Fertigstellungsgrad als zentrale Steuerungsgröße

Der Fertigstellungsgrad ist entscheidend, weil er die Brücke zwischen Projektfortschritt, Kostencontrolling und Earned Value Analyse bildet.

## Mögliche Methoden zur Ermittlung des Fertigstellungsgrads

| Methode | Beschreibung | Einsatzbereich |
|---|---|---|
| Subjektive Einschätzung | Verantwortlicher schätzt Fortschritt | Einfach, aber risikobehaftet |
| Aufwand + Restaufwand | FGR aus bisherigem Aufwand und geschätztem Restaufwand | Praxistauglicher als reine Einschätzung |
| Zwischenresultate | Fortschritt wird an definierte Ergebnisse gekoppelt | Gut für klare Lieferobjekte |
| 0/100-Regel | Erst bei Fertigstellung 100 % | Geeignet für kleine Arbeitspakete |
| 50/50-Regel | 50 % bei Start, 100 % bei Abschluss | Einfach, aber ggf. zu optimistisch |
| 20/80- oder 0/20/100-Regel | Fortschritt über feste Stufen | Geeignet für Software- oder Umsetzungsprojekte |

## Empfehlung für eine Projektplattform

[Schlussfolgerung] Für eine digitale Projektplattform sollte der Fertigstellungsgrad nicht frei und unkontrolliert gepflegt werden. Sinnvoll ist eine auswählbare Fortschrittsmethode je Arbeitspakettyp.

Beispiel:

```text
Arbeitspakettyp: Konzept
FGR-Methode: Zwischenresultate
- 20 % Rohstruktur erstellt
- 50 % Inhalte vollständig
- 80 % Review durchgeführt
- 100 % Abnahme erfolgt

Arbeitspakettyp: Umsetzung
FGR-Methode: 0/20/100
- 0 % nicht begonnen
- 20 % begonnen
- 100 % abgeschlossen und geprüft
```

---

# 7. Earned Value Analyse als Projekt-Evaluierung

## Ziel der Earned Value Analyse

Die Earned Value Analyse verbindet Kosten, Zeit und Fortschritt miteinander. Dadurch wird sichtbar, ob ein Projekt nicht nur Geld verbraucht, sondern auch den geplanten Wert erzeugt.

## Zentrale Begriffe

| Abkürzung | Begriff | Bedeutung |
|---|---|---|
| BAC | Budget at Completion | Geplantes Gesamtbudget des Projekts |
| PV | Planned Value | Geplanter Wert zum Stichtag |
| AC | Actual Cost | Tatsächliche Ist-Kosten zum Stichtag |
| PC / FGR | Percent Complete / Fertigstellungsgrad | Fortschritt zum Stichtag |
| EV | Earned Value | Wert der tatsächlich fertiggestellten Arbeit |
| CV | Cost Variance | Kostenabweichung |
| SV | Schedule Variance | Terminplanabweichung |
| CPI | Cost Performance Index | Kosteneffizienz |
| SPI | Schedule Performance Index | Termineffizienz |
| EAC | Estimate at Completion | Erwartete Gesamtkosten bei Fertigstellung |
| ETC | Estimate to Complete | Erwartete Restkosten |
| VAC | Variance at Completion | Erwartete Budgetabweichung am Projektende |

## Formeln

```text
EV  = PC × BAC
CV  = EV - AC
SV  = EV - PV
CPI = EV / AC
SPI = EV / PV
EAC = BAC / CPI
ETC = EAC - AC
VAC = BAC - EAC
```

## Interpretation

| Kennzahl | Interpretation |
|---|---|
| EV = PV | Projekt liegt im Zeitplan |
| EV < PV | Projekt liegt hinter dem Zeitplan |
| EV > PV | Projekt ist schneller als geplant |
| EV = AC | Projekt kostet wie geplant |
| EV < AC | Projekt kostet mehr als geplant |
| EV > AC | Projekt kostet weniger als geplant |
| CPI < 1 | Kostenproblem / Projekt wird teurer |
| CPI > 1 | Kostenvorteil / Projekt ist günstiger |
| SPI < 1 | Terminverzug |
| SPI > 1 | Projekt ist schneller als geplant |

---

# 8. User Story: Earned Value Analyse zur Projektbewertung

```markdown
# User Story: Earned Value Analyse zur Projektbewertung durchführen

## Status
Proposed

## User Story
Als Projektleiter möchte ich auf Basis von Projektbaseline, Ist-Kosten und Fertigstellungsgrad eine Earned Value Analyse durchführen, damit ich den Projektstatus objektiv nach Kosten, Termin und Prognose bewerten kann.

## Fachlicher Nutzen
Die Projektbewertung basiert nicht nur auf Bauchgefühl oder verbrauchtem Budget, sondern auf dem Verhältnis von geplantem Wert, tatsächlichem Aufwand und tatsächlich erreichtem Fortschritt.

## Akzeptanzkriterien
- [ ] Für jedes relevante Arbeitspaket sind BAC, PV, AC und PC/FGR zum Stichtag erfassbar.
- [ ] Der Earned Value wird je Arbeitspaket nach EV = PC × BAC berechnet.
- [ ] Kostenabweichung wird nach CV = EV - AC berechnet.
- [ ] Terminplanabweichung wird nach SV = EV - PV berechnet.
- [ ] CPI wird nach CPI = EV / AC berechnet.
- [ ] SPI wird nach SPI = EV / PV berechnet.
- [ ] EAC wird auf Projektebene nach EAC = BAC / CPI berechnet.
- [ ] ETC wird nach ETC = EAC - AC berechnet.
- [ ] VAC wird nach VAC = BAC - EAC berechnet.
- [ ] Projektstatus wird je Arbeitspaket und aggregiert auf Projektebene angezeigt.
- [ ] Abweichungen werden als „unter Budget / über Budget“ und „vor Termin / hinter Termin“ interpretierbar dargestellt.
- [ ] Fehlende oder unplausible Werte werden kenntlich gemacht und nicht stillschweigend verrechnet.

## Nicht-Akzeptanzkriterien
- [ ] Eine rein subjektive Fortschrittsmeldung ohne definierte FGR-Regel reicht nicht aus.
- [ ] EVA darf nicht nur auf Projektende angewendet werden, sondern muss auch stichtagsbezogen nutzbar sein.
- [ ] Manuelle Überschreibung berechneter Werte ohne Änderungsprotokoll ist nicht zulässig.
- [ ] Ein Projekt darf nicht als „grün“ bewertet werden, wenn CPI oder SPI kritisch sind und keine Begründung hinterlegt wurde.

## Definition of Ready
- [ ] Projektbaseline ist freigegeben.
- [ ] Arbeitspakete haben geplante Kosten und geplante Termine.
- [ ] Reporting-Stichtage sind definiert.
- [ ] Methode zur Ermittlung des Fertigstellungsgrads ist festgelegt.
- [ ] Quelle für Ist-Kosten ist definiert.
- [ ] Verantwortliche für Statusmeldungen sind benannt.

## Definition of Done
- [ ] EVA-Kennzahlen werden korrekt berechnet.
- [ ] Projekt-, Phasen- und Arbeitspaketebene sind auswertbar.
- [ ] Dashboard zeigt CPI, SPI, CV, SV, EAC, ETC und VAC.
- [ ] Statusbericht kann aus der Auswertung erzeugt werden.
- [ ] Testdaten aus dem Beispielmodell wurden erfolgreich geprüft.
- [ ] Berechnungslogik ist dokumentiert.
```

---

# 9. Weitere sinnvolle Epics und Stories aus den Dokumenten

| Epic | Story | Kurzbeschreibung |
|---|---|---|
| Projektinitialisierung | Projektauftrag erstellen | Projektziel, Scope, Budget, Rollen und Freigabe erfassen |
| Projektplanung | Projektstrukturplan erstellen | Phasen, Teilprojekte und Arbeitspakete strukturieren |
| Aufwand & Ressourcen | Aufwandsschätzung durchführen | Optimistisch, wahrscheinlich und pessimistisch erfassen |
| Terminplanung | Abhängigkeiten planen | Vorgänger, Start, Ende, Dauer und kritische Abhängigkeiten abbilden |
| Meilensteine | Meilensteinplan pflegen | Meilensteine mit Prüfkriterien und Status verwalten |
| Kostenplanung | Kosten- und Ressourcenplan erstellen | Personalkosten, Sachkosten, Rollen und Summen planen |
| Risikomanagement | Risikoregister pflegen | Risiken bewerten, Maßnahmen und Verantwortliche definieren |
| Qualitätsmanagement | Qualitätsplan erstellen | Qualitätsziele, Prüfmaßnahmen und Abweichungsmaßnahmen definieren |
| Berichtswesen | Reportingplan erstellen | Absender, Empfänger, Frequenz und Berichtsform festlegen |
| Controlling | Arbeitspaketstatus erfassen | FGR, Ist-Aufwand, Restaufwand, Probleme und Prognose erfassen |
| Controlling | Soll-Ist-Vergleich durchführen | Termine, Kosten und Fortschritt gegen Baseline prüfen |
| Controlling | Meilensteintrendanalyse erstellen | Verschiebungen von Meilensteinen über Stichtage verfolgen |
| Controlling | Kostenvergleich erstellen | Plan-, Ist- und Abweichungskosten auswerten |
| Controlling | EVA durchführen | Earned Value, CPI, SPI, EAC, ETC und VAC berechnen |
| Change Management | Änderungsantrag steuern | Änderung erfassen, Auswirkungen prüfen und Entscheidung dokumentieren |
| Abschluss | Projekt evaluieren | Zielerreichung, Kosten, Termine, Qualität und Lessons Learned bewerten |

---

# 10. Beispielhafte Struktur für Epics, Features und Stories

## Epic 1: Projektinitialisierung und Projektauftrag

```text
Epic: Projektinitialisierung und Projektauftrag
Ziel: Projekte strukturiert anlegen, prüfen und freigeben.

Features:
- Projektsteckbrief
- Projektauftrag
- Stakeholderübersicht
- Ziel- und Scope-Definition
- Initiale Risikoerfassung

Stories:
- Projektauftrag erstellen
- Projektziele erfassen
- Scope und Out-of-Scope dokumentieren
- Projektfreigabe dokumentieren
```

## Epic 2: Projektplanung und Baseline

```text
Epic: Projektplanung und Baseline
Ziel: Eine belastbare Planungsgrundlage für Termine, Kosten, Ressourcen und Controlling schaffen.

Features:
- Projektstrukturplan
- Arbeitspaketplanung
- Aufwandsschätzung
- Terminplanung
- Ressourcenplanung
- Kostenplanung
- Meilensteinplanung
- Baseline-Versionierung

Stories:
- Projektstrukturplan erstellen
- Arbeitspakete definieren
- Aufwandsschätzung durchführen
- Terminplan erstellen
- Kostenplan erstellen
- Baseline freigeben
```

## Epic 3: Projektcontrolling und Statusmanagement

```text
Epic: Projektcontrolling und Statusmanagement
Ziel: Projektfortschritt regelmäßig erfassen, bewerten und steuerbar machen.

Features:
- Arbeitspaketstatus
- Fertigstellungsgrad
- Soll-Ist-Vergleich
- Ampellogik
- Statusbericht
- Maßnahmenmanagement

Stories:
- Arbeitspaketstatus erfassen
- Fertigstellungsgrad berechnen
- Soll-Ist-Vergleich durchführen
- Abweichungen analysieren
- Steuerungsmaßnahmen dokumentieren
- Projektstatusbericht erstellen
```

## Epic 4: Earned Value Analyse und Projektbewertung

```text
Epic: Earned Value Analyse und Projektbewertung
Ziel: Projektstatus objektiv anhand von Wertschöpfung, Kosten und Terminstatus bewerten.

Features:
- EVA-Basisdaten
- EVA-Berechnung
- CPI/SPI-Auswertung
- EAC/ETC/VAC-Prognose
- EVA-Dashboard
- Projektabschlussbewertung

Stories:
- EVA-Basisdaten erfassen
- Earned Value berechnen
- CPI und SPI berechnen
- Projektforecast berechnen
- EVA-Dashboard anzeigen
- EVA im Projektabschlussbericht auswerten
```

## Epic 5: Risiko-, Qualitäts- und Änderungsmanagement

```text
Epic: Risiko-, Qualitäts- und Änderungsmanagement
Ziel: Risiken, Qualität und Änderungen während des Projekts kontrolliert steuern.

Features:
- Risikoregister
- Qualitätsplan
- Maßnahmenmanagement
- Change Requests
- Entscheidungsvorlagen

Stories:
- Risiko erfassen
- Risiko bewerten
- Maßnahme definieren
- Qualitätskriterium erfassen
- Änderungsantrag erstellen
- Auswirkungen eines Changes bewerten
```

## Epic 6: Projektabschluss und Lessons Learned

```text
Epic: Projektabschluss und Lessons Learned
Ziel: Projekt formal abschließen und Erkenntnisse für zukünftige Projekte sichern.

Features:
- Abschlussbericht
- Zielerreichungsbewertung
- EVA-Abschlussauswertung
- Lessons Learned
- Abnahmeprotokoll
- Archivierung

Stories:
- Abschlussbericht erstellen
- Zielerreichung bewerten
- Lessons Learned erfassen
- Projektabnahme dokumentieren
- Projekt archivieren
```

---

# 11. Datenmodell-Ansatz für eine digitale Projektplattform

## Zentrale Objekte

```text
Project
ProjectPhase
WorkPackage
Milestone
Resource
CostPlan
StatusReport
Risk
QualityCriterion
ChangeRequest
EarnedValueSnapshot
ProjectEvaluation
```

## Beispielhafte Beziehungen

```text
Project 1:n ProjectPhase
ProjectPhase 1:n WorkPackage
Project 1:n Milestone
WorkPackage 1:n StatusReport
WorkPackage 1:n Risk
WorkPackage 1:n CostPlan
Project 1:n EarnedValueSnapshot
Project 1:n ChangeRequest
Project 1:1 ProjectEvaluation
```

## Wichtige Felder je Arbeitspaket

| Feld | Bedeutung |
|---|---|
| WorkPackage ID | Eindeutige Kennung |
| Name | Bezeichnung |
| Phase | Zuordnung zur Projektphase |
| Verantwortlicher | AP-Verantwortlicher |
| Geplanter Start | Start gemäß Baseline |
| Geplantes Ende | Ende gemäß Baseline |
| Tatsächlicher Start | Ist-Start |
| Tatsächliches Ende | Ist-Ende |
| Geplanter Aufwand | Aufwand laut Planung |
| Ist-Aufwand | Tatsächlich verbrauchter Aufwand |
| Restaufwand | Erwarteter Restaufwand |
| BAC | Geplantes Budget des Arbeitspakets |
| PV | Geplanter Wert zum Stichtag |
| AC | Ist-Kosten zum Stichtag |
| FGR / PC | Fertigstellungsgrad |
| EV | Earned Value |
| Status | z. B. nicht begonnen, in Arbeit, fertig, blockiert |

---

# 12. Beispiel für einen monatlichen Projektstatusbericht

```markdown
# Projektstatusbericht

## 1. Kopfdaten

| Feld | Wert |
|---|---|
| Projektname | <Projektname> |
| Berichtsmonat | <Monat/Jahr> |
| Projektleiter | <Name> |
| Auftraggeber | <Name> |
| Statusdatum | <Datum> |

## 2. Gesamtstatus

| Dimension | Status | Kommentar |
|---|---|---|
| Termine | Grün / Gelb / Rot | <Kommentar> |
| Kosten | Grün / Gelb / Rot | <Kommentar> |
| Qualität | Grün / Gelb / Rot | <Kommentar> |
| Ressourcen | Grün / Gelb / Rot | <Kommentar> |
| Risiken | Grün / Gelb / Rot | <Kommentar> |
| Gesamt | Grün / Gelb / Rot | <Kommentar> |

## 3. Fortschritt

| Phase | Geplanter Fortschritt | Ist-Fortschritt | Abweichung |
|---|---:|---:|---:|
| Phase 1 | 100 % | 100 % | 0 % |
| Phase 2 | 80 % | 65 % | -15 % |
| Phase 3 | 40 % | 25 % | -15 % |

## 4. Kostenstatus

| Kennzahl | Wert |
|---|---:|
| BAC | <Wert> |
| PV | <Wert> |
| AC | <Wert> |
| EV | <Wert> |
| CV | <Wert> |
| CPI | <Wert> |

## 5. Terminstatus

| Kennzahl | Wert |
|---|---:|
| PV | <Wert> |
| EV | <Wert> |
| SV | <Wert> |
| SPI | <Wert> |

## 6. Risiken und Probleme

| Risiko / Problem | Auswirkung | Maßnahme | Verantwortlich | Termin |
|---|---|---|---|---|
| <Risiko> | <Auswirkung> | <Maßnahme> | <Name> | <Datum> |

## 7. Entscheidungsbedarf

| Entscheidung | Auswirkung | Benötigt bis | Entscheider |
|---|---|---|---|
| <Entscheidung> | <Auswirkung> | <Datum> | <Name> |

## 8. Nächste Schritte

- [ ] <Nächster Schritt 1>
- [ ] <Nächster Schritt 2>
- [ ] <Nächster Schritt 3>
```

---

# 13. Steuerungslogik für Ampelbewertung

## Beispielhafte Ampellogik für CPI und SPI

| Kennzahl | Grün | Gelb | Rot |
|---|---:|---:|---:|
| CPI | 0,90 – 1,10 | 0,80 – 0,90 | < 0,80 |
| SPI | 0,90 – 1,10 | 0,80 – 0,90 | < 0,80 |

## Ergänzende Bewertungslogik

| Situation | Interpretation |
|---|---|
| CPI grün, SPI grün | Projekt liegt weitgehend im Plan |
| CPI rot, SPI grün | Kostenproblem bei akzeptablem Terminstatus |
| CPI grün, SPI rot | Terminproblem bei akzeptablem Kostenstatus |
| CPI rot, SPI rot | Kritischer Projektstatus mit Steuerungsbedarf |

---

# 14. Konkrete Ableitung für eine Projektplattform

## Benötigte Funktionsmodule

```text
1. Projektanlage
2. Projektauftrag
3. Projektstrukturplan
4. Arbeitspaketmanagement
5. Terminplanung
6. Ressourcenplanung
7. Kostenplanung
8. Meilensteinplanung
9. Risikomanagement
10. Qualitätsmanagement
11. Berichtswesen
12. Statusmeldung
13. Soll-Ist-Vergleich
14. Meilensteintrendanalyse
15. Kostenvergleich
16. Earned Value Analyse
17. Change Management
18. Projektabschluss
19. Lessons Learned
20. Projektarchiv
```

## MVP-Fokus

Für einen ersten MVP wäre folgende Reihenfolge sinnvoll:

```text
MVP 1: Projektauftrag + Projektstruktur + Arbeitspakete
MVP 2: Termin-, Ressourcen- und Kostenplanung
MVP 3: Statusmeldung + Fertigstellungsgrad
MVP 4: Soll-Ist-Vergleich + Statusbericht
MVP 5: Earned Value Analyse
MVP 6: Risiko, Qualität und Change Management
MVP 7: Projektabschluss und Evaluation
```

---

# 15. Zusammenfassung

Aus den vorhandenen Reitern und PM-Unterlagen lässt sich ein vollständiges Projektmodell für klassische Wasserfall- bzw. PMI-Projekte ableiten.

Die wichtigsten Bausteine sind:

- Projektauftrag,
- Projektstrukturplan,
- Arbeitspakete,
- Terminplanung,
- Ressourcenplanung,
- Kostenplanung,
- Meilensteinplanung,
- Risikomanagement,
- Qualitätsmanagement,
- Berichtswesen,
- Statusmanagement,
- Soll-Ist-Vergleich,
- Fertigstellungsgrad,
- Meilensteintrendanalyse,
- Kostenvergleich,
- Earned Value Analyse,
- Change Management,
- Projektabschluss und Evaluation.

Die Earned Value Analyse sollte als eigene Story bzw. eigenes Funktionsmodul aufgenommen werden, weil sie Projektfortschritt, Kostenstatus und Terminstatus miteinander verbindet und damit eine objektivere Projektbewertung ermöglicht.

Das Zielbild für eine digitale Projektplattform lautet daher:

```text
Projekt planen → Baseline freigeben → Status erfassen → Abweichungen bewerten → Maßnahmen steuern → Projekt evaluieren
```

Damit werden die vorhandenen Excel- und PM-Dokumente nicht nur als Vorlagen genutzt, sondern in eine digitale, skalierbare und steuerbare Projektlogik überführt.
