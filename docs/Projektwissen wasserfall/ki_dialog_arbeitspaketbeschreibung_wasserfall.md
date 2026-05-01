# KI-gestützte Arbeitspaketbeschreibung für Wasserfall-/PMI-Projekte

## 1. Ziel der Beschreibung

Diese Beschreibung definiert, wie eine KI bei der Erstellung von Arbeitspaketen in einem klassischen Wasserfall-/PMI-Projekt unterstützen soll.

Die KI soll die notwendigen Informationen nicht als freie Texteingabe erwarten, sondern strukturiert über einen Dialog abfragen. Ziel ist, dass jedes Arbeitspaket vollständig, prüfbar, planbar, steuerbar und später für Controlling, Soll-Ist-Vergleich, Ressourcenplanung, Kostenplanung, Freigabe und Projektabschlussbewertung nutzbar ist.

Die Arbeitspaketbeschreibung orientiert sich an einer klassischen Vorlage mit folgenden Kernbereichen:

- Verantwortlicher
- Arbeitspaket-Name
- Projektname
- Projektnummer
- Projektleiter
- Vertretung
- Teilprojekt
- Teilprojektleiter
- Tätigkeiten und Ziel
- geplante Ressourcen
- tatsächlich genutzte Ressourcen
- Ort und Datum
- Freigabe durch verantwortliche Person

Die bisherige manuelle Unterschrift wird in einer digitalen Anwendung durch einen systemgestützten Freigabeprozess ersetzt.

---

## 2. Grundprinzip für die KI-Abfrage

Die KI soll jedes Arbeitspaket dialoggeführt erstellen.

Dabei gilt:

1. Die KI fragt fehlende Informationen Schritt für Schritt ab.
2. Die KI prüft, ob die Angaben vollständig und widerspruchsfrei sind.
3. Die KI unterscheidet zwischen Pflichtangaben, optionalen Angaben und später nachpflegbaren Ist-Daten.
4. Die KI erzeugt aus den Antworten eine strukturierte Arbeitspaketbeschreibung.
5. Die KI erkennt offene Punkte und markiert diese sichtbar.
6. Die KI bereitet die Arbeitspaketbeschreibung für eine digitale Freigabe vor.
7. Die KI darf fehlende Informationen nicht stillschweigend erfinden.

---

## 3. Pflichtinformationen für ein Arbeitspaket

### 3.1 Kopfdaten

| Feld | Beschreibung | Pflichtfeld | KI-Abfrage |
|---|---|---:|---|
| Arbeitspaket-Name | Eindeutige Bezeichnung des Arbeitspakets | Ja | „Wie soll das Arbeitspaket heißen?“ |
| Projektname | Name des Gesamtprojekts | Ja | „Zu welchem Projekt gehört dieses Arbeitspaket?“ |
| Projektnummer | Interne oder externe Projektnummer | Ja, falls vorhanden | „Gibt es eine Projektnummer?“ |
| Verantwortlicher | Person, die fachlich oder organisatorisch verantwortlich ist | Ja | „Wer ist für dieses Arbeitspaket verantwortlich?“ |
| Projektleiter | Gesamtverantwortlicher Projektleiter | Ja | „Wer ist Projektleiter des Gesamtprojekts?“ |
| Vertretung | Stellvertretung bei Abwesenheit | Optional, empfohlen | „Wer vertritt den Verantwortlichen oder Projektleiter bei Abwesenheit?“ |
| Teilprojekt | Zugeordnetes Teilprojekt oder Projektphase | Optional, empfohlen | „Gehört das Arbeitspaket zu einem Teilprojekt oder einer Phase?“ |
| Teilprojektleiter | Verantwortliche Person für das Teilprojekt | Optional | „Wer leitet das Teilprojekt?“ |

---

### 3.2 Inhaltliche Beschreibung

