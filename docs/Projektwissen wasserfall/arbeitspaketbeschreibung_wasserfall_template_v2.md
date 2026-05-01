# Arbeitspaketbeschreibung – Wasserfall / PMI

## 1. Zweck der Vorlage

Diese Vorlage dient dazu, ein Arbeitspaket in einem klassischen Wasserfall- oder PMI-orientierten Projekt vollständig, nachvollziehbar und steuerbar zu beschreiben.

Sie basiert auf der im Bild dargestellten Arbeitspaketbeschreibung mit folgenden Kernelementen:

- Verantwortlicher
- Arbeitspaketbeschreibung
- Projekt- und Teilprojektinformationen
- Tätigkeiten und Ziel
- geplante Ressourcen
- tatsächlich genutzte Ressourcen
- Ort, Datum und Unterschrift

Für eine digitale Projektplattform wird die handschriftliche Unterschrift durch einen systemgestützten Freigabeprozess ersetzt.

---

# Arbeitspaketbeschreibung

## 2. Kopfdaten

| Feld | Inhalt |
|---|---|
| Verantwortlicher | `<Name der verantwortlichen Person>` |
| Arbeitspaket-Titel | `<Titel des Arbeitspakets>` |
| Arbeitspaket-ID | `<z. B. AP-2.4>` |
| Version | `<z. B. 1.0>` |
| Status | `Entwurf / In Prüfung / Freigegeben / In Bearbeitung / Abgeschlossen / Abgelehnt` |
| Projektphase | `<z. B. Konzept, Umsetzung, Test, Rollout>` |
| Teilprojekt / Stream | `<Name des Teilprojekts>` |
| Erstellt am | `<Datum>` |
| Zuletzt geändert am | `<Datum>` |
| Geplanter Start | `<Datum>` |
| Geplantes Ende | `<Datum>` |
| Tatsächlicher Start | `<Datum>` |
| Tatsächliches Ende | `<Datum>` |

---

## 3. Name des Arbeitspakets

```text
<Name AP>
```

---

## 4. Projektzuordnung

| Feld | Inhalt |
|---|---|
| Projektname | `<Projektname>` |
| Projektnummer | `<Projektnummer>` |
| Projektleiter | `<Name Projektleiter>` |
| Vertretung | `<Name Vertretung>` |
| Teilprojekt | `<Name Teilprojekt>` |
| Teilprojektleiter | `<Name Teilprojektleiter>` |

---

## 5. Tätigkeiten und Ziel

### 5.1 Ziel des Arbeitspakets

```text
<Was soll mit diesem Arbeitspaket erreicht werden?>
```

### 5.2 Tätigkeiten

| Nr. | Tätigkeit | Beschreibung | Verantwortlich | Ergebnis / Lieferobjekt |
|---:|---|---|---|---|
| 1 | `<Tätigkeit>` | `<Beschreibung>` | `<Name>` | `<Ergebnis>` |
| 2 | `<Tätigkeit>` | `<Beschreibung>` | `<Name>` | `<Ergebnis>` |
| 3 | `<Tätigkeit>` | `<Beschreibung>` | `<Name>` | `<Ergebnis>` |

### 5.3 Lieferobjekte

| Nr. | Lieferobjekt | Beschreibung | Abnahmekriterium |
|---:|---|---|---|
| 1 | `<Lieferobjekt>` | `<Beschreibung>` | `<Kriterium>` |
| 2 | `<Lieferobjekt>` | `<Beschreibung>` | `<Kriterium>` |

### 5.4 Abgrenzung / Nicht Bestandteil

```text
<Was gehört ausdrücklich nicht zu diesem Arbeitspaket?>
```

---

## 6. Geplante Ressourcen

