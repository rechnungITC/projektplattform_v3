# Systembeschreibung: Stakeholdermanagement für die Projektmanagement-Plattform

## 1. Zweck des Moduls

Das Modul **Stakeholdermanagement** unterstützt die systematische Erfassung, Analyse, Planung, Steuerung und Auswertung aller Personen, Rollen, Gruppen und Organisationseinheiten, die ein Projekt beeinflussen oder vom Projekt betroffen sind.

Das Modul soll insbesondere in klassischen Wasserfall-/PMI-orientierten Projekten eingesetzt werden, kann aber später auch für hybride oder agile Projektformen erweitert werden.

Ziel ist, dass die Software nicht nur Stakeholder als Kontaktliste verwaltet, sondern aktiv dabei hilft,

- relevante Stakeholder frühzeitig zu identifizieren,
- Rollen, Interessen, Erwartungen und Einfluss zu erfassen,
- Kommunikations- und Beteiligungsmaßnahmen abzuleiten,
- Entscheidungs- und Freigabewege sichtbar zu machen,
- Risiken durch Widerstände, fehlende Einbindung oder unklare Verantwortlichkeiten zu reduzieren,
- Stakeholderinformationen mit Projektstruktur, Arbeitspaketen, Ressourcenplanung, Kommunikation, Risiken und Abschlussauswertung zu verbinden.

---

## 2. Fachliche Einordnung

Stakeholdermanagement ist ein verbindendes Querschnittsmodul innerhalb der Projektplattform.

Es steht in Beziehung zu:

- Projektauftrag
- Projektorganisation
- Projektstrukturplan
- Arbeitspaketen
- Ressourcenplanung
- Kommunikationsplanung
- Risikomanagement
- Change-Management
- Freigabe- und Entscheidungsprozessen
- Berichtswesen
- Projektabschluss und Lessons Learned

Das Modul berücksichtigt, dass Projektarbeit immer in einer bestehenden Organisation stattfindet. Dort wirken verschiedene Rollen, Verantwortlichkeiten, Befugnisse, Interessen und Einflussfaktoren auf das Projekt ein.

---

## 3. Grundprinzipien

### 3.1 Stakeholder sind mehr als Kontakte

Ein Stakeholder ist nicht nur eine Person mit Name und E-Mail-Adresse, sondern besitzt projektrelevante Eigenschaften wie:

- Rolle im Projekt
- Rolle in der Organisation
- Entscheidungsbefugnis
- Informationsbedarf
- Interessenlage
- Einfluss auf Projekterfolg
- Betroffenheit durch Projektergebnisse
- Haltung zum Projekt
- Kommunikationspräferenz
- Eskalationsrelevanz
- fachliche oder technische Kompetenz
- mögliche Risiken oder Widerstände

---

### 3.2 Stakeholdermanagement muss dialoggeführt sein

Die KI soll den Projektleiter bei der Erstellung des Stakeholdermanagements durch gezielte Fragen unterstützen.

Der Projektleiter muss nicht von Anfang an wissen, welche Matrix oder welches PM-Instrument benötigt wird. Die Software soll die notwendigen Informationen schrittweise abfragen und daraus passende Auswertungen erzeugen.

---

### 3.3 Stakeholdermanagement ist dynamisch

Stakeholderdaten dürfen nicht nur einmal zu Projektbeginn erfasst werden.

Die Plattform soll ermöglichen, dass Stakeholder im Projektverlauf neu bewertet werden können, insbesondere bei:

- neuen Anforderungen
- Änderungen im Projektumfang
- Organisationsänderungen
- Eskalationen
- Ressourcenengpässen
- Wechsel von Ansprechpartnern
- Freigaben
- Abnahmen
- Projektabschluss

---

## 4. Stakeholdertypen im System

Die Software soll Stakeholder nach Typen klassifizieren können.

