# Systembeschreibung: Erweitertes Stakeholdermanagement für die Projektmanagement-Plattform

## 1. Zweck des Moduls

Das Modul **Erweitertes Stakeholdermanagement** erweitert die klassische Stakeholderliste um eine strukturierte Betrachtung von Personen, Rollen, Organisationen, Managementebenen, Einflussbeziehungen, Konfliktpotenzialen, Kommunikationsbedarfen, Teamdynamiken und Führungssituationen.

Ziel ist es, Stakeholder nicht nur als Kontaktpersonen zu erfassen, sondern als aktive Einflussfaktoren im Projekt zu verstehen und systematisch steuerbar zu machen.

Das Modul soll in der Projektmanagement-Plattform ermöglichen:

- Stakeholder strukturiert zu erfassen,
- Stakeholder als natürliche Personen, juristische Personen, Organisationseinheiten oder Gruppen zu klassifizieren,
- Managementebenen und Entscheidungswege abzubilden,
- Einfluss, Interesse, Haltung, Konfliktpotenzial und Kommunikationsbedarf zu bewerten,
- Führungssituationen und Reifegrade von Beteiligten einzuschätzen,
- Stakeholdermaßnahmen als Arbeitspakete, Stories oder Tasks zu planen,
- Konflikte frühzeitig zu erkennen und strukturiert zu bearbeiten,
- Dashboard-Auswertungen für Management, Projektleitung und Teamsteuerung bereitzustellen.

---

## 2. Fachlicher Kontext

Stakeholdermanagement ist mehr als eine Liste von Ansprechpartnern. In komplexen Projekten wirken unterschiedliche Personen und Gruppen auf das Projekt ein:

- Auftraggeber,
- Geschäftsführung,
- Lenkungsausschuss,
- Betriebsrat,
- Projektleitung,
- Teilprojektleitung,
- Fachbereiche,
- Key User,
- operative Mitarbeitende,
- externe Dienstleister,
- Lieferanten,
- Kunden,
- Behörden,
- Gesellschaften oder Organisationen.

Diese Stakeholder können unterschiedliche Ziele, Befugnisse, Interessen, Widerstände, Kommunikationsbedürfnisse und Einflussmöglichkeiten haben.

Das System sollte daher Stakeholder nicht isoliert betrachten, sondern im Zusammenhang mit:

- Projektzielen,
- Arbeitspaketen,
- Epics und Stories,
- Entscheidungen,
- Risiken,
- Kommunikationsmaßnahmen,
- Eskalationswegen,
- Rollen und Verantwortlichkeiten,
- Konflikten,
- Teamphasen,
- Führungssituationen.

---

## 3. Stakeholder-Typen

### 3.1 Natürliche Person

Eine natürliche Person ist eine einzelne reale Person, die im Projekt eine Rolle einnimmt.

Beispiele:

- Projektleiter,
- Auftraggeber,
- Key User,
- Fachbereichsleitung,
- Betriebsratsmitglied,
- Entwickler,
- externer Berater,
- Lieferantenansprechpartner.

Mögliche Datenfelder:

| Feld | Beschreibung |
|---|---|
| Name | Name der Person |
| Organisation | Zugehöriges Unternehmen / Bereich |
| Rolle im Projekt | z. B. Auftraggeber, Entscheider, Nutzer, Betroffener |
| Managementebene | Top, oberes, mittleres, unteres Management, operative Ebene |
| Entscheidungsbefugnis | Keine, beratend, empfehlend, entscheidend |
| Einfluss | Niedrig, mittel, hoch |
| Interesse | Niedrig, mittel, hoch |
| Haltung | Unterstützend, neutral, kritisch, blockierend |
| Kommunikationsbedarf | Niedrig, normal, hoch, kritisch |
| Konfliktpotenzial | Niedrig, mittel, hoch |
| bevorzugter Kommunikationskanal | Meeting, E-Mail, Chat, Bericht, Dashboard |
| relevante Arbeitspakete | Verknüpfung zu APs, Stories oder Epics |
| Maßnahmen | geplante Stakeholdermaßnahmen |

---

### 3.2 Juristische Person

