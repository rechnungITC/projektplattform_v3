# Systembeschreibung: Projektstrukturplan, Arbeitspakete und Vorgänge für Wasserfall-/PMI-Projekte

## 1. Zweck des Moduls

Dieses Modul beschreibt, wie eine Projektmanagement-Software die Erstellung eines **Projektstrukturplans (PSP / WBS)**, die Ableitung von **Arbeitspaketen (AP)** und die weitere Unterteilung in **Vorgänge / Aktivitäten** unterstützen soll.

Der Projektstrukturplan dient als zentrale Grundlage für die weitere Planung eines klassischen Wasserfall-/PMI-orientierten Projekts. Aus ihm werden nachgelagert Terminplanung, Ressourcenplanung, Kostenplanung, Risikomanagement, Qualitätsplanung, Berichtswesen, Controlling und Earned-Value-Auswertungen abgeleitet.

Das System soll den Nutzer nicht nur eine Struktur manuell erfassen lassen, sondern ihn mithilfe eines KI-gestützten Dialogs schrittweise durch die Strukturierung führen.

---

## 2. Grundprinzip

Der PSP ist die fachliche und organisatorische Zerlegung des Projekts in überschaubare Einheiten.

```text
Projekt
├── Teilprojekt / Phase
│   ├── Teilaufgabe / Sammelvorgang
│   │   ├── Arbeitspaket
│   │   │   ├── Vorgang / Aktivität
│   │   │   └── Vorgang / Aktivität
│   │   └── Arbeitspaket
│   └── Teilaufgabe
└── Teilprojekt / Phase
```

Die unterste steuerbare Ebene des PSP ist das **Arbeitspaket**. Ein Arbeitspaket kann wiederum mehrere **Vorgänge** enthalten, wenn eine detailliertere Ablauf-, Termin- oder Ressourcenplanung erforderlich ist.

---

## 3. Ziele des Moduls

Das Modul soll sicherstellen, dass:

- alle relevanten Projektbestandteile strukturiert erfasst werden,
- keine wesentlichen Aufgaben vergessen werden,
- Aufgaben nicht doppelt geplant werden,
- jedes Arbeitspaket ein konkretes Ergebnis besitzt,
- jedes Arbeitspaket eindeutig einem Projektziel zugeordnet werden kann,
- jedes Arbeitspaket eine eindeutige Verantwortung besitzt,
- Arbeitspakete später für Aufwand, Termin, Ressourcen, Kosten und Controlling nutzbar sind,
- die Projektstruktur sowohl als Liste als auch als Baum dargestellt werden kann,
- Standard-PSPs für ähnliche Projekte wiederverwendet werden können.

---

## 4. Fachliche Einordnung

### 4.1 Projektstrukturplan (PSP)

Der Projektstrukturplan zeigt die Bestandteile eines Projekts und deren Beziehungen. Er dient der Vollständigkeitsprüfung, Orientierung und Reduzierung späterer Scope-Erweiterungen.

Der PSP kann unterschiedlich gegliedert werden:

| Gliederungsart | Leitfrage | Beispiel |
|---|---|---|
| Phasenorientiert | Welche Projektphasen durchlaufen wir? | Initiierung, Analyse, Konzept, Umsetzung, Test, Rollout |
| Objektorientiert | Was soll erstellt werden? | Module, Systeme, Dokumente, Lieferobjekte |
| Funktionsorientiert | Welche Tätigkeiten sind zu erledigen? | Konzipieren, Entwickeln, Testen, Schulen |
| Gemischtorientiert | Kombination mehrerer Kriterien | Obere Ebene nach Phasen, untere Ebene nach Funktionen |

Für Wasserfall-/PMI-Projekte ist häufig eine **gemischte Struktur** sinnvoll:

```text
1. Projektmanagement
2. Analyse und Anforderungen
3. Lösungskonzept
4. Umsetzung / Implementierung
5. Test und Qualitätssicherung
6. Rollout / Inbetriebnahme
7. Projektabschluss
```

---

### 4.2 Arbeitspaket

Ein Arbeitspaket ist die kleinste planbare und steuerbare Einheit im PSP.