| Stakeholdertyp | Beschreibung | Typische Beispiele |
|---|---|---|
| Auftraggeber | trägt den Projektauftrag oder finanziert das Projekt | Kunde, Sponsor, Geschäftsführung |
| Entscheider | trifft verbindliche Projektentscheidungen | Lenkungsausschuss, PAG, Geschäftsleitung |
| Projektleitung | steuert das Projekt operativ | Projektleiter, Teilprojektleiter |
| Projektteam | arbeitet aktiv an Arbeitspaketen | Entwickler, Berater, Fachbereich, Tester |
| Fachbereich | liefert Anforderungen oder nutzt Ergebnisse | Anwender, Key User, Prozessverantwortliche |
| Linienorganisation | stellt Ressourcen bereit oder ist organisatorisch betroffen | Abteilungsleitung, Vorgesetzte |
| Personal / HR | unterstützt Stellen-, Ressourcen- und Kompetenzplanung | Personalabteilung, Recruiting, Personalentwicklung |
| Betriebsrat / Mitbestimmung | prüft und begleitet mitbestimmungsrelevante Themen | Betriebsrat, Arbeitnehmervertretung |
| Lieferanten | liefern Leistungen, Systeme oder Beratung | Softwareanbieter, Implementierungspartner |
| Kunden / externe Nutzer | sind vom Projektergebnis betroffen | Endkunden, Partner, Dienstleister |
| Kontrollinstanzen | prüfen Compliance, Qualität oder Sicherheit | Datenschutz, IT-Security, Revision, Audit |
| Multiplikatoren | beeinflussen Akzeptanz und Kommunikation | Key User, Change Agents, Team Leads |
| Kritische Stakeholder | können Projektfortschritt erheblich beeinflussen | Entscheider mit hoher Macht, skeptische Fachbereiche |

---

## 5. Stakeholder-Lebenszyklus

```text
Identifizieren
   ↓
Kategorisieren
   ↓
Analysieren
   ↓
Bewerten
   ↓
Maßnahmen planen
   ↓
Kommunizieren und einbinden
   ↓
Überwachen
   ↓
Aktualisieren
   ↓
Lessons Learned sichern
```

---

## 6. KI-Dialog zur Erstellung des Stakeholdermanagements

Die KI soll den Projektleiter mit einem strukturierten Dialog durch die Stakeholdererfassung führen.

### 6.1 Startfragen

```text
1. Für welches Projekt soll das Stakeholdermanagement erstellt werden?
2. Welche Organisationseinheiten sind direkt vom Projekt betroffen?
3. Wer ist Auftraggeber oder Sponsor des Projekts?
4. Wer trifft verbindliche Entscheidungen?
5. Wer arbeitet operativ im Projekt mit?
6. Wer stellt Ressourcen bereit?
7. Wer nutzt das spätere Ergebnis?
8. Wer kann das Projekt blockieren oder verzögern?
9. Wer muss regelmäßig informiert werden?
10. Wer muss formell freigeben oder abnehmen?
```

---

### 6.2 Detailfragen je Stakeholder

Für jeden identifizierten Stakeholder fragt die KI:

```text
1. Wie heißt der Stakeholder?
2. Handelt es sich um eine Person, Rolle, Gruppe oder Organisationseinheit?
3. Welche Funktion hat der Stakeholder im Projekt?
4. Welche Funktion hat der Stakeholder in der Linienorganisation?
5. Welche Ziele verfolgt der Stakeholder im Projekt?
6. Welche Erwartungen hat der Stakeholder?
7. Welche Interessen oder Vorbehalte sind bekannt?
8. Wie stark ist der Stakeholder vom Projektergebnis betroffen?
9. Wie groß ist der Einfluss auf Entscheidungen, Budget oder Ressourcen?
10. Wie ist die aktuelle Haltung zum Projekt?
11. Wie soll die gewünschte Haltung zum Projekt sein?
12. Welche Informationen benötigt der Stakeholder?
13. In welcher Form soll er informiert werden?
14. In welchem Rhythmus soll er informiert werden?
15. Muss der Stakeholder etwas freigeben oder bestätigen?
16. Ist der Stakeholder mit einem Arbeitspaket, Risiko, Change oder Meilenstein verknüpft?
17. Gibt es Eskalations- oder Vertretungsregeln?
```

---

### 6.3 KI-Fragen zur Einbindung und Kommunikation