Eine juristische Person ist eine Organisation oder Gesellschaft, die selbst Träger von Rechten und Pflichten sein kann.

Beispiele:

- GmbH,
- AG,
- UG,
- Lieferantenunternehmen,
- Kunde,
- Behörde,
- externer Dienstleister.

Mögliche Datenfelder:

| Feld | Beschreibung |
|---|---|
| Name der Organisation | Name der juristischen Person |
| Rechtsform | GmbH, AG, UG, Behörde, Verein, etc. |
| Rolle im Projekt | Auftraggeber, Lieferant, Partner, Dienstleister, Regulator |
| Vertragsbezug | Vertrag, Rahmenvertrag, NDA, SLA, Bestellung |
| Ansprechpartner | Verknüpfte natürliche Personen |
| Haftungs-/Risikorelevanz | niedrig, mittel, hoch |
| Entscheidungsrelevanz | niedrig, mittel, hoch |
| Abhängigkeit | fachlich, technisch, organisatorisch, rechtlich |

---

### 3.3 Gruppe / Gremium

Gruppen und Gremien sind kollektive Stakeholder.

Beispiele:

- Lenkungsausschuss,
- Betriebsrat,
- Projektteam,
- Fachbereich,
- Key-User-Gruppe,
- Managementrunde,
- Lieferantenkreis.

Mögliche Datenfelder:

| Feld | Beschreibung |
|---|---|
| Gruppenname | Bezeichnung des Gremiums / der Gruppe |
| Gruppentyp | formal, informell, temporär, dauerhaft |
| Mitglieder | verknüpfte Personen |
| Zweck | Entscheidung, Beratung, Umsetzung, Kontrolle |
| Entscheidungsmodus | Einzelentscheidung, Mehrheitsentscheidung, Konsens |
| Eskalationsrolle | Keine, beratend, entscheidend, Schlichtung |
| Meetingfrequenz | wöchentlich, zweiwöchentlich, monatlich, anlassbezogen |

---

## 4. Managementebenen und Entscheidungslogik

Das System sollte Managementebenen abbilden, weil Einfluss, Informationsbedarf und Kommunikationsform je Ebene unterschiedlich sind.

| Ebene | Typische Rolle | Fokus | Kommunikationsform |
|---|---|---|---|
| Top Management | Geschäftsführung, Vorstand | Strategie, Budget, Priorität, Unternehmenswirkung | Management Summary, Entscheidungsvorlage, Ampelstatus |
| Oberes Management | Bereichsleitung | Programm-/Portfolioebene, Zielerreichung, Ressourcen | Statusbericht, Steering, Eskalationen |
| Mittleres Management | Abteilungsleitung, Projektauftraggeber | operative Steuerung, Umsetzung, Zielkonflikte | Regeltermine, Maßnahmenlisten, Risikoübersicht |
| Unteres Management | Teamleitung, Teilprojektleitung | Aufgabenkoordination, Teamleistung, operative Konflikte | Jour fixe, Aufgabenboard, Fortschrittsbericht |
| Operative Ebene | Mitarbeitende, Key User, Entwickler | konkrete Umsetzung, Tests, Feedback, Akzeptanz | Workshops, Tickets, Schulung, Chat, Arbeitsanweisung |

### Top-down und Bottom-up

Das Modul sollte beide Richtungen unterstützen:

- **Top-down:** Ziele, Entscheidungen, Prioritäten und Rahmenbedingungen werden von oben nach unten kommuniziert.
- **Bottom-up:** Probleme, Risiken, Aufwände, Verbesserungsvorschläge und Konflikte werden von unten nach oben sichtbar gemacht.

Das Dashboard sollte zeigen, ob Informationen in beide Richtungen funktionieren.

---

## 5. Führung und Stakeholdersteuerung

Stakeholdermanagement überschneidet sich mit Führung, wenn Stakeholder aktiv in Umsetzung, Entscheidung oder Akzeptanz eingebunden werden müssen.

Das System sollte nicht nur speichern, **wer** Stakeholder ist, sondern auch, **wie** mit dieser Person oder Gruppe gearbeitet werden sollte.