Ein gutes Arbeitspaket besitzt:

- eine eindeutige ID / PSP-Code,
- eine aktive und eindeutige Bezeichnung,
- ein konkretes Ergebnis,
- einen eindeutigen Verantwortlichen,
- einen klar abgegrenzten Leistungsumfang,
- klare Schnittstellen zu anderen Arbeitspaketen,
- eine Aufwandsschätzung,
- eine Termin- oder Dauerplanung,
- geplante Ressourcen,
- geplante Kosten,
- eine Zuordnung zu Projektziel, Phase und ggf. Meilenstein,
- messbare Abnahmekriterien.

Schlechte AP-Bezeichnung:

```text
Server
```

Gute AP-Bezeichnung:

```text
Serverumgebung für Testsystem installieren
```

---

### 4.3 Vorgang / Aktivität

Ein Vorgang ist eine weitere Unterteilung eines Arbeitspakets.

Vorgänge werden genutzt, wenn:

- ein Arbeitspaket zeitlich genauer geplant werden muss,
- mehrere Personen an einem AP beteiligt sind,
- logische Abhängigkeiten innerhalb des AP bestehen,
- Terminplanung, Ressourcenplanung oder Controlling mehr Detailtiefe benötigen,
- der kritische Pfad oder Abhängigkeiten genauer bestimmt werden sollen.

Nicht jedes Arbeitspaket muss zwingend in Vorgänge zerlegt werden. Die Zerlegung darf nicht unnötig komplex werden.

---

## 5. Vorgehensweisen zur PSP-Erstellung

### 5.1 Top-down-Vorgehen

Beim Top-down-Vorgehen wird das Gesamtprojekt schrittweise vom Groben ins Detail zerlegt.

```text
Projektziel
→ Hauptphasen
→ Teilaufgaben
→ Arbeitspakete
→ Vorgänge
```

Geeignet für:

- bekannte Projektarten,
- Standardprojekte,
- Wasserfall-/PMI-Vorgehensmodelle,
- Projekte mit klaren Phasen und Lieferobjekten.

---

### 5.2 Bottom-up-Vorgehen

Beim Bottom-up-Vorgehen werden zunächst Aufgaben gesammelt und danach strukturiert.

```text
Aufgaben sammeln
→ Aufgaben clustern
→ Teilbereiche bilden
→ Arbeitspakete ableiten
→ PSP-Struktur erzeugen
```

Geeignet für:

- unklare oder neue Projektarten,
- Workshops,
- frühe Strukturierungsphasen,
- Projekte mit vielen offenen Anforderungen.

---

### 5.3 Kombiniertes Vorgehen

Die Software sollte beide Ansätze unterstützen:

1. KI schlägt eine grobe PSP-Struktur vor.
2. Nutzer ergänzt Aufgaben frei per Brainstorming.
3. KI clustert die Aufgaben in Phasen / Teilbereiche.
4. Nutzer prüft und bestätigt die Struktur.
5. KI leitet daraus Arbeitspakete ab.
6. Nutzer ergänzt Verantwortlichkeiten, Aufwand, Ressourcen und Ziele.

---

## 6. KI-gestützter Dialog zur PSP-Erstellung

Die KI soll den Nutzer dialoggeführt durch die Strukturierung führen.

### 6.1 Einstieg

```text
Welches Projekt soll strukturiert werden?
```

Abzufragende Informationen:

- Projektname
- Projektziel
- Projektart
- Vorgehensmodell
- bekannte Phasen
- erwartete Lieferobjekte
- beteiligte Fachbereiche
- bekannte Meilensteine
- bekannte Einschränkungen
- gewünschte Detailtiefe

---

### 6.2 Auswahl der Strukturierungslogik

```text
Soll der Projektstrukturplan eher nach Phasen, Ergebnissen, Funktionen oder gemischt aufgebaut werden?
```

Antwortoptionen:

- Phasenorientiert
- Objektorientiert
- Funktionsorientiert
- Gemischtorientiert
- KI-Vorschlag auf Basis des Projektziels

Empfohlene Standardlogik für Wasserfall:

```text
Gemischtorientiert:
Obere Ebene = Projektphasen
Untere Ebene = Arbeitspakete / Funktionen / Lieferobjekte
```

