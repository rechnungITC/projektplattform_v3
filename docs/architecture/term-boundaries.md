# Fachliche Begriffsgrenzen — Plattform Welle 1
Dokument-Typ: Architekturentscheidung / Fachliche Definitionen  
Status: verbindlich für Welle 1  
Datum: 2026-04-20

Dieses Dokument legt fest, was die Plattform fachlich unter Task, Open Item, Decision und Stakeholder versteht — und wie diese Begriffe gegeneinander und gegen technische Konzepte (User, Rolle, Berechtigung) abzugrenzen sind. Es gilt als Referenz für alle Story-Schnitte, Datenmodelle und Epic-Definitionen ab Welle 1.

---

## 1. Task (Aufgabe)

### Definition

Ein Task ist eine **ausführbare Arbeitseinheit** mit einem konkreten Handlungsziel, einem verantwortlichen Bearbeiter und einem definierten Lebenszyklusstatus. Er entsteht, wenn klar ist: *wer tut was bis wann*.

### Wesentliche Merkmale

- **Immer zugewiesen**: Ein Task ohne Verantwortlichen ist kein vollständiger Task — er ist ein Open Item.
- **Erwartetes Ergebnis**: Aus einem Task geht etwas hervor — ein Dokument, eine Entscheidungsgrundlage, eine abgeschlossene Aktivität.
- **Definierbarer Status**: Der Task durchläuft einen Lebenszyklus von offen bis abgeschlossen.
- **Zeitlich terminierbar**: Ein Fälligkeitsdatum ist möglich, aber kein Pflichtfeld.
- **Abhängig oder unabhängig**: Tasks können in Vorgänger-Nachfolger-Beziehungen stehen.

### Lebenszyklus

```
offen → [zugewiesen] → in Arbeit → erledigt
                ↘ blockiert → [freigegeben] → in Arbeit
```

### Entstehung

- Manuell angelegt durch Projektleiter oder Teammitglied
- Aus einem KI-Vorschlag übernommen (Welle 3) — aber immer mit explizitem Review-Schritt

### Was ein Task nicht ist

- **Kein Open Item**: Ein Open Item hat keinen definierten Verantwortlichen und kein definiertes Ergebnis. Sobald ein Open Item zu einer Arbeitsanweisung wird, wird es ein Task.
- **Keine Decision**: Eine Decision dokumentiert eine bereits getroffene Entscheidung. Ein Task führt Arbeit aus, er trifft keine Entscheidung.
- **Kein Governance-Objekt**: Tasks gehören zur operativen Steuerungsebene, nicht zur Governance-Ebene.

---

## 2. Open Item (Offener Punkt)

### Definition

Ein Open Item ist ein **ungeklärter Sachverhalt, eine offene Frage oder ein identifizierter Klärungsbedarf**, der für das Projekt relevant ist, aber noch keine definierten nächsten Schritte, keinen verantwortlichen Bearbeiter und keine getroffene Entscheidung hat.

Ein Open Item signalisiert: *Hier muss etwas geklärt werden — was genau und durch wen, ist noch offen.*

### Wesentliche Merkmale

- **Kein zwingender Verantwortlicher**: Es kann eine zuständige Person notiert werden, aber das ist keine strukturelle Pflicht.
- **Kein definiertes Ergebnis**: Es ist noch nicht klar, wie der Sachverhalt aufgelöst wird.
- **Leichtgewichtig**: Open Items sind kein schweres Governance-Objekt. Sie sind ein operatives Steuerungswerkzeug für den Projektalltag.
- **Wandlungsfähig**: Ein Open Item kann sich in einen Task verwandeln (wenn ein Klärungsweg definiert wird) oder in eine Decision (wenn der Sachverhalt entschieden wird).

### Lebenszyklus

```
offen → [in Klärung] → geschlossen
                  ↘ konvertiert in Task
                  ↘ konvertiert in Decision
                  ↘ als irrelevant geschlossen
```

### Was ein Open Item nicht ist

- **Kein Task**: Ein Open Item wird erst dann ein Task, wenn jemand zugewiesen wurde und ein konkretes Ergebnis definiert ist. Bis dahin ist es ein Klärungsbedarf, keine Arbeitsanweisung.
- **Keine Decision**: Eine Decision ist bereits getroffen. Ein Open Item ist noch offen.
- **Kein Risiko**: Ein Risiko ist eine identifizierte Unsicherheit mit potenzieller Auswirkung. Ein Open Item ist ein Klärungsbedarf, der noch nicht einmal als Risiko klassifiziert sein muss.