### 5.1 Führungsgrundsätze als Systemlogik

Folgende Grundsätze können als Qualitätskriterien für Stakeholdermaßnahmen dienen:

| Grundsatz | Bedeutung im System |
|---|---|
| Prozessorientiert | Maßnahmen beziehen sich auf nachvollziehbare Projektprozesse |
| Fördern und Fordern | Beteiligte werden befähigt und gleichzeitig verbindlich eingebunden |
| Gleichbehandlung | Stakeholdergruppen werden transparent und konsistent behandelt |
| Lösungsorientierung | Konflikte und Widerstände werden auf Lösung statt Schuld fokussiert |
| Transparenz | Entscheidungen, Begründungen und Maßnahmen werden dokumentiert |
| Fehlerkultur | Fehler werden als Steuerungsinformation behandelt |
| Sachebene und Beziehungsebene | System berücksichtigt Inhalt und Beziehung/Emotion getrennt |

---

### 5.2 Reifegradmodell für Stakeholder

Für Stakeholder, die aktiv Aufgaben übernehmen oder Entscheidungen vorbereiten, sollte ein Reifegrad erfasst werden.

Der Reifegrad ergibt sich aus:

| Dimension | Beschreibung |
|---|---|
| Leistungsvermögen | Fachkompetenz, Methodenkompetenz, persönliche Kompetenz, soziale Kompetenz, Handlungskompetenz |
| Leistungsbereitschaft | Motivation, Verantwortung, Bezug zum Projektziel |
| Leistungsrahmen | Befugnisse, Mittel, Einsatzrahmen, Zeit, Ressourcen |

Beispielhafte Bewertung:

| Reifegrad | Beschreibung | Empfohlener Umgang |
|---|---|---|
| Niedrig | geringe Kompetenz und/oder geringe Bereitschaft | klare Vorgaben, enge Begleitung |
| Mäßig | einzelne Fähigkeiten vorhanden, aber unsicher | erklären, strukturieren, motivieren |
| Mittel | fachlich brauchbar, benötigt Orientierung | partizipativ einbinden |
| Hoch | kann und will Verantwortung übernehmen | delegieren, Entscheidungsspielraum geben |

---

## 6. Stakeholder-Bewertungsmatrixen

### 6.1 Einfluss-Interesse-Matrix

| Einfluss / Interesse | Niedriges Interesse | Mittleres Interesse | Hohes Interesse |
|---|---|---|---|
| Hoher Einfluss | aktiv beobachten | gezielt einbinden | eng managen |
| Mittlerer Einfluss | informieren | regelmäßig einbinden | aktiv beteiligen |
| Niedriger Einfluss | minimal informieren | informieren | befähigen / mitnehmen |

---

### 6.2 Haltung-Wirkung-Matrix

| Haltung / Wirkung | Niedrige Projektwirkung | Mittlere Projektwirkung | Hohe Projektwirkung |
|---|---|---|---|
| Unterstützend | als Multiplikator nutzen | aktiv einbinden | als Sponsor / Champion einsetzen |
| Neutral | informieren | aktivieren | gezielt überzeugen |
| Kritisch | beobachten | Ursachen analysieren | Maßnahmenplan erstellen |
| Blockierend | dokumentieren | eskalationsfähig machen | Management-Intervention prüfen |

---

### 6.3 Konfliktpotenzial-Matrix

| Konfliktpotenzial | Auslöser | Systemreaktion |
|---|---|---|
| Niedrig | normale Abstimmung | beobachten, dokumentieren |
| Mittel | wiederkehrende Missverständnisse, Rollenunklarheit | Klärungsgespräch, Maßnahmenplan |
| Hoch | Zielkonflikt, Machtkonflikt, Eskalation | Konfliktanalyse, Moderator, Eskalationspfad |
| Kritisch | Zusammenarbeit gefährdet Projektziel | Lenkungsausschuss / Managemententscheidung |

---

### 6.4 Management-Eskalationsmatrix