| Mitarbeiter | Abteilung | Aufwand / Stunden | Sonstige Kosten | Bemerkung |
|---|---|---:|---:|---|
| `<Name>` | `<Abteilung>` | `<Stunden>` | `<Kosten>` | `<Bemerkung>` |
| `<Name>` | `<Abteilung>` | `<Stunden>` | `<Kosten>` | `<Bemerkung>` |
| `<Name>` | `<Abteilung>` | `<Stunden>` | `<Kosten>` | `<Bemerkung>` |
| **Summe** |  | **`<Summe Stunden>`** | **`<Summe Kosten>`** |  |

---

## 7. Tatsächlich genutzte Ressourcen

| Mitarbeiter | Abteilung | Aufwand / Stunden | Sonstige Kosten | Bemerkung |
|---|---|---:|---:|---|
| `<Name>` | `<Abteilung>` | `<Stunden>` | `<Kosten>` | `<Bemerkung>` |
| `<Name>` | `<Abteilung>` | `<Stunden>` | `<Kosten>` | `<Bemerkung>` |
| `<Name>` | `<Abteilung>` | `<Stunden>` | `<Kosten>` | `<Bemerkung>` |
| **Summe** |  | **`<Summe Stunden>`** | **`<Summe Kosten>`** |  |

---

## 8. Plan-Ist-Vergleich für das Arbeitspaket

| Kennzahl | Plan | Ist | Abweichung | Bemerkung |
|---|---:|---:|---:|---|
| Aufwand in Stunden | `<Plan>` | `<Ist>` | `<Ist - Plan>` | `<Bemerkung>` |
| Sonstige Kosten | `<Plan>` | `<Ist>` | `<Ist - Plan>` | `<Bemerkung>` |
| Startdatum | `<Plan>` | `<Ist>` | `<Abweichung>` | `<Bemerkung>` |
| Enddatum | `<Plan>` | `<Ist>` | `<Abweichung>` | `<Bemerkung>` |
| Fertigstellungsgrad | `<Plan %>` | `<Ist %>` | `<Abweichung>` | `<Bemerkung>` |

---

## 9. Fertigstellungsgrad / Fortschrittsbewertung

### 9.1 Methode zur Bewertung

| Methode | Beschreibung | Auswahl |
|---|---|---|
| 0/100 | Arbeitspaket zählt erst bei vollständigem Abschluss als fertig | `[ ]` |
| 20/80/100 | 20 % bei Start, 80 % bei fachlich fertig, 100 % nach Abnahme | `[ ]` |
| 50/50 | 50 % bei Start, 100 % nach Abschluss | `[ ]` |
| Meilensteinbasiert | Fortschritt wird über definierte Zwischenergebnisse bewertet | `[ ]` |
| Aufwand + Restaufwand | Fortschritt ergibt sich aus geleistetem Aufwand und geschätztem Restaufwand | `[ ]` |

### 9.2 Fortschrittslogik

| Status | Fortschritt | Kriterium |
|---|---:|---|
| Nicht begonnen | 0 % | Keine Tätigkeit gestartet |
| Gestartet | 20 % | Tätigkeit wurde begonnen und dokumentiert |
| In Bearbeitung | 50 % | Zwischenergebnisse liegen vor |
| Fachlich fertig | 80 % | Lieferobjekt ist erstellt und prüfbar |
| Abgenommen | 100 % | Freigabe durch verantwortliche Person erfolgt |

---

## 10. Abhängigkeiten

| Typ | Beschreibung | Betroffenes Arbeitspaket / Meilenstein | Auswirkung |
|---|---|---|---|
| Vorgänger | `<Beschreibung>` | `<AP/MS>` | `<Auswirkung>` |
| Nachfolger | `<Beschreibung>` | `<AP/MS>` | `<Auswirkung>` |
| Externe Abhängigkeit | `<Beschreibung>` | `<System/Lieferant/Person>` | `<Auswirkung>` |

---

## 11. Risiken und offene Punkte