---

## 3. Decision (Entscheidung)

### Definition

Eine Decision ist eine **getroffene, dokumentierte Entscheidung** mit Datum, Begründung und fachlichem Kontext — die den Projektverlauf direkt beeinflusst und für alle Beteiligten nachvollziehbar bleiben muss.

Eine Decision signalisiert: *Diese Frage ist beantwortet. Das ist das Ergebnis. Hier ist die Begründung.*

### Wesentliche Merkmale

- **Bereits getroffen**: Eine Decision existiert erst, wenn sie getroffen wurde. Eine noch offene Entscheidungsfrage ist ein Open Item.
- **Datum und Kontext**: Wann wurde entschieden, auf welcher Grundlage, durch wen?
- **Unveränderlich in der Aussage**: Entscheidungen werden nicht überschrieben. Wenn eine Entscheidung revidiert wird, entsteht eine neue Decision mit Verweis auf die alte.
- **Stakeholder-Bezug**: Entscheidungen binden Beteiligte ein. Wer hat entschieden, wer war informiert?
- **Governance-relevant**: Decisions sind das primäre Rückgrat für Lenkungskreis-Arbeit, Compliance und spätere Prüfungen.

### Lebenszyklus

```
dokumentiert → [referenziert von Tasks, Risiken, Outputs]
             → ggf. revidiert (neue Decision mit Rückbezug)
```

Decisions haben keinen operativen Status wie Tasks. Sie sind entweder dokumentiert oder nicht. Revisionen erzeugen neue Datensätze, keine Überschreibungen.

### Was eine Decision nicht ist

- **Kein Open Item**: Ein Open Item ist noch nicht entschieden. Sobald die Entscheidung getroffen ist, wird ein neues Decision-Objekt angelegt — das Open Item wird geschlossen.
- **Kein Task**: Eine Decision definiert kein auszuführendes Ergebnis. Sie hält einen Entschluss fest. Die Folgearbeit nach einer Decision wird in Tasks abgebildet.
- **Kein Risiko**: Decisions können auf Risiken reagieren oder Risiken auslösen, aber sie sind keine Risiko-Entitäten.

---

## 4. Abgrenzungstabelle: Task, Open Item, Decision

| Dimension | Task | Open Item | Decision |
|---|---|---|---|
| **Was ist es?** | ausführbare Arbeit | offene Frage / Klärungsbedarf | getroffene Entscheidung |
| **Verantwortlicher** | Pflichtfeld — immer zugewiesen | optional notiert | Entscheider dokumentiert |
| **Erwartet ein Ergebnis?** | ja — Arbeitsprodukt oder Abschluss | nein — noch unklar | nein — Entschluss bereits gefasst |
| **Ist bereits entschieden?** | nein — wird ausgeführt | nein — noch offen | ja — ist dokumentiert |
| **Status-Logik** | offen → in Arbeit → erledigt | offen → geschlossen | dokumentiert (unveränderlich) |
| **Fälligkeitsdatum** | möglich und sinnvoll | optional | Entscheidungsdatum (wann getroffen) |
| **Kann sich wandeln in** | — | Task, Decision, irrelevant | nicht mehr; Revisionen = neue Decision |
| **Abhängigkeiten** | ja — zu anderen Tasks | nein — strukturell frei | optional — zu Risiken, Stakeholdern |
| **Ebene** | operativ | operativ / administrativ | governance-kritisch |
| **KI kann vorschlagen?** | ja (Welle 3) | ja (als Hinweis) | nein — Decisions werden nicht von KI getroffen |
| **Governance-Relevanz** | gering (operativ) | mittel | hoch — Lenkungskreis, Audit, Compliance |

---

## 5. Stakeholder

### Definition

Ein Stakeholder ist eine **Person, Gruppe oder Partei, die für das Projekt fachlich relevant ist** — aufgrund ihrer Rolle, ihres Einflusses, ihrer Zuständigkeit oder ihrer Betroffenheit.

Ein Stakeholder ist eine **fachliche Projektentität**, kein technischer Systemzugang.

### Wesentliche Merkmale