| Auslöser | Erste Ebene | Zweite Ebene | Dritte Ebene |
|---|---|---|---|
| operative Unklarheit | Teamleitung | Projektleitung | Teilprojektleitung |
| Ressourcenproblem | Teilprojektleitung | Projektleitung | Lenkungsausschuss |
| Zielkonflikt | Projektleitung | Auftraggeber | Steering / Geschäftsführung |
| Blockade durch Bereich | Projektleitung | Bereichsleitung | Top Management |
| rechtlich/organisatorisch kritischer Fall | Projektleitung | HR/Legal/BR | Geschäftsführung |

---

## 7. Teamdynamik im Stakeholdermanagement

Stakeholder sind nicht nur Einzelpersonen. Sie wirken in Gruppen. Daher sollte das System Teamphasen berücksichtigen.

| Teamphase | Beschreibung | Relevanz für Stakeholdermanagement |
|---|---|---|
| Forming | Orientierung, Rollenfindung | Erwartungsklärung, Zielbild, Rollenkommunikation |
| Storming | Konfliktphase | Konfliktanalyse, Moderation, Klärung von Zuständigkeiten |
| Norming | Regeln und Zusammenarbeit entstehen | Teamregeln, Kommunikationsstruktur, Arbeitsweise festlegen |
| Performing | produktive Arbeitsphase | Fortschritt messen, Verantwortung delegieren |
| Adjourning | Auflösung | Abschluss, Lessons Learned, Würdigung |
| Reforming | neue Zusammensetzung | Rollen und Kommunikationswege neu prüfen |

---

## 8. Persönlicher Wert und Stakeholdermotivation

Das Modul sollte berücksichtigen, dass Stakeholder nicht nur rational reagieren. Akzeptanz, Widerstand und Engagement entstehen häufig aus einer Kombination von fachlicher, emotionaler und sozialer Bewertung.

### 8.1 Wertdimensionen eines Stakeholders

| Dimension | Bedeutung im Projekt |
|---|---|
| Fachlicher Wert | Wissen, Erfahrung, Qualifikation, Entscheidungsbeitrag |
| Sozialer Wert | Netzwerk, Teamfähigkeit, Unterstützung anderer |
| Emotionaler Wert | Identifikation, Motivation, Vertrauen, Sicherheitsgefühl |
| Produktiver Wert | Beitrag zu Ergebnis, Qualität, Geschwindigkeit, Stabilität |
| Organisationswert | Bedeutung für Bereich, Struktur, Governance, Akzeptanz |

### 8.2 Zonenmodell für Stakeholderreaktionen

| Zone | Verhalten | Projektreaktion |
|---|---|---|
| Komfortzone | stabil, vertraut, wenig Veränderungsdruck | behutsam informieren, Nutzen erklären |
| Lernzone | offen für Entwicklung, aber unsicher | befähigen, trainieren, begleiten |
| Panikzone | Überforderung, Flucht, Starre oder Angriff | Druck reduzieren, Konfliktklärung, Eskalation vermeiden |

Das System sollte Warnsignale erfassen können, wenn Stakeholder durch Projektveränderungen aus der Lernzone in die Panikzone geraten.

---

## 9. KI-Dialog zur Stakeholdererfassung

Die KI sollte bei der Anlage oder Bewertung eines Stakeholders dialoggeführt vorgehen.

### 9.1 Basisfragen

```text
1. Handelt es sich um eine Person, Organisation, Gruppe oder ein Gremium?
2. Welche Rolle hat der Stakeholder im Projekt?
3. Ist der Stakeholder intern oder extern?
4. Welche Managementebene ist betroffen?
5. Welche Entscheidungskompetenz besitzt der Stakeholder?
6. Welche Arbeitspakete, Stories oder Epics sind betroffen?
7. Welche Ziele oder Interessen verfolgt der Stakeholder?
8. Welche Erwartungen hat der Stakeholder an das Projekt?
9. Welche Informationen benötigt der Stakeholder regelmäßig?
10. Über welchen Kanal soll der Stakeholder eingebunden werden?
```

### 9.2 Bewertungsfragen