```text
1. Welche Stakeholder brauchen regelmäßige Statusinformationen?
2. Welche Stakeholder müssen aktiv in Workshops eingebunden werden?
3. Welche Stakeholder sollen nur bei Entscheidungen informiert werden?
4. Welche Stakeholder benötigen Management Summarys?
5. Welche Stakeholder benötigen operative Detailinformationen?
6. Welche Stakeholder benötigen technische Detailinformationen?
7. Welche Stakeholder sollten frühzeitig wegen Akzeptanzrisiken eingebunden werden?
8. Welche Stakeholder können als Multiplikatoren genutzt werden?
9. Welche Stakeholder müssen bei Änderungen automatisch benachrichtigt werden?
10. Welche Stakeholder müssen beim Projektabschluss eine Abnahme oder Bewertung abgeben?
```

---

## 7. Datenmodell für Stakeholdermanagement

### 7.1 Entität: Stakeholder

| Feld | Typ | Beschreibung | Pflichtfeld |
|---|---|---|---|
| Stakeholder-ID | Systemwert | Eindeutige ID | Ja |
| Projekt-ID | Referenz | Zugehöriges Projekt | Ja |
| Name | Text | Name der Person, Rolle oder Gruppe | Ja |
| Stakeholdertyp | Auswahl | z. B. Auftraggeber, Fachbereich, Betriebsrat | Ja |
| Organisationseinheit | Text / Referenz | Abteilung, Bereich, Firma | Nein |
| Rolle im Projekt | Auswahl / Text | Sponsor, Entscheider, Key User, Tester etc. | Ja |
| Rolle in der Organisation | Text | Linienrolle / Stellenbezeichnung | Nein |
| Kontaktkanal | Auswahl | Mail, Teams, Telefon, Portal, Meeting | Nein |
| E-Mail | Text | Kontaktadresse | Nein |
| Entscheidungsbefugnis | Auswahl | Keine, Empfehlung, Freigabe, Entscheidung | Ja |
| Einfluss | Skala 1-5 | Einfluss auf Projektverlauf | Ja |
| Betroffenheit | Skala 1-5 | Betroffenheit durch Projektergebnis | Ja |
| Interesse | Skala 1-5 | Interesse am Projekt | Ja |
| Haltung aktuell | Auswahl | Unterstützend, neutral, skeptisch, kritisch | Ja |
| Haltung Ziel | Auswahl | gewünschter Zielzustand | Nein |
| Informationsbedarf | Text | Welche Informationen werden benötigt? | Nein |
| Kommunikationsfrequenz | Auswahl | Ad hoc, wöchentlich, 14-täglich, monatlich, Meilenstein | Nein |
| Kommunikationsformat | Auswahl | Statusbericht, Meeting, Dashboard, Mail, Workshop | Nein |
| Risiken / Vorbehalte | Text / Referenz | mögliche Widerstände | Nein |
| Verknüpfte Arbeitspakete | Referenzliste | AP-Bezug | Nein |
| Verknüpfte Risiken | Referenzliste | Risikobezug | Nein |
| Verknüpfte Entscheidungen | Referenzliste | Entscheidungsbezug | Nein |
| Vertretung | Referenz | Stellvertretung | Nein |
| Status | Auswahl | aktiv, passiv, neu, ausgeschieden, ersetzt | Ja |
| Letzte Bewertung | Datum | Datum der letzten Aktualisierung | Ja |

---

### 7.2 Entität: Stakeholderbewertung

| Feld | Typ | Beschreibung |
|---|---|---|
| Bewertung-ID | Systemwert | Eindeutige Bewertung |
| Stakeholder-ID | Referenz | Zugehöriger Stakeholder |
| Bewertungsdatum | Datum | Stichtag der Bewertung |
| Einfluss | Skala 1-5 | aktueller Einfluss |
| Interesse | Skala 1-5 | aktuelles Interesse |
| Betroffenheit | Skala 1-5 | aktuelle Betroffenheit |
| Haltung | Auswahl | aktuelle Haltung |
| Risikoindikator | Auswahl | niedrig, mittel, hoch, kritisch |
| Begründung | Text | Warum wurde so bewertet? |
| Maßnahme | Text / Referenz | geplante Maßnahme |
| Verantwortlicher | Nutzer | Verantwortliche Person |
| Wiedervorlage | Datum | Nächste Prüfung |

---

### 7.3 Entität: Stakeholdermaßnahme