| Feld | Beschreibung | Pflichtfeld | KI-Abfrage |
|---|---|---:|---|
| Ziel des Arbeitspakets | Was soll mit dem Arbeitspaket erreicht werden? | Ja | „Was ist das konkrete Ziel dieses Arbeitspakets?“ |
| Tätigkeiten | Welche Arbeiten sind durchzuführen? | Ja | „Welche konkreten Tätigkeiten müssen durchgeführt werden?“ |
| Ergebnis / Lieferobjekt | Was liegt nach Abschluss vor? | Ja | „Welches konkrete Ergebnis oder Lieferobjekt soll entstehen?“ |
| Abnahmekriterien | Woran erkennt man, dass das Arbeitspaket fertig ist? | Ja | „Wann gilt das Arbeitspaket als erfolgreich abgeschlossen?“ |
| Nicht-Ziele | Was gehört ausdrücklich nicht dazu? | Empfohlen | „Was ist ausdrücklich nicht Bestandteil dieses Arbeitspakets?“ |
| Abhängigkeiten | Welche Vorleistungen oder Folgearbeiten bestehen? | Empfohlen | „Von welchen anderen Arbeitspaketen, Entscheidungen oder Ergebnissen hängt dieses Arbeitspaket ab?“ |

---

## 4. Aufwand, Dauer und Ressourcen

### 4.1 Grundregel

Die KI muss Aufwand und Dauer getrennt abfragen.

Ein Arbeitspaket kann z. B. einen Aufwand von 3 Personentagen haben, aber je nach Anzahl und Verfügbarkeit der Personen unterschiedlich lange dauern:

- 3 Personentage mit 1 Vollzeitperson = 3 Kalendertage Dauer
- 3 Personentage mit 3 Vollzeitpersonen = 1 Kalendertag Dauer
- 3 Personentage mit 1 Person zu 50 % Verfügbarkeit = 6 Kalendertage Dauer

### 4.2 KI-Abfragen zur Aufwandsschätzung

Die KI soll mindestens folgende Fragen stellen:

1. „Wie hoch ist der geschätzte Aufwand in Personentagen oder Personenstunden?“
2. „Welche Einheit soll verwendet werden: PT, PH, MT oder MH?“
3. „Wie viele Personen arbeiten voraussichtlich daran?“
4. „Wie hoch ist die Verfügbarkeit dieser Personen?“
5. „Welche geplante Dauer ergibt sich daraus?“
6. „Gibt es externe Dienstleistungen oder Sachkosten?“
7. „Gibt es Reise-, Material-, Lizenz- oder Beratungskosten?“
8. „Welcher Tagessatz oder Stundensatz soll zur Kostenberechnung verwendet werden?“
9. „Wie sicher ist die Schätzung: niedrig, mittel oder hoch?“
10. „Welche Annahmen liegen der Schätzung zugrunde?“

### 4.3 Geplante Ressourcen

Die KI soll geplante Ressourcen in folgender Struktur erfassen:

| Mitarbeiter / Rolle | Abteilung | Aufwand / Stunden | Sonstige Kosten | Bemerkung |
|---|---|---:|---:|---|
| tbd | tbd | tbd | tbd | tbd |

### 4.4 Tatsächlich genutzte Ressourcen

Die tatsächlich genutzten Ressourcen werden während oder nach der Umsetzung gepflegt.

| Mitarbeiter / Rolle | Abteilung | Aufwand / Stunden | Sonstige Kosten | Bemerkung |
|---|---|---:|---:|---|
| tbd | tbd | tbd | tbd | tbd |

Die KI soll bei der Erstellung eines neuen Arbeitspakets den Ist-Bereich vorbereiten, aber nicht zwingend befüllen.

---

## 5. Methoden zur Aufwandsschätzung

Die KI soll aktiv nachfragen, welche Schätzmethode verwendet werden soll. Wenn keine Methode ausgewählt wird, soll sie eine geeignete Methode vorschlagen.

### 5.1 Expertenbefragung / Delphi-Methode