```text
1. Wie hoch ist der Einfluss auf das Projekt?
2. Wie hoch ist das Interesse am Projekt?
3. Ist die Haltung unterstützend, neutral, kritisch oder blockierend?
4. Welche Risiken entstehen, wenn der Stakeholder nicht eingebunden wird?
5. Gibt es bekannte Zielkonflikte?
6. Gibt es frühere Konflikte oder sensible Themen?
7. Wie hoch ist die Veränderungsbereitschaft?
8. Wie hoch ist die fachliche Kompetenz zum Projektthema?
9. Wie hoch ist die Entscheidungs- oder Umsetzungsbefugnis?
10. Ist eine Eskalations- oder Kommunikationsmaßnahme notwendig?
```

### 9.3 Maßnahmenfragen

```text
1. Welche konkrete Maßnahme soll für diesen Stakeholder geplant werden?
2. Ist die Maßnahme Information, Beteiligung, Schulung, Entscheidung, Konfliktlösung oder Eskalation?
3. Wer ist verantwortlich?
4. Bis wann muss die Maßnahme erledigt sein?
5. Welches Ergebnis soll erreicht werden?
6. Woran wird erkannt, dass die Maßnahme erfolgreich war?
7. Muss die Maßnahme mit einem Arbeitspaket, einer Story oder einem Risiko verknüpft werden?
8. Soll eine Erinnerung oder automatische Wiedervorlage erstellt werden?
```

---

## 10. Umgang mit Stakeholdermaßnahmen als Arbeitspakete, Stories oder Epics

### 10.1 Epic-Ebene

Ein Epic beschreibt einen größeren Stakeholdermanagement-Bereich.

Beispiele:

```markdown
# Epic: Stakeholdermanagement für CRM-Einführung aufbauen

Ziel ist es, alle relevanten internen und externen Stakeholder zu erfassen, zu bewerten, gezielt einzubinden und Risiken aus Widerständen, Kommunikationslücken oder Entscheidungskonflikten frühzeitig sichtbar zu machen.
```

Weitere Epic-Beispiele:

- Stakeholderanalyse für SharePoint-Migration durchführen
- Kommunikations- und Akzeptanzmanagement aufbauen
- Lenkungsausschuss- und Entscheidungsstruktur etablieren
- Konfliktmanagement im Projektteam operationalisieren
- Key-User- und Fachbereichseinbindung strukturieren

---

### 10.2 Story-Ebene

Stories beschreiben konkrete nutzerorientierte Funktionen oder fachliche Anforderungen.

```markdown
# User Story: Stakeholder erfassen und bewerten

Als Projektleiter möchte ich Stakeholder strukturiert erfassen und nach Einfluss, Interesse, Haltung und Konfliktpotenzial bewerten, damit ich Kommunikations- und Steuerungsmaßnahmen gezielt planen kann.

## Akzeptanzkriterien
- [ ] Stakeholder können als Person, Organisation, Gruppe oder Gremium angelegt werden.
- [ ] Einfluss und Interesse können bewertet werden.
- [ ] Haltung kann als unterstützend, neutral, kritisch oder blockierend gepflegt werden.
- [ ] Stakeholder können mit Epics, Stories, Arbeitspaketen, Risiken und Entscheidungen verknüpft werden.
- [ ] Aus der Bewertung wird eine empfohlene Stakeholderstrategie vorgeschlagen.
- [ ] Änderungen an Bewertungen werden historisiert.
```

---

### 10.3 Arbeitspaket-Ebene

Arbeitspakete beschreiben konkrete umzusetzende Maßnahmen.

```markdown
# Arbeitspaket: Stakeholderinterviews durchführen

## Ziel
Relevante Erwartungen, Risiken, Interessen und Kommunikationsbedarfe der wichtigsten Stakeholder erfassen.

## Tätigkeiten
- Stakeholderliste vorbereiten
- Interviewleitfaden erstellen
- Interviews terminieren
- Interviews durchführen
- Ergebnisse auswerten
- Stakeholdermatrix aktualisieren

## Ergebnis
Aktualisierte Stakeholderanalyse mit Maßnahmenvorschlägen.

## Verantwortlich
Projektleitung

## Beteiligte
Fachbereich, Auftraggeber, Key User, Betriebsrat, IT, externe Partner

## Abnahmekriterium
Mindestens alle als kritisch oder hoch relevant markierten Stakeholder sind bewertet und mit einer Maßnahme versehen.
```