| Nr. | Risiko / offener Punkt | Auswirkung | Maßnahme | Verantwortlich | Status |
|---:|---|---|---|---|---|
| 1 | `<Risiko>` | `<Auswirkung>` | `<Maßnahme>` | `<Name>` | `<Status>` |
| 2 | `<Offener Punkt>` | `<Auswirkung>` | `<Maßnahme>` | `<Name>` | `<Status>` |

---

## 12. Abnahmekriterien

Das Arbeitspaket gilt als abgeschlossen, wenn folgende Kriterien erfüllt sind:

- [ ] Alle geplanten Tätigkeiten wurden abgeschlossen.
- [ ] Alle definierten Lieferobjekte liegen vor.
- [ ] Der geplante Fertigstellungsgrad beträgt 100 %.
- [ ] Plan-Ist-Abweichungen wurden dokumentiert.
- [ ] Offene Punkte wurden geschlossen oder als Restpunkte dokumentiert.
- [ ] Risiken und Abweichungen wurden bewertet.
- [ ] Die verantwortliche Person hat das Arbeitspaket digital freigegeben.
- [ ] Der Projektleiter oder Teilprojektleiter hat die Freigabe bestätigt, sofern erforderlich.

---

# 13. Digitale Freigabe statt Unterschrift

## 13.1 Grundsatz

Die im ursprünglichen Formular vorgesehene Unterschrift wird in der digitalen Projektplattform durch einen Freigabeprozess ersetzt.

Die Freigabe kann durch folgende Personen erfolgen:

- verantwortliche Person des Arbeitspakets
- Teilprojektleiter
- Projektleiter
- Vertretung
- fachlicher Abnehmer

Je nach Projektstruktur kann der Projektleiter selbst die verantwortliche Person sein und die Freigabe direkt durchführen.

---

## 13.2 Freigabeprozess

```mermaid
flowchart TD
    A[Arbeitspaket fertiggestellt] --> B[Status auf "Zur Freigabe" setzen]
    B --> C[System sendet Mail oder Nachricht an verantwortliche Person]
    C --> D{Prüfung durch Verantwortlichen}
    D -->|Freigeben| E[Bestätigung per Button]
    D -->|Ablehnen| F[Kommentar erforderlich]
    F --> G[Zurück an Bearbeiter / Projektleiter]
    E --> H[Zeitstempel und Benutzer werden gespeichert]
    H --> I[Status: Freigegeben]
    I --> J[Projektleiter / TP-Leiter wird informiert]
```

---

## 13.3 Freigabedaten

| Feld | Inhalt |
|---|---|
| Freigabestatus | `Offen / Angefragt / Freigegeben / Abgelehnt / Zurückgezogen` |
| Freigabe angefragt am | `<Datum / Uhrzeit>` |
| Freigabe angefragt durch | `<Name>` |
| Freigabeempfänger | `<Name>` |
| Freigegeben am | `<Datum / Uhrzeit>` |
| Freigegeben durch | `<Name>` |
| Rolle der freigebenden Person | `<Verantwortlicher / Projektleiter / Teilprojektleiter / Fachabnehmer>` |
| Kommentar zur Freigabe | `<Kommentar>` |
| Ablehnungsgrund | `<Kommentar, falls abgelehnt>` |
| Systemnachweis | `<Audit-ID / Log-ID>` |

---

## 13.4 Anforderungen an die digitale Freigabe

- [ ] Das System kann eine Freigabeanforderung per E-Mail oder In-App-Nachricht versenden.
- [ ] Die empfangende Person kann das Arbeitspaket über einen Link öffnen.
- [ ] Die empfangende Person kann per Button `Freigeben` oder `Ablehnen` auswählen.
- [ ] Bei Ablehnung muss ein Kommentar angegeben werden.
- [ ] Bei Freigabe werden Benutzer, Rolle, Datum und Uhrzeit gespeichert.
- [ ] Die Freigabe wird unveränderbar im Verlauf des Arbeitspakets dokumentiert.
- [ ] Nach Freigabe wird der Status des Arbeitspakets automatisch aktualisiert.
- [ ] Der Projektleiter oder Teilprojektleiter wird nach Freigabe oder Ablehnung informiert.
- [ ] Eine erneute Bearbeitung nach Freigabe erzeugt eine neue Version oder setzt den Status wieder auf `In Bearbeitung`.
- [ ] Jede Freigabe ist im Audit-Log nachvollziehbar.