---

### 6.3 KI-Fragen zur Vollständigkeit

Die KI sollte prüfen:

```text
Welche Ergebnisse müssen am Projektende vorliegen?
```

```text
Welche Projektphasen sind notwendig?
```

```text
Welche Aktivitäten sind für Analyse, Konzeption, Umsetzung, Test, Rollout und Abschluss erforderlich?
```

```text
Welche Aufgaben gehören zum Projektmanagement selbst?
```

```text
Welche Aufgaben zur Kommunikation, Dokumentation, Schulung und Abnahme sind erforderlich?
```

```text
Welche Schnittstellen, Daten, Systeme oder externen Dienstleister müssen berücksichtigt werden?
```

```text
Welche Projektziele müssen durch Arbeitspakete abgedeckt werden?
```

---

### 6.4 KI-Prüfung auf Lücken

Die KI soll automatisch prüfen, ob typische Bereiche fehlen:

- Projektmanagement
- Stakeholdermanagement
- Anforderungsanalyse
- Fachkonzept
- Technisches Konzept
- Architektur
- Datenmigration
- Schnittstellen
- Berechtigungen
- Qualitätssicherung
- Test
- Schulung
- Rollout
- Betriebsübergabe
- Dokumentation
- Abnahme
- Projektabschluss
- Lessons Learned

---

## 7. Systemprozess zur Erstellung des PSP

```text
1. Projektziel erfassen
2. Strukturierungsart auswählen
3. Grobe Phasen / Teilprojekte erfassen
4. Lieferobjekte und Ergebnisse erfassen
5. Arbeitspakete ableiten
6. Arbeitspakete prüfen
7. Arbeitspakete einem Projektziel zuordnen
8. Verantwortliche festlegen
9. Arbeitspakete bei Bedarf in Vorgänge unterteilen
10. PSP-Code automatisch vergeben
11. PSP als Baum und Liste anzeigen
12. PSP zur Freigabe einreichen
13. PSP als Planungsbaseline speichern
```

---

## 8. Datenmodell

### 8.1 Entität: Projektstrukturplan

| Feld | Beschreibung |
|---|---|
| `psp_id` | Eindeutige ID des PSP |
| `project_id` | Zugehöriges Projekt |
| `version` | Version des PSP |
| `status` | Entwurf, In Prüfung, Freigegeben, Archiviert |
| `structure_type` | phasenorientiert, objektorientiert, funktionsorientiert, gemischt |
| `created_by` | Ersteller |
| `approved_by` | Freigeber |
| `approved_at` | Freigabezeitpunkt |
| `baseline_version` | Bezug zur Projektbaseline |

---

### 8.2 Entität: PSP-Element

| Feld | Beschreibung |
|---|---|
| `psp_element_id` | Eindeutige ID des Elements |
| `psp_code` | z. B. 1, 1.1, 1.1.1 |
| `parent_id` | Übergeordnetes PSP-Element |
| `project_id` | Zugehöriges Projekt |
| `element_type` | Projekt, Phase, Teilaufgabe, Arbeitspaket, Vorgang |
| `name` | Bezeichnung |
| `description` | Beschreibung |
| `objective_reference` | Bezug zu Projektziel |
| `deliverable` | erwartetes Ergebnis |
| `responsible_person_id` | verantwortliche Person |
| `status` | Entwurf, Geplant, Freigegeben, In Arbeit, Abgeschlossen |
| `sort_order` | Reihenfolge im PSP |

---

### 8.3 Entität: Arbeitspaket

| Feld | Beschreibung |
|---|---|
| `work_package_id` | Eindeutige AP-ID |
| `psp_code` | PSP-Code |
| `project_id` | Zugehöriges Projekt |
| `phase_id` | Zugehörige Phase |
| `name` | AP-Bezeichnung |
| `goal` | Tätigkeiten und Ziel |
| `result` | erwartetes Ergebnis |
| `scope_description` | Leistungsumfang |
| `out_of_scope` | explizit nicht enthaltene Leistungen |
| `responsible_person_id` | AP-Verantwortlicher |
| `planned_effort_hours` | geplanter Aufwand |
| `planned_duration_days` | geplante Dauer |
| `planned_start` | geplanter Start |
| `planned_end` | geplantes Ende |
| `planned_resources` | geplante Ressourcen |
| `planned_costs` | geplante Kosten |
| `dependencies` | logische / zeitliche Abhängigkeiten |
| `acceptance_criteria` | Abnahmekriterien |
| `quality_criteria` | Qualitätskriterien |
| `risks` | Risiken auf AP-Ebene |
| `approval_status` | Freigabestatus |