---

## 11. Beispiel: Erweitertes Stakeholdermanagement in einem CRM-Projekt

| Stakeholder | Typ | Rolle | Einfluss | Interesse | Haltung | Risiko | Maßnahme |
|---|---|---|---|---|---|---|---|
| Geschäftsführung | Gruppe | Sponsor / Entscheidung | Hoch | Hoch | Unterstützend | Prioritätswechsel | monatliches Management Summary |
| Vertriebsleitung | Person | Fachlicher Owner | Hoch | Hoch | Unterstützend | Scope-Erweiterung | wöchentlicher Review |
| Key User Vertrieb | Gruppe | Anwendervertretung | Mittel | Hoch | Neutral | geringe Akzeptanz | Workshops + Schulung |
| IT-Leitung | Person | technischer Owner | Hoch | Mittel | Kritisch | Integrationsrisiko | Architekturtermin |
| Betriebsrat | Gremium | Mitbestimmung / Schutzinteressen | Hoch | Mittel | Neutral | Verzögerung bei Beteiligung | frühzeitige Information und Abstimmung |
| Externer Implementierungspartner | Organisation | Umsetzungspartner | Mittel | Hoch | Unterstützend | Abhängigkeit von Lieferfähigkeit | Lieferantensteuerung |

---

## 12. Dashboard-Auswertungen

### 12.1 Stakeholder-Portfolio

| Kennzahl | Bedeutung |
|---|---|
| Anzahl Stakeholder gesamt | Gesamtzahl erfasster Stakeholder |
| Kritische Stakeholder | Stakeholder mit hoher Wirkung und kritischer/blockierender Haltung |
| Nicht bewertete Stakeholder | Stakeholder ohne vollständige Analyse |
| Offene Stakeholdermaßnahmen | Maßnahmen mit Status offen oder überfällig |
| Eskalationsfälle | Stakeholder mit aktiver Eskalation |
| Kommunikationsabdeckung | Anteil Stakeholder mit definiertem Kommunikationsplan |

---

### 12.2 Heatmap Einfluss / Haltung

| Haltung / Einfluss | Niedrig | Mittel | Hoch |
|---|---|---|---|
| Unterstützend | beobachten | einbinden | als Sponsor nutzen |
| Neutral | informieren | aktivieren | gezielt managen |
| Kritisch | beobachten | Maßnahmenplan | eng managen |
| Blockierend | dokumentieren | Eskalation prüfen | sofortige Intervention |

---

### 12.3 Konflikt-Dashboard

| Kennzahl | Beschreibung |
|---|---|
| Anzahl aktiver Konflikte | alle offenen Konfliktfälle |
| Konflikte nach Stufe | niedrig, mittel, hoch, kritisch |
| Konflikte nach Ursache | Ziel, Rolle, Ressource, Beziehung, Kommunikation |
| Konflikte mit Managementbedarf | Fälle, die Eskalation erfordern |
| durchschnittliche Lösungszeit | Zeit von Erfassung bis Klärung |
| Wiederkehrende Konfliktmuster | Häufungen bei Personen, Gruppen oder Themen |

---

### 12.4 Reifegrad- und Führungsdashboard

| Kennzahl | Beschreibung |
|---|---|
| Stakeholder mit niedrigem Reifegrad | benötigen enge Begleitung |
| Stakeholder in Lernzone | geeignet für Schulung und Befähigung |
| Stakeholder in Panikzone | Risiko für Widerstand oder Blockade |
| Delegierbare Stakeholder | hoher Reifegrad, hohe Bereitschaft |
| Führungsmaßnahmen offen | Coaching, Schulung, Klärung, Entscheidung |

---

## 13. Datenmodell für die Software

### 13.1 Entity: Stakeholder