Geeignet, wenn mehrere Fachpersonen das Arbeitspaket bewerten können.

KI-Fragen:

- „Welche Experten sollen eine Schätzung abgeben?“
- „Welche Schätzwerte liegen je Experte vor?“
- „Liegen die Schätzwerte innerhalb einer akzeptablen Bandbreite?“
- „Muss eine zweite Schätzrunde durchgeführt werden?“

### 5.2 Schätzkonferenz

Geeignet, wenn mehrere Beteiligte gemeinsam optimistische, realistische und pessimistische Werte erarbeiten.

KI-Fragen:

- „Was ist der optimistische Aufwand?“
- „Was ist der realistische Aufwand?“
- „Was ist der pessimistische Aufwand?“
- „Soll daraus ein gewichteter Schätzwert berechnet werden?“

Beispielhafte Formel:

```text
Schätzwert = (optimistisch + pessimistisch + 4 × realistisch) / 6
```

### 5.3 Analogieverfahren

Geeignet, wenn vergleichbare Arbeitspakete aus früheren Projekten vorhanden sind.

KI-Fragen:

- „Gibt es ein vergleichbares Arbeitspaket aus einem früheren Projekt?“
- „Wie hoch war dort der tatsächliche Aufwand?“
- „Welche Unterschiede bestehen zum aktuellen Arbeitspaket?“
- „Welche Anpassung ist aufgrund von Komplexität, Umfang oder Rahmenbedingungen erforderlich?“

### 5.4 Algorithmische oder funktionsbasierte Schätzung

Geeignet für Software- oder technische Projekte, wenn messbare Größen wie Funktionen, Objekte, Schnittstellen, Datenmengen oder technische Komponenten vorliegen.

KI-Fragen:

- „Kann das Arbeitspaket anhand messbarer technischer Objekte geschätzt werden?“
- „Wie viele Funktionen, Schnittstellen, Datenobjekte oder Komponenten sind betroffen?“
- „Gibt es Erfahrungswerte je Objekt oder Funktion?“

---

## 6. Einflussfaktoren, die die KI prüfen soll

Die KI soll bei jedem Arbeitspaket gezielt prüfen, ob folgende Einflussfaktoren relevant sind:

| Einflussfaktor | KI-Prüffrage |
|---|---|
| Komplexität | „Wie komplex ist das Arbeitspaket fachlich und technisch?“ |
| Hilfsmittel | „Welche Tools, Vorlagen oder Systeme stehen zur Verfügung?“ |
| Anzahl Personen | „Wie viele Personen werden benötigt?“ |
| Verfügbarkeit | „Sind die Personen vollständig oder nur teilweise verfügbar?“ |
| Abhängigkeiten | „Welche Zwischenergebnisse anderer Arbeitspakete werden benötigt?“ |
| Erfahrung | „Hat das Team bereits ähnliche Arbeitspakete umgesetzt?“ |
| Unsicherheit | „Welche Unklarheiten bestehen noch?“ |
| Externe Abhängigkeiten | „Sind Lieferanten, Kunden, Fachbereiche oder andere Teams beteiligt?“ |

---

## 7. Häufige Probleme, die die KI erkennen soll

Die KI soll Warnhinweise ausgeben, wenn typische Planungsprobleme auftreten:

| Problem | KI-Hinweis |
|---|---|
| Projektmitarbeiter stehen noch nicht fest | „Die Ressourcenschätzung ist unsicher, weil konkrete Personen noch fehlen.“ |
| Verfügbarkeit ist unklar | „Die Dauer kann ohne Verfügbarkeitsangabe nicht belastbar berechnet werden.“ |
| Produktivität variiert stark | „Die Schätzung sollte durch Erfahrungswerte oder Expertenreview abgesichert werden.“ |
| technisches Umfeld ist unklar | „Es besteht ein Schätzrisiko wegen technischer Unsicherheit.“ |
| organisatorisches Umfeld ist unklar | „Es besteht ein Risiko durch ungeklärte Zuständigkeiten oder Entscheidungswege.“ |
| Abnahmekriterien fehlen | „Das Arbeitspaket ist nicht steuerbar, solange keine Abnahmekriterien definiert sind.“ |
| Ergebnis ist unklar | „Das Arbeitspaket benötigt ein konkretes Lieferobjekt.“ |