---

### 8.4 Entität: Vorgang / Aktivität

| Feld | Beschreibung |
|---|---|
| `activity_id` | Eindeutige Vorgangs-ID |
| `work_package_id` | Zugehöriges Arbeitspaket |
| `name` | Vorgangsbezeichnung |
| `description` | Beschreibung |
| `responsible_person_id` | Verantwortlicher |
| `planned_effort_hours` | geplanter Aufwand |
| `planned_duration_days` | geplante Dauer |
| `dependency_type` | EA, AA, EE, AE |
| `predecessor_activity_id` | Vorgänger |
| `planned_start` | geplanter Start |
| `planned_end` | geplantes Ende |
| `status` | Status |

---

## 9. Validierungsregeln

### 9.1 PSP-Validierung

Ein PSP darf nur freigegeben werden, wenn:

- mindestens eine Hauptphase vorhanden ist,
- jede PSP-Ebene eine eindeutige ID besitzt,
- jedes Arbeitspaket einer Phase oder Teilaufgabe zugeordnet ist,
- keine doppelten PSP-Codes existieren,
- jede unterste steuerbare Einheit als Arbeitspaket definiert ist,
- alle Arbeitspakete einem Projektziel zugeordnet sind,
- jedes Arbeitspaket einen Verantwortlichen besitzt,
- keine unklaren Sammelbezeichnungen ohne Ergebnis verwendet werden,
- die Struktur nicht unnötig tief oder zu grob ist.

---

### 9.2 Arbeitspaket-Validierung

Ein Arbeitspaket ist vollständig, wenn:

- PSP-Code vorhanden ist,
- Bezeichnung aktiv formuliert ist,
- Ziel und Ergebnis beschrieben sind,
- Verantwortlicher benannt ist,
- Aufwand erfasst oder bewusst offen markiert ist,
- geplante Ressourcen erfasst sind,
- Abhängigkeiten geprüft sind,
- Akzeptanzkriterien vorhanden sind,
- Schnittstellen zu anderen AP benannt sind,
- Freigabeprozess definiert ist.

---

### 9.3 KI-Warnungen

Die KI soll warnen, wenn:

- ein Arbeitspaket nur aus einem Substantiv besteht,
- mehrere Arbeitspakete ähnlich oder redundant wirken,
- ein Arbeitspaket zu groß oder zu unklar ist,
- kein konkretes Ergebnis beschrieben wurde,
- kein Verantwortlicher vorhanden ist,
- ein AP keinem Projektziel zugeordnet ist,
- typische Projektphasen fehlen,
- Test, Schulung, Dokumentation oder Abnahme nicht berücksichtigt wurden,
- zu viele Arbeitspakete derselben Person zugeordnet sind,
- der Detaillierungsgrad nicht zur Projektgröße passt.

---

## 10. Beispiel: PSP für ein CRM-Einführungsprojekt

### 10.1 Baumstruktur