---

## 13.5 Statusmodell

| Status | Bedeutung | Nächster möglicher Schritt |
|---|---|---|
| Entwurf | Arbeitspaket ist angelegt, aber noch nicht vollständig beschrieben | In Prüfung |
| In Prüfung | Arbeitspaket wird fachlich geprüft | Freigabe anfragen / Zurück an Bearbeitung |
| Freigabe angefragt | Verantwortliche Person wurde benachrichtigt | Freigeben / Ablehnen |
| Freigegeben | Arbeitspaketbeschreibung wurde bestätigt | In Bearbeitung |
| In Bearbeitung | Arbeitspaket wird umgesetzt | Zur Freigabe Abschluss |
| Abschlussfreigabe angefragt | Ergebnis soll final bestätigt werden | Abschließen / Ablehnen |
| Abgeschlossen | Arbeitspaket ist fertiggestellt und freigegeben | Archivieren / in Projektabschluss übernehmen |
| Abgelehnt | Freigabe wurde verweigert | Nachbearbeitung |

---

# 14. Umsetzung als User Story für die Projektplattform

## User Story: Arbeitspaketbeschreibung digital erfassen und freigeben

### Status

Proposed

### User Story

Als Projektleiter möchte ich Arbeitspakete nach einer standardisierten Vorlage erfassen, Ressourcen planen, tatsächliche Aufwände dokumentieren und die Arbeitspaketbeschreibung digital freigeben lassen, damit klassische Wasserfallprojekte nachvollziehbar geplant, gesteuert und abgeschlossen werden können.

### Akzeptanzkriterien

- [ ] Ein Arbeitspaket kann mit Projektname, Projektnummer, Projektleiter, Vertretung, Teilprojekt und Teilprojektleiter angelegt werden.
- [ ] Ein Arbeitspaket hat einen eindeutigen Namen und eine eindeutige Arbeitspaket-ID.
- [ ] Tätigkeiten und Ziele können als Freitext und als strukturierte Tätigkeitsliste erfasst werden.
- [ ] Geplante Ressourcen können mit Mitarbeiter, Abteilung, Aufwand/Stunden, sonstigen Kosten und Bemerkung erfasst werden.
- [ ] Tatsächlich genutzte Ressourcen können mit denselben Feldern dokumentiert werden.
- [ ] Plan- und Ist-Werte können gegenübergestellt werden.
- [ ] Der Fertigstellungsgrad kann nach definierter Methode bewertet werden.
- [ ] Eine digitale Freigabe kann durch eine verantwortliche Person, den Teilprojektleiter oder den Projektleiter ausgelöst werden.
- [ ] Das System versendet eine Nachricht oder E-Mail an die freigabeberechtigte Person.
- [ ] Die Freigabe kann über einen Button bestätigt oder abgelehnt werden.
- [ ] Bei Ablehnung muss ein Kommentar angegeben werden.
- [ ] Freigabe, Ablehnung, Benutzer, Rolle und Zeitstempel werden revisionssicher protokolliert.
- [ ] Nach Freigabe wird der Status automatisch aktualisiert.
- [ ] Das Arbeitspaket kann als Bestandteil des Projektstatusberichts genutzt werden.

### Nicht-Akzeptanzkriterien

- [ ] Eine reine handschriftliche Unterschrift ist für die digitale Plattform nicht ausreichend.
- [ ] Eine Freigabe ohne Benutzerkennung, Rolle und Zeitstempel gilt nicht als gültige digitale Freigabe.
- [ ] Eine Ablehnung ohne Kommentar gilt nicht als vollständig.
- [ ] Nachträgliche Änderungen an freigegebenen Arbeitspaketen dürfen nicht ohne neue Version oder erneute Freigabe erfolgen.