| Feld | Typ | Beschreibung |
|---|---|---|
| Maßnahme-ID | Systemwert | Eindeutige ID |
| Stakeholder-ID | Referenz | Zugehöriger Stakeholder |
| Maßnahmentyp | Auswahl | informieren, einbinden, überzeugen, eskalieren, schulen, freigeben lassen |
| Beschreibung | Text | Konkrete Maßnahme |
| Ziel | Text | Gewünschte Wirkung |
| Verantwortlicher | Nutzer | Wer führt die Maßnahme aus? |
| Fälligkeitsdatum | Datum | Bis wann umzusetzen? |
| Status | Auswahl | offen, in Arbeit, erledigt, zurückgestellt |
| Ergebnis | Text | Ergebnis der Maßnahme |
| Folgeaktion | Text | mögliche Folgeaktivität |

---

## 8. Bewertungslogik

### 8.1 Einfluss-Interesse-Matrix

| Einfluss | Interesse | Kategorie | Umgang |
|---|---|---|---|
| Hoch | Hoch | Eng managen | aktiv einbinden, regelmäßig abstimmen |
| Hoch | Niedrig | Zufrieden halten | gezielt informieren, nicht überlasten |
| Niedrig | Hoch | Informiert halten | regelmäßige Updates, Feedback ermöglichen |
| Niedrig | Niedrig | Beobachten | minimale Information, bei Veränderung neu bewerten |

---

### 8.2 Betroffenheit-Einfluss-Matrix

| Betroffenheit | Einfluss | Bedeutung | Maßnahme |
|---|---|---|---|
| Hoch | Hoch | kritischer Stakeholder | Stakeholderplan und aktive Betreuung erforderlich |
| Hoch | Niedrig | Akzeptanzrelevant | Kommunikation, Schulung, Feedbackkanäle |
| Niedrig | Hoch | Entscheidungstreiber | Management Summary, Entscheidungsvorlagen |
| Niedrig | Niedrig | Randstakeholder | passive Information ausreichend |

---

### 8.3 Haltungsmatrix

| Aktuelle Haltung | Zielhaltung | Handlungsbedarf |
|---|---|---|
| Unterstützend | Unterstützend halten | als Multiplikator nutzen |
| Neutral | Unterstützend | Nutzen und Auswirkungen erklären |
| Skeptisch | Neutral oder unterstützend | Vorbehalte aktiv klären |
| Kritisch | Neutral | Einzelgespräch, Eskalation oder Managementeinbindung |
| Blockierend | Entscheidungsfähig klären | Risiko erfassen, Maßnahmenplan erstellen |

---

## 9. Dashboard-Auswertungen

Das Modul soll Stakeholderinformationen für das Projekt-Dashboard auswertbar machen.

### 9.1 Stakeholderübersicht

| Kennzahl | Beschreibung |
|---|---|
| Anzahl Stakeholder gesamt | Alle Stakeholder im Projekt |
| Anzahl kritischer Stakeholder | Einfluss hoch und Haltung kritisch/skeptisch |
| Anzahl unterstützender Stakeholder | Haltung unterstützend |
| Anzahl Stakeholder mit offener Maßnahme | Maßnahmen noch nicht erledigt |
| Anzahl Stakeholder ohne Kommunikationsplan | Risiko für Informationslücken |
| Anzahl Stakeholder ohne aktuelle Bewertung | Bewertung älter als definierter Zeitraum |
| Anzahl Stakeholder mit Freigabeverantwortung | Entscheidungsträger / Abnehmer |
| Anzahl Stakeholder mit Eskalationsrelevanz | bei Risiken oder Changes einzubeziehen |

---

### 9.2 Stakeholder-Risikoampel

| Status | Bedingung | Bedeutung |
|---|---|---|
| Grün | keine kritischen Stakeholder, Bewertungen aktuell | Stakeholderlage stabil |
| Gelb | einzelne skeptische Stakeholder oder offene Maßnahmen | Beobachtung erforderlich |
| Rot | kritische Stakeholder mit hohem Einfluss und offener Maßnahme | aktives Management erforderlich |
| Grau | Bewertungen fehlen | keine belastbare Aussage möglich |

---

### 9.3 Engagement-Dashboard