```text
CRM Trainnix 2014
├── 1. Projektmanagement
│   ├── 1.1 Projektauftrag finalisieren
│   ├── 1.2 Projektplan erstellen
│   ├── 1.3 Status- und Berichtswesen aufsetzen
│   └── 1.4 Projektabschluss durchführen
├── 2. Analyse und Anforderungen
│   ├── 2.1 Ist-Prozesse aufnehmen
│   ├── 2.2 Anforderungen der Fachbereiche erfassen
│   ├── 2.3 Zielprozesse beschreiben
│   └── 2.4 Lastenheft erstellen und abstimmen
├── 3. Lösungskonzept
│   ├── 3.1 CRM-Zielarchitektur beschreiben
│   ├── 3.2 Datenmodell definieren
│   ├── 3.3 Rollen- und Berechtigungskonzept erstellen
│   └── 3.4 Migrations- und Schnittstellenkonzept erstellen
├── 4. Umsetzung
│   ├── 4.1 CRM-System konfigurieren
│   ├── 4.2 Stammdaten importieren
│   ├── 4.3 Schnittstellen implementieren
│   └── 4.4 Reports und Dashboards erstellen
├── 5. Test und Qualitätssicherung
│   ├── 5.1 Testkonzept erstellen
│   ├── 5.2 Funktionstests durchführen
│   ├── 5.3 Integrationstests durchführen
│   └── 5.4 Fachbereichsabnahme durchführen
├── 6. Rollout und Schulung
│   ├── 6.1 Schulungsunterlagen erstellen
│   ├── 6.2 Anwender schulen
│   ├── 6.3 Go-Live vorbereiten
│   └── 6.4 Hypercare durchführen
└── 7. Abschluss
    ├── 7.1 Projektabschlussbericht erstellen
    ├── 7.2 Lessons Learned durchführen
    └── 7.3 Abschlussabnahme einholen
```

---

### 10.2 Beispiel-Arbeitspaket

```markdown
# Arbeitspaket 3.3: Rollen- und Berechtigungskonzept erstellen

## PSP-Code
3.3

## Zugehörige Phase
3. Lösungskonzept

## Projektzielbezug
Sicherstellung einer kontrollierten, rollenbasierten Nutzung des CRM-Systems.

## Tätigkeiten und Ziel
Das Rollen- und Berechtigungskonzept für das CRM-System wird fachlich und technisch beschrieben. Ziel ist eine klare Zuordnung von Benutzergruppen, Zugriffen, Rollen, Rechten und Freigabeprozessen.

## Erwartetes Ergebnis
Freigegebenes Rollen- und Berechtigungskonzept inklusive Rollenmatrix.

## Verantwortlicher
Projektleiter oder benannter Security-/Fachverantwortlicher

## Geplante Ressourcen
| Rolle | Aufwand | Bemerkung |
|---|---:|---|
| Projektleiter | 8 h | Koordination |
| Fachbereichsvertreter Vertrieb | 6 h | fachliche Rollen |
| IT-Administrator | 8 h | technische Berechtigungen |
| Datenschutz / Compliance | 4 h | Prüfung |

## Abhängigkeiten
- Anforderungen der Fachbereiche müssen erfasst sein.
- Zielprozesse müssen beschrieben sein.
- Systemrollen des CRM müssen bekannt sein.

## Akzeptanzkriterien
- [ ] Alle relevanten Benutzergruppen sind beschrieben.
- [ ] Jede Rolle besitzt definierte Rechte.
- [ ] Kritische Berechtigungen sind gekennzeichnet.
- [ ] Freigabeprozess für Rollenänderungen ist beschrieben.
- [ ] Konzept wurde durch Projektleitung und Fachbereich freigegeben.

## Out of Scope
- Technische Umsetzung der Rollen im System.
- Schulung der Anwender.

## Freigabe
Digitale Freigabe durch Projektleiter oder benannten Verantwortlichen über Systemworkflow.
```

---

## 11. KI-Dialog für Arbeitspaketableitung aus dem PSP

Die KI soll je PSP-Element fragen:

```text
Welche konkreten Ergebnisse sollen in dieser Phase entstehen?
```

```text
Welche Arbeitspakete sind notwendig, um diese Ergebnisse zu erreichen?
```

```text
Ist das Arbeitspaket eindeutig genug, um Aufwand, Termin und Kosten zu schätzen?
```

```text
Gibt es Überschneidungen mit anderen Arbeitspaketen?
```

```text
Wer kann für dieses Arbeitspaket verantwortlich sein?
```

```text
Welche Arbeitspakete müssen vorher abgeschlossen sein?
```

```text
Welche Abnahmekriterien gelten für das Ergebnis?
```

```text
Soll dieses Arbeitspaket weiter in Vorgänge unterteilt werden?
```

---

## 12. Freigabeprozess