### Definition of Ready

- [ ] Rollenmodell für Projektleiter, Teilprojektleiter, Verantwortliche und Abnehmer ist definiert.
- [ ] Statusmodell für Arbeitspakete ist abgestimmt.
- [ ] Benachrichtigungskanal ist geklärt: E-Mail, In-App-Nachricht oder beides.
- [ ] Pflichtfelder für die Arbeitspaketbeschreibung sind definiert.
- [ ] Freigabe- und Ablehnungslogik ist fachlich abgestimmt.

### Definition of Done

- [ ] Arbeitspaketformular ist umgesetzt.
- [ ] Ressourcenplanung und Ist-Erfassung sind umgesetzt.
- [ ] Freigabeprozess ist umgesetzt.
- [ ] Benachrichtigungen funktionieren.
- [ ] Audit-Log ist vorhanden.
- [ ] Statuswechsel funktionieren gemäß Statusmodell.
- [ ] Tests für Freigabe, Ablehnung und erneute Bearbeitung sind vorhanden.
- [ ] Dokumentation wurde aktualisiert.

---

# 15. Druckansicht / Export

Für klassische Projektunterlagen sollte die Plattform zusätzlich eine Druck- oder PDF-Ansicht erzeugen können.

## Empfohlene Druckfelder

| Bereich | Inhalt |
|---|---|
| Kopfbereich | Verantwortlicher, Arbeitspaket-Titel, ID, Version, Status |
| Projektzuordnung | Projektname, Projektnummer, Projektleiter, Vertretung, Teilprojekt, Teilprojektleiter |
| Inhalt | Tätigkeiten und Ziel |
| Planung | geplante Ressourcen, Termine, Kosten |
| Ist-Daten | tatsächlich genutzte Ressourcen, Ist-Aufwand, Ist-Kosten |
| Bewertung | Fortschritt, Plan-Ist-Abweichung, Risiken |
| Freigabe | digital freigegeben durch, Rolle, Datum, Uhrzeit, Kommentar |

## Ersatz für Ort, Datum, Unterschrift

| Bisheriges Formularfeld | Digitale Entsprechung |
|---|---|
| Ort | Systemkontext / Organisation / Standort |
| Datum | automatischer Zeitstempel |
| Unterschrift verantwortliche Person | digitale Button-Freigabe mit Benutzerkennung |
| Rücksendung per Mail | automatische Benachrichtigung und Statuswechsel im System |

---

# 16. Kurzfassung für Entwickler

Die Arbeitspaketbeschreibung benötigt folgende Kernobjekte:

```text
WorkPackage
├── id
├── project_id
├── work_package_number
├── title
├── responsible_user_id
├── project_manager_id
├── deputy_user_id
├── subproject_id
├── subproject_manager_id
├── status
├── version
├── objective
├── activities
├── deliverables
├── planned_resources
├── actual_resources
├── planned_start
├── planned_end
├── actual_start
├── actual_end
├── progress_method
├── progress_percent
├── dependencies
├── risks
├── acceptance_criteria
├── approval_status
├── approval_requested_at
├── approval_requested_by
├── approved_at
├── approved_by
├── approval_comment
├── rejection_reason
├── audit_log
└── created_at / updated_at
```

## Wichtige Geschäftsregel

Ein Arbeitspaket darf nur als `Abgeschlossen` gelten, wenn:

1. alle Pflichtfelder ausgefüllt sind,
2. der Fertigstellungsgrad 100 % beträgt,
3. Plan-Ist-Abweichungen dokumentiert sind,
4. offene Punkte bewertet wurden,
5. die digitale Abschlussfreigabe erfolgreich erfolgt ist.