| Stakeholder | Aktuelle Haltung | Zielhaltung | Maßnahme | Status | Fällig |
|---|---|---|---|---|---|
| Geschäftsführung | unterstützend | unterstützend halten | monatliches Management Summary | aktiv | monatlich |
| Fachbereich Vertrieb | skeptisch | neutral | Workshop zu Prozessauswirkungen | offen | 15.07. |
| Betriebsrat | neutral | unterstützend | frühzeitige Informationsrunde | geplant | 20.07. |
| IT-Admin | unterstützend | unterstützend halten | technische Einbindung | aktiv | wöchentlich |

---

## 10. Beispiel: Stakeholdermanagement für ein CRM-Projekt

### 10.1 Stakeholderregister

| ID | Stakeholder | Typ | Rolle | Einfluss | Betroffenheit | Haltung | Kommunikationsbedarf | Maßnahme |
|---|---|---|---|---:|---:|---|---|---|
| ST-001 | Geschäftsführung | Entscheider | Sponsor / Budgetfreigabe | 5 | 3 | unterstützend | Management Summary, Meilensteinstatus | monatliches Steering Update |
| ST-002 | Vertriebsleitung | Fachbereich | Prozessverantwortung Vertrieb | 5 | 5 | neutral | Prozessänderungen, Nutzen, Risiken | Workshop und Freigabe Soll-Prozess |
| ST-003 | Key User Vertrieb | Multiplikator | fachlicher Tester | 3 | 5 | unterstützend | Teststatus, Schulung, Feedback | aktive Einbindung in UAT |
| ST-004 | IT-Leitung | Kontrollinstanz | Systembetrieb / IT-Freigabe | 4 | 4 | unterstützend | Architektur, Security, Betrieb | technisches Review |
| ST-005 | Betriebsrat | Mitbestimmung | Prüfung mitbestimmungsrelevanter Themen | 4 | 3 | neutral | Auswirkungen auf Mitarbeitende | Informationsgespräch |
| ST-006 | Datenschutz | Kontrollinstanz | Prüfung personenbezogener Daten | 4 | 3 | skeptisch | Datenflüsse, Rollen, Berechtigungen | Datenschutzprüfung |
| ST-007 | Externer Anbieter | Lieferant | Softwarebereitstellung | 3 | 2 | unterstützend | Anforderungen, Termine, Vertrag | Lieferanten-Jour-fixe |
| ST-008 | Anwendergruppe Innendienst | Nutzergruppe | spätere Nutzung | 2 | 5 | skeptisch | Schulung, Nutzen, Prozessänderungen | Change- und Schulungsplan |

---

### 10.2 Stakeholdermatrix: Einfluss / Interesse

| Stakeholder | Einfluss | Interesse | Kategorie | Steuerungsansatz |
|---|---:|---:|---|---|
| Geschäftsführung | 5 | 4 | Eng managen | Management Summary und Entscheidungsvorlagen |
| Vertriebsleitung | 5 | 5 | Eng managen | Workshops, Freigaben, Prozessreviews |
| Key User Vertrieb | 3 | 5 | Informiert halten / einbinden | UAT, Feedback, Schulung |
| Betriebsrat | 4 | 3 | Zufrieden halten | frühzeitig informieren, Einwände klären |
| Datenschutz | 4 | 4 | Eng managen | Datenschutzreview und Abnahme |
| Anwendergruppe | 2 | 5 | Informiert halten | Kommunikation, Schulung, Feedback |

---

### 10.3 Kommunikationsplan aus Stakeholdermanagement

| Zielgruppe | Inhalt | Format | Frequenz | Verantwortlich |
|---|---|---|---|---|
| Geschäftsführung | Status, Budget, Risiken, Entscheidungen | Management Summary | monatlich / Meilenstein | Projektleiter |
| Lenkungsausschuss | Status, Changes, Eskalationen | Steering Meeting | 4-wöchentlich | Projektleiter |
| Projektteam | Aufgaben, Blocker, Termine | Jour fixe | wöchentlich | Projektleiter |
| Fachbereich | Anforderungen, Prozessänderungen, Tests | Workshop / Review | nach Phase | Business Analyst |
| Betriebsrat | Auswirkungen auf Mitarbeitende | Informationsgespräch | bei Bedarf / vor Rollout | Projektleiter / HR |
| Endanwender | Nutzen, Schulung, Go-Live-Informationen | Mail, Intranet, Training | vor Rollout | Change Manager |