---

## 8. Digitale Freigabe statt Unterschrift

Die ursprüngliche Vorlage sieht eine Unterschrift der verantwortlichen Person vor. In der Software soll diese Unterschrift durch einen digitalen Freigabeprozess ersetzt werden.

### 8.1 Ziel des Freigabeprozesses

Der Freigabeprozess soll dokumentieren, dass eine verantwortliche Person das Arbeitspaket geprüft und bestätigt hat.

Die verantwortliche Person kann je nach Projektkontext sein:

- Arbeitspaketverantwortlicher
- Teilprojektleiter
- Projektleiter
- fachlicher Verantwortlicher
- Auftraggebervertreter

### 8.2 Ablauf

1. Arbeitspaket wird durch KI oder Nutzer erstellt.
2. System prüft Pflichtfelder und offene Punkte.
3. System erzeugt eine Freigabeanfrage.
4. Verantwortliche Person erhält eine E-Mail, Systemnachricht oder In-App-Benachrichtigung.
5. Verantwortliche Person prüft das Arbeitspaket.
6. Verantwortliche Person kann:
   - freigeben,
   - ablehnen,
   - Rückfrage stellen,
   - Änderung anfordern.
7. Entscheidung wird mit Zeitstempel, Benutzer und Kommentar protokolliert.
8. Nach Freigabe wird das Arbeitspaket für Planung, Umsetzung und Controlling verwendbar.

### 8.3 Statusmodell

| Status | Bedeutung |
|---|---|
| Draft | Arbeitspaket wird erstellt |
| In Review | Arbeitspaket liegt zur Prüfung vor |
| Changes Requested | Änderungen wurden angefordert |
| Approved | Arbeitspaket wurde freigegeben |
| Rejected | Arbeitspaket wurde abgelehnt |
| In Progress | Arbeitspaket wird umgesetzt |
| Completed | Arbeitspaket wurde abgeschlossen |
| Closed | Arbeitspaket wurde geprüft und final geschlossen |

### 8.4 Mindestdaten im Freigabeprotokoll

| Feld | Beschreibung |
|---|---|
| Freigabestatus | Approved, Rejected, Changes Requested |
| Freigegeben durch | Benutzername / Rolle |
| Datum und Uhrzeit | Zeitpunkt der Entscheidung |
| Kommentar | Begründung oder Hinweis |
| Version | Version der Arbeitspaketbeschreibung |
| Änderungshistorie | Nachvollziehbare Anpassungen |

---

## 9. KI-Dialog zur Erstellung eines Arbeitspakets

### 9.1 Dialogstruktur

Die KI soll den Nutzer in folgender Reihenfolge durch die Erstellung führen:

1. Projektzuordnung
2. Arbeitspaketname
3. Verantwortlichkeiten
4. Ziel und Ergebnis
5. Tätigkeiten
6. Abnahmekriterien
7. Abhängigkeiten
8. Aufwandsschätzung
9. Ressourcenplanung
10. Kostenplanung
11. Risiken und Unsicherheiten
12. Qualität und Prüfungen
13. Freigabeprozess
14. Zusammenfassung und Prüfung

### 9.2 Beispiel-Dialog