- **Intern oder extern**: Stakeholder können zur eigenen Organisation gehören oder extern sein (Lieferant, Auftraggeber, Betriebsrat, Berater).
- **Mit oder ohne Systemzugang**: Ein Stakeholder kann einen Login in der Plattform haben, muss es aber nicht. Ein externer Berater ohne Systemzugang ist ein vollständiger Stakeholder.
- **Fachliche Projektrolle**: Die Rolle eines Stakeholders beschreibt seinen fachlichen Beitrag und Einfluss (z. B. Auftraggeber, Key User, IT-Leitung, Betriebsrat), nicht seinen technischen Zugang.
- **Einfluss und Interesse**: Stakeholder werden nach Einfluss auf das Projekt und Interesse am Projektergebnis eingeschätzt.
- **Governance-Bezug**: Decisions, Freigaben und Eskalationen referenzieren Stakeholder.

### Beispiele für Stakeholder

- Auftraggeber (intern oder extern)
- IT-Leitung (Einfluss auf Systemauswahl)
- Betriebsrat / Personalrat (Einbindungspflicht)
- Key User (fachliche Anforderungen)
- Einkauf (Vendor-Prozess-Beteiligte)
- Externer Implementierungspartner
- Lenkungskreismitglied
- Projektmitarbeiter ohne Systemzugang

---

## 6. Abgrenzung: Stakeholder, User, Rolle, Berechtigung

### Die vier Konzepte im Überblick

**User (Systemnutzer)**  
Technische Entität. Eine Person mit einem Login in der Plattform. Hat eine technische Identität (Benutzername, Authentifizierung) und erhält Zugriffsrechte über das RBAC-System. Existiert im technischen Layer der Plattform.

**Stakeholder (fachlicher Projektbeteiligter)**  
Fachliche Entität. Eine Person, Gruppe oder Partei, die für das Projekt relevant ist. Existiert im fachlichen Layer der Plattform. Kann, muss aber nicht, ein User sein.

**Rolle (RBAC-Rolle)**  
Technisches Konzept. Eine Rolle bündelt Berechtigungen. Sie definiert, was ein User im System tun darf (z. B. lesen, schreiben, administrieren). Eine RBAC-Rolle ist kein fachliches Projektrolle-Konzept.

**Berechtigung (Permission)**  
Technisches Konzept. Ein spezifisches Zugriffsrecht auf eine Funktion oder ein Objekt (z. B. „Aufgabe bearbeiten", „Risiko anlegen"). Wird über Rollen gebündelt.

---

### Abgrenzungstabelle: Stakeholder, User, Rolle, Berechtigung

| Dimension | Stakeholder | User | Rolle (RBAC) | Berechtigung |
|---|---|---|---|---|
| **Layer** | fachlich | technisch | technisch | technisch |
| **Zweck** | fachliche Relevanz im Projekt | Systemzugang | Zugriffsrechte bündeln | einzelnes Zugriffsrecht |
| **Kann extern sein?** | ja — ohne Systemzugang | nein — braucht Login | nein | nein |
| **Projektzuordnung?** | ja — immer projektbezogen | nein — systemweit | nein — systemweit | nein — systemweit |
| **Fachliche Rolle?** | ja — Auftraggeber, Key User, Betriebsrat | nein — nur technische Identität | nein — nur Zugriffslogik | nein |
| **Einfluss / Interesse?** | ja — Kerneigenschaft | nein | nein | nein |
| **Governance-Bezug?** | ja — Decisions referenzieren Stakeholder | indirekt (wer hat Zugang) | nein | nein |

---

### Die kritische Überschneidung

Eine Person kann gleichzeitig User und Stakeholder sein. Beispiel: Der Projektleiter hat einen Login (User) und ist fachlich relevant für das Projekt (Stakeholder).

Das bedeutet nicht, dass User und Stakeholder dieselbe Entität sind. Es bedeutet, dass es eine optionale Verknüpfung geben kann: *Dieser Stakeholder ist auch User X in der Plattform.*

Diese Verknüpfung ist **optional**, nicht strukturell erzwungen.

---

## 7. Empfohlene Modellierung für Welle 1

### Task
- Eigene Entität mit: Titel, Beschreibung, Status, Fälligkeitsdatum, Zuweisung (User), Projektzuordnung, Phasenzuordnung (optional)
- Zuweisung referenziert User (technisch) — nicht Stakeholder (fachlich)
- Status: offen, in Arbeit, erledigt, blockiert
- Keine Freigabelogik in Welle 1

### Open Item
- Eigene, leichtgewichtige Entität mit: Titel, Beschreibung, Status, optionaler Kontaktperson (Freitext oder Stakeholder-Referenz), Projektzuordnung
- Status: offen, in Klärung, geschlossen
- Keine Pflicht-Zuweisung
- Konvertierung in Task oder Decision: manuell, kein automatischer Workflow in Welle 1