---

## 11. Validierungsregeln im System

Die Software soll bei der Stakeholdererfassung folgende Regeln prüfen:

- Jeder Stakeholder benötigt einen Typ.
- Jeder kritische Stakeholder benötigt eine Maßnahme.
- Stakeholder mit hoher Entscheidungsbefugnis benötigen eine definierte Kommunikationsfrequenz.
- Stakeholder mit Freigabeverantwortung müssen mit mindestens einem Meilenstein, Arbeitspaket oder Entscheidungsobjekt verknüpft werden können.
- Stakeholder mit kritischer Haltung und hohem Einfluss müssen als Risiko vorgeschlagen werden.
- Jede Maßnahme benötigt einen Verantwortlichen und ein Fälligkeitsdatum.
- Bewertungen müssen versioniert werden, damit Veränderungen im Projektverlauf nachvollziehbar bleiben.
- Für Stakeholder mit Mitbestimmungs-, Datenschutz- oder Compliance-Bezug muss ein Prüf- oder Freigabeprozess hinterlegt werden können.

---

## 12. Automatisierungen

Das System kann auf Basis der Stakeholderdaten automatische Aktionen auslösen.

| Auslöser | Systemaktion |
|---|---|
| Neuer kritischer Stakeholder wird erfasst | Maßnahme und Wiedervorlage vorschlagen |
| Haltung ändert sich auf kritisch | Risikoanlage vorschlagen |
| Stakeholdermaßnahme ist überfällig | Erinnerung an Verantwortlichen |
| Meilensteinfreigabe steht an | Freigabeanfrage an relevante Stakeholder senden |
| Change Request betrifft Stakeholdergruppe | automatische Benachrichtigung vorschlagen |
| Kommunikationsplan fehlt | KI-Dialog zur Kommunikationsplanung starten |
| Projektabschluss beginnt | Abschlussfeedback und Lessons Learned bei Stakeholdern anfragen |

---

## 13. KI-Dialog: Beispielablauf

```text
KI: Wer ist Auftraggeber oder Sponsor des Projekts?
Nutzer: Die Geschäftsführung.

KI: Hat die Geschäftsführung Entscheidungsbefugnis über Budget, Scope oder Termine?
Nutzer: Ja, Budget und Scope.

KI: Wie hoch ist der Einfluss auf einer Skala von 1 bis 5?
Nutzer: 5.

KI: Wie stark ist die Geschäftsführung vom Projektergebnis betroffen?
Nutzer: 3.

KI: Welche Informationen benötigt die Geschäftsführung regelmäßig?
Nutzer: Projektstatus, Budget, Risiken und Entscheidungen.

KI: Soll daraus automatisch ein Kommunikationsplan-Eintrag erstellt werden?
Vorschlag:
- Format: Management Summary
- Frequenz: monatlich und zu Meilensteinen
- Verantwortlich: Projektleiter
- Inhalt: Status, Budget, Risiken, Entscheidungen
```

---

## 14. User Story für die Projektplattform