```json
{
  "id": "stakeholder_001",
  "project_id": "project_001",
  "type": "person | organisation | group | committee",
  "name": "Vertriebsleitung",
  "role": "Fachlicher Owner",
  "internal_external": "internal",
  "management_level": "middle_management",
  "decision_authority": "high",
  "influence": "high",
  "interest": "high",
  "attitude": "supportive",
  "conflict_potential": "medium",
  "communication_need": "high",
  "preferred_channel": "Steering Meeting",
  "linked_epics": [],
  "linked_work_packages": [],
  "linked_risks": [],
  "owner": "Projektleiter",
  "status": "active"
}
```

### 13.2 Entity: StakeholderMeasure

```json
{
  "id": "measure_001",
  "stakeholder_id": "stakeholder_001",
  "project_id": "project_001",
  "type": "information | involvement | decision | training | conflict_resolution | escalation",
  "title": "Stakeholderinterview durchführen",
  "description": "Erwartungen und Risiken der Vertriebsleitung aufnehmen",
  "responsible": "Projektleitung",
  "due_date": "2026-06-15",
  "status": "open",
  "success_criteria": "Erwartungen dokumentiert und Maßnahmen abgeleitet",
  "linked_story": "story_123"
}
```

### 13.3 Entity: ConflictCase

```json
{
  "id": "conflict_001",
  "project_id": "project_001",
  "stakeholders": ["stakeholder_001", "stakeholder_002"],
  "conflict_type": "goal_conflict | role_conflict | resource_conflict | relationship_conflict | communication_conflict",
  "severity": "medium",
  "description": "Unklare Priorität zwischen Vertrieb und IT",
  "impact": "Terminverzug bei Schnittstellenentscheidung",
  "resolution_strategy": "moderated_clarification",
  "status": "in_progress",
  "owner": "Projektleitung"
}
```

---

## 14. Automatisierungen

Das System sollte folgende Automatisierungen ermöglichen:

| Auslöser | Automatische Aktion |
|---|---|
| Stakeholder mit hohem Einfluss und kritischer Haltung wird angelegt | Maßnahmenvorschlag erzeugen |
| Stakeholdermaßnahme ist überfällig | Erinnerung an Verantwortlichen senden |
| Konfliktpotenzial steigt auf hoch | Eskalationsvorschlag erzeugen |
| Stakeholder ohne Kommunikationsplan | KI fragt Kommunikationsbedarf ab |
| Entscheidung hängt an Stakeholder | Entscheidung im Dashboard hervorheben |
| Projektphase wechselt | Stakeholderbewertung zur Aktualisierung vorschlagen |
| Arbeitspaket verzögert sich durch Stakeholderabhängigkeit | Risiko oder Blocker vorschlagen |

---

## 15. Rechtliche und organisatorische Leitplanken

Das Modul darf keine automatisierten Personalentscheidungen treffen. Bewertungen zu Reifegrad, Haltung, Konfliktpotenzial oder Kommunikationsbedarf dienen der Projektsteuerung und müssen durch berechtigte Personen überprüft werden.

Wichtige Leitplanken:

- nur projektbezogene Informationen erfassen,
- keine unnötigen persönlichen oder sensiblen Daten speichern,
- Bewertungslogik transparent machen,
- Änderungen historisieren,
- Zugriffe rollenbasiert beschränken,
- Betriebsrat/HR/Legal einbinden, wenn Mitarbeiterdaten, Leistungsbewertungen oder mitbestimmungspflichtige Themen betroffen sind,
- keine diskriminierenden Merkmale zur Bewertung verwenden,
- KI-Vorschläge immer als Vorschläge kennzeichnen und nicht automatisch als Entscheidung verwenden.

---

## 16. Definition of Ready für Stakeholder-Stories

Eine Stakeholder-Story ist bereit für die Umsetzung, wenn:

- [ ] Ziel und Nutzen der Story klar sind.
- [ ] betroffene Stakeholdergruppen benannt sind.
- [ ] Datenschutz- und Berechtigungskontext geprüft ist.
- [ ] Bewertungsdimensionen definiert sind.
- [ ] Akzeptanzkriterien messbar formuliert sind.
- [ ] Abhängigkeiten zu Kommunikation, Risiko, Ressourcen oder Projektstruktur benannt sind.
- [ ] KI-Dialogfragen definiert sind.

---

## 17. Definition of Done für Stakeholder-Stories