### Decision
- Eigene Entität mit: Titel, Begründung, Entscheidungsinhalt, Datum, Entscheider (Stakeholder-Referenz), Projektzuordnung, optionaler Kontextbezug (Phase, Risiko)
- Status: dokumentiert, revidiert (Revisionsverweis auf ältere Decision)
- Keine Freigabe-Gate-Anbindung in Welle 1 — diese kommt in Welle 2

### Stakeholder
- Eigene Entität mit: Name, Rolle (fachlich, Freitext oder Liste), Typ (intern/extern), Organisation/Abteilung, Einfluss, Interesse, Projektzuordnung
- Optionale Verknüpfung: `linked_user_id` — falls der Stakeholder auch ein Systemnutzer ist
- Diese Verknüpfung ist optional und strukturell nachrangig — die Stakeholder-Entität ist auch ohne Systemzugang vollständig

### Trennung, die von Anfang an gilt
- Stakeholder-Rollen (Auftraggeber, Key User, IT-Leitung) sind keine RBAC-Rollen
- RBAC-Rollen (Projektleiter im System, Viewer, Admin) steuern Zugriff, nicht fachliche Relevanz
- Eine Person kann beides haben — aber die Konzepte müssen getrennte Datenstrukturen bleiben

---

## 8. Risiken bei falscher Vermischung

### R1 — Task und Open Item werden gleichgesetzt
**Symptom:** Alle ungeklärten Sachverhalte werden als Tasks angelegt. Aufgabenliste wird zur Rumpelkammer.  
**Folge:** Kein Verantwortlicher, kein Status, kein Ergebnis — Tasks verlieren ihre Steuerungsqualität. Reporting ist wertlos.  
**Auslöser:** Kein separates Open-Item-Objekt vorhanden, oder Nutzer weichen auf Tasks aus, weil es einfacher ist.

### R2 — Open Items werden nie zu Decisions konvertiert
**Symptom:** Entscheidungen werden als „geschlossen" markiert, ohne dass eine Decision angelegt wird.  
**Folge:** Entscheidungshistorie fehlt. Lenkungskreis-Kommunikation nicht reproduzierbar. Compliance-Risiko.  
**Auslöser:** Kein klarer Prozess, wann aus einem Open Item eine Decision werden muss.

### R3 — Decisions werden überschrieben statt revidiert
**Symptom:** Wenn sich eine Entscheidung ändert, wird der bestehende Decision-Datensatz editiert.  
**Folge:** Historische Nachvollziehbarkeit verloren. Governance-Prüfungen scheitern.  
**Auslöser:** Kein technischer oder fachlicher Schutz der Decision-Unveränderlichkeit in Welle 1.

### R4 — Stakeholder wird als User-Erweiterung modelliert
**Symptom:** Stakeholder-Felder (Rolle, Einfluss, Interesse) werden direkt in die User-Tabelle eingebettet.  
**Folge:** Externe Stakeholder ohne Systemzugang können nicht erfasst werden. Governance-Entitäten referenzieren User statt fachliche Projektrollen. RBAC-Änderungen haben unerwartete Auswirkungen auf fachliche Projektstruktur.  
**Auslöser:** Scheinbare Vereinfachung — „Projektleiter ist doch eh schon im User-Modell."

### R5 — RBAC-Rollen werden mit fachlichen Stakeholder-Rollen gleichgesetzt
**Symptom:** Rollen wie „Projektleiter", „Key User" oder „Auftraggeber" werden als RBAC-Rollen modelliert.  
**Folge:** Fachliche Projektrollen sind von technischen Zugriffsrechten abhängig. Wenn jemand nur beobachtet (kein Login), kann er nicht als Stakeholder erfasst werden. Wenn die RBAC-Rolle geändert wird, verändert sich der fachliche Kontext des Projekts.  
**Auslöser:** Verwechslung von „wer darf was im System" mit „wer hat welche Rolle im Projekt."

### R6 — Governance-Logik driftet in Tasks
**Symptom:** Task-Status-Felder werden um Freigabe-Pflichtfelder erweitert. Tasks bekommen Genehmiger.  
**Folge:** Governance-Logik ist über Task-Objekte verteilt statt in Decisions und ApprovalGates. Core und Governance vermischen sich.  
**Auslöser:** Wunsch nach „Genehmigungsworkflow" vor Welle 2, der dann schnell in den Task-Status eingebaut wird.