Der PSP und die daraus abgeleiteten Arbeitspakete sollten einen digitalen Freigabeprozess durchlaufen.

### 12.1 Statusmodell

```text
Entwurf
→ In Prüfung
→ Rückfrage / Überarbeitung
→ Freigegeben
→ Baseline gespeichert
→ Änderung nur über Change Request
```

### 12.2 Freigabe per Systemnachricht

Das System soll den Verantwortlichen automatisch benachrichtigen:

```text
Das Arbeitspaket "3.3 Rollen- und Berechtigungskonzept erstellen" wurde zur Freigabe eingereicht.
Bitte prüfen Sie Ziel, Ergebnis, Aufwand, Ressourcen, Abhängigkeiten und Akzeptanzkriterien.
```

Aktionen:

- Freigeben
- Ablehnen
- Rückfrage stellen
- Kommentieren
- Änderung anfordern

### 12.3 Audit-Log

Jede Freigabe muss protokolliert werden:

| Feld | Beschreibung |
|---|---|
| `approved_by` | freigebende Person |
| `approved_at` | Zeitpunkt |
| `approval_comment` | Kommentar |
| `version` | freigegebene Version |
| `previous_version` | vorherige Version |

---

## 13. Verbindung zu anderen Modulen

| Modul | Verbindung |
|---|---|
| Projektauftrag | Projektziele und Scope liefern Ausgangsbasis für PSP |
| Arbeitspaketbeschreibung | AP-Daten werden aus PSP erzeugt und detailliert beschrieben |
| Aufwandsschätzung | Aufwand wird je AP oder Vorgang geschätzt |
| Terminplanung | Vorgänge und Abhängigkeiten werden terminiert |
| Ressourcenplanung | Ressourcen werden Arbeitspaketen zugeordnet |
| Kostenplanung | Kosten werden aus Aufwand und Ressourcen abgeleitet |
| Risikomanagement | Risiken können auf Projekt-, Phasen- oder AP-Ebene zugeordnet werden |
| Kommunikation / Berichtswesen | PSP und AP dienen als Berichtsstruktur |
| Controlling | Plan-Ist-Vergleich erfolgt auf AP- und Phasenebene |
| EVA | BAC, PV, AC, EV können aus AP-Planung und Status abgeleitet werden |

---

## 14. User Story: Projektstrukturplan erstellen

```markdown
# User Story: Projektstrukturplan dialoggeführt erstellen

## Status
Proposed

## User Story
Als Projektleiter möchte ich mithilfe eines KI-gestützten Dialogs einen Projektstrukturplan erstellen, damit das Projekt vollständig, nachvollziehbar und planbar in Phasen, Teilaufgaben, Arbeitspakete und bei Bedarf Vorgänge zerlegt werden kann.

## Akzeptanzkriterien
- [ ] Der Nutzer kann eine Strukturierungslogik auswählen: phasenorientiert, objektorientiert, funktionsorientiert oder gemischt.
- [ ] Die KI kann auf Basis von Projektziel und Projektart einen PSP-Vorschlag erzeugen.
- [ ] Der PSP kann als Baum und als Liste dargestellt werden.
- [ ] PSP-Codes werden automatisch erzeugt.
- [ ] Arbeitspakete werden als unterste steuerbare Einheit gekennzeichnet.
- [ ] Jedes Arbeitspaket kann einem Projektziel zugeordnet werden.
- [ ] Jedes Arbeitspaket kann einen Verantwortlichen erhalten.
- [ ] Die KI prüft auf doppelte, fehlende oder zu grob formulierte Arbeitspakete.
- [ ] Arbeitspakete können bei Bedarf in Vorgänge unterteilt werden.
- [ ] Der PSP kann digital freigegeben und als Baseline gespeichert werden.

## Nicht-Akzeptanzkriterien
- [ ] Der PSP darf nicht nur als unstrukturierte Aufgabenliste gespeichert werden.
- [ ] Arbeitspakete ohne Ergebnisbeschreibung gelten nicht als vollständig.
- [ ] Arbeitspakete ohne Verantwortlichen dürfen nicht freigegeben werden.
- [ ] Änderungen an freigegebenen PSP-Versionen dürfen nicht ohne Versions- oder Change-Log erfolgen.

## Definition of Ready
- [ ] Projektziel ist bekannt.
- [ ] Projektart ist bekannt.
- [ ] gewünschtes Vorgehensmodell ist bekannt.
- [ ] grober Scope ist beschrieben.
- [ ] bekannte Projektphasen oder Lieferobjekte sind erfasst.

## Definition of Done
- [ ] PSP ist vollständig erstellt.
- [ ] Arbeitspakete sind eindeutig benannt.
- [ ] PSP-Codes sind vergeben.
- [ ] Zielzuordnung ist vorhanden.
- [ ] Verantwortlichkeiten sind hinterlegt.
- [ ] Freigabeprozess wurde durchlaufen.
- [ ] PSP ist als Baseline versioniert.
```