```text
KI: Zu welchem Projekt gehört das Arbeitspaket?
Nutzer: SharePoint-Migration.

KI: Wie soll das Arbeitspaket heißen?
Nutzer: Migration der Abteilungsdaten Vertrieb.

KI: Wer ist für das Arbeitspaket verantwortlich?
Nutzer: Max Mustermann.

KI: Was ist das konkrete Ziel dieses Arbeitspakets?
Nutzer: Die freigegebenen Vertriebsdaten sollen aus dem Fileserver nach SharePoint migriert werden.

KI: Welches konkrete Ergebnis soll am Ende vorliegen?
Nutzer: Die Daten liegen vollständig in der neuen SharePoint-Struktur und wurden durch den Fachbereich geprüft.

KI: Wann gilt das Arbeitspaket als abgeschlossen?
Nutzer: Wenn die Migration durchgeführt, die Berechtigungen geprüft und der Fachbereich die Daten bestätigt hat.

KI: Welche Tätigkeiten sind dafür notwendig?
Nutzer: Daten prüfen, Zielstruktur anlegen, Migration durchführen, Berechtigungen testen, Fachbereichsabnahme einholen.

KI: Wie hoch ist der geschätzte Aufwand?
Nutzer: 4 Personentage.

KI: Wie viele Personen arbeiten daran und mit welcher Verfügbarkeit?
Nutzer: Eine Person mit 50 Prozent Verfügbarkeit.

KI: Dann beträgt die rechnerische Dauer voraussichtlich 8 Arbeitstage. Soll ich das so übernehmen?
Nutzer: Ja.

KI: Wer soll das Arbeitspaket digital freigeben?
Nutzer: Der Projektleiter.
```

---

## 10. Validierungsregeln für die KI

Die KI soll vor Abschluss prüfen:

- Ist ein eindeutiger Arbeitspaketname vorhanden?
- Ist das Arbeitspaket einem Projekt oder Teilprojekt zugeordnet?
- Ist ein Verantwortlicher benannt?
- Sind Ziel und Ergebnis unterscheidbar beschrieben?
- Sind konkrete Tätigkeiten vorhanden?
- Sind messbare Abnahmekriterien definiert?
- Sind Aufwand und Dauer getrennt erfasst?
- Sind geplante Ressourcen eingetragen?
- Sind sonstige Kosten berücksichtigt?
- Sind Risiken und Unsicherheiten dokumentiert?
- Ist eine Freigabeperson definiert?
- Ist der Freigabestatus nachvollziehbar?

Wenn Pflichtinformationen fehlen, soll die KI diese gezielt nachfragen.

---

## 11. Standardausgabe der KI

Die KI soll nach dem Dialog eine Arbeitspaketbeschreibung in folgender Struktur erzeugen:

```markdown
# Arbeitspaketbeschreibung: <Name des Arbeitspakets>

## 1. Kopfdaten

| Feld | Wert |
|---|---|
| Projektname | <Projektname> |
| Projektnummer | <Projektnummer> |
| Arbeitspaket | <Name AP> |
| Verantwortlicher | <Name> |
| Projektleiter | <Name> |
| Vertretung | <Name> |
| Teilprojekt | <Teilprojekt> |
| Teilprojektleiter | <Name> |
| Status | Draft / In Review / Approved |

## 2. Ziel und Tätigkeiten

### Ziel
<Zielbeschreibung>

### Tätigkeiten
- <Tätigkeit 1>
- <Tätigkeit 2>
- <Tätigkeit 3>

### Ergebnis / Lieferobjekt
<Ergebnisbeschreibung>

### Abnahmekriterien
- [ ] <Kriterium 1>
- [ ] <Kriterium 2>
- [ ] <Kriterium 3>

### Nicht-Ziele / Out of Scope
- <Nicht-Ziel 1>
- <Nicht-Ziel 2>

## 3. Planung

| Feld | Wert |
|---|---|
| Geplanter Aufwand | <PT/PH> |
| Geplante Dauer | <Tage/Wochen> |
| Start geplant | <Datum> |
| Ende geplant | <Datum> |
| Schätzmethode | <Methode> |
| Schätzsicherheit | niedrig / mittel / hoch |
| Annahmen | <Annahmen> |

## 4. Geplante Ressourcen

| Mitarbeiter / Rolle | Abteilung | Aufwand / Stunden | Sonstige Kosten | Bemerkung |
|---|---|---:|---:|---|
| <Name/Rolle> | <Abteilung> | <Aufwand> | <Kosten> | <Bemerkung> |

## 5. Tatsächlich genutzte Ressourcen

| Mitarbeiter / Rolle | Abteilung | Aufwand / Stunden | Sonstige Kosten | Bemerkung |
|---|---|---:|---:|---|
| tbd | tbd | tbd | tbd | tbd |

## 6. Abhängigkeiten

- <Abhängigkeit 1>
- <Abhängigkeit 2>

## 7. Risiken und offene Punkte

### Risiken
- <Risiko 1>
- <Risiko 2>

### Offene Punkte
- <Offener Punkt 1>
- <Offener Punkt 2>

## 8. Qualitätssicherung

- <Prüfung 1>
- <Prüfung 2>
- <Prüfung 3>

## 9. Digitaler Freigabeprozess

| Feld | Wert |
|---|---|
| Freigabe erforderlich durch | <Person/Rolle> |
| Freigabestatus | Draft / In Review / Approved / Rejected |
| Freigabe angefragt am | <Datum/Uhrzeit> |
| Freigegeben durch | <Name> |
| Freigegeben am | <Datum/Uhrzeit> |
| Kommentar | <Kommentar> |

## 10. Änderungshistorie

| Version | Datum | Änderung | Geändert durch |
|---|---|---|---|
| 0.1 | <Datum> | Erstellt | <Name/KI> |
```

---

## 12. Nutzung für Projektcontrolling

Damit das Arbeitspaket später im Projektcontrolling genutzt werden kann, müssen Plan- und Ist-Daten sauber getrennt werden.

### 12.1 Planwerte

- geplanter Aufwand
- geplante Dauer
- geplante Kosten
- geplante Ressourcen
- geplante Start- und Endtermine
- geplante Lieferobjekte

### 12.2 Ist-Werte

- tatsächlich genutzter Aufwand
- tatsächlich genutzte Ressourcen
- tatsächlich entstandene Kosten
- tatsächlicher Start
- tatsächliches Ende
- Fertigstellungsgrad
- Probleme / Abweichungen

### 12.3 Bewertbare Kennzahlen

Das Arbeitspaket soll später Grundlage sein für:

- Soll-Ist-Vergleich
- Kostenvergleich
- Terminvergleich
- Fertigstellungsgrad
- Earned Value Analyse
- Projektstatusbericht
- Lessons Learned

---

## 13. Anforderungen an die spätere Softwarefunktion

### 13.1 Funktionale Anforderungen

- Die Software muss Arbeitspakete strukturiert erfassen können.
- Die Software muss Pflichtfelder prüfen können.
- Die Software muss einen KI-gestützten Dialog zur Erstellung anbieten.
- Die Software muss geplante und tatsächliche Ressourcen getrennt darstellen.
- Die Software muss Aufwand und Dauer getrennt behandeln.
- Die Software muss unterschiedliche Schätzmethoden unterstützen.
- Die Software muss Freigabeanfragen per Mail, Nachricht oder In-App-Mitteilung senden können.
- Die Software muss eine Freigabe per Button ermöglichen.
- Die Software muss Ablehnung, Rückfrage und Änderungsanforderung ermöglichen.
- Die Software muss ein Audit-Log führen.
- Die Software muss Arbeitspakete versionieren können.

### 13.2 Nicht-funktionale Anforderungen

- Änderungen müssen nachvollziehbar sein.
- Freigaben müssen revisionssicher protokolliert werden.
- Pflichtfeldprüfung muss vor Freigabe erfolgen.
- Die Oberfläche muss auch für nicht-technische Projektbeteiligte verständlich sein.
- Der KI-Dialog muss unterbrechbar und später fortsetzbar sein.
- Offene Punkte dürfen nicht verloren gehen.