Eine Stakeholder-Story ist abgeschlossen, wenn:

- [ ] Stakeholder erfasst und klassifizierbar sind.
- [ ] Matrixauswertungen funktionieren.
- [ ] Maßnahmen erstellt und verfolgt werden können.
- [ ] Verknüpfung zu Epics, Stories, Arbeitspaketen, Risiken und Entscheidungen funktioniert.
- [ ] Dashboard-Kennzahlen aktualisiert werden.
- [ ] Berechtigungen geprüft wurden.
- [ ] Änderungen auditierbar sind.
- [ ] KI-Vorschläge nachvollziehbar dokumentiert werden.

---

## 18. Beispiel-User-Story für die Plattform

```markdown
# User Story: Erweitertes Stakeholderprofil erstellen

## User Story
Als Projektleiter möchte ich für jeden Stakeholder ein erweitertes Profil mit Rolle, Einfluss, Interesse, Haltung, Reifegrad, Kommunikationsbedarf und Konfliktpotenzial erfassen, damit ich Stakeholdermaßnahmen gezielt planen und Risiken frühzeitig erkennen kann.

## Akzeptanzkriterien
- [ ] Stakeholder können als Person, Organisation, Gruppe oder Gremium angelegt werden.
- [ ] Managementebene und Rolle können gepflegt werden.
- [ ] Einfluss, Interesse, Haltung und Konfliktpotenzial können bewertet werden.
- [ ] Reifegrad und Kommunikationsbedarf können optional erfasst werden.
- [ ] Die KI schlägt auf Basis der Bewertung eine Stakeholderstrategie vor.
- [ ] Stakeholder können mit Arbeitspaketen, Stories, Epics, Risiken und Entscheidungen verknüpft werden.
- [ ] Kritische Stakeholder erscheinen automatisch im Dashboard.
- [ ] Änderungen werden im Audit-Log dokumentiert.

## Nicht-Akzeptanzkriterien
- [ ] Das System trifft keine automatisierten Personalentscheidungen.
- [ ] Sensible personenbezogene Daten werden nicht ohne Zweckbezug gespeichert.
- [ ] KI-Bewertungen werden nicht als objektive Wahrheit dargestellt.

## Definition of Done
- [ ] Datenmodell ist umgesetzt.
- [ ] Dialoggeführte Stakeholderanlage ist verfügbar.
- [ ] Matrixauswertung ist im Dashboard sichtbar.
- [ ] Berechtigungsprüfung ist aktiv.
- [ ] Testfälle für kritische Stakeholderkonstellationen sind vorhanden.
```

---

## 19. Einordnung in die Gesamtplattform

Das erweiterte Stakeholdermanagement sollte mit folgenden Modulen verbunden sein:

| Modul | Verbindung |
|---|---|
| Projektstruktur / PSP | Stakeholder werden Arbeitspaketen und Teilprojekten zugeordnet |
| Ressourcenplanung | Stakeholder können Ressourcen, Entscheider oder Engpass sein |
| Kommunikationsplanung | Stakeholder erhalten Kommunikationsmaßnahmen |
| Risikomanagement | Stakeholderrisiken werden als Projektrisiken geführt |
| Konfliktmanagement | Konflikte werden mit Stakeholdern verknüpft |
| Entscheidungsmanagement | Entscheidungen werden Stakeholdern und Gremien zugeordnet |
| Dashboard | Heatmaps, Konflikte, Eskalationen, Maßnahmenstatus |
| Projektabschluss | Lessons Learned zu Stakeholdern und Zusammenarbeit sichern |

---

## 20. Kurzfazit

Das erweiterte Stakeholdermanagement macht sichtbar, **wer** das Projekt beeinflusst, **wie stark** der Einfluss ist, **welche Haltung** besteht, **welche Kommunikation** erforderlich ist und **welche Maßnahmen** zur Steuerung nötig sind.

Damit wird Stakeholdermanagement zu einem aktiven Steuerungsinstrument für:

- Akzeptanz,
- Kommunikation,
- Führung,
- Konfliktlösung,
- Risikoerkennung,
- Entscheidungsfähigkeit,
- Umsetzungssicherheit.