---

## 15. Systemanforderungen

### 15.1 Funktionale Anforderungen

- PSP als Baum erstellen
- PSP als Liste erstellen
- PSP-Code automatisch vergeben
- Phasen, Teilaufgaben, AP und Vorgänge unterscheiden
- Arbeitspakete aus PSP ableiten
- Arbeitspakete Projektzielen zuordnen
- Verantwortliche zuweisen
- Abhängigkeiten erfassen
- Vorgänge optional aus Arbeitspaketen ableiten
- KI-gestützte Vollständigkeitsprüfung durchführen
- Standard-PSPs speichern und wiederverwenden
- Freigabeprozess auslösen
- Versionierung und Baseline-Funktion bereitstellen

---

### 15.2 Nicht-funktionale Anforderungen

- Struktur muss auch bei großen Projekten performant darstellbar sein.
- Baumansicht muss filter- und durchsuchbar sein.
- Änderungen müssen nachvollziehbar protokolliert werden.
- Berechtigungen müssen steuern, wer PSPs ändern, freigeben oder archivieren darf.
- Export als Markdown, PDF, Excel und Projektplan sollte möglich sein.
- KI-Vorschläge müssen durch Nutzer bestätigbar oder ablehnbar sein.

---

## 16. Beispiel für KI-Ausgabe

```markdown
## KI-Vorschlag für PSP-Struktur

Auf Basis des Projektziels "Einführung eines CRM-Systems" schlage ich eine gemischtorientierte PSP-Struktur vor.

### Hauptphasen
1. Projektmanagement
2. Analyse und Anforderungen
3. Lösungskonzept
4. Umsetzung
5. Test und Qualitätssicherung
6. Rollout und Schulung
7. Abschluss

### Auffälligkeiten
- Es sollte ein eigenes Arbeitspaket für Datenmigration aufgenommen werden.
- Es sollte ein eigenes Arbeitspaket für Rollen- und Berechtigungskonzept aufgenommen werden.
- Test, Schulung und Abnahme sollten nicht im Arbeitspaket "Go-Live" versteckt werden.

### Rückfrage
Soll die Datenmigration als eigenes Teilprojekt oder als Arbeitspaket innerhalb der Umsetzungsphase geplant werden?
```

---

## 17. Entscheidungsregel für die Detailtiefe

Die Software soll folgende Faustregel verwenden:

```text
Ein PSP ist ausreichend detailliert, wenn jedes Arbeitspaket einem klaren Verantwortlichen zugewiesen werden kann und Aufwand, Termin, Kosten, Ergebnis und Abnahme sinnvoll planbar sind.
```

Wenn ein Arbeitspaket nicht schätzbar, nicht delegierbar oder nicht abnehmbar ist, sollte die KI eine weitere Zerlegung vorschlagen.

---

## 18. Ergebnis

Mit diesem Modul wird der Projektstrukturplan zur zentralen Planungsbasis der Projektplattform. Die Struktur ist nicht nur eine grafische Darstellung, sondern die verbindliche Grundlage für:

- Arbeitspaketbeschreibung,
- Aufwandsschätzung,
- Terminplanung,
- Ressourcen- und Kostenplanung,
- Risikomanagement,
- Qualitätssicherung,
- Kommunikation,
- Controlling,
- Earned Value Analyse,
- Projektabschlussbewertung.