---

## 14. Beispiel-User-Story für die Projektplattform

```markdown
# User Story: KI-gestützte Arbeitspaketbeschreibung erstellen

## User Story
Als Projektleiter möchte ich Arbeitspakete mithilfe eines KI-gestützten Dialogs strukturiert erstellen, damit alle relevanten Informationen für Planung, Umsetzung, Ressourcensteuerung, Kostenplanung, Freigabe und Controlling vollständig erfasst werden.

## Akzeptanzkriterien
- [ ] Die KI fragt alle Pflichtfelder für ein Arbeitspaket dialoggeführt ab.
- [ ] Die KI unterscheidet zwischen Projektkopfdaten, Ziel, Tätigkeiten, Ressourcen, Aufwand, Kosten, Risiken und Freigabe.
- [ ] Aufwand und Dauer werden getrennt abgefragt.
- [ ] Die KI weist darauf hin, wenn Verfügbarkeit, Ressourcen oder Abnahmekriterien fehlen.
- [ ] Geplante Ressourcen und tatsächliche Ressourcen werden getrennt geführt.
- [ ] Die KI kann eine Aufwandsschätzung nach gewählter Methode vorbereiten.
- [ ] Die KI erzeugt eine strukturierte Arbeitspaketbeschreibung im Markdown- oder Systemformat.
- [ ] Eine digitale Freigabe kann an eine verantwortliche Person gesendet werden.
- [ ] Die verantwortliche Person kann per Button freigeben, ablehnen oder Änderungen anfordern.
- [ ] Jede Freigabeentscheidung wird mit Zeitstempel, Benutzer und Kommentar protokolliert.

## Nicht-Akzeptanzkriterien
- [ ] Fehlende Pflichtangaben dürfen nicht automatisch erfunden werden.
- [ ] Eine manuelle Unterschrift darf nicht als einzige Freigabeform erforderlich sein.
- [ ] Aufwand und Dauer dürfen nicht als identischer Wert behandelt werden.
- [ ] Eine Freigabe darf nicht ohne Prüfstatus und Audit-Log erfolgen.

## Definition of Ready
- [ ] Felder der Arbeitspaketvorlage sind fachlich bestätigt.
- [ ] Rollen für Freigabe sind definiert.
- [ ] Statusmodell ist abgestimmt.
- [ ] Pflichtfelder sind definiert.
- [ ] Schätzmethoden sind ausgewählt.

## Definition of Done
- [ ] KI-Dialog ist umgesetzt.
- [ ] Arbeitspaket kann vollständig erzeugt werden.
- [ ] Pflichtfeldprüfung funktioniert.
- [ ] Digitaler Freigabeprozess funktioniert.
- [ ] Audit-Log wird geschrieben.
- [ ] Arbeitspaket kann für Controlling weiterverwendet werden.
```

---

## 15. Kurzregel für Agenten / KI-Systemprompt

```markdown
Bei der Erstellung eines Arbeitspakets musst du alle relevanten Informationen strukturiert abfragen. Nutze dafür einen Dialog und prüfe, ob alle Pflichtangaben vorhanden sind.

Berücksichtige mindestens:

- Projektname
- Projektnummer
- Arbeitspaketname
- Verantwortlicher
- Projektleiter
- Teilprojekt
- Ziel
- Tätigkeiten
- Lieferobjekt
- Abnahmekriterien
- geplante Ressourcen
- geplanter Aufwand
- geplante Dauer
- sonstige Kosten
- Abhängigkeiten
- Risiken
- offene Punkte
- Qualitätssicherung
- digitale Freigabe

Unterscheide immer zwischen Aufwand und Dauer. Frage nach Verfügbarkeit, Anzahl der Personen und Schätzmethode. Erfinde fehlende Informationen nicht, sondern frage gezielt nach. Bereite am Ende eine strukturierte Arbeitspaketbeschreibung inklusive digitalem Freigabeprozess vor.
```