```markdown
# User Story: Stakeholdermanagement dialoggeführt erstellen und auswerten

## Status
Proposed

## User Story
Als Projektleiter möchte ich Stakeholder dialoggeführt erfassen, analysieren und bewerten können, damit ich Kommunikations-, Entscheidungs-, Risiko- und Beteiligungsmaßnahmen frühzeitig planen und im Projekt-Dashboard überwachen kann.

## Akzeptanzkriterien
- [ ] Stakeholder können als Person, Rolle, Gruppe oder Organisationseinheit erfasst werden.
- [ ] Jeder Stakeholder kann einem Typ, einer Projektrolle und einer Organisationseinheit zugeordnet werden.
- [ ] Einfluss, Interesse, Betroffenheit und Haltung können bewertet werden.
- [ ] Aus den Bewertungen wird automatisch eine Stakeholderkategorie abgeleitet.
- [ ] Für kritische Stakeholder schlägt das System Maßnahmen vor.
- [ ] Stakeholder können mit Arbeitspaketen, Risiken, Meilensteinen, Changes und Entscheidungen verknüpft werden.
- [ ] Das System kann aus Stakeholderdaten einen Kommunikationsplan vorschlagen.
- [ ] Stakeholderbewertungen werden historisiert.
- [ ] Das Dashboard zeigt kritische Stakeholder, offene Maßnahmen und fehlende Bewertungen an.
- [ ] KI-Dialoge unterstützen die vollständige Erfassung und Validierung.

## Nicht-Akzeptanzkriterien
- [ ] Eine reine Kontaktliste ohne Bewertung gilt nicht als Stakeholdermanagement.
- [ ] Kritische Stakeholder dürfen nicht ohne Maßnahme bleiben.
- [ ] Kommunikationsmaßnahmen dürfen nicht ohne Verantwortlichen erstellt werden.
- [ ] Freigaberelevante Stakeholder dürfen nicht ohne zugehörigen Entscheidungs- oder Meilensteinbezug geführt werden.

## Definition of Ready
- [ ] Stakeholdertypen sind definiert.
- [ ] Bewertungslogik für Einfluss, Interesse, Betroffenheit und Haltung ist abgestimmt.
- [ ] Kommunikationsformate sind definiert.
- [ ] Verknüpfungen zu Projektobjekten sind technisch vorgesehen.

## Definition of Done
- [ ] Stakeholder können vollständig erfasst werden.
- [ ] KI-Dialog erzeugt strukturierte Stakeholderdatensätze.
- [ ] Matrixauswertungen funktionieren.
- [ ] Dashboard-Kennzahlen werden angezeigt.
- [ ] Maßnahmen, Wiedervorlagen und Benachrichtigungen funktionieren.
- [ ] Historie und Audit-Log sind vorhanden.
```

---

## 15. Systemanforderungen

### Funktionale Anforderungen

- Stakeholderregister je Projekt
- Stakeholderklassifikation nach Typen
- Bewertung nach Einfluss, Interesse, Betroffenheit und Haltung
- Matrixauswertungen
- Maßnahmenplanung
- Wiedervorlagen
- Kommunikationsplan-Ableitung
- Verknüpfung mit Arbeitspaketen, Risiken, Meilensteinen und Changes
- Freigabe- und Eskalationslogik
- Dashboard-Auswertung
- Export für Projektbericht / Management Summary
- Lessons-Learned-Rückfluss am Projektende

### Nicht-funktionale Anforderungen

- Historisierung von Bewertungen
- Berechtigungssteuerung für sensible Stakeholderdaten
- Audit-Log für Änderungen
- Datenschutzkonforme Speicherung personenbezogener Informationen
- Rollenbasierte Sichtbarkeit
- Exportfähigkeit
- KI-Dialog mit nachvollziehbaren Vorschlägen

---

## 16. Verbindung zu anderen Modulen

| Modul | Verbindung |
|---|---|
| Projektauftrag | Sponsor, Auftraggeber, Zielgruppen |
| PSP / Arbeitspakete | Verantwortliche, Beteiligte, Betroffene |
| Ressourcenplanung | verfügbare Personen, Rollen, Kompetenzen |
| Kommunikationsplanung | Informationsbedarf, Frequenz, Format |
| Risikomanagement | kritische Stakeholder, Widerstände, Akzeptanzrisiken |
| Change-Management | betroffene Stakeholder bei Änderungen |
| Meilensteine | Freigabe- und Entscheidungsstakeholder |
| Berichtswesen | Empfänger, Verteiler, Reportingbedarf |
| Projektabschluss | Abnahme, Feedback, Lessons Learned |

---

## 17. Zusammenfassung

Das Stakeholdermanagement-Modul soll sicherstellen, dass alle relevanten Personen, Gruppen und Organisationseinheiten im Projekt systematisch erkannt, bewertet und eingebunden werden.

Die Software soll den Projektleiter durch einen KI-Dialog unterstützen und aus den Antworten automatisch Stakeholderregister, Matrixauswertungen, Kommunikationsmaßnahmen, Risiken, Freigabewege und Dashboard-Kennzahlen ableiten.

Damit wird Stakeholdermanagement nicht als statische Liste verstanden, sondern als aktives Steuerungsinstrument für Projektkommunikation, Akzeptanz, Entscheidungen, Ressourcen, Risiken und Projektabschluss.
